from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Dict, List
import json
import asyncio
import time
from firebase_admin import firestore
from core.config import settings
from services.r2_service import delete_object
from services.redis_service import (
    get_room_state, 
    set_room_state, 
    add_user_to_room, 
    remove_user_from_room, 
    update_room_time, 
    get_room_time, 
    add_chat_message,
    get_room_users
)

router = APIRouter()

async def cleanup_room_media(room_id: str):
    """Deletes room and associated R2 media files."""
    db = firestore.client()
    room_ref = db.collection("cinema_rooms").document(room_id)
    room_doc = room_ref.get()
    
    if not room_doc.exists:
        return

    data = room_doc.to_dict()
    print(f"CLEANUP: Deleting R2 media for room {room_id}")

    # Cleanup R2 Media
    movie_url = data.get("movie_file")
    poster_url = data.get("thumbnail")
    
    if movie_url and settings.R2_PUBLIC_BASE_URL in movie_url:
        movie_key = movie_url.split(f"{settings.R2_PUBLIC_BASE_URL}/")[-1]
        delete_object(settings.R2_BUCKET_MOVIES, movie_key)
        
    if poster_url and settings.R2_PUBLIC_BASE_URL in poster_url:
        poster_key = poster_url.split(f"{settings.R2_PUBLIC_BASE_URL}/")[-1]
        delete_object(settings.R2_BUCKET_ASSETS, poster_key)

    # Delete from Firestore
    room_ref.delete()
    print(f"CLEANUP: Room {room_id} and media deleted.")

async def start_periodic_cinema_cleanup():
    """Worker to cleanup old cinema rooms every 10 minutes."""
    while True:
        try:
            print("WORKER: Running periodic cinema room cleanup...")
            db = firestore.client()
            now = time.time()
            rooms = db.collection("cinema_rooms").stream()
            
            for room in rooms:
                data = room.to_dict()
                created_at = data.get("created_at")
                
                if created_at:
                    try:
                        created_ts = created_at.timestamp()
                        if now - created_ts > 86400: # 24 hours
                             await cleanup_room_media(room.id)
                    except: pass
                    
        except Exception as e:
            print(f"CINEMA WORKER ERROR: {str(e)}")
            
        await asyncio.sleep(600)

class ConnectionManager:
    def __init__(self):
        # room_id -> list of active websocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.user_websockets: Dict[str, WebSocket] = {} # uid -> WebSocket

    async def connect(self, websocket: WebSocket, room_id: str, uid: str = None):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
        if uid:
            self.user_websockets[uid] = websocket

    def disconnect(self, websocket: WebSocket, room_id: str, uid: str = None):
        if room_id in self.active_connections:
            try:
                self.active_connections[room_id].remove(websocket)
            except: pass
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
        if uid and uid in self.user_websockets:
            del self.user_websockets[uid]

    async def broadcast(self, message: dict, room_id: str):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

    async def send_to_user(self, message: dict, uid: str):
        if uid in self.user_websockets:
            try:
                await self.user_websockets[uid].send_json(message)
            except: pass

manager = ConnectionManager()

@router.websocket("/{room_id}/ws")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    uid = "anonymous"
    try:
        await manager.connect(websocket, room_id)
        
        # Fetch current state and send to the newly connected user
        current_state = await get_room_state(room_id)
        current_time = await get_room_time(room_id)
        
        await websocket.send_json({
            "type": "init",
            "state": current_state,
            "playback": current_time
        })
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            event_type = message.get("type")
            
            if event_type == "join":
                uid = message.get("uid", "anonymous")
                manager.user_websockets[uid] = websocket
                
                # Check for ban
                db = firestore.client()
                room_doc = db.collection("cinema_rooms").document(room_id).get()
                if room_doc.exists:
                    room_data = room_doc.to_dict()
                    if room_data.get("bannedUsers", {}).get(uid):
                        await websocket.send_json({"type": "error", "message": "You are banned from this room."})
                        continue
                
                await add_user_to_room(room_id, uid)
                users = await get_room_users(room_id)
                await manager.broadcast({"type": "user_list", "users": users}, room_id)
                
            elif event_type in ["play", "pause", "seek"]:
                new_time = message.get("time", 0.0)
                status = "playing" if event_type != "pause" else "paused"
                await update_room_time(room_id, new_time, status)
                await manager.broadcast({
                    "type": "playback_sync",
                    "status": status,
                    "time": new_time,
                    "uid": uid
                }, room_id)

            elif event_type == "next_episode":
                state = await get_room_state(room_id)
                state["currentEpisodeIndex"] = message.get("index", 0)
                await set_room_state(room_id, state)
                await manager.broadcast({
                    "type": "episode_sync",
                    "index": message.get("index", 0),
                    "uid": uid
                }, room_id)

            elif event_type == "kick":
                target_uid = message.get("target_uid")
                if target_uid:
                    await manager.send_to_user({"type": "kicked"}, target_uid)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id, uid)
        await remove_user_from_room(room_id, uid)
        users = await get_room_users(room_id)
        await manager.broadcast({"type": "user_list", "users": users}, room_id)
    except Exception as e:
        print(f"WS Error: {e}")
        manager.disconnect(websocket, room_id, uid)
