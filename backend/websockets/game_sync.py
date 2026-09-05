from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Any
import json
import asyncio
import time
import random
import uuid
from core.security import get_current_user
from firebase_admin import firestore

from core.payouts import calculate_payout_split

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
            if websocket in self.active_connections[game_id]:
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
    """Handles the timer and state transitions with multi-round awareness."""
    print(f"STARTING game loop for {game_id}")
    try:
        state = manager.game_states.get(game_id)
        if not state: 
            print(f"No state found for {game_id} in game loop")
            return
        
        db = firestore.client()
        room_ref = db.collection("game_rooms").document(game_id)

        # 1. Convincing Phase (60s)
        print(f"Game {game_id}: Entering convincing phase")
        state["status"] = "convincing"
        state["timer"] = 60
        room_ref.update({"status": "convincing", "timer": 60})
        await manager.broadcast({"type": "game_update", "state": state}, game_id)
        
        while state["timer"] > 0:
            await asyncio.sleep(1)
            if game_id not in manager.game_states: return
            state["timer"] -= 1
            await manager.broadcast({"type": "game_update", "state": {"timer": state["timer"]}}, game_id)
        
        # 2. Sudden Death Choosing Phase (10s - Choose or Forfeit)
        print(f"Game {game_id}: Entering sudden death choosing phase (10s)")
        state["status"] = "sudden_death"
        state["timer"] = 10
        state["choices"] = {}
        room_ref.update({"status": "sudden_death", "timer": 10, "choices": {}})
        await manager.broadcast({"type": "game_update", "state": state}, game_id)

        bot_picked = False

        while state["timer"] > 0:
            await asyncio.sleep(1)
            if game_id not in manager.game_states: return

            # Simulate bot making a choice naturally after 2 seconds (at timer <= 8)
            if not bot_picked and state["timer"] <= 8:
                for p_key in ["playerA", "playerB"]:
                    p = state.get(p_key)
                    if p and p.get("isBot") and p["uid"] not in state.get("choices", {}):
                        state["choices"][p["uid"]] = random.choice(["split", "steal"])
                bot_picked = True
                room_ref.update({"choices": state["choices"]})
                obscured_choices = {k: True for k, v in state.get("choices", {}).items() if v}
                await manager.broadcast({"type": "game_update", "state": {"choices": obscured_choices}}, game_id)

            state["timer"] -= 1
            await manager.broadcast({"type": "game_update", "state": {"timer": state["timer"]}}, game_id)

        # Auto-pick for any remaining bots before entering reveal (HUMANS ARE NOT AUTO-PICKED)
        for p_key in ["playerA", "playerB"]:
            p = state.get(p_key)
            if p and p.get("isBot") and p["uid"] not in state.get("choices", {}):
                state["choices"][p["uid"]] = random.choice(["split", "steal"])

        # 3. Reveal Phase (10s suspense - human choices can still be altered in first 5s if they made one)
        print(f"Game {game_id}: Entering revealing phase (10s)")
        state["status"] = "revealing"
        state["timer"] = 10
        room_ref.update({"status": "revealing", "timer": 10})
        await manager.broadcast({"type": "game_update", "state": state}, game_id)

        while state["timer"] > 0:
            await asyncio.sleep(1)
            if game_id not in manager.game_states: return
            state["timer"] -= 1
            # IMPORTANT: Broadcast obscured choices so clients know who chose without revealing choices yet
            obscured_choices = {k: True for k, v in state.get("choices", {}).items() if v}
            await manager.broadcast({"type": "game_update", "state": {"timer": state["timer"], "choices": obscured_choices}}, game_id)

        # 5. Final Result Calculation & Payout Distribution
        print(f"Game {game_id}: Calculating final results")

        uid_a = state["playerA"]["uid"] if state.get("playerA") else None
        uid_b = state["playerB"]["uid"] if state.get("playerB") else None

        choice_a = state.get("choices", {}).get(uid_a) if uid_a else None # "split", "steal", or None
        choice_b = state.get("choices", {}).get(uid_b) if uid_b else None # "split", "steal", or None
        
        result = "none"
        prize_amount = float(state.get("prizeAmount", 0))
        host_uid = state.get("hostUid")
        room_name = state.get("roomName", "Game")
        host_name = state.get("hostName", "Host")
        
        # Scenario 1: Both Split -> 50% to Player A, 50% to Player B
        if choice_a == "split" and choice_b == "split":
            result = "share"
            half_prize = prize_amount / 2
            for p in [state.get("playerA"), state.get("playerB")]:
                if p and not p.get("isBot"):
                    db.collection("game_wallets").document(p["uid"]).set({"balance": firestore.Increment(half_prize)}, merge=True)
                    db.collection("game_wallets").document(p["uid"]).collection("activity").add({
                        "type": "game_win", "amount": half_prize, "desc": "Won Split or Steal (Shared)", "timestamp": firestore.SERVER_TIMESTAMP
                    })

        # Scenario 2: Player A Split & Player B AFK -> 50% to Player A, 50% burned to Host
        elif choice_a == "split" and not choice_b:
            result = "afk_split_a"
            half_prize = prize_amount / 2
            if state.get("playerA") and not state["playerA"].get("isBot"):
                db.collection("game_wallets").document(state["playerA"]["uid"]).set({"balance": firestore.Increment(half_prize)}, merge=True)
                db.collection("game_wallets").document(state["playerA"]["uid"]).collection("activity").add({
                    "type": "game_win", "amount": half_prize, "desc": "Split prize won (Opponent AFK / Forfeited)", "timestamp": firestore.SERVER_TIMESTAMP
                })
            if host_uid and half_prize > 0:
                platform_cut, host_final, referrer_uid, referrer_cut = calculate_payout_split(host_uid, half_prize, db)
                db.collection("game_wallets").document(host_uid).set({"balance": firestore.Increment(host_final)}, merge=True)
                db.collection("game_wallets").document(host_uid).collection("activity").add({
                    "type": "host_reclaim", 
                    "amount": host_final, 
                    "desc": f"Half burned prize from {room_name} (Opponent AFK). Platform kept fee.", 
                    "timestamp": firestore.SERVER_TIMESTAMP
                })
                if referrer_uid and referrer_cut > 0:
                    ref_user_ref = db.collection("users").document(referrer_uid)
                    ref_user_ref.update({"referralBalance": firestore.Increment(referrer_cut)})
                    db.collection("game_wallets").document(referrer_uid).collection("activity").add({
                        "type": "referral_earning",
                        "amount": referrer_cut,
                        "desc": f"10% commission from {host_name}'s partial burned game prize",
                        "room": room_name,
                        "timestamp": firestore.SERVER_TIMESTAMP
                    })

        # Scenario 3: Player B Split & Player A AFK -> 50% to Player B, 50% burned to Host
        elif not choice_a and choice_b == "split":
            result = "afk_split_b"
            half_prize = prize_amount / 2
            if state.get("playerB") and not state["playerB"].get("isBot"):
                db.collection("game_wallets").document(state["playerB"]["uid"]).set({"balance": firestore.Increment(half_prize)}, merge=True)
                db.collection("game_wallets").document(state["playerB"]["uid"]).collection("activity").add({
                    "type": "game_win", "amount": half_prize, "desc": "Split prize won (Opponent AFK / Forfeited)", "timestamp": firestore.SERVER_TIMESTAMP
                })
            if host_uid and half_prize > 0:
                platform_cut, host_final, referrer_uid, referrer_cut = calculate_payout_split(host_uid, half_prize, db)
                db.collection("game_wallets").document(host_uid).set({"balance": firestore.Increment(host_final)}, merge=True)
                db.collection("game_wallets").document(host_uid).collection("activity").add({
                    "type": "host_reclaim", 
                    "amount": host_final, 
                    "desc": f"Half burned prize from {room_name} (Opponent AFK). Platform kept fee.", 
                    "timestamp": firestore.SERVER_TIMESTAMP
                })
                if referrer_uid and referrer_cut > 0:
                    ref_user_ref = db.collection("users").document(referrer_uid)
                    ref_user_ref.update({"referralBalance": firestore.Increment(referrer_cut)})
                    db.collection("game_wallets").document(referrer_uid).collection("activity").add({
                        "type": "referral_earning",
                        "amount": referrer_cut,
                        "desc": f"10% commission from {host_name}'s partial burned game prize",
                        "room": room_name,
                        "timestamp": firestore.SERVER_TIMESTAMP
                    })

        # Scenario 4: Player A Steals (against Split or AFK opponent) -> 100% to Player A
        elif choice_a == "steal" and (choice_b == "split" or not choice_b):
            result = "one_steal"
            desc_note = "Won Split or Steal (Stolen)" if choice_b == "split" else "Won Split or Steal (Opponent AFK / Forfeited)"
            if state.get("playerA") and not state["playerA"].get("isBot"):
                db.collection("game_wallets").document(state["playerA"]["uid"]).set({"balance": firestore.Increment(prize_amount)}, merge=True)
                db.collection("game_wallets").document(state["playerA"]["uid"]).collection("activity").add({
                    "type": "game_win", "amount": prize_amount, "desc": desc_note, "timestamp": firestore.SERVER_TIMESTAMP
                })

        # Scenario 5: Player B Steals (against Split or AFK opponent) -> 100% to Player B
        elif choice_b == "steal" and (choice_a == "split" or not choice_a):
            result = "one_steal"
            desc_note = "Won Split or Steal (Stolen)" if choice_a == "split" else "Won Split or Steal (Opponent AFK / Forfeited)"
            if state.get("playerB") and not state["playerB"].get("isBot"):
                db.collection("game_wallets").document(state["playerB"]["uid"]).set({"balance": firestore.Increment(prize_amount)}, merge=True)
                db.collection("game_wallets").document(state["playerB"]["uid"]).collection("activity").add({
                    "type": "game_win", "amount": prize_amount, "desc": desc_note, "timestamp": firestore.SERVER_TIMESTAMP
                })

        # Scenario 6: Both Steal OR Both AFK -> 100% burned & returned to Host
        else:
            result = "none"
            desc_note = "Both Steal" if (choice_a == "steal" and choice_b == "steal") else "Both AFK / Forfeit"
            if host_uid and prize_amount > 0:
                # TREAT BURNED MONEY AS REVENUE (30/7/63 split applies)
                platform_cut, host_final, referrer_uid, referrer_cut = calculate_payout_split(host_uid, prize_amount, db)
                
                # Update Host Game Wallet
                db.collection("game_wallets").document(host_uid).set({"balance": firestore.Increment(host_final)}, merge=True)
                db.collection("game_wallets").document(host_uid).collection("activity").add({
                    "type": "host_reclaim", 
                    "amount": host_final, 
                    "desc": f"Burned prize from {room_name} ({desc_note}). Platform kept fee.", 
                    "timestamp": firestore.SERVER_TIMESTAMP
                })

                # Update Referrer if active
                if referrer_uid and referrer_cut > 0:
                    ref_user_ref = db.collection("users").document(referrer_uid)
                    ref_user_ref.update({"referralBalance": firestore.Increment(referrer_cut)})
                    db.collection("game_wallets").document(referrer_uid).collection("activity").add({
                        "type": "referral_earning",
                        "amount": referrer_cut,
                        "desc": f"10% commission from {host_name}'s burned game prize",
                        "room": room_name,
                        "timestamp": firestore.SERVER_TIMESTAMP
                    })

        state["revealResult"] = result
        
        is_multi = state.get("isMultipleRounds", False)
        total_rounds = state.get("numberOfRounds", 1)
        current_round = state.get("currentRound", 1)
        
        if "playedUsers" not in state: state["playedUsers"] = []
        state["playedUsers"].extend([state["playerA"]["uid"], state["playerB"]["uid"]])

        if is_multi and current_round < total_rounds:
            state["status"] = "round_finished"
            state["currentRound"] = current_round + 1
            room_ref.update({
                "status": "round_finished",
                "currentRound": state["currentRound"],
                "revealResult": result,
                "playedUsers": state["playedUsers"],
                "choices": state["choices"]
            })
        else:
            state["status"] = "finished"
            state["finishedAt"] = time.time()
            room_ref.update({
                "status": "finished",
                "revealResult": result,
                "choices": state["choices"],
                "playedUsers": state["playedUsers"],
                "finishedAt": state["finishedAt"]
            })
            # Immediate in-memory task (backup)
            asyncio.create_task(cleanup_game_room(game_id))
            
        await manager.broadcast({"type": "game_update", "state": state}, game_id)
        print(f"Game {game_id}: Loop completed successfully")
    except Exception as e:
        print(f"ERROR in run_game_loop for {game_id}: {str(e)}")
        import traceback
        traceback.print_exc()

async def cleanup_game_room(game_id: str):
    """Background task to delete a room after 1 hour of inactivity/finish."""
    print(f"CLEANUP: Room {game_id} scheduled for deletion in 1 hour")
    await asyncio.sleep(3600)
    
    try:
        db = firestore.client()
        doc = db.collection("game_rooms").document(game_id).get()
        if not doc.exists: return

        print(f"CLEANUP: Deleting room {game_id} now")
        
        # 1. Inform any remaining users
        await manager.broadcast({
            "type": "game_update", 
            "state": {"status": "deleted", "message": "Room has been deleted after completion."}
        }, game_id)
        
        # 2. Delete from Firestore
        db.collection("game_rooms").document(game_id).delete()
        
        # 3. Close all active WebSockets for this game
        if game_id in manager.active_connections:
            for ws in list(manager.active_connections[game_id]):
                try:
                    await ws.close()
                except:
                    pass
            del manager.active_connections[game_id]
        
        # 4. Remove from memory
        if game_id in manager.game_states:
            del manager.game_states[game_id]
            
        print(f"CLEANUP: Room {game_id} successfully removed")
    except Exception as e:
        print(f"CLEANUP ERROR for {game_id}: {str(e)}")

async def start_periodic_cleanup():
    """Persistent worker to cleanup old rooms from Firestore every 10 minutes."""
    # Delay initial execution slightly to let the server start up first without blocking
    await asyncio.sleep(5)
    while True:
        try:
            print("WORKER: Running periodic room cleanup...")
            db = firestore.client()
            
            def fetch_finished_rooms():
                return list(db.collection("game_rooms").where("status", "==", "finished").stream())
                
            rooms = await asyncio.to_thread(fetch_finished_rooms)
            
            now = time.time()
            deleted_count = 0
            
            for room in rooms:
                data = room.to_dict()
                finished_at = data.get("finishedAt")
                
                # Delete if finished more than 1 hour ago (3600s)
                # Or if finishedAt is missing (assume old/stuck)
                if not finished_at or (now - finished_at > 3600):
                    print(f"WORKER: Deleting expired room {room.id}")
                    
                    def delete_doc(rid):
                        db.collection("game_rooms").document(rid).delete()
                        
                    await asyncio.to_thread(delete_doc, room.id)
                    deleted_count += 1
            
            if deleted_count > 0:
                print(f"WORKER: Cleaned up {deleted_count} rooms")
                
        except Exception as e:
            print(f"WORKER ERROR: {str(e)}")
            
        await asyncio.sleep(600) # Run every 10 minutes

@router.websocket("/{game_id}/ws")
async def game_websocket_endpoint(websocket: WebSocket, game_id: str, token: str = None):
    print(f"WS CONNECTION REQUEST: game_id={game_id}, token={'present' if token else 'none'}")
    from firebase_admin import auth
    
    uid = None
    is_admin = False
    
    if token:
        try:
            decoded_token = auth.verify_id_token(token)
            uid = decoded_token.get("uid")
            is_admin = bool(decoded_token.get("admin") or decoded_token.get("isAdmin", False))
            if not is_admin and uid:
                db = firestore.client()
                user_doc = db.collection("users").document(uid).get()
                if user_doc.exists:
                    u_data = user_doc.to_dict() or {}
                    is_admin = bool(u_data.get("isAdmin", False) or u_data.get("role") == "admin" or u_data.get("is_admin", False))
        except Exception as e:
            print(f"WS Auth Token Verification Note: {str(e)}")
            
    try:
        await manager.connect(websocket, game_id)
        print(f"WS ACCEPTED: {game_id} (uid={uid}, is_admin={is_admin})")
        
        db = firestore.client()
        room_ref = db.collection("game_rooms").document(game_id)
        
        if game_id not in manager.game_states:
            print(f"Initializing state for {game_id} from Firestore")
            try:
                room_doc = room_ref.get()
                if room_doc.exists:
                    data = room_doc.to_dict()
                    manager.game_states[game_id] = {
                        "status": data.get("status", "waiting"),
                        "playerA": data.get("playerA"),
                        "playerB": data.get("playerB"),
                        "timer": data.get("timer", 0),
                        "choices": data.get("choices", {}),
                        "revealResult": data.get("revealResult"),
                        "participants": data.get("participants", []),
                        "playedUsers": data.get("playedUsers", []),
                        "messages": data.get("messages", []),
                        "currentRound": data.get("currentRound", 1),
                        "numberOfRounds": data.get("numberOfRounds", 1),
                        "isMultipleRounds": data.get("isMultipleRounds", False),
                        "prizeAmount": data.get("prizeAmount", 0),
                        "hostUid": data.get("hostUid")
                    }
                else:
                    print(f"Room {game_id} not found in Firestore, using default state")
                    manager.game_states[game_id] = {
                        "status": "waiting",
                        "playerA": None,
                        "playerB": None,
                        "timer": 0,
                        "choices": {},
                        "revealResult": None,
                        "participants": [],
                        "playedUsers": [],
                        "messages": [],
                        "currentRound": 1
                    }
            except Exception as fe:
                print(f"Firestore error during WS init: {str(fe)}")
                manager.game_states[game_id] = { "status": "waiting", "participants": [], "messages": [], "choices": {} }

        # Send initial state
        await websocket.send_json({
            "type": "game_update",
            "state": manager.game_states[game_id]
        })

        while True:
            try:
                data = await websocket.receive_text()
                msg = json.loads(data)
                action = msg.get("type")
                state = manager.game_states[game_id]
                
                # Check user identity & admin status dynamically from msg if needed
                client_uid = msg.get("uid") or uid
                if client_uid and not uid:
                    uid = client_uid
                    
                if not is_admin and client_uid:
                    db = firestore.client()
                    user_doc = db.collection("users").document(client_uid).get()
                    if user_doc.exists:
                        u_data = user_doc.to_dict() or {}
                        is_admin = bool(u_data.get("isAdmin", False) or u_data.get("role") == "admin" or u_data.get("is_admin", False))

                if action == "join":
                    user_info = {"uid": uid or f"anon_{uuid.uuid4().hex[:6]}", "displayName": msg.get("name", "User"), "photoURL": msg.get("photo"), "isBot": False}
                    if "viewers" not in state: state["viewers"] = []
                    if not any(v["uid"] == user_info["uid"] for v in state["viewers"]):
                        state["viewers"].append(user_info)
                    await manager.broadcast({"type": "game_update", "state": {"viewers": state["viewers"]}}, game_id)

                elif action == "chat":
                    channel = msg.get("channel", "viewer")
                    message = {
                        "id": f"msg_{uuid.uuid4().hex[:8]}",
                        "uid": uid or client_uid,
                        "userName": msg.get("name", "User"),
                        "text": msg.get("text"),
                        "timestamp": time.time(),
                        "reactions": {},
                        "channel": channel
                    }
                    if "messages" not in state: state["messages"] = []
                    state["messages"].append(message)
                    
                    # Keep only last 100
                    if len(state["messages"]) > 100:
                        state["messages"] = state["messages"][-100:]
                    
                    # PERSIST TO FIRESTORE
                    room_ref.update({"messages": state["messages"]})
                    
                    await manager.broadcast({"type": "chat", "message": message}, game_id)

                elif action == "add_bots":
                    if is_admin:
                        num_rounds = state.get("numberOfRounds", 1)
                        max_parts = num_rounds * 2
                        current_parts = len(state.get("participants", []))
                        slots_left = max_parts - current_parts
                        if slots_left > 0:
                            bots_to_add = min(2, slots_left)
                            new_bots = []
                            for _ in range(bots_to_add):
                                bot_uid = f"bot_{uuid.uuid4().hex[:6]}"
                                new_bots.append({
                                    "uid": bot_uid,
                                    "displayName": f"Bot {random.randint(100, 999)}",
                                    "photoURL": f"https://api.dicebear.com/7.x/bottts/svg?seed={bot_uid}",
                                    "isBot": True
                                })
                            state["participants"].extend(new_bots)
                            room_ref.update({"participants": state["participants"]})
                            await manager.broadcast({"type": "game_update", "state": {"participants": state["participants"]}}, game_id)

                elif action == "chat_reaction":
                    await manager.broadcast({
                        "type": "chat_reaction",
                        "messageId": msg.get("messageId"),
                        "emoji": msg.get("emoji"),
                        "uid": uid or client_uid
                    }, game_id)

                elif action == "pick_random_players":
                    is_admin_action = is_admin or (uid and uid == state.get("hostUid")) or (client_uid and client_uid == state.get("hostUid")) or msg.get("isAdmin")
                    state["status"] = "selecting"
                    state["choices"] = {}
                    state["revealResult"] = None
                    try:
                        room_ref.update({"status": "selecting", "choices": {}, "revealResult": None})
                        await manager.broadcast({"type": "game_update", "state": state}, game_id)
                        await asyncio.sleep(4)
                        
                        played = set(state.get("playedUsers", []))
                        
                        # Pool for selection
                        participants = state.get("participants", [])
                        viewers = state.get("viewers", [])
                        
                        # All participants who haven't played yet in this multi-round session
                        eligible = [p for p in participants if p["uid"] not in played]
                        
                        # If admin is picking and no paid participants, allow viewers too
                        if is_admin_action and len(eligible) < 2:
                            for v in viewers:
                                if v["uid"] not in [p["uid"] for p in eligible]:
                                    eligible.append(v)
                        
                        # If still not enough, allow all participants
                        if len(eligible) < 2 and len(participants) >= 2:
                            eligible = list(participants)
                        
                        if len(eligible) >= 2:
                            # Pick 2 contestants
                            picked = random.sample(eligible, 2)
                            state["playerA"] = picked[0]
                            state["playerB"] = picked[1]
                            state["status"] = "selecting"
                            
                            room_ref.update({
                                "playerA": state["playerA"], 
                                "playerB": state["playerB"],
                                "status": "selecting",
                                "choices": {},
                                "revealResult": None
                            })
                            await manager.broadcast({"type": "game_update", "state": state}, game_id)
                            asyncio.create_task(run_game_loop(game_id))
                        else:
                            state["status"] = "waiting"
                            room_ref.update({"status": "waiting"})
                            await manager.broadcast({"type": "game_update", "state": state}, game_id)
                    except Exception as e:
                        print(f"Error picking players: {str(e)}")
                        import traceback
                        traceback.print_exc()

                elif action == "make_choice":
                    player_uids = [p["uid"] for p in [state.get("playerA"), state.get("playerB")] if p]
                    if uid in player_uids:
                        if state["status"] in ["choosing", "sudden_death", "revealing"]:
                            if state["status"] == "revealing" and state.get("timer", 0) <= 5:
                                # Locked in, cannot change choice
                                pass
                            else:
                                state["choices"][uid] = msg.get("choice")
                                room_ref.update({"choices": state["choices"]})
                                await manager.broadcast({
                                    "type": "game_update", 
                                    "state": {"choices": {k: True for k, v in state["choices"].items() if v}}
                                }, game_id)

                elif action == "emoji":
                    await manager.broadcast({
                        "type": "emoji",
                        "emoji": msg.get("emoji"),
                        "uid": uid,
                        "origin": msg.get("origin")
                    }, game_id)

                elif action == "delete_room":
                    # Only Host or Admin can delete
                    is_admin_action = is_admin
                    is_host_action = uid == state.get("hostUid")
                    
                    if is_admin_action or is_host_action:
                        print(f"MANUAL DELETE: Room {game_id} by {uid}")
                        try:
                            # 1. Inform remaining users
                            await manager.broadcast({
                                "type": "game_update", 
                                "state": {"status": "deleted", "message": "Room has been closed by the host."}
                            }, game_id)
                            
                            # 2. Delete from Firestore
                            db.collection("game_rooms").document(game_id).delete()
                            
                            # 3. Close all active WebSockets
                            if game_id in manager.active_connections:
                                for ws_conn in list(manager.active_connections[game_id]):
                                    try:
                                        await ws_conn.close()
                                    except:
                                        pass
                                del manager.active_connections[game_id]
                            
                            # 4. Remove from memory
                            if game_id in manager.game_states:
                                del manager.game_states[game_id]
                                
                        except Exception as de:
                            print(f"Manual delete error: {str(de)}")

            except Exception as e:
                print(f"Error processing WS message: {str(e)}")
                break

    except WebSocketDisconnect:
        manager.disconnect(websocket, game_id)
    except Exception as e:
        print(f"WS CONNECTION ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
