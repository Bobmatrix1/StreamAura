from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, List, Any, Optional
from pydantic import BaseModel
import uuid
import time
import firebase_admin
from firebase_admin import firestore
from core.security import get_current_user

router = APIRouter()

def get_db():
    return firestore.client()

class JoinPoolRequest(BaseModel):
    gameId: str

class CreateGameRequest(BaseModel):
    roomName: str
    entryFee: float
    prizePerRound: float
    isMultipleRounds: bool
    numberOfRounds: int
    startCondition: str
    autoStartUsers: Optional[int] = None
    isManualPairing: bool
    playerAId: Optional[str] = None
    playerBId: Optional[str] = None

@router.post("/create")
async def create_game_room(request: CreateGameRequest, user: dict = Depends(get_current_user)):
    db = get_db()
    uid = user['uid']
    
    # Check if admin
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()
    is_admin = user_doc.to_dict().get("isAdmin", False) if user_doc.exists else False
    
    total_prize_cost = request.prizePerRound * (request.numberOfRounds if request.isMultipleRounds else 1)
    
    # Deduct from normal wallet if not admin
    if not is_admin and total_prize_cost > 0:
        wallet_ref = db.collection("room_wallets").document(uid)
        wallet_doc = wallet_ref.get()
        if not wallet_doc.exists or wallet_doc.to_dict().get("balance", 0) < total_prize_cost:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance to fund the prize.")
        wallet_ref.update({"balance": firestore.Increment(-total_prize_cost)})
        
        # Log Transaction for History
        db.collection("transactions").add({
            "user_uid": uid,
            "type": "purchase",
            "amount": total_prize_cost,
            "title": f"Funded Game Prize: {request.roomName}",
            "status": "completed",
            "timestamp": firestore.SERVER_TIMESTAMP,
            "date": "Just Now" # Frontend handles real formatting
        })
    
    game_id = f"game_{uuid.uuid4().hex[:12]}"
    
    payload = {
        "roomName": request.roomName,
        "gameType": 'split_or_steal',
        "hostUid": uid,
        "hostName": user.get('name', 'Host'),
        "entryFee": request.entryFee,
        "prizeAmount": request.prizePerRound,
        "isMultipleRounds": request.isMultipleRounds,
        "numberOfRounds": request.numberOfRounds,
        "currentRound": 1,
        "startCondition": request.startCondition,
        "autoStartUsers": request.autoStartUsers,
        "isManualPairing": is_admin and request.isManualPairing,
        "playerAId": request.playerAId if (is_admin and request.isManualPairing) else None,
        "playerBId": request.playerBId if (is_admin and request.isManualPairing) else None,
        "status": 'waiting',
        "createdAt": firestore.SERVER_TIMESTAMP,
        "participants": [],
        "playedUsers": [], # To track users who already played in multi-round
        "hostEarningsRate": 1.0 if is_admin else 0.70
    }
    
    db.collection("game_rooms").document(game_id).set(payload)
    return {"success": True, "gameId": game_id}

@router.post("/join-pool")
async def join_game_pool(request: JoinPoolRequest, user: dict = Depends(get_current_user)):
    db = get_db()
    uid = user['uid']
    
    try:
        # 1. Fetch Game Room
        game_ref = db.collection("game_rooms").document(request.gameId)
        game_doc = game_ref.get()
        
        if not game_doc.exists:
            raise HTTPException(status_code=404, detail="Game room not found.")
        
        game_data = game_doc.to_dict()
        entry_fee = game_data.get("entryFee", 0)
        
        # 2. Check if already in pool
        participants = game_data.get("participants", [])
        if any(p["uid"] == uid for p in participants):
            return {"success": True, "message": "Already in pool."}
        
        # 3. Process Payment (Deduct from room_wallets)
        wallet_ref = db.collection("room_wallets").document(uid)
        wallet_doc = wallet_ref.get()
        
        if not wallet_doc.exists or wallet_doc.to_dict().get("balance", 0) < entry_fee:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance.")
        
        # Atomic Deduction
        wallet_ref.update({"balance": firestore.Increment(-entry_fee)})
        
        # Log Transaction
        db.collection("transactions").add({
            "user_uid": uid,
            "type": "purchase",
            "amount": entry_fee,
            "title": f"Entry Fee: {game_data.get('roomName', 'Game')}",
            "status": "completed",
            "timestamp": firestore.SERVER_TIMESTAMP,
            "date": "Just Now"
        })
        
        # 4. Add Participant to Room
        user_info = {
            "uid": uid,
            "displayName": user.get("name", "Anonymous"),
            "photoURL": user.get("picture"), # Fixed key
            "joinedAt": time.time() # Fixed: use standard time instead of SERVER_TIMESTAMP in ArrayUnion
        }
        game_ref.update({"participants": firestore.ArrayUnion([user_info])})
        
        # 5. Handle Host/Admin Payout (70% or 100%) routed to GAME WALLET
        host_uid = game_data.get("hostUid")
        earnings_rate = game_data.get("hostEarningsRate", 0.70)
        host_cut = entry_fee * earnings_rate
        
        if host_uid:
            host_wallet_ref = db.collection("game_wallets").document(host_uid)
            host_wallet_ref.set({"balance": firestore.Increment(host_cut)}, merge=True)
            # Add to activity
            activity_ref = db.collection("game_wallets").document(host_uid).collection("activity").document()
            activity_ref.set({
                "type": "entry_earnings",
                "amount": host_cut,
                "desc": f"Earnings from {game_data.get('roomName')} entry fee",
                "timestamp": firestore.SERVER_TIMESTAMP
            })

        return {"success": True, "message": "Joined pool successfully!"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

