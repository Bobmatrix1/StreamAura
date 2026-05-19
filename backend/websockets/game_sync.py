from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Any
import json
import asyncio
import time
import random
from services.redis_service import get_room_state, set_room_state
from core.security import get_current_user
from firebase_admin import firestore

router = APIRouter()

class GameConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.game_states: Dict[str, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, game_id: str):
        await websocket.accept()
        if game_id not in self.active_connections:
            self.active_connections[game_id] = []
        self.active_connections[game_id].append(websocket)

    def disconnect(self, websocket: WebSocket, game_id: str):
        if game_id in self.active_connections:
            self.active_connections[game_id].remove(websocket)

    async def broadcast(self, message: dict, game_id: str):
        if game_id in self.active_connections:
            for connection in self.active_connections[game_id]:
                try:
                    await connection.send_json(message)
                except:
                    pass

manager = GameConnectionManager()

async def run_game_loop(game_id: str):
    """Handles the 60s timer and state transitions for a game room."""
    state = manager.game_states.get(game_id)
    if not state: return

    # 1. Selection Phase (Animation only, handled by client trigger)
    
    # 2. Convincing Phase (60s)
    state["status"] = "convincing"
    state["timer"] = 60
    await manager.broadcast({"type": "game_update", "state": state}, game_id)
    
    while state["timer"] > 0:
        await asyncio.sleep(1)
        state["timer"] -= 1
        # Broadcast timer every second
        await manager.broadcast({"type": "game_update", "state": {"timer": state["timer"]}}, game_id)
    
    # 3. Choosing Phase
    state["status"] = "choosing"
    state["timer"] = 20 # 20 seconds to make a choice
    state["choices"] = {}
    await manager.broadcast({"type": "game_update", "state": state}, game_id)
    
    while state["timer"] > 0 and len(state["choices"]) < 2:
        await asyncio.sleep(1)
        state["timer"] -= 1
        await manager.broadcast({"type": "game_update", "state": {"timer": state["timer"]}}, game_id)

    # 4. Reveal Phase
    state["status"] = "revealing"
    await manager.broadcast({"type": "game_update", "state": state}, game_id)
    await asyncio.sleep(5) # 5 seconds of suspense

    # Calculate Results
    choice_a = state["choices"].get(state["playerA"]["uid"], "steal") # Default to steal if no choice
    choice_b = state["choices"].get(state["playerB"]["uid"], "steal")
    
    result = "none"
    db = firestore.client()
    prize_amount = state.get("prizeAmount", 0)
    host_uid = state.get("hostUid")
    
    if choice_a == "split" and choice_b == "split":
        result = "share"
        # 50% to each player's game wallet
        half_prize = prize_amount / 2
        for p in [state["playerA"], state["playerB"]]:
            if not p.get("isBot"):
                db.collection("game_wallets").document(p["uid"]).set({"balance": firestore.Increment(half_prize)}, merge=True)
                db.collection("game_wallets").document(p["uid"]).collection("activity").add({
                    "type": "game_win", "amount": half_prize, "desc": f"Won Split or Steal (Shared)", "timestamp": firestore.SERVER_TIMESTAMP
                })

    elif choice_a == "split" and choice_b == "steal":
        result = "one_steal" # Player B steals
        if not state["playerB"].get("isBot"):
            db.collection("game_wallets").document(state["playerB"]["uid"]).set({"balance": firestore.Increment(prize_amount)}, merge=True)
            db.collection("game_wallets").document(state["playerB"]["uid"]).collection("activity").add({
                "type": "game_win", "amount": prize_amount, "desc": f"Won Split or Steal (Stolen)", "timestamp": firestore.SERVER_TIMESTAMP
            })

    elif choice_a == "steal" and choice_b == "split":
        result = "one_steal" # Player A steals
        if not state["playerA"].get("isBot"):
            db.collection("game_wallets").document(state["playerA"]["uid"]).set({"balance": firestore.Increment(prize_amount)}, merge=True)
            db.collection("game_wallets").document(state["playerA"]["uid"]).collection("activity").add({
                "type": "game_win", "amount": prize_amount, "desc": f"Won Split or Steal (Stolen)", "timestamp": firestore.SERVER_TIMESTAMP
            })

    else:
        result = "none" # Both steal
        # Prize goes to host game wallet
        if host_uid:
            db.collection("game_wallets").document(host_uid).set({"balance": firestore.Increment(prize_amount)}, merge=True)
            db.collection("game_wallets").document(host_uid).collection("activity").add({
                "type": "host_reclaim", "amount": prize_amount, "desc": f"Players stole. Prize reclaimed.", "timestamp": firestore.SERVER_TIMESTAMP
            })

    state["revealResult"] = result
    
    # Handle Multiple Rounds
    is_multi = state.get("isMultipleRounds", False)
    total_rounds = state.get("numberOfRounds", 1)
    current_round = state.get("currentRound", 1)
    
    if is_multi and current_round < total_rounds:
        state["status"] = "round_finished"
        state["currentRound"] = current_round + 1
        # Add played users to played list so they aren't picked again
        if "playedUsers" not in state: state["playedUsers"] = []
        state["playedUsers"].extend([state["playerA"]["uid"], state["playerB"]["uid"]])
    else:
        state["status"] = "finished"
        # Cleanup: Delete room from Firestore after a short delay to allow players to see results
        asyncio.create_task(cleanup_game_room(game_id))
        
    await manager.broadcast({"type": "game_update", "state": state}, game_id)

async def cleanup_game_room(game_id: str):
    """Wait 1 hour then delete the game room records."""
    await asyncio.sleep(3600)
    db = firestore.client()
    db.collection("game_rooms").document(game_id).delete()
    if game_id in manager.game_states:
        del manager.game_states[game_id]
    if game_id in manager.active_connections:
        del manager.active_connections[game_id]

@router.websocket("/{game_id}/ws")
async def game_websocket_endpoint(websocket: WebSocket, game_id: str):
    await manager.connect(websocket, game_id)
    
    # Initialize state if not exists
    if game_id not in manager.game_states:
        manager.game_states[game_id] = {
            "status": "waiting",
            "playerA": None,
            "playerB": None,
            "timer": 0,
            "choices": {},
            "revealResult": None,
            "participants": [],
            "playedUsers": []
        }

    try:
        # Send current state
        await websocket.send_json({
            "type": "game_update",
            "state": manager.game_states[game_id]
        })

        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            uid = msg.get("uid")
            action = msg.get("type")

            state = manager.game_states[game_id]

            if action == "join":
                # In real app, fetch name/photo from DB
                user_info = {"uid": uid, "displayName": msg.get("name", "User"), "photoURL": msg.get("photo"), "isBot": False}
                if not any(p["uid"] == uid for p in state["participants"]):
                    state["participants"].append(user_info)
                    await manager.broadcast({"type": "game_update", "state": {"participants": state["participants"]}}, game_id)

            elif action == "add_bot_player":
                bot_id = f"bot_{random.randint(1000, 9999)}"
                bot_info = {
                    "uid": bot_id, 
                    "displayName": f"Bot_{bot_id[-4:]}", 
                    "photoURL": f"https://api.dicebear.com/7.x/bottts/svg?seed={bot_id}", 
                    "isBot": True
                }
                state["participants"].append(bot_info)
                await manager.broadcast({"type": "game_update", "state": {"participants": state["participants"]}}, game_id)

            elif action == "chat":
                await manager.broadcast({
                    "type": "chat",
                    "message": {
                        "uid": uid,
                        "userName": msg.get("name", "User"),
                        "text": msg.get("text"),
                        "timestamp": time.time()
                    }
                }, game_id)

            elif action == "pick_random_players":
                # Only host/admin can trigger
                state["status"] = "selecting"
                await manager.broadcast({"type": "game_update", "state": state}, game_id)
                await asyncio.sleep(3) # Shuffling animation time
                
                # Logic to pick 2 from participants who haven't played yet
                played = set(state.get("playedUsers", []))
                eligible = [p for p in state["participants"] if p["uid"] not in played]
                
                if len(eligible) >= 2:
                    picked = random.sample(eligible, 2)
                    state["playerA"] = picked[0]
                    state["playerB"] = picked[1]
                    await manager.broadcast({"type": "game_update", "state": state}, game_id)
                    # Auto start Convincing
                    asyncio.create_task(run_game_loop(game_id))
                else:
                    state["status"] = "waiting" # Not enough eligible players
                    await manager.broadcast({"type": "game_update", "state": state}, game_id)

            elif action == "make_choice":
                if state["status"] == "choosing":
                    target_uid = msg.get("botUid", uid) # Can be for self or for a bot
                    state["choices"][target_uid] = msg.get("choice")
                    # Broadcast choice acknowledgement (without revealing value)
                    await manager.broadcast({
                        "type": "game_update", 
                        "state": {"choices": {k: True for k in state["choices"].keys()}}
                    }, game_id)

            elif action == "emoji":
                await manager.broadcast({
                    "type": "emoji",
                    "emoji": msg.get("emoji"),
                    "uid": uid
                }, game_id)

    except WebSocketDisconnect:
        manager.disconnect(websocket, game_id)
