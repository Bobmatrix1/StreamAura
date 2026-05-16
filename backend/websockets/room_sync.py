from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Dict, List
import json
import asyncio
import time
from services.redis_service import get_room_state, set_room_state, add_user_to_room, remove_user_from_room, update_room_time, get_room_time, add_chat_message

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        # room_id -> list of active websocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]

    async def broadcast(self, message: dict, room_id: str):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()

@router.websocket("/{room_id}/ws")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    # In a real scenario, we'd extract user identity from a token passed via query param or headers.
    # For now, we assume connection is successful and assign a generic user id or expect it in the first message.
    await manager.connect(websocket, room_id)
    uid = "anonymous" # This should be derived from auth
    
    try:
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
            
            # Handle different event types
            event_type = message.get("type")
            
            if event_type == "join":
                uid = message.get("uid", "anonymous")
                await add_user_to_room(room_id, uid)
                await manager.broadcast({"type": "user_joined", "uid": uid}, room_id)
                
            elif event_type == "chat":
                chat_msg = {"uid": uid, "text": message.get("text"), "timestamp": time.time()}
                await add_chat_message(room_id, chat_msg)
                await manager.broadcast({"type": "chat", "message": chat_msg}, room_id)
                
            elif event_type in ["play", "pause", "seek"]:
                # Only host should technically do this, verify on production
                new_time = message.get("time", 0.0)
                status = "playing" if event_type == "play" else "paused"
                await update_room_time(room_id, new_time, status)
                await manager.broadcast({
                    "type": "playback_sync",
                    "status": status,
                    "time": new_time,
                    "initiator": uid
                }, room_id)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        await remove_user_from_room(room_id, uid)
        await manager.broadcast({"type": "user_left", "uid": uid}, room_id)
