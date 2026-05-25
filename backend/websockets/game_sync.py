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
            state["timer"] -= 1
            await manager.broadcast({"type": "game_update", "state": {"timer": state["timer"]}}, game_id)
        
        # 2. Choosing Phase (Waiting for Humans)
        print(f"Game {game_id}: Entering choosing phase")
        state["status"] = "choosing"
        state["timer"] = 0 
        state["choices"] = {}
        room_ref.update({"status": "choosing", "timer": 0, "choices": {}})
        await manager.broadcast({"type": "game_update", "state": state}, game_id)

        # Wait until all human contestants have made at least one choice
        while True:
            await asyncio.sleep(1)
            if game_id not in manager.game_states: return

            # Treat missing isBot as False (Human)
            human_uids = [p["uid"] for p in [state.get("playerA"), state.get("playerB")] if p and not p.get("isBot", False)]
            
            # If no humans, break immediately (two bots)
            if not human_uids: break
            
            # Check if all human players have made a choice
            if all(uid in state.get("choices", {}) for uid in human_uids):
                print(f"Game {game_id}: All human contestants chosen.")
                break

        # Auto-pick for any bots before entering reveal
        if state.get("playerA") and state["playerA"].get("isBot") and state["playerA"]["uid"] not in state["choices"]:
            state["choices"][state["playerA"]["uid"]] = random.choice(["split", "steal"])
        if state.get("playerB") and state["playerB"].get("isBot") and state["playerB"]["uid"] not in state["choices"]:
            state["choices"][state["playerB"]["uid"]] = random.choice(["split", "steal"])

        # 3. Reveal Phase (10s suspense - choices CAN be changed here)
        print(f"Game {game_id}: Entering revealing phase (10s to change mind)")
        state["status"] = "revealing"
        state["timer"] = 10
        room_ref.update({"status": "revealing", "timer": 10})
        await manager.broadcast({"type": "game_update", "state": state}, game_id)

        while state["timer"] > 0:
            await asyncio.sleep(1)
            state["timer"] -= 1
            # IMPORTANT: We broadcast a partial state. 
            # We must NOT overwrite state["choices"] in memory with booleans!
            obscured_choices = {k: True for k in state["choices"].keys()}
            await manager.broadcast({"type": "game_update", "state": {"timer": state["timer"], "choices": obscured_choices}}, game_id)

        # Final Result Calculation
        print(f"Game {game_id}: Calculating final results")

        choice_a = state.get("choices", {}).get(state["playerA"]["uid"], "steal")
        choice_b = state.get("choices", {}).get(state["playerB"]["uid"], "steal")
        
        result = "none"
        prize_amount = state.get("prizeAmount", 0)
        host_uid = state.get("hostUid")
        
        if choice_a == "split" and choice_b == "split":
            result = "share"
            half_prize = prize_amount / 2
            for p in [state["playerA"], state["playerB"]]:
                if not p.get("isBot"):
                    db.collection("game_wallets").document(p["uid"]).set({"balance": firestore.Increment(half_prize)}, merge=True)
                    db.collection("game_wallets").document(p["uid"]).collection("activity").add({
                        "type": "game_win", "amount": half_prize, "desc": f"Won Split or Steal (Shared)", "timestamp": firestore.SERVER_TIMESTAMP
                    })
        elif choice_a == "split" and choice_b == "steal":
            result = "one_steal"
            if not state["playerB"].get("isBot"):
                db.collection("game_wallets").document(state["playerB"]["uid"]).set({"balance": firestore.Increment(prize_amount)}, merge=True)
                db.collection("game_wallets").document(state["playerB"]["uid"]).collection("activity").add({
                    "type": "game_win", "amount": prize_amount, "desc": f"Won Split or Steal (Stolen)", "timestamp": firestore.SERVER_TIMESTAMP
                })
        elif choice_a == "steal" and choice_b == "split":
            result = "one_steal"
            if not state["playerA"].get("isBot"):
                db.collection("game_wallets").document(state["playerA"]["uid"]).set({"balance": firestore.Increment(prize_amount)}, merge=True)
                db.collection("game_wallets").document(state["playerA"]["uid"]).collection("activity").add({
                    "type": "game_win", "amount": prize_amount, "desc": f"Won Split or Steal (Stolen)", "timestamp": firestore.SERVER_TIMESTAMP
                })
        else:
            result = "none"
            if host_uid:
                # TREAT BURNED MONEY AS REVENUE (30/7/63 split applies)
                platform_cut, host_final, referrer_uid, referrer_cut = calculate_payout_split(host_uid, prize_amount, db)
                
                # Update Host Game Wallet
                db.collection("game_wallets").document(host_uid).set({"balance": firestore.Increment(host_final)}, merge=True)
                db.collection("game_wallets").document(host_uid).collection("activity").add({
                    "type": "host_reclaim", 
                    "amount": host_final, 
                    "desc": f"Burned money from {state.get('roomName', 'Game')}. Platform kept fee.", 
                    "timestamp": firestore.SERVER_TIMESTAMP
                })

                # Update Referrer if active
                if referrer_uid and referrer_cut > 0:
                    ref_user_ref = db.collection("users").document(referrer_uid)
                    ref_user_ref.update({"referralBalance": firestore.Increment(referrer_cut)})
                    # Log activity for referrer (They see who and where)
                    db.collection("game_wallets").document(referrer_uid).collection("activity").add({
                        "type": "referral_earning",
                        "amount": referrer_cut,
                        "desc": f"10% commission from {state.get('hostName', 'Host')}'s burned game prize",
                        "room": state.get('roomName'),
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
    while True:
        try:
            print("WORKER: Running periodic room cleanup...")
            db = firestore.client()
            rooms = db.collection("game_rooms").where("status", "==", "finished").stream()
            
            now = time.time()
            deleted_count = 0
            
            for room in rooms:
                data = room.to_dict()
                finished_at = data.get("finishedAt")
                
                # Delete if finished more than 1 hour ago (3600s)
                # Or if finishedAt is missing (assume old/stuck)
                if not finished_at or (now - finished_at > 3600):
                    print(f"WORKER: Deleting expired room {room.id}")
                    db.collection("game_rooms").document(room.id).delete()
                    deleted_count += 1
            
            if deleted_count > 0:
                print(f"WORKER: Cleaned up {deleted_count} rooms")
                
        except Exception as e:
            print(f"WORKER ERROR: {str(e)}")
            
        await asyncio.sleep(600) # Run every 10 minutes

@router.websocket("/{game_id}/ws")
async def game_websocket_endpoint(websocket: WebSocket, game_id: str):
    print(f"WS CONNECTION REQUEST: game_id={game_id}")
    try:
        await manager.connect(websocket, game_id)
        print(f"WS ACCEPTED: {game_id}")
        
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
                uid = msg.get("uid")
                action = msg.get("type")
                state = manager.game_states[game_id]

                if action == "join":
                    user_info = {"uid": uid, "displayName": msg.get("name", "User"), "photoURL": msg.get("photo"), "isBot": False}
                    if "viewers" not in state: state["viewers"] = []
                    if not any(v["uid"] == uid for v in state["viewers"]):
                        state["viewers"].append(user_info)
                    await manager.broadcast({"type": "game_update", "state": {"viewers": state["viewers"]}}, game_id)

                elif action == "chat":
                    channel = msg.get("channel", "viewer")
                    message = {
                        "id": f"msg_{uuid.uuid4().hex[:8]}",
                        "uid": uid,
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
                    if msg.get("isAdmin", False):
                        new_bots = [
                            {"uid": f"bot_{uuid.uuid4().hex[:6]}", "displayName": f"Bot {random.randint(100, 999)}", "photoURL": f"https://api.dicebear.com/7.x/bottts/svg?seed={random.random()}", "isBot": True},
                            {"uid": f"bot_{uuid.uuid4().hex[:6]}", "displayName": f"Bot {random.randint(100, 999)}", "photoURL": f"https://api.dicebear.com/7.x/bottts/svg?seed={random.random()}", "isBot": True}
                        ]
                        state["participants"].extend(new_bots)
                        room_ref.update({"participants": firestore.ArrayUnion(new_bots)})
                        await manager.broadcast({"type": "game_update", "state": {"participants": state["participants"]}}, game_id)

                elif action == "chat_reaction":
                    await manager.broadcast({
                        "type": "chat_reaction",
                        "messageId": msg.get("messageId"),
                        "emoji": msg.get("emoji"),
                        "uid": uid
                    }, game_id)

                elif action == "pick_random_players":
                    is_admin_action = msg.get("isAdmin", False)
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
                        
                        if is_admin_action:
                            # Admin can pick ANYONE in the room (participants + viewers)
                            # Filter unique humans first
                            all_humans = [p for p in participants if not p.get("isBot")]
                            all_humans.extend([v for v in viewers if v["uid"] not in [p["uid"] for p in all_humans]])
                            
                            # ADMIN BYPASS: In test/admin mode, we ignore 'played' list for the admin themselves
                            eligible_humans = [p for p in all_humans if p["uid"] not in played or p["uid"] == uid]
                            eligible_bots = [p for p in participants if p.get("isBot")]
                            
                            eligible = eligible_humans + eligible_bots
                        else:
                            # Normal host only picks from paid human participants who haven't played
                            eligible = [p for p in participants if p["uid"] not in played and not p.get("isBot")]
                        
                        if len(eligible) >= 2:
                            # If admin is picking, ensure the admin themselves is picked if they are in the room
                            admin_user = next((p for p in all_humans if p["uid"] == uid), None) if is_admin_action else None
                            
                            if is_admin_action and admin_user:
                                # Start with the admin
                                picked = [admin_user]
                                # Pick one more from everyone else
                                others = [p for p in eligible if p["uid"] != uid]
                                if others:
                                    picked.append(random.choice(others))
                                    random.shuffle(picked)
                                else:
                                    # Fallback if somehow no others
                                    picked = random.sample(eligible, 2)
                            else:
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
                    if state["status"] in ["choosing", "revealing"]:
                        state["choices"][uid] = msg.get("choice")
                        await manager.broadcast({
                            "type": "game_update", 
                            "state": {"choices": {k: True for k in state["choices"].keys()}}
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
                    is_admin_action = msg.get("isAdmin", False)
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
