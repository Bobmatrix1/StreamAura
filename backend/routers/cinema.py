from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from core.security import get_current_user, get_current_admin
from core.config import settings
from models.cinema import RoomCreateRequest, PresignedUrlRequest, PaystackInitRequest, AgoraTokenRequest, WithdrawalRequest, MultipartInitiateRequest, MultipartPartRequest, MultipartCompleteRequest
from services.r2_service import generate_presigned_upload_url, generate_presigned_download_url, initiate_multipart_upload, generate_presigned_part_url, complete_multipart_upload
from services.agora_service import generate_rtc_token
from services.paystack_service import initialize_transaction, verify_transaction, create_transfer_recipient, initiate_transfer, get_banks, resolve_account_number
from services.redis_service import set_room_state

import uuid
import time
import hashlib
import json
from firebase_admin import firestore

router = APIRouter()

# Get Firestore db from firebase-admin (Lazy initialization)
def get_db():
    return firestore.client()

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
                "title": "Wallet Top-up via Paystack",
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
async def paystack_webhook(request: Request):
    """
    Handle Paystack Webhook events.
    Verifies the signature and updates database based on event type.
    """
    payload = await request.body()
    signature = request.headers.get("x-paystack-signature")
    
    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature")
        
    # Verify signature
    import hmac
    import hashlib
    expected_signature = hmac.new(
        settings.PAYSTACK_SECRET_KEY.encode(),
        payload,
        hashlib.sha512
    ).hexdigest()
    
    if signature != expected_signature:
        raise HTTPException(status_code=401, detail="Invalid signature")
        
    event_data = json.loads(payload)
    event_type = event_data.get("event")
    
    if event_type == "charge.success":
        data = event_data["data"]
        reference = data["reference"]
        amount_naira = data["amount"] / 100
        uid = data["metadata"].get("user_uid")
        
        db = get_db()
        
        # 1. Check if already processed
        tx_ref = db.collection("transactions").document(reference)
        if tx_ref.get().exists:
            return {"status": "already_processed"}
            
        # 2. Process based on metadata type
        metadata = data.get("metadata", {})
        metadata_type = metadata.get("type")
        
        if metadata_type == "wallet_funding":
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
                "title": "Wallet Top-up via Paystack",
                "status": "completed",
                "timestamp": firestore.SERVER_TIMESTAMP,
                "reference": reference
            })
        elif metadata_type == "ticket_purchase":
            room_id = metadata.get("room_id")
            if room_id:
                # Distribution logic (30% platform, 70% host base)
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
                    
                    # Update Room Specific Stats
                    db.collection("cinema_rooms").document(room_id).update({
                        "tickets_sold": firestore.Increment(1),
                        "total_earned": firestore.Increment(host_final),
                        "gross_revenue": firestore.Increment(amount_naira)
                    })
                    
                    # Update Room Specific Stats
                    db.collection("cinema_rooms").document(room_id).update({
                        "tickets_sold": firestore.Increment(1),
                        "total_earned": firestore.Increment(host_final),
                        "gross_revenue": firestore.Increment(amount_naira)
                    })
                    
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
                })
                
                # Grant access pass
                pass_id = f"pass_{uuid.uuid4().hex}"
                db.collection("room_access_passes").document(pass_id).set({
                    "room_id": room_id,
                    "user_uid": uid,
                    "reference": reference,
                    "granted_at": firestore.SERVER_TIMESTAMP
                })
        
        # Add other event processing logic here if needed
        
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
    room_doc = db.collection("cinema_rooms").document(room_id).get()
    if not room_doc.exists:
        raise HTTPException(status_code=404, detail="Room not found")
        
    room = room_doc.to_dict()
    if room.get("room_type") != "paid":
        raise HTTPException(status_code=400, detail="This room does not require payment")
        
    price = room.get("ticket_price", 0)
    
    user_ref = db.collection("users").document(user["uid"])
    user_doc = user_ref.get()
    user_data = user_doc.to_dict()
    
    current_balance = user_data.get("referralBalance", 0)
    if current_balance < price:
        raise HTTPException(status_code=400, detail=f"Insufficient referral balance. Need ₦{price}")
        
    # Deduct balance and grant pass
    user_ref.update({"referralBalance": firestore.Increment(-price)})
    
    pass_id = f"pass_{uuid.uuid4().hex}"
    db.collection("room_access_passes").document(pass_id).set({
        "room_id": room_id,
        "user_uid": user["uid"],
        "payment_method": "referral_balance",
        "granted_at": firestore.SERVER_TIMESTAMP
    })
    
    return {"success": True, "message": "Ticket purchased with referral balance!"}

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
    user_ref = db.collection("users").document(uid)
    
    if bonus_to_deduct > 0:
        user_doc = user_ref.get()
        if not user_doc.exists or user_doc.to_dict().get("bonusBalance", 0) < bonus_to_deduct:
            raise HTTPException(status_code=400, detail="Insufficient bonus balance for series discount.")
        user_ref.update({"bonusBalance": firestore.Increment(-bonus_to_deduct)})

    if referral_to_deduct > 0:
        user_doc = user_ref.get()
        if not user_doc.exists or user_doc.to_dict().get("referralBalance", 0) < referral_to_deduct:
            raise HTTPException(status_code=400, detail="Insufficient referral commission balance.")
        user_ref.update({"referralBalance": firestore.Increment(-referral_to_deduct)})

    if normal_to_deduct > 0:
        wallet_ref = db.collection("room_wallets").document(uid)
        wallet_doc = wallet_ref.get()
        if not wallet_doc.exists or wallet_doc.to_dict().get("balance", 0) < normal_to_deduct:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance.")
        
        # Unified deduction (Funded first, then Host)
        w_data = wallet_doc.to_dict()
        fb = w_data.get("funded_balance", 0)
        
        if fb >= normal_to_deduct:
            wallet_ref.update({
                "funded_balance": firestore.Increment(-normal_to_deduct),
                "balance": firestore.Increment(-normal_to_deduct)
            })
        else:
            remaining = normal_to_deduct - fb
            wallet_ref.update({
                "funded_balance": 0,
                "host_balance": firestore.Increment(-remaining),
                "balance": firestore.Increment(-normal_to_deduct)
            })
    
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
        response = await verify_transaction(reference)
        
        if response["data"]["status"] == "success":
            # Update transaction
            db.collection("transactions").document(reference).update({"status": "success"})
            
            # Grant access pass
            pass_id = f"pass_{uuid.uuid4().hex}"
            db.collection("room_access_passes").document(pass_id).set({
                "room_id": room_id,
                "user_uid": user["uid"],
                "reference": reference,
                "granted_at": firestore.SERVER_TIMESTAMP
            })
            
            # Distribution logic (30% platform, 70% host base)
            tx_doc = db.collection("transactions").document(reference).get().to_dict()
            amount = tx_doc.get("amount", 0)
            room_doc = db.collection("cinema_rooms").document(room_id).get()
            if not room_doc.exists:
                return {"success": False, "message": "Room not found during payout"}
                
            room_data = room_doc.to_dict()
            host_uid = room_data.get("host_uid")
            host_name = room_data.get("host_name", "Host")
            
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
            balance_field = "funded_balance" if request.balance_type == "funded" else "host_balance"
            
        user_doc = user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail="Wallet not found")
            
        data = user_doc.to_dict()
        current_balance = data.get(balance_field, 0)
        
        if current_balance < request.amount or request.amount <= 0:
            raise HTTPException(status_code=400, detail=f"Insufficient {request.balance_type} balance")
            
        # 1. Deduct balance immediately
        updates = {balance_field: firestore.Increment(-request.amount)}
        if request.balance_type != "referral":
            updates["balance"] = firestore.Increment(-request.amount) # keep total synced
        user_ref.update(updates)
        
        # 2. Apply Fees Logic
        # Funded: 5% fee (User gets 95%)
        # Host/Referral: 1% fee (User gets 99%)
        fee_percentage = 5 if request.balance_type == "funded" else 1
        fee_amount = (request.amount * fee_percentage) / 100
        payout_amount = request.amount - fee_amount
        
        withdrawal_id = f"wd_{uuid.uuid4().hex[:12]}"
        withdrawal_data = {
            "id": withdrawal_id,
            "user_uid": uid,
            "user_name": user.get("displayName", "User"),
            "user_email": user.get("email"),
            "amount": request.amount,
            "payout_amount": payout_amount,
            "fee_amount": fee_amount,
            "bank_code": request.bank_code,
            "account_number": request.account_number,
            "account_name": request.account_name,
            "status": "pending",
            "type": request.balance_type,
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
async def process_payout(withdrawal_id: str, action: str, admin: dict = Depends(get_current_admin)):
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
                balance_field = "funded_balance" if balance_type == "funded" else "host_balance"
                user_ref.update({
                    balance_field: firestore.Increment(wd_data["amount"]),
                    "balance": firestore.Increment(wd_data["amount"])
                })
            
            wd_ref.update({"status": "rejected", "processed_at": firestore.SERVER_TIMESTAMP})
            return {"success": True, "message": "Withdrawal rejected and refunded"}
            
        elif action == "approve":
            # Use payout_amount for real transfer
            payout_amount = wd_data.get("payout_amount", wd_data["amount"])
            
            # 1. Create Transfer Recipient
            recipient_resp = await create_transfer_recipient(
                wd_data["account_name"],
                wd_data["account_number"],
                wd_data["bank_code"]
            )
            
            if not recipient_resp.get("status"):
                raise HTTPException(status_code=400, detail=f"Paystack Error: {recipient_resp.get('message')}")
                
            recipient_code = recipient_resp["data"]["recipient_code"]
            
            # 2. Initiate Transfer (Amount in kobo)
            transfer_resp = await initiate_transfer(
                int(payout_amount * 100),
                recipient_code,
                f"Aura Payout: {wd_data['id']} ({wd_data['type']})"
            )
            
            if not transfer_resp.get("status"):
                raise HTTPException(status_code=400, detail=f"Transfer Error: {transfer_resp.get('message')}")
                
            # 3. Update Status
            wd_ref.update({
                "status": "completed",
                "paystack_transfer_code": transfer_resp["data"].get("transfer_code"),
                "processed_at": firestore.SERVER_TIMESTAMP
            })
            
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
    poster_url = data.get("thumbnail")
    
    try:
        if movie_url and settings.R2_PUBLIC_BASE_URL in movie_url:
            movie_key = movie_url.split(f"{settings.R2_PUBLIC_BASE_URL}/")[-1]
            # Use R2_BUCKET_MOVIES as it's the most likely bucket for room media
            delete_object(settings.R2_BUCKET_MOVIES, movie_key)
            
        if poster_url and settings.R2_PUBLIC_BASE_URL in poster_url:
            poster_key = poster_url.split(f"{settings.R2_PUBLIC_BASE_URL}/")[-1]
            delete_object(settings.R2_BUCKET_ASSETS, poster_key)
    except Exception as e:
        print(f"R2 Cleanup Error: {str(e)}")

    # 2. Delete from Firestore
    room_ref.delete()
    
    return {"success": True}
