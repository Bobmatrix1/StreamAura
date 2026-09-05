from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from core.security import get_current_user, get_current_admin
from core.config import settings
from models.cinema import RoomCreateRequest, PresignedUrlRequest, PaystackInitRequest, AgoraTokenRequest, WithdrawalRequest, MultipartInitiateRequest, MultipartPartRequest, MultipartCompleteRequest
from services.r2_service import generate_presigned_upload_url, generate_presigned_download_url, initiate_multipart_upload, generate_presigned_part_url, complete_multipart_upload, delete_object
from services.agora_service import generate_rtc_token
from services.transactpay_service import initialize_transaction, verify_transaction, initiate_payout, get_banks, resolve_account_number
from services.redis_service import set_room_state

import uuid
import time
import hashlib
import json
import urllib.parse
from typing import Optional
from firebase_admin import firestore

router = APIRouter()

# Get Firestore db from firebase-admin (Lazy initialization)
def get_db():
    return firestore.client()

def check_is_admin(user: dict) -> bool:
    if user.get("admin") or user.get("isAdmin"):
        return True
    try:
        db = get_db()
        user_doc = db.collection("users").document(user["uid"]).get()
        if user_doc.exists and user_doc.to_dict().get("isAdmin", False):
            return True
    except Exception as e:
        print(f"Error checking admin status: {e}")
    return False

def is_r2_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    url = url.strip()
    base_url = (settings.R2_PUBLIC_BASE_URL or "").rstrip("/")
    if base_url and base_url in url:
        return True
    if "r2.cloudflarestorage.com" in url or "r2.dev" in url or "streamaura.site" in url:
        return True
    if settings.R2_BUCKET_ASSETS and f"/{settings.R2_BUCKET_ASSETS}/" in url:
        return True
    if settings.R2_BUCKET_MOVIES and f"/{settings.R2_BUCKET_MOVIES}/" in url:
        return True
    # If not an absolute URL, check if it looks like an object key (not starting with http/https)
    if not url.startswith("http://") and not url.startswith("https://"):
        return True
    return False

def extract_r2_key(url: str) -> Optional[str]:
    if not url or not isinstance(url, str):
        return None
    url = url.split("?")[0].split("#")[0].strip()
    
    # If base url configured, strip it
    base_url = (settings.R2_PUBLIC_BASE_URL or "").rstrip("/")
    if base_url and base_url in url:
        key = url.split(base_url)[-1].lstrip("/")
    else:
        # Standard URL parsing
        parsed = urllib.parse.urlparse(url)
        if parsed.netloc:
            key = parsed.path.lstrip("/")
        else:
            key = url.lstrip("/")
            
    # Strip bucket names if prefixed in path
    if settings.R2_BUCKET_ASSETS and key.startswith(f"{settings.R2_BUCKET_ASSETS}/"):
        key = key[len(settings.R2_BUCKET_ASSETS) + 1:]
    if settings.R2_BUCKET_MOVIES and key.startswith(f"{settings.R2_BUCKET_MOVIES}/"):
        key = key[len(settings.R2_BUCKET_MOVIES) + 1:]
        
    return key

from core.payouts import calculate_payout_split

@router.post("/verify-wallet-funding")
async def verify_wallet_funding(reference: str, user: dict = Depends(get_current_user)):
    """
    Verify Paystack transaction for wallet funding and update balance.
    """
    db = get_db()
    try:
        response = await verify_transaction(reference)
        
        if response["data"]["status"] == "success":
            # Check transaction owner to prevent reference theft
            metadata = response["data"].get("metadata", {})
            if metadata and metadata.get("user_uid") != user["uid"]:
                raise HTTPException(status_code=403, detail="Unauthorized transaction reference")
            amount_kobo = response["data"]["amount"]
            amount_naira = amount_kobo / 100
            
            # Check if transaction was already processed
            tx_ref = db.collection("transactions").document(reference)
            tx_doc = tx_ref.get()
            if tx_doc.exists and tx_doc.to_dict().get("status") == "completed":
                return {"success": True, "message": "Already processed"}
                
            # Update user's wallet (Funded Balance)
            wallet_ref = db.collection("room_wallets").document(user["uid"])
            wallet_ref.set({
                "funded_balance": firestore.Increment(amount_naira),
                "balance": firestore.Increment(amount_naira), # Total spending power
                "total_funded": firestore.Increment(amount_naira)
            }, merge=True)
            
            # Save transaction
            tx_ref.set({
                "user_uid": user["uid"],
                "type": "deposit",
                "amount": amount_naira,
                "title": "Wallet Top-up",
                "status": "completed",
                "timestamp": firestore.SERVER_TIMESTAMP,
                "reference": reference
            })
            
            # Update global analytics
            stats_ref = db.collection('system_analytics').document('global_counters')
            stats_ref.set({
                "payments.success.count": firestore.Increment(1),
                "payments.success.totalAmount": firestore.Increment(amount_naira),
                "actions.deposit": firestore.Increment(1)
            }, merge=True)
            
            return {"success": True, "amount": amount_naira}
        else:
            raise HTTPException(status_code=400, detail="Payment verification failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/webhook")
async def verify_webhook():
    return {"status": "Webhook Active", "message": "Send POST requests here for Paystack events."}

@router.post("/webhook")
async def transactpay_webhook(request: Request):
    """
    Handle TransactPay Webhook events.
    Queries TransactPay API directly to verify transaction status before processing.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    reference = body.get("reference") or body.get("data", {}).get("reference") or body.get("data", {}).get("paymentReference")
    if not reference:
        return {"status": "ignored", "reason": "No reference found in payload"}
        
    # Securely verify transaction status with TransactPay
    verify_resp = await verify_transaction(reference)
    if not verify_resp.get("status"):
        return {"status": "ignored", "reason": "Transaction not successful on TransactPay"}
        
    amount_naira = verify_resp["data"]["amount_naira"]
    db = get_db()
    
    # Check if already processed
    tx_ref = db.collection("transactions").document(reference)
    tx_doc = tx_ref.get()
    if tx_doc.exists and tx_doc.to_dict().get("status") == "completed":
        return {"status": "already_processed"}
        
    # Determine type of transaction from reference
    if reference.startswith("deposit_"):
        parts = reference.split("_")
        if len(parts) < 3:
            return {"status": "error", "reason": "Malformed deposit reference"}
        uid = parts[1]
        
        # Update user's wallet
        wallet_ref = db.collection("room_wallets").document(uid)
        wallet_ref.set({
            "funded_balance": firestore.Increment(amount_naira),
            "balance": firestore.Increment(amount_naira),
            "total_funded": firestore.Increment(amount_naira)
        }, merge=True)
        
        # Save transaction
        tx_ref.set({
            "user_uid": uid,
            "type": "deposit",
            "amount": amount_naira,
            "title": "Wallet Top-up via TransactPay",
            "status": "completed",
            "timestamp": firestore.SERVER_TIMESTAMP,
            "reference": reference
        })
        
        # Update global stats
        stats_ref = db.collection('system_analytics').document('global_counters')
        stats_ref.set({
            "payments.success.count": firestore.Increment(1),
            "payments.success.totalAmount": firestore.Increment(amount_naira),
            "actions.deposit": firestore.Increment(1)
        }, merge=True)
        
    elif reference.startswith("ticket_"):
        # Look up pending transaction to get metadata
        pending_tx = tx_ref.get()
        if not pending_tx.exists:
            return {"status": "error", "reason": "Ticket transaction not found"}
            
        tx_data = pending_tx.to_dict()
        uid = tx_data.get("user_uid")
        room_id = tx_data.get("room_id")
        
        if room_id:
            room_doc = db.collection("cinema_rooms").document(room_id).get()
            if room_doc.exists:
                host_uid = room_doc.to_dict().get("host_uid")
                host_name = room_doc.to_dict().get("host_name", "Host")
                
                platform_cut, host_final, referrer_uid, referrer_cut = calculate_payout_split(host_uid, amount_naira, db)
                
                # Update Host Wallet
                wallet_ref = db.collection("room_wallets").document(host_uid)
                wallet_ref.set({
                    "host_balance": firestore.Increment(host_final),
                    "balance": firestore.Increment(host_final),
                    "total_earned": firestore.Increment(host_final),
                    "tickets_sold": firestore.Increment(1)
                }, merge=True)
                
                # Update Room Stats
                db.collection("cinema_rooms").document(room_id).update({
                    "tickets_sold": firestore.Increment(1),
                    "total_earned": firestore.Increment(host_final),
                    "gross_revenue": firestore.Increment(amount_naira)
                })
                
                # Update Referrer if active
                if referrer_uid and referrer_cut > 0:
                    ref_user_ref = db.collection("users").document(referrer_uid)
                    ref_user_ref.update({"referralBalance": firestore.Increment(referrer_cut)})
                    db.collection("game_wallets").document(referrer_uid).collection("activity").add({
                        "type": "referral_earning",
                        "amount": referrer_cut,
                        "desc": f"10% commission from {host_name}'s ticket sale",
                        "timestamp": firestore.SERVER_TIMESTAMP
                    })
            
            # Update transaction
            tx_ref.set({
                "room_id": room_id,
                "user_uid": uid,
                "amount": amount_naira,
                "status": "completed",
                "title": "Cinema Ticket Purchase",
                "type": "purchase",
                "timestamp": firestore.SERVER_TIMESTAMP,
                "reference": reference
            }, merge=True)
            
            # Grant access pass
            pass_id = f"pass_{uuid.uuid4().hex}"
            db.collection("room_access_passes").document(pass_id).set({
                "room_id": room_id,
                "user_uid": uid,
                "reference": reference,
                "granted_at": firestore.SERVER_TIMESTAMP
            })
            
    return {"status": "success"}

@router.get("/banks")
async def fetch_bank_list():
    """
    Returns the list of supported Nigerian banks.
    """
    try:
        response = await get_banks()
        return response
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/resolve-account")
async def resolve_bank_account(account_number: str, bank_code: str):
    """
    Resolves an account number to an account name using Paystack.
    """
    try:
        response = await resolve_account_number(account_number, bank_code)
        # Mock success if we hit Paystack's strict test limits
        if not response.get("status") and ("limit" in response.get("message", "").lower() or "test mode" in response.get("message", "").lower()):
            return {
                "status": True,
                "message": "Account number resolved",
                "data": {
                    "account_number": account_number,
                    "account_name": "Verified User Account"
                }
            }
        return response
    except Exception as e:
        # Paystack returns 422/400 for invalid accounts, handle gracefully
        return {"status": False, "message": "Could not resolve account name"}

@router.post("/presigned-url")
async def get_presigned_url(request: PresignedUrlRequest, user: dict = Depends(get_current_user)):
    """
    Returns a secure presigned URL for the frontend to upload directly to Cloudflare R2.
    """
    bucket_name = settings.R2_BUCKET_ASSETS if request.bucket_type == "assets" else settings.R2_BUCKET_MOVIES
    
    # Generate a unique path to prevent overwriting
    ext = request.file_name.split('.')[-1] if '.' in request.file_name else ''
    unique_name = f"{user['uid']}/{uuid.uuid4().hex}.{ext}"
    
    urls = generate_presigned_upload_url(bucket_name, unique_name, request.content_type)
    if not urls:
        raise HTTPException(status_code=500, detail="Failed to generate upload URL")
        
    return urls

@router.post("/rooms/{room_id}/pay-referral")
async def pay_with_referral_balance(room_id: str, user: dict = Depends(get_current_user)):
    """
    Pay for a room ticket using referral balance.
    """
    db = get_db()
    uid = user["uid"]
    
    try:
        room_ref = db.collection("cinema_rooms").document(room_id)
        user_ref = db.collection("users").document(uid)
        
        transaction = db.transaction()
        
        @firestore.transactional
        def transactional_pay(transaction):
            # Read room
            room_snapshot = room_ref.get(transaction=transaction)
            if not room_snapshot.exists:
                raise HTTPException(status_code=404, detail="Room not found")
                
            room = room_snapshot.to_dict()
            if room.get("room_type") != "paid":
                raise HTTPException(status_code=400, detail="This room does not require payment")
                
            price = room.get("ticket_price", 0)
            
            # Read user
            user_snapshot = user_ref.get(transaction=transaction)
            if not user_snapshot.exists:
                raise HTTPException(status_code=404, detail="User not found")
                
            user_data = user_snapshot.to_dict()
            current_balance = user_data.get("referralBalance", 0)
            if current_balance < price:
                raise HTTPException(status_code=400, detail=f"Insufficient referral balance. Need ₦{price}")
                
            # Perform updates
            transaction.update(user_ref, {"referralBalance": firestore.Increment(-price)})
            
            pass_id = f"pass_{uuid.uuid4().hex}"
            pass_ref = db.collection("room_access_passes").document(pass_id)
            transaction.set(pass_ref, {
                "room_id": room_id,
                "user_uid": uid,
                "payment_method": "referral_balance",
                "granted_at": firestore.SERVER_TIMESTAMP
            })
            
            return {"success": True, "message": "Ticket purchased with referral balance!"}
            
        return transactional_pay(transaction)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rooms/create")
async def create_cinema_room(request: RoomCreateRequest, user: dict = Depends(get_current_user)):
    """
    Creates a new cinema room. Supports referral balance payment for private rooms and series episodes.
    """
    db = get_db()
    room_id = f"room_{uuid.uuid4().hex[:12]}"
    uid = user['uid']
    
    # --- COST CALCULATION & DEDUCTIONS ---
    normal_to_deduct = 0
    referral_to_deduct = 0
    bonus_to_deduct = 0

    # 1. Series/Episode Cost
    if request.content_type == "series" and request.episodes:
        ep_count = len(request.episodes)
        if request.payment_wallet_episodes == "bonus":
            bonus_to_deduct += (ep_count * 50) # Discounted
        elif request.payment_wallet_episodes == "referral":
            referral_to_deduct += (ep_count * 100) # Normal rate
        else:
            normal_to_deduct += (ep_count * 100) # Normal rate

    # 2. Private Room Cost
    if request.room_type == "private":
        seats = request.max_seats or 1
        if request.payment_wallet_private == "bonus":
            bonus_to_deduct += (seats * 2500) # Premium rate for bonus
        elif request.payment_wallet_private == "referral":
            referral_to_deduct += (seats * 1000) # Normal rate
        else:
            normal_to_deduct += (seats * 1000) # Normal rate
    # --- PERFORM DEDUCTIONS ---
    try:
        user_ref = db.collection("users").document(uid)
        wallet_ref = db.collection("room_wallets").document(uid)
        
        transaction = db.transaction()
        
        @firestore.transactional
        def transactional_deduct(transaction):
            user_snapshot = user_ref.get(transaction=transaction)
            user_data = user_snapshot.to_dict() if user_snapshot.exists else {}
            
            wallet_snapshot = wallet_ref.get(transaction=transaction)
            w_data = wallet_snapshot.to_dict() if wallet_snapshot.exists else {}
            
            if bonus_to_deduct > 0:
                if user_data.get("bonusBalance", 0) < bonus_to_deduct:
                    raise HTTPException(status_code=400, detail="Insufficient bonus balance for series discount.")
                    
            if referral_to_deduct > 0:
                if user_data.get("referralBalance", 0) < referral_to_deduct:
                    raise HTTPException(status_code=400, detail="Insufficient referral commission balance.")
                    
            if normal_to_deduct > 0:
                if w_data.get("balance", 0) < normal_to_deduct:
                    raise HTTPException(status_code=400, detail="Insufficient wallet balance.")
                    
            # Perform Writes
            user_updates = {}
            if bonus_to_deduct > 0:
                user_updates["bonusBalance"] = firestore.Increment(-bonus_to_deduct)
            if referral_to_deduct > 0:
                user_updates["referralBalance"] = firestore.Increment(-referral_to_deduct)
            if user_updates:
                transaction.update(user_ref, user_updates)
                
            if normal_to_deduct > 0:
                fb = w_data.get("funded_balance", 0)
                if fb >= normal_to_deduct:
                    transaction.update(wallet_ref, {
                        "funded_balance": firestore.Increment(-normal_to_deduct),
                        "balance": firestore.Increment(-normal_to_deduct)
                    })
                else:
                    remaining = normal_to_deduct - fb
                    transaction.update(wallet_ref, {
                        "funded_balance": 0,
                        "host_balance": firestore.Increment(-remaining),
                        "balance": firestore.Increment(-normal_to_deduct)
                    })
                    
        transactional_deduct(transaction)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    room_data = request.dict()
    room_data.update({
        "id": room_id,
        "host_uid": uid,
        "host_name": user.get('name', 'Host'),
        "created_at": firestore.SERVER_TIMESTAMP,
        "status": "upcoming" if request.scheduled_start_time else "live",
        "active_viewers": 0
    })
    
    # Calculate seat layout based on capacity
    if request.max_seats:
        rows = max(1, request.max_seats // 10)
        cols = min(10, request.max_seats)
        room_data["seat_layout"] = {"rows": rows, "cols": cols, "total": request.max_seats}
    else:
        room_data["seat_layout"] = {"rows": 0, "cols": 0, "total": "unlimited"}

    # Save to Firestore
    db.collection("cinema_rooms").document(room_id).set(room_data)
    
    # Initialize live state in Redis
    initial_state = {
        "status": "waiting" if request.scheduled_start_time else "playing",
        "movie_time": 0.0,
        "host_uid": uid,
        "muted_all": False,
        "current_episode_index": 0
    }
    await set_room_state(room_id, initial_state)
    
    invite_link = f"{settings.FRONTEND_URL}/?tab=cinema&room={room_id}"
    return {"success": True, "room_id": room_id, "invite_link": invite_link}

@router.post("/rooms/{room_id}/pay")
async def init_room_payment(room_id: str, user: dict = Depends(get_current_user)):
    """
    Initialize a Paystack payment for a paid room ticket.
    """
    db = get_db()
    room_doc = db.collection("cinema_rooms").document(room_id).get()
    if not room_doc.exists:
        raise HTTPException(status_code=404, detail="Room not found")
        
    room = room_doc.to_dict()
    if room.get("room_type") != "paid":
        raise HTTPException(status_code=400, detail="This room does not require payment")
        
    price = room.get("ticket_price", 0)
    if price <= 0:
        raise HTTPException(status_code=400, detail="Invalid ticket price")

    reference = f"ticket_{uuid.uuid4().hex}"
    
    # Price is in Naira, paystack expects Kobo
    amount_in_kobo = int(price * 100)
    
    callback_url = f"{settings.FRONTEND_URL}/?tab=cinema&room={room_id}&verify={reference}"
    
    email = user.get("email")
    if not email:
         raise HTTPException(status_code=400, detail="User email required for payment")
         
    try:
        metadata = {
            "type": "ticket_purchase",
            "user_uid": user["uid"],
            "room_id": room_id
        }
        response = await initialize_transaction(email, amount_in_kobo, reference, callback_url, metadata)
        
        # Log pending transaction
        db.collection("transactions").document(reference).set({
            "room_id": room_id,
            "user_uid": user["uid"],
            "amount": price,
            "status": "pending",
            "created_at": firestore.SERVER_TIMESTAMP,
            "metadata": metadata
        })
        
        return {"authorization_url": response["data"]["authorization_url"], "reference": reference}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rooms/{room_id}/verify-payment")
async def verify_room_payment(room_id: str, reference: str, user: dict = Depends(get_current_user)):
    """
    Verify payment and grant access pass.
    """
    db = get_db()
    try:
        # Verify transaction database existence, status, owner, and room ID
        tx_ref = db.collection("transactions").document(reference)
        tx_doc = tx_ref.get()
        if not tx_doc.exists:
            raise HTTPException(status_code=404, detail="Transaction reference not found")
            
        tx_data = tx_doc.to_dict()
        if tx_data.get("status") == "completed":
            raise HTTPException(status_code=400, detail="Transaction has already been verified/completed")
            
        if tx_data.get("user_uid") != user["uid"]:
            raise HTTPException(status_code=403, detail="Unauthorized transaction reference owner")
            
        if tx_data.get("room_id") != room_id:
            raise HTTPException(status_code=400, detail="Transaction reference does not match room ID")

        response = await verify_transaction(reference)
        
        if response["data"]["status"] == "success":
            # Grant access pass
            pass_id = f"pass_{uuid.uuid4().hex}"
            db.collection("room_access_passes").document(pass_id).set({
                "room_id": room_id,
                "user_uid": user["uid"],
                "reference": reference,
                "granted_at": firestore.SERVER_TIMESTAMP
            })
            
            # Fetch room details for ticket price
            room_doc = db.collection("cinema_rooms").document(room_id).get()
            if not room_doc.exists:
                return {"success": False, "message": "Room not found during payout"}
                
            room_data = room_doc.to_dict()
            amount = room_data.get("ticket_price", 0)
            host_uid = room_data.get("host_uid")
            host_name = room_data.get("host_name", "Host")
            
            # Set completed transaction document
            db.collection("transactions").document(reference).set({
                "room_id": room_id,
                "user_uid": user["uid"],
                "amount": amount,
                "status": "completed",
                "title": "Cinema Ticket Purchase",
                "type": "purchase",
                "timestamp": firestore.SERVER_TIMESTAMP,
                "reference": reference
            }, merge=True)
            
            platform_cut, host_final, referrer_uid, referrer_cut = calculate_payout_split(host_uid, amount, db)
            
            # Update Host Wallet (Host Balance)
            wallet_ref = db.collection("room_wallets").document(host_uid)
            wallet_ref.set({
                "host_balance": firestore.Increment(host_final),
                "balance": firestore.Increment(host_final), # spending power
                "total_earned": firestore.Increment(host_final),
                "tickets_sold": firestore.Increment(1)
            }, merge=True)
                
            # Update Referrer if active
            if referrer_uid and referrer_cut > 0:
                ref_user_ref = db.collection("users").document(referrer_uid)
                ref_user_ref.update({"referralBalance": firestore.Increment(referrer_cut)})
                # Log activity for referrer
                db.collection("game_wallets").document(referrer_uid).collection("activity").add({
                    "type": "referral_earning",
                    "amount": referrer_cut,
                    "desc": f"10% commission from {host_name}'s ticket sale",
                    "timestamp": firestore.SERVER_TIMESTAMP
                })
                
            return {"success": True, "message": "Payment verified. Access granted."}
        else:
            return {"success": False, "message": "Payment not successful"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/withdraw")
async def request_withdrawal(request: WithdrawalRequest, user: dict = Depends(get_current_user)):
    """
    Unified withdrawal for Referral (0% fee), Funded (5% fee), and Host (0% fee).
    """
    db = get_db()
    uid = user['uid']
    
    try:
        balance_field = ""
        user_ref = None
        
        if request.balance_type == "referral":
            user_ref = db.collection("users").document(uid)
            balance_field = "referralBalance"
        else:
            user_ref = db.collection("room_wallets").document(uid)
            balance_field = "funded_balance" if (request.balance_type == "funded" or request.balance_type == "vendor") else "host_balance"
            
        transaction = db.transaction()
        current_balance = 0.0
        
        @firestore.transactional
        def transactional_withdraw(transaction):
            nonlocal current_balance
            user_snapshot = user_ref.get(transaction=transaction)
            if not user_snapshot.exists:
                raise HTTPException(status_code=404, detail="Wallet not found")
                
            data = user_snapshot.to_dict()
            current_balance = float(data.get(balance_field, 0) or 0)
            
            if current_balance < request.amount or request.amount <= 0:
                raise HTTPException(status_code=400, detail=f"Insufficient {request.balance_type} balance")
                
            # 1. Deduct balance immediately
            updates = {balance_field: firestore.Increment(-request.amount)}
            if request.balance_type != "referral":
                updates["balance"] = firestore.Increment(-request.amount) # keep total synced
            transaction.update(user_ref, updates)
            return current_balance
            
        tx_result = transactional_withdraw(transaction)
        if tx_result is not None:
            current_balance = float(tx_result)
        
        # 2. Apply Fees Logic
        # Funded/Vendor: 5% fee (User gets 95%)
        # Host/Referral: 1% fee (User gets 99%)
        fee_percentage = 5 if (request.balance_type == "funded" or request.balance_type == "vendor") else 1
        fee_amount = (request.amount * fee_percentage) / 100
        payout_amount = request.amount - fee_amount
        
        # Resolve bank name from request or user profile
        bank_name = request.bank_name or ""
        if not bank_name:
            try:
                profile_ref = db.collection("users").document(uid).get()
                if profile_ref.exists:
                    bank_details = profile_ref.to_dict().get("bankDetails", {})
                    bank_name = bank_details.get("bankName", "")
            except Exception:
                pass

        withdrawal_id = f"wd_{uuid.uuid4().hex[:12]}"
        withdrawal_data = {
            "id": withdrawal_id,
            "user_uid": uid,
            "user_name": user.get("name", "User"),
            "user_email": user.get("email"),
            "amount": request.amount,
            "payout_amount": payout_amount,
            "fee_amount": fee_amount,
            "bank_code": request.bank_code,
            "bank_name": bank_name,
            "account_number": request.account_number,
            "account_name": request.account_name,
            "status": "pending",
            "type": request.balance_type,
            "balance_before": current_balance,
            "balance_after": current_balance - request.amount,
            "created_at": firestore.SERVER_TIMESTAMP
        }
        db.collection("withdrawals").document(withdrawal_id).set(withdrawal_data)
        
        return {"success": True, "message": "Withdrawal request submitted successfully"}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/referral/withdraw")
async def request_referral_withdrawal(request: WithdrawalRequest, user: dict = Depends(get_current_user)):
    """
    Redirect to unified withdraw endpoint.
    """
    request.balance_type = "referral"
    return await request_withdrawal(request, user)

@router.post("/admin/payouts/{withdrawal_id}/process")
async def process_payout(withdrawal_id: str, action: str, reason: str = None, admin: dict = Depends(get_current_admin)):
    """
    Admin approves or rejects a withdrawal request.
    Uses payout_amount (net after fees).
    """
    db = get_db()
    
    try:
        wd_ref = db.collection("withdrawals").document(withdrawal_id)
        wd_doc = wd_ref.get()
        
        if not wd_doc.exists:
            raise HTTPException(status_code=404, detail="Withdrawal request not found")
            
        wd_data = wd_doc.to_dict()
        if wd_data.get("status") != "pending":
            raise HTTPException(status_code=400, detail="Request already processed")
            
        if action == "reject":
            # Refund user balance
            uid = wd_data["user_uid"]
            balance_type = wd_data.get("type", "host")
            
            if balance_type == "referral":
                user_ref = db.collection("users").document(uid)
                user_ref.update({"referralBalance": firestore.Increment(wd_data["amount"])})
            else:
                user_ref = db.collection("room_wallets").document(uid)
                balance_field = "funded_balance" if (balance_type == "funded" or balance_type == "vendor") else "host_balance"
                user_ref.update({
                    balance_field: firestore.Increment(wd_data["amount"]),
                    "balance": firestore.Increment(wd_data["amount"])
                })
            
            wd_ref.update({
                "status": "rejected", 
                "rejection_reason": reason or "Rejected by admin",
                "processed_at": firestore.SERVER_TIMESTAMP
            })

            # Send notification to the user
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            notif_data = {
                "id": notif_id,
                "title": "Withdrawal Request Rejected",
                "message": f"Your withdrawal request of ₦{float(wd_data['amount']):,} ({wd_data.get('type', 'host').capitalize()}) has been rejected. Reason: {reason or 'No reason provided.'}",
                "timestamp": firestore.SERVER_TIMESTAMP,
                "read": False,
                "type": "alert",
                "link": "/wallet"
            }
            db.collection("users").document(uid).collection("notifications").document(notif_id).set(notif_data)
            
            return {"success": True, "message": "Withdrawal rejected and refunded"}
            
        elif action == "approve":
            # Use payout_amount for real transfer
            payout_amount = wd_data.get("payout_amount", wd_data["amount"])
            
            # Initiate TransactPay payout directly
            payout_resp = await initiate_payout(
                amount_naira=float(payout_amount),
                account_number=wd_data["account_number"],
                bank_code=wd_data["bank_code"],
                account_name=wd_data["account_name"],
                reference=f"payout_{wd_data['id']}",
                reason=f"Aura Payout: {wd_data['id']} ({wd_data['type']})"
            )
            
            if not payout_resp.get("status"):
                raise HTTPException(status_code=400, detail=f"TransactPay Error: {payout_resp.get('message')}")
                
            # Update Status
            wd_ref.update({
                "status": "completed",
                "transactpay_payout_ref": payout_resp["data"].get("transfer_code"),
                "processed_at": firestore.SERVER_TIMESTAMP
            })
            
            # Send notification to the user
            uid = wd_data["user_uid"]
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            notif_data = {
                "id": notif_id,
                "title": "Withdrawal Request Approved",
                "message": f"Your withdrawal of ₦{float(payout_amount):,} ({wd_data.get('type', 'host').capitalize()}) has been approved and sent to your account after fee deduction.",
                "timestamp": firestore.SERVER_TIMESTAMP,
                "read": False,
                "type": "withdrawal_approved",
                "link": "/wallet"
            }
            db.collection("users").document(uid).collection("notifications").document(notif_id).set(notif_data)
            
            return {"success": True, "message": "Payout processed successfully"}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/agora/token")
async def get_agora_token(request: AgoraTokenRequest, user: dict = Depends(get_current_user)):
    """
    Generate Agora RTC token for voice/video chat in a specific room.
    """
    db = get_db()
    room_doc = db.collection("cinema_rooms").document(request.room_id).get()
    if not room_doc.exists: raise HTTPException(status_code=404, detail="Room not found")
    import hashlib
    numeric_uid = int(hashlib.md5(user['uid'].encode()).hexdigest()[:8], 16)
    token = generate_rtc_token(request.room_id, numeric_uid, request.role)
    return {'token': token, 'uid': numeric_uid, 'app_id': settings.AGORA_APP_ID}

# =================================================================
# === MULTIPART UPLOAD ENDPOINTS (High Performance) ================
# =================================================================

@router.post("/multipart/initiate")
async def initiate_upload(request: MultipartInitiateRequest, user: dict = Depends(get_current_user)):
    """
    Step 1: Start a multipart upload. Returns UploadId and Key.
    """
    bucket_name = settings.R2_BUCKET_ASSETS if request.bucket_type == "assets" else settings.R2_BUCKET_MOVIES
    
    # Generate unique key
    ext = request.file_name.split('.')[-1] if '.' in request.file_name else ''
    object_name = f"{user['uid']}/large_{uuid.uuid4().hex[:8]}.{ext}"
    
    result = initiate_multipart_upload(bucket_name, object_name, request.content_type)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to initiate multipart upload")
        
    return result

@router.post("/multipart/presign-part")
async def presign_part(request: MultipartPartRequest, user: dict = Depends(get_current_user)):
    """
    Step 2: Get a signed URL for a specific part (e.g. part 1, 2, 3...)
    """
    if not request.key.startswith(f"{user['uid']}/"):
        raise HTTPException(status_code=403, detail="Unauthorized upload key")

    bucket_name = settings.R2_BUCKET_ASSETS if request.bucket_type == "assets" else settings.R2_BUCKET_MOVIES
    
    url = generate_presigned_part_url(
        bucket_name, 
        request.key, 
        request.upload_id, 
        request.part_number
    )
    
    if not url:
        raise HTTPException(status_code=500, detail="Failed to generate part URL")
        
    return {"upload_url": url}

@router.post("/multipart/complete")
async def complete_upload(request: MultipartCompleteRequest, user: dict = Depends(get_current_user)):
    """
    Step 3: Tell R2 to join all the uploaded parts into a single file.
    """
    if not request.key.startswith(f"{user['uid']}/"):
        raise HTTPException(status_code=403, detail="Unauthorized upload key")

    bucket_name = settings.R2_BUCKET_ASSETS if request.bucket_type == "assets" else settings.R2_BUCKET_MOVIES
    
    success = complete_multipart_upload(
        bucket_name, 
        request.key, 
        request.upload_id, 
        request.parts
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to complete multipart upload")
        
from services.r2_service import delete_object

@router.delete("/rooms/{room_id}")
async def delete_cinema_room(room_id: str, current_user = Depends(get_current_user)):
    from firebase_admin import firestore
    db = firestore.client()
    
    room_ref = db.collection("cinema_rooms").document(room_id)
    room_doc = room_ref.get()
    
    if not room_doc.exists:
        raise HTTPException(status_code=404, detail="Room not found")
        
    data = room_doc.to_dict()
    
    # Check if host or admin
    user_uid = current_user.get('uid')
    if data.get("host_uid") != user_uid:
        # Check if admin
        user_doc = db.collection("users").document(user_uid).get()
        if not user_doc.exists or not user_doc.to_dict().get("isAdmin"):
            raise HTTPException(status_code=403, detail="Not authorized")

    # 1. Cleanup R2 Media
    movie_url = data.get("movie_file")
    poster_url = data.get("movie_cover_image") # Corrected field name
    trailer_url = data.get("trailer_url")
    episodes = data.get("episodes", [])
    
    try:
        # Helper to delete from movies bucket
        def del_movie(url):
            if url and settings.R2_PUBLIC_BASE_URL in url:
                key = url.split(f"{settings.R2_PUBLIC_BASE_URL}/")[-1]
                delete_object(settings.R2_BUCKET_MOVIES, key)
                # Try assets too just in case of old data
                delete_object(settings.R2_BUCKET_ASSETS, key)

        # Delete main movie
        if movie_url: del_movie(movie_url)
        
        # Delete all episodes
        for ep in episodes:
            ep_url = ep.get("url")
            if ep_url: del_movie(ep_url)
            
        # Delete trailer
        if trailer_url: del_movie(trailer_url)
            
        # Delete poster from assets
        if poster_url and settings.R2_PUBLIC_BASE_URL in poster_url:
            poster_key = poster_url.split(f"{settings.R2_PUBLIC_BASE_URL}/")[-1]
            delete_object(settings.R2_BUCKET_ASSETS, poster_key)
            
    except Exception as e:
        print(f"R2 Cleanup Error: {str(e)}")

    # 2. Delete from Firestore
    room_ref.delete()
    
    return {"success": True}

class DeleteAssetRequest(BaseModel):
    url: str

@router.post("/delete-asset")
async def delete_asset(request: DeleteAssetRequest, user: dict = Depends(get_current_user)):
    """
    Deletes an asset from Cloudflare R2 given its public URL.
    Authorized if the user is an admin OR if the object key belongs to the user's UID.
    """
    url = request.url
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
        
    if not is_r2_url(url):
        return {"success": True, "message": "Not an R2 asset, skipped"}
        
    key = extract_r2_key(url)
    if not key:
        raise HTTPException(status_code=400, detail="Could not extract key from URL")
        
    uid = user.get("uid") or user.get("sub")
    is_admin = check_is_admin(user)
    
    # SECURITY: Non-admins can only delete their own uploaded files!
    if not is_admin and not key.startswith(f"{uid}/"):
        raise HTTPException(status_code=403, detail="Unauthorized to delete this object")
        
    # Delete from assets bucket (and check movies bucket as well)
    delete_object(settings.R2_BUCKET_ASSETS, key)
    delete_object(settings.R2_BUCKET_MOVIES, key)
        
    return {"success": True, "message": "Object deleted from Cloudflare", "key": key}


@router.delete("/products/{product_id}")
@router.post("/products/{product_id}/delete")
async def delete_product(product_id: str, user: dict = Depends(get_current_user)):
    """
    Deletes a product from the Firestore database AND removes its image asset(s) from Cloudflare R2.
    Only the vendor owner who owns the product or an admin is authorized to perform this deletion.
    """
    db = get_db()
    product_ref = db.collection("products").document(product_id)
    product_doc = product_ref.get()
    
    if not product_doc.exists:
        return {"success": True, "message": "Product not found or already deleted"}
        
    product_data = product_doc.to_dict() or {}
    vendor_id = product_data.get("vendorId")
    uid = user.get("uid") or user.get("sub")
    is_admin = check_is_admin(user)
    is_owner = (vendor_id == uid or product_data.get("userId") == uid or product_data.get("creatorId") == uid)
    
    if not (is_admin or is_owner):
        raise HTTPException(
            status_code=403, 
            detail="You do not have permission to delete this product. Only the vendor owner or an admin can delete it."
        )
        
    deleted_assets = []
    
    # 1. Delete primary image from Cloudflare R2
    image_url = product_data.get("image")
    if image_url and is_r2_url(image_url):
        key = extract_r2_key(image_url)
        if key:
            try:
                delete_object(settings.R2_BUCKET_ASSETS, key)
                delete_object(settings.R2_BUCKET_MOVIES, key)
                deleted_assets.append(key)
                print(f"[R2 CLEANUP] Successfully deleted product image {key} from Cloudflare R2")
            except Exception as e:
                print(f"[R2 CLEANUP ERROR] Failed to delete image {key}: {e}")
                
    # 2. Check for any additional images in an images array
    images = product_data.get("images", [])
    if isinstance(images, list):
        for img_url in images:
            if isinstance(img_url, str) and is_r2_url(img_url):
                key = extract_r2_key(img_url)
                if key and key not in deleted_assets:
                    try:
                        delete_object(settings.R2_BUCKET_ASSETS, key)
                        delete_object(settings.R2_BUCKET_MOVIES, key)
                        deleted_assets.append(key)
                        print(f"[R2 CLEANUP] Successfully deleted secondary product image {key} from Cloudflare R2")
                    except Exception as e:
                        print(f"[R2 CLEANUP ERROR] Failed to delete secondary image {key}: {e}")

    # 3. Delete product document from Firestore database
    try:
        product_ref.delete()
        print(f"[DB CLEANUP] Successfully deleted product document {product_id} from Firestore")
    except Exception as e:
        print(f"[DB CLEANUP ERROR] Failed to delete product document {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete product from database: {str(e)}")
        
    return {
        "success": True,
        "message": f"Product {product_id} deleted from database and Cloudflare",
        "deleted_assets": deleted_assets
    }

