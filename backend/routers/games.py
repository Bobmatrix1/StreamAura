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
    entryType: Optional[str] = "cash"
    prizePerRound: float
    prizeType: Optional[str] = "cash"
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

class ProcessReferralRequest(BaseModel):
    referrerUid: str

# =================================================================
# === WALLET INTERNAL TRANSFERS ===================================
# =================================================================

@router.post("/fund-from-main")
async def fund_game_wallet_from_main(request: FundGameWalletRequest, user: dict = Depends(get_current_user)):
    """
    Move funds from Main Wallets (Funded/Host/Referral) to Game Wallet.
    Uses Firestore atomic transaction to prevent race condition balance duplication.
    Tracks unspent funded deposits to prevent withdrawal fee arbitrage (5% vs 1%).
    """
    db = get_db()
    uid = user['uid']
    
    try:
        amt = round(float(request.amount), 2)
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Invalid amount")
            
        if request.source_wallet == "referral":
            source_ref = db.collection("users").document(uid)
            source_field = "referralBalance"
        else:
            source_ref = db.collection("room_wallets").document(uid)
            source_field = "funded_balance" if request.source_wallet == "funded" else "host_balance"
            
        game_wallet_ref = db.collection("game_wallets").document(uid)
        activity_ref = game_wallet_ref.collection("activity").document()

        transaction = db.transaction()

        @firestore.transactional
        def transactional_fund(transaction):
            source_doc = source_ref.get(transaction=transaction)
            if not source_doc.exists or float(source_doc.to_dict().get(source_field, 0) or 0) < amt:
                raise HTTPException(status_code=400, detail=f"Insufficient {request.source_wallet} balance.")
                
            updates = {source_field: firestore.Increment(-amt)}
            if request.source_wallet != "referral":
                updates["balance"] = firestore.Increment(-amt)
            transaction.update(source_ref, updates)
            
            game_updates = {"balance": firestore.Increment(amt)}
            if request.source_wallet == "funded":
                game_updates["unspent_funded_deposits"] = firestore.Increment(amt)
                
            transaction.set(game_wallet_ref, game_updates, merge=True)
            transaction.set(activity_ref, {
                "type": "fund_from_main",
                "amount": amt,
                "desc": f"Funded game wallet with ₦{amt:,.2f} from {'main' if request.source_wallet == 'funded' else request.source_wallet} wallet",
                "timestamp": firestore.SERVER_TIMESTAMP
            })
            return {"success": True, "message": "Game wallet funded successfully"}

        return transactional_fund(transaction)
    except HTTPException: raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# =================================================================
# === GAME LOBBY & CREATION =======================================
# =================================================================

@router.post("/v1/claim")
async def claim_game_winnings_v1(request: WinningsClaimRequest, user: dict = Depends(get_current_user)):
    """
    Transfer winnings from Game Wallet to Main Wallets.
    Uses Firestore atomic transaction to prevent race conditions.
    Protects against fee evasion: unspent funded deposits return to funded_balance (5% fee pool),
    while legitimate game winnings transfer to host_balance (1% fee pool).
    """
    db = get_db()
    uid = user['uid']
    try:
        amt = round(float(request.amount), 2)
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Invalid amount")
            
        game_wallet_ref = db.collection("game_wallets").document(uid)
        main_wallet_ref = db.collection("room_wallets").document(uid)
        activity_ref = game_wallet_ref.collection("activity").document()

        transaction = db.transaction()

        @firestore.transactional
        def transactional_claim(transaction):
            wallet_doc = game_wallet_ref.get(transaction=transaction)
            if not wallet_doc.exists or float(wallet_doc.to_dict().get("balance", 0) or 0) < amt:
                raise HTTPException(status_code=400, detail="Insufficient game balance.")
                
            wallet_data = wallet_doc.to_dict() or {}
            unspent_deposits = float(wallet_data.get("unspent_funded_deposits", 0) or 0)
            
            # Calculate breakdown between unspent deposit refunds and actual winnings
            unspent_portion = min(amt, max(0.0, unspent_deposits))
            winnings_portion = round(amt - unspent_portion, 2)
            
            game_updates = {"balance": firestore.Increment(-amt)}
            if unspent_portion > 0:
                game_updates["unspent_funded_deposits"] = firestore.Increment(-unspent_portion)
                
            transaction.update(game_wallet_ref, game_updates)
            
            main_updates = {"balance": firestore.Increment(amt)}
            if unspent_portion > 0:
                main_updates["funded_balance"] = firestore.Increment(unspent_portion)
            if winnings_portion > 0:
                main_updates["host_balance"] = firestore.Increment(winnings_portion)
                
            transaction.set(main_wallet_ref, main_updates, merge=True)
            transaction.set(activity_ref, {
                "type": "transfer_to_main",
                "amount": amt,
                "unspent_deposit_refund": unspent_portion,
                "game_winnings_credited": winnings_portion,
                "desc": f"Moved ₦{amt:,.2f} to main wallet ({f'₦{unspent_portion:,.2f} deposit' if unspent_portion > 0 else ''}{f' + ₦{winnings_portion:,.2f} winnings' if winnings_portion > 0 else ''})",
                "timestamp": firestore.SERVER_TIMESTAMP
            })
            return {"success": True, "message": f"₦{amt:,.2f} moved successfully"}

        return transactional_claim(transaction)
    except HTTPException: raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/referrals/list")
async def get_referred_users(user: dict = Depends(get_current_user)):
    db = get_db()
    uid = user.get('uid') or user.get('user_id') or user.get('sub')
    if not uid:
        return {"success": True, "referrals": []}
    try:
        # Fetch users referred by this UID
        try:
            from google.cloud.firestore_v1.base_query import FieldFilter
            users_stream = db.collection("users").where(filter=FieldFilter("referredBy", "==", uid)).stream()
        except Exception:
            users_stream = db.collection("users").where("referredBy", "==", uid).stream()
        
        referred_list = []
        for u in users_stream:
            data = u.to_dict() or {}
            
            # Safely serialize createdAt to JSON-compatible timestamp
            raw_created = data.get("createdAt")
            created_at_val = None
            if hasattr(raw_created, 'timestamp'):
                created_at_val = int(raw_created.timestamp() * 1000)
            elif hasattr(raw_created, 'isoformat'):
                created_at_val = raw_created.isoformat()
            elif isinstance(raw_created, (int, float)):
                created_at_val = raw_created
            elif isinstance(raw_created, str):
                created_at_val = raw_created
                
            referred_list.append({
                "uid": u.id,
                "displayName": data.get("displayName", "Anonymous"),
                "photoURL": data.get("photoURL"),
                "createdAt": created_at_val
            })
            
        return {"success": True, "referrals": referred_list}
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Return empty list with safe diagnostic rather than 500
        return {"success": True, "referrals": [], "warning": str(e)}

@router.post("/process-referral")
async def process_referral_bonus(request: ProcessReferralRequest, user: dict = Depends(get_current_user)):
    """
    Process referral reward when a newly registered user attributes a referrer.
    Credits referrer with 100 bonus / AuraCoins, increments referral count,
    sends a notification to the referrer, and records referral attribution.
    Uses Firestore atomic transaction to prevent race conditions or duplicate claims.
    """
    db = get_db()
    new_user_uid = user.get('uid') or user.get('user_id') or user.get('sub')
    if not new_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    referrer_uid = request.referrerUid.strip()
    
    # Block self-referral, empty, or malicious referrer UIDs
    if not referrer_uid or referrer_uid == new_user_uid or len(referrer_uid) > 128:
        return {"success": False, "message": "Invalid referrer"}
        
    try:
        referrer_ref = db.collection("users").document(referrer_uid)
        new_user_ref = db.collection("users").document(new_user_uid)
        
        transaction = db.transaction()
        
        @firestore.transactional
        def transactional_process(transaction):
            new_user_doc = new_user_ref.get(transaction=transaction)
            if new_user_doc.exists:
                new_user_data = new_user_doc.to_dict() or {}
                if new_user_data.get("referredByProcessed"):
                    return {"success": True, "message": "Referral already processed"}
            
            referrer_doc = referrer_ref.get(transaction=transaction)
            if not referrer_doc.exists:
                return {"success": False, "message": "Referrer not found"}

            transaction.set(referrer_ref, {
                "referredCount": firestore.Increment(1),
                "bonusBalance": firestore.Increment(500),
                "auraCoins": firestore.Increment(500),
                "auraCoin": firestore.DELETE_FIELD
            }, merge=True)
            
            ref_wallet_ref = db.collection("game_wallets").document(referrer_uid)
            ref_act_ref = ref_wallet_ref.collection("activity").document()
            user_display = user.get('name') or user.get('displayName') or 'A new user'
            transaction.set(ref_act_ref, {
                "type": "referral_bonus",
                "currency": "auracoin",
                "amount": 500,
                "desc": f"Referral reward: {user_display} joined (500 AuraCoins)",
                "timestamp": firestore.SERVER_TIMESTAMP
            })
            
            transaction.set(new_user_ref, {
                "referredBy": referrer_uid,
                "referredByProcessed": True
            }, merge=True)
            
            return {"success": True, "message": "Referral processed successfully", "notify": True}

        res = transactional_process(transaction)
        if not res.get("success"):
            return res
            
        if res.get("notify"):
            try:
                notif_id = f"ref_{uuid.uuid4().hex[:12]}"
                user_display = user.get('name') or user.get('displayName') or 'A new user'
                notif_data = {
                    "id": notif_id,
                    "title": "New Referral Earned! 🎉",
                    "message": f"{user_display} joined using your referral link! You earned 500 AuraCoins.",
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "read": False,
                    "type": "referral_reward",
                    "link": "/referral"
                }
                db.collection("users").document(referrer_uid).collection("notifications").document(notif_id).set(notif_data)
                db.collection("users").document(referrer_uid).update({"unreadCount": firestore.Increment(1)})
            except Exception as ne:
                print(f"[Referral Notification Error] {ne}")
                
        return {"success": True, "message": "Referral processed successfully"}
    except HTTPException: raise
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
    
    clean_room_name = (request.roomName or "").strip()[:60]
    if not clean_room_name:
        raise HTTPException(status_code=400, detail="Room name is required.")
        
    entry_fee = max(0.0, round(float(request.entryFee), 2))
    prize_amount = max(0.0, round(float(request.prizePerRound), 2))
    rounds_count = max(1, min(20, int(request.numberOfRounds))) if request.isMultipleRounds else 1
    total_prize_cost = round(prize_amount * rounds_count, 2)
    game_id = f"game_{uuid.uuid4().hex[:12]}"
    game_room_ref = db.collection("game_rooms").document(game_id)
    
    payload = {
        "roomName": clean_room_name,
        "gameType": 'split_or_steal',
        "hostUid": uid,
        "hostName": user.get('name', 'Host'),
        "entryFee": entry_fee,
        "entryType": entry_type,
        "prizeAmount": prize_amount,
        "prizeType": prize_type,
        "isMultipleRounds": request.isMultipleRounds,
        "numberOfRounds": rounds_count,
        "currentRound": 1,
        "startCondition": request.startCondition if request.startCondition in ["auto", "manual"] else "auto",
        "autoStartUsers": request.autoStartUsers,
        "isManualPairing": is_admin and request.isManualPairing,
        "playerAId": request.playerAId if (is_admin and request.isManualPairing) else None,
        "playerBId": request.playerBId if (is_admin and request.isManualPairing) else None,
        "status": 'waiting',
        "createdAt": firestore.SERVER_TIMESTAMP,
        "participants": [],
        "playedUsers": [],
        "hostEarningsRate": 1.0 if is_admin else 0.80
    }

    # Deduct from host wallet (AuraCoins or Game Wallet) via atomic transaction
    if total_prize_cost > 0:
        transaction = db.transaction()

        if prize_type == "auracoin":
            wallet_ref = db.collection("game_wallets").document(uid)
            activity_ref = wallet_ref.collection("activity").document()

            @firestore.transactional
            def transactional_create(transaction):
                u_doc = user_ref.get(transaction=transaction)
                u_data = u_doc.to_dict() if u_doc.exists else {}
                current_coins = float(u_data.get("auraCoins") or u_data.get("auraCoin") or u_data.get("bonusBalance") or 0)
                if current_coins < total_prize_cost:
                    raise HTTPException(status_code=400, detail="Insufficient AuraCoin balance to fund the prize.")
                
                transaction.update(user_ref, {"auraCoins": firestore.Increment(-total_prize_cost)})
                coins_display = int(total_prize_cost) if total_prize_cost.is_integer() else total_prize_cost
                transaction.set(activity_ref, {
                    "type": "create_room_prize",
                    "currency": "auracoin",
                    "amount": total_prize_cost,
                    "desc": f"Funded Game Prize: {request.roomName} ({coins_display:,} AuraCoins)",
                    "timestamp": firestore.SERVER_TIMESTAMP
                })
                transaction.set(game_room_ref, payload)
                return {"success": True, "gameId": game_id}

            return transactional_create(transaction)
        else:
            wallet_ref = db.collection("game_wallets").document(uid)
            activity_ref = wallet_ref.collection("activity").document()

            @firestore.transactional
            def transactional_create(transaction):
                wallet_doc = wallet_ref.get(transaction=transaction)
                if not wallet_doc.exists or float(wallet_doc.to_dict().get("balance", 0) or 0) < total_prize_cost:
                    raise HTTPException(status_code=400, detail="Insufficient game wallet balance to fund the prize.")
                    
                transaction.update(wallet_ref, {"balance": firestore.Increment(-total_prize_cost)})
                transaction.set(activity_ref, {
                    "type": "create_room_prize",
                    "currency": "cash",
                    "amount": total_prize_cost,
                    "desc": f"Funded Game Prize: {request.roomName}",
                    "timestamp": firestore.SERVER_TIMESTAMP
                })
                transaction.set(game_room_ref, payload)
                return {"success": True, "gameId": game_id}

            return transactional_create(transaction)
    else:
        game_room_ref.set(payload)
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
            if game_data.get("status") not in ["waiting", "selecting"]:
                raise HTTPException(status_code=400, detail="This game room is no longer open for new entries.")
                
            entry_fee = float(game_data.get("entryFee", 0) or 0)
            entry_type = game_data.get("entryType", "cash")
            num_rounds = game_data.get("numberOfRounds", 1)
            max_players = num_rounds * 2
            
            # Check if already in pool
            participants = game_data.get("participants", [])
            if any(p["uid"] == uid for p in participants):
                return {"success": True, "message": "Already in pool."}
                
            if len(participants) >= max_players:
                raise HTTPException(status_code=400, detail=f"The player pool is full. Maximum {max_players} players allowed for a {num_rounds}-round game.")
            
            user_ref = db.collection("users").document(uid)
            activity_ref = game_wallet_ref.collection("activity").document()

            # Check user balance and deduct
            if entry_fee > 0:
                if entry_type == "auracoin":
                    user_doc = user_ref.get(transaction=transaction)
                    u_data = user_doc.to_dict() if user_doc.exists else {}
                    current_coins = float(u_data.get("auraCoins") or u_data.get("auraCoin") or u_data.get("bonusBalance") or 0)
                    if current_coins < entry_fee:
                        raise HTTPException(status_code=400, detail="Insufficient AuraCoins to pay entry fee.")
                    
                    transaction.update(user_ref, {"auraCoins": firestore.Increment(-entry_fee)})
                    coins_display = int(entry_fee) if entry_fee.is_integer() else entry_fee
                    transaction.set(activity_ref, {
                        "type": "join_pool_fee",
                        "currency": "auracoin",
                        "amount": entry_fee,
                        "desc": f"Paid Entry Fee: {game_data.get('roomName', 'Game')} ({coins_display:,} AuraCoins)",
                        "timestamp": firestore.SERVER_TIMESTAMP
                    })
                else:
                    game_wallet_snapshot = game_wallet_ref.get(transaction=transaction)
                    if not game_wallet_snapshot.exists or float(game_wallet_snapshot.to_dict().get("balance", 0) or 0) < entry_fee:
                        raise HTTPException(status_code=400, detail="Insufficient game wallet balance.")
                    
                    transaction.update(game_wallet_ref, {"balance": firestore.Increment(-entry_fee)})
                    transaction.set(activity_ref, {
                        "type": "join_pool_fee",
                        "currency": "cash",
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
        user_ref = db.collection("users").document(uid)
        
        transaction = db.transaction()
        
        @firestore.transactional
        def transactional_delete(transaction):
            game_doc = game_ref.get(transaction=transaction)
            if not game_doc.exists:
                raise HTTPException(status_code=404, detail="Room not found")
                
            data = game_doc.to_dict()
            user_doc = user_ref.get(transaction=transaction)
            is_admin = user_doc.to_dict().get("isAdmin", False) if user_doc.exists else False
            
            if not is_admin and data.get("hostUid") != uid:
                raise HTTPException(status_code=403, detail="Unauthorized to delete this room")
                
            if data.get("status") in ["deleted", "cancelled"]:
                return {"success": True, "message": "Room already deleted"}
                
            # Refund host unspent prize & participant entry fees if room was still active / not fully finished
            if data.get("status") in ["waiting", "selecting", "convincing", "choosing", "sudden_death", "revealing", "round_finished"]:
                host_uid = data.get("hostUid")
                total_rounds = data.get("numberOfRounds", 1) if data.get("isMultipleRounds") else 1
                prize_per_round = float(data.get("prizeAmount", 0) or 0)
                
                played_users = set(data.get("playedUsers", []))
                rounds_completed = len(played_users) // 2
                remaining_rounds = max(0, total_rounds - rounds_completed)
                unspent_prize = round(prize_per_round * remaining_rounds, 2)
                
                if unspent_prize > 0 and host_uid:
                    prize_type = data.get("prizeType", "cash")
                    if prize_type == "auracoin":
                        host_user_ref = db.collection("users").document(host_uid)
                        transaction.set(host_user_ref, {"auraCoins": firestore.Increment(unspent_prize)}, merge=True)
                        coins_display = int(unspent_prize) if unspent_prize.is_integer() else unspent_prize
                        host_wallet_ref = db.collection("game_wallets").document(host_uid)
                        act_ref = host_wallet_ref.collection("activity").document()
                        transaction.set(act_ref, {
                            "type": "room_cancelled_refund",
                            "currency": "auracoin",
                            "amount": unspent_prize,
                            "desc": f"Refunded unspent prize from cancelled room: {data.get('roomName', 'Game')} ({coins_display:,} AuraCoins)",
                            "timestamp": firestore.SERVER_TIMESTAMP
                        })
                    else:
                        host_wallet_ref = db.collection("game_wallets").document(host_uid)
                        transaction.set(host_wallet_ref, {"balance": firestore.Increment(unspent_prize)}, merge=True)
                        act_ref = host_wallet_ref.collection("activity").document()
                        transaction.set(act_ref, {
                            "type": "room_cancelled_refund",
                            "currency": "cash",
                            "amount": unspent_prize,
                            "desc": f"Refunded unspent prize from cancelled room: {data.get('roomName', 'Game')}",
                            "timestamp": firestore.SERVER_TIMESTAMP
                        })

                entry_fee = float(data.get("entryFee", 0) or 0)
                entry_type = data.get("entryType", "cash")
                participants = data.get("participants", [])
                for p in participants:
                    p_uid = p.get("uid")
                    if not p.get("isBot") and p_uid and p_uid not in played_users and entry_fee > 0:
                        coins_display = int(entry_fee) if entry_fee.is_integer() else entry_fee
                        p_wallet_ref = db.collection("game_wallets").document(p_uid)
                        p_act_ref = p_wallet_ref.collection("activity").document()
                        if entry_type == "auracoin":
                            p_user_ref = db.collection("users").document(p_uid)
                            transaction.set(p_user_ref, {"auraCoins": firestore.Increment(entry_fee)}, merge=True)
                            transaction.set(p_act_ref, {
                                "type": "pool_cancelled_refund",
                                "currency": "auracoin",
                                "amount": entry_fee,
                                "desc": f"Refunded entry fee from cancelled room: {data.get('roomName', 'Game')} ({coins_display:,} AuraCoins)",
                                "timestamp": firestore.SERVER_TIMESTAMP
                            })
                        else:
                            transaction.set(p_wallet_ref, {"balance": firestore.Increment(entry_fee)}, merge=True)
                            transaction.set(p_act_ref, {
                                "type": "pool_cancelled_refund",
                                "currency": "cash",
                                "amount": entry_fee,
                                "desc": f"Refunded entry fee from cancelled room: {data.get('roomName', 'Game')}",
                                "timestamp": firestore.SERVER_TIMESTAMP
                            })

            transaction.delete(game_ref)
            return {"success": True, "message": "Room deleted successfully"}

        result = transactional_delete(transaction)

        from ws_sync.game_sync import manager
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
            
        return result
    except HTTPException: raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
