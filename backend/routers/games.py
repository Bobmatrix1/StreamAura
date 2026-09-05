from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, List, Any, Optional
from pydantic import BaseModel
import uuid
import time
import firebase_admin
from firebase_admin import firestore
from core.security import get_current_user
from core.payouts import calculate_payout_split

router = APIRouter()

def get_db():
    return firestore.client()


class JoinPoolRequest(BaseModel):
    gameId: str
    payment_wallet: Optional[str] = 'normal'

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
    payment_wallet: Optional[str] = 'normal'

class FundGameWalletRequest(BaseModel):
    amount: float
    source_wallet: str # 'funded', 'host', 'referral'

class WinningsClaimRequest(BaseModel):
    amount: float

# =================================================================
# === WALLET INTERNAL TRANSFERS ===================================
# =================================================================

@router.post("/fund-from-main")
async def fund_game_wallet_from_main(request: FundGameWalletRequest, user: dict = Depends(get_current_user)):
    """
    Move funds from Main Wallets (Funded/Host/Referral) to Game Wallet.
    """
    db = get_db()
    uid = user['uid']
    
    try:
        if request.amount <= 0:
            raise HTTPException(status_code=400, detail="Invalid amount")
            
        # 1. Deduct from Source
        if request.source_wallet == "referral":
            source_ref = db.collection("users").document(uid)
            source_field = "referralBalance"
        else:
            source_ref = db.collection("room_wallets").document(uid)
            source_field = "funded_balance" if request.source_wallet == "funded" else "host_balance"
            
        source_doc = source_ref.get()
        if not source_doc.exists or source_doc.to_dict().get(source_field, 0) < request.amount:
            raise HTTPException(status_code=400, detail=f"Insufficient {request.source_wallet} balance.")
            
        # Deduct
        updates = {source_field: firestore.Increment(-request.amount)}
        if request.source_wallet != "referral":
            updates["balance"] = firestore.Increment(-request.amount)
        source_ref.update(updates)
        
        # 2. Add to Game Wallet
        game_wallet_ref = db.collection("game_wallets").document(uid)
        game_wallet_ref.set({"balance": firestore.Increment(request.amount)}, merge=True)
        
        # 3. Log Activity
        db.collection("game_wallets").document(uid).collection("activity").add({
            "type": "fund_from_main",
            "amount": request.amount,
            "desc": f"Funded game wallet with ₦{request.amount:,.2f} from {'main' if request.source_wallet == 'funded' else request.source_wallet} wallet",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        return {"success": True, "message": "Game wallet funded successfully"}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =================================================================
# === GAME LOBBY & CREATION =======================================
# =================================================================

@router.post("/v1/claim")
async def claim_game_winnings_v1(request: WinningsClaimRequest, user: dict = Depends(get_current_user)):
    db = get_db()
    uid = user['uid']
    try:
        amt = request.amount
        if amt <= 0: raise HTTPException(status_code=400, detail="Invalid amount")
        game_wallet_ref = db.collection("game_wallets").document(uid)
        wallet_doc = game_wallet_ref.get()
        if not wallet_doc.exists or wallet_doc.to_dict().get("balance", 0) < amt:
            raise HTTPException(status_code=400, detail="Insufficient game winnings.")
        game_wallet_ref.update({"balance": firestore.Increment(-amt)})
        main_wallet_ref = db.collection("room_wallets").document(uid)
        main_wallet_ref.set({
            "host_balance": firestore.Increment(amt),
            "balance": firestore.Increment(amt)
        }, merge=True)
        db.collection("game_wallets").document(uid).collection("activity").add({
            "type": "transfer_to_main",
            "amount": amt,
            "desc": f"Moved ₦{amt:,.2f} to main earnings wallet",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        return {"success": True, "message": f"₦{amt:,.2f} moved successfully"}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/referrals/list")
async def get_referred_users(user: dict = Depends(get_current_user)):
    db = get_db()
    uid = user['uid']
    try:
        # Fetch users referred by this UID
        users_ref = db.collection("users").where("referredBy", "==", uid).stream()
        
        referred_list = []
        for u in users_ref:
            data = u.to_dict()
            referred_list.append({
                "uid": u.id,
                "displayName": data.get("displayName", "Anonymous"),
                "photoURL": data.get("photoURL"),
                "createdAt": data.get("createdAt")
            })
            
        return {"success": True, "referrals": referred_list}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create")
async def create_game_room(request: CreateGameRequest, user: dict = Depends(get_current_user)):
    db = get_db()
    uid = user['uid']
    
    # Check if admin
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()
    is_admin = user_doc.to_dict().get("isAdmin", False) if user_doc.exists else False
    
    total_prize_cost = request.prizePerRound * (request.numberOfRounds if request.isMultipleRounds else 1)
    
    # Deduct exclusively from Game Wallet
    if total_prize_cost > 0:
        wallet_ref = db.collection("game_wallets").document(uid)
        wallet_doc = wallet_ref.get()
        if not wallet_doc.exists or wallet_doc.to_dict().get("balance", 0) < total_prize_cost:
            raise HTTPException(status_code=400, detail="Insufficient game wallet balance to fund the prize.")
        wallet_ref.update({"balance": firestore.Increment(-total_prize_cost)})

        # Log exclusively to Game Wallet Activity subcollection
        db.collection("game_wallets").document(uid).collection("activity").add({
            "type": "create_room_prize",
            "amount": total_prize_cost,
            "desc": f"Funded Game Prize: {request.roomName}",
            "timestamp": firestore.SERVER_TIMESTAMP
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
        "playedUsers": [],
        "hostEarningsRate": 1.0 if is_admin else 0.70
    }
    
    db.collection("game_rooms").document(game_id).set(payload)
    return {"success": True, "gameId": game_id}

@router.post("/join-pool")
async def join_game_pool(request: JoinPoolRequest, user: dict = Depends(get_current_user)):
    db = get_db()
    uid = user['uid']
    
    try:
        game_ref = db.collection("game_rooms").document(request.gameId)
        game_wallet_ref = db.collection("game_wallets").document(uid)
        
        transaction = db.transaction()
        
        @firestore.transactional
        def transactional_join(transaction):
            # All reads must precede writes in a Firestore transaction
            game_snapshot = game_ref.get(transaction=transaction)
            if not game_snapshot.exists:
                raise HTTPException(status_code=404, detail="Game room not found.")
            
            game_data = game_snapshot.to_dict()
            entry_fee = game_data.get("entryFee", 0)
            num_rounds = game_data.get("numberOfRounds", 1)
            max_players = num_rounds * 2
            
            # Check if already in pool
            participants = game_data.get("participants", [])
            if any(p["uid"] == uid for p in participants):
                return {"success": True, "message": "Already in pool."}
                
            if len(participants) >= max_players:
                raise HTTPException(status_code=400, detail=f"The player pool is full. Maximum {max_players} players allowed for a {num_rounds}-round game.")
            
            # Check user balance
            game_wallet_snapshot = game_wallet_ref.get(transaction=transaction)
            if not game_wallet_snapshot.exists or game_wallet_snapshot.to_dict().get("balance", 0) < entry_fee:
                raise HTTPException(status_code=400, detail="Insufficient game wallet balance.")
                
            # Calculate payout split (reads host user doc under the hood)
            host_uid = game_data.get("hostUid")
            host_name = game_data.get("hostName", "Host")
            platform_cut, host_final, referrer_uid, referrer_cut = calculate_payout_split(host_uid, entry_fee, db, transaction=transaction)
            
            # Reads finished. Execute writes:
            
            # Deduct entry fee
            transaction.update(game_wallet_ref, {"balance": firestore.Increment(-entry_fee)})
            
            # Log to Game Wallet Activity subcollection
            activity_ref = game_wallet_ref.collection("activity").document()
            transaction.set(activity_ref, {
                "type": "join_pool_fee",
                "amount": entry_fee,
                "desc": f"Paid Entry Fee: {game_data.get('roomName', 'Game')}",
                "timestamp": firestore.SERVER_TIMESTAMP
            })
            
            # Add Participant
            user_info = {
                "uid": uid,
                "displayName": user.get("name", "Anonymous"),
                "photoURL": user.get("picture"),
                "joinedAt": time.time(),
                "isBot": False
            }
            transaction.update(game_ref, {"participants": firestore.ArrayUnion([user_info])})
            
            # Handle Host Payout
            if host_uid:
                host_wallet_ref = db.collection("game_wallets").document(host_uid)
                transaction.set(host_wallet_ref, {"balance": firestore.Increment(host_final)}, merge=True)
                
                host_activity_ref = host_wallet_ref.collection("activity").document()
                transaction.set(host_activity_ref, {
                    "type": "entry_earnings",
                    "amount": host_final,
                    "desc": f"Earnings from {game_data.get('roomName')} entry fee",
                    "timestamp": firestore.SERVER_TIMESTAMP
                })
                
            # Handle Referrer Payout
            if referrer_uid and referrer_cut > 0:
                ref_user_ref = db.collection("users").document(referrer_uid)
                transaction.update(ref_user_ref, {"referralBalance": firestore.Increment(referrer_cut)})
                
                ref_activity_ref = db.collection("game_wallets").document(referrer_uid).collection("activity").document()
                transaction.set(ref_activity_ref, {
                    "type": "referral_earning",
                    "amount": referrer_cut,
                    "desc": f"10% commission from {host_name}'s game entry",
                    "timestamp": firestore.SERVER_TIMESTAMP
                })
                
            return {"success": True, "message": "Joined pool successfully!"}
            
        result = transactional_join(transaction)
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{game_id}")
async def delete_game_room(game_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    uid = user['uid']
    
    try:
        game_ref = db.collection("game_rooms").document(game_id)
        game_doc = game_ref.get()
        
        if not game_doc.exists:
            raise HTTPException(status_code=404, detail="Room not found")
            
        data = game_doc.to_dict()
        user_ref = db.collection("users").document(uid)
        user_doc = user_ref.get()
        is_admin = user_doc.to_dict().get("isAdmin", False) if user_doc.exists else False
        
        if not is_admin and data.get("hostUid") != uid:
            raise HTTPException(status_code=403, detail="Unauthorized to delete this room")
            
        # Refund host unspent prize & participant entry fees if room was still waiting/selecting
        if data.get("status") in ["waiting", "selecting"]:
            host_uid = data.get("hostUid")
            total_rounds = data.get("numberOfRounds", 1) if data.get("isMultipleRounds") else 1
            prize_per_round = data.get("prizeAmount", 0)
            total_prize = prize_per_round * total_rounds
            
            if total_prize > 0 and host_uid:
                db.collection("game_wallets").document(host_uid).set({"balance": firestore.Increment(total_prize)}, merge=True)
                db.collection("game_wallets").document(host_uid).collection("activity").add({
                    "type": "room_cancelled_refund",
                    "amount": total_prize,
                    "desc": f"Refunded prize from cancelled room: {data.get('roomName', 'Game')}",
                    "timestamp": firestore.SERVER_TIMESTAMP
                })

            entry_fee = data.get("entryFee", 0)
            participants = data.get("participants", [])
            for p in participants:
                if not p.get("isBot") and p.get("uid") and entry_fee > 0:
                    db.collection("game_wallets").document(p["uid"]).set({"balance": firestore.Increment(entry_fee)}, merge=True)
                    db.collection("game_wallets").document(p["uid"]).collection("activity").add({
                        "type": "pool_cancelled_refund",
                        "amount": entry_fee,
                        "desc": f"Refunded entry fee from cancelled room: {data.get('roomName', 'Game')}",
                        "timestamp": firestore.SERVER_TIMESTAMP
                    })

        from websockets.game_sync import manager
        if game_id in manager.active_connections:
            await manager.broadcast({
                "type": "game_update", 
                "state": {"status": "deleted", "message": "Room has been closed."}
            }, game_id)
            
            for ws_conn in list(manager.active_connections[game_id]):
                try: await ws_conn.close()
                except: pass
            del manager.active_connections[game_id]
            
        if game_id in manager.game_states:
            del manager.game_states[game_id]
            
        game_ref.delete()
        return {"success": True, "message": "Room deleted successfully"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
