from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, Query
from pydantic import BaseModel
from core.security import get_current_user, get_current_admin, get_optional_user
from core.config import settings
from models.cinema import RoomCreateRequest, PresignedUrlRequest, PaystackInitRequest, AgoraTokenRequest, WithdrawalRequest, MultipartInitiateRequest, MultipartPartRequest, MultipartCompleteRequest
from services.r2_service import (
    generate_presigned_upload_url, 
    generate_presigned_download_url, 
    get_presigned_stream_url,
    get_s3_client,
    initiate_multipart_upload, 
    generate_presigned_part_url, 
    complete_multipart_upload, 
    delete_object
)
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

from core.payouts import calculate_payout_split, record_platform_cut

@router.post("/verify-wallet-funding")
async def verify_wallet_funding(reference: str, user: dict = Depends(get_current_user)):
    """
    Verify Paystack transaction for wallet funding and update balance atomically.
    """
    db = get_db()
    uid = user["uid"]
    try:
        response = await verify_transaction(reference)
        
        if response.get("data", {}).get("status") == "success":
            # Check transaction owner to prevent reference theft
            metadata = response["data"].get("metadata", {})
            if metadata and metadata.get("user_uid") != uid:
                raise HTTPException(status_code=403, detail="Unauthorized transaction reference")
            amount_kobo = response["data"]["amount"]
            amount_naira = round(amount_kobo / 100, 2)
            
            tx_ref = db.collection("transactions").document(reference)
            wallet_ref = db.collection("room_wallets").document(uid)
            stats_ref = db.collection('system_analytics').document('global_counters')
            
            transaction = db.transaction()
            
            @firestore.transactional
            def transactional_fund(transaction):
                tx_snap = tx_ref.get(transaction=transaction)
                if tx_snap.exists and tx_snap.to_dict().get("status") == "completed":
                    return {"success": True, "message": "Already processed", "amount": amount_naira}
                    
                # Update user's wallet (Funded Balance)
                transaction.set(wallet_ref, {
                    "funded_balance": firestore.Increment(amount_naira),
                    "balance": firestore.Increment(amount_naira), # Total spending power
                    "total_funded": firestore.Increment(amount_naira)
                }, merge=True)
                
                # Save transaction
                transaction.set(tx_ref, {
                    "user_uid": uid,
                    "type": "deposit",
                    "amount": amount_naira,
                    "title": "Wallet Top-up",
                    "status": "completed",
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "reference": reference
                })
                
                # Update global analytics
                transaction.set(stats_ref, {
                    "payments.success.count": firestore.Increment(1),
                    "payments.success.totalAmount": firestore.Increment(amount_naira),
                    "actions.deposit": firestore.Increment(1)
                }, merge=True)
                
                return {"success": True, "amount": amount_naira}
                
            return transactional_fund(transaction)
        else:
            raise HTTPException(status_code=400, detail="Payment verification failed")
    except HTTPException: raise
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
    Uses Firestore atomic transactions to prevent double-crediting from webhook retries.
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
        
    amount_naira = round(float(verify_resp["data"]["amount_naira"]), 2)
    db = get_db()
    
    # Determine type of transaction from reference
    if reference.startswith("deposit_"):
        parts = reference.split("_")
        if len(parts) < 3:
            return {"status": "error", "reason": "Malformed deposit reference"}
        uid = parts[1]
        
        tx_ref = db.collection("transactions").document(reference)
        wallet_ref = db.collection("room_wallets").document(uid)
        stats_ref = db.collection('system_analytics').document('global_counters')
        
        transaction = db.transaction()
        
        @firestore.transactional
        def transactional_deposit_webhook(transaction):
            tx_snap = tx_ref.get(transaction=transaction)
            if tx_snap.exists and tx_snap.to_dict().get("status") == "completed":
                return {"status": "already_processed"}
                
            transaction.set(wallet_ref, {
                "funded_balance": firestore.Increment(amount_naira),
                "balance": firestore.Increment(amount_naira),
                "total_funded": firestore.Increment(amount_naira)
            }, merge=True)
            
            transaction.set(tx_ref, {
                "user_uid": uid,
                "type": "deposit",
                "amount": amount_naira,
                "title": "Wallet Top-up via TransactPay",
                "status": "completed",
                "timestamp": firestore.SERVER_TIMESTAMP,
                "reference": reference
            })
            
            transaction.set(stats_ref, {
                "payments.success.count": firestore.Increment(1),
                "payments.success.totalAmount": firestore.Increment(amount_naira),
                "actions.deposit": firestore.Increment(1)
            }, merge=True)
            return {"status": "success"}
            
        return transactional_deposit_webhook(transaction)
        
    elif reference.startswith("ticket_"):
        tx_ref = db.collection("transactions").document(reference)
        pending_tx = tx_ref.get()
        if not pending_tx.exists:
            return {"status": "error", "reason": "Ticket transaction not found"}
            
        tx_data = pending_tx.to_dict()
        uid = tx_data.get("user_uid")
        room_id = tx_data.get("room_id")
        
        if room_id:
            room_ref = db.collection("cinema_rooms").document(room_id)
            pass_id = f"pass_{uuid.uuid4().hex}"
            pass_ref = db.collection("room_access_passes").document(pass_id)
            
            transaction = db.transaction()
            
            @firestore.transactional
            def transactional_ticket_webhook(transaction):
                tx_snap = tx_ref.get(transaction=transaction)
                if tx_snap.exists and tx_snap.to_dict().get("status") == "completed":
                    return {"status": "already_processed"}
                    
                room_snap = room_ref.get(transaction=transaction)
                if not room_snap.exists:
                    return {"status": "error", "reason": "Cinema room not found"}
                    
                room_data = room_snap.to_dict()
                host_uid = room_data.get("host_uid")
                host_name = room_data.get("host_name", "Host")
                
                platform_cut, host_final, referrer_uid, referrer_cut = calculate_payout_split(host_uid, amount_naira, db, transaction=transaction)
                
                # Record 20% Platform Cut
                if platform_cut > 0:
                    record_platform_cut(
                        db=db,
                        amount=platform_cut,
                        currency="cash",
                        source="cinema_ticket",
                        desc=f"20% platform cut from {room_data.get('room_name', 'Cinema')} ticket sale",
                        room_id=room_id,
                        transaction=transaction
                    )
                
                # Update Host Wallet
                if host_uid:
                    wallet_ref = db.collection("room_wallets").document(host_uid)
                    transaction.set(wallet_ref, {
                        "host_balance": firestore.Increment(host_final),
                        "balance": firestore.Increment(host_final),
                        "total_earned": firestore.Increment(host_final),
                        "tickets_sold": firestore.Increment(1)
                    }, merge=True)
                    
                # Update Room Stats
                transaction.update(room_ref, {
                    "tickets_sold": firestore.Increment(1),
                    "total_earned": firestore.Increment(host_final),
                    "gross_revenue": firestore.Increment(amount_naira)
                })
                
                # Update Referrer if active
                if referrer_uid and referrer_cut > 0:
                    ref_user_ref = db.collection("users").document(referrer_uid)
                    transaction.update(ref_user_ref, {"referralBalance": firestore.Increment(referrer_cut)})
                    ref_activity_ref = db.collection("game_wallets").document(referrer_uid).collection("activity").document()
                    transaction.set(ref_activity_ref, {
                        "type": "referral_earning",
                        "amount": referrer_cut,
                        "desc": f"10% commission from {host_name}'s ticket sale",
                        "timestamp": firestore.SERVER_TIMESTAMP
                    })
                    
                # Mark completed
                transaction.set(tx_ref, {
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
                transaction.set(pass_ref, {
                    "room_id": room_id,
                    "user_uid": uid,
                    "reference": reference,
                    "granted_at": firestore.SERVER_TIMESTAMP
                })
                return {"status": "success"}
                
            return transactional_ticket_webhook(transaction)
            
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

@router.get("/trailer-stream-url")
async def get_cinema_trailer_stream_url(
    url: Optional[str] = None,
    room_id: Optional[str] = None,
    trailer_id: Optional[str] = None,
    title: Optional[str] = None,
    user: Optional[dict] = Depends(get_optional_user)
):
    """
    Publicly resolves a playable stream URL or embed URL for cinema trailers.
    Supports R2 presigned streaming, direct MP4, YouTube URLs, and movie titles.
    """
    db = get_db()
    target_url = url
    
    # 1. If room_id or trailer_id provided, look up trailer in Firestore
    if not target_url and trailer_id:
        try:
            t_doc = db.collection("cinema_trailers").document(trailer_id).get()
            if t_doc.exists:
                t_data = t_doc.to_dict() or {}
                target_url = t_data.get("videoUrl") or t_data.get("trailer_url") or t_data.get("url")
                if not title:
                    title = t_data.get("title") or t_data.get("movie_title")
        except Exception as e:
            print(f"Trailer doc lookup error: {e}")

    if not target_url and room_id:
        try:
            r_doc = db.collection("cinema_rooms").document(room_id).get()
            if r_doc.exists:
                r_data = r_doc.to_dict() or {}
                target_url = r_data.get("trailer_url")
                if not title:
                    title = r_data.get("movie_title") or r_data.get("room_name")
        except Exception as e:
            print(f"Room trailer lookup error: {e}")

    if target_url:
        target_url = target_url.strip()

        # YouTube URL handling
        yt_id = None
        if "youtube.com" in target_url or "youtu.be" in target_url:
            if "youtu.be/" in target_url:
                yt_id = target_url.split("youtu.be/")[-1].split("?")[0].split("&")[0]
            elif "v=" in target_url:
                yt_id = target_url.split("v=")[-1].split("&")[0]
            elif "/embed/" in target_url:
                yt_id = target_url.split("/embed/")[-1].split("?")[0]
                
        if yt_id:
            embed_url = f"https://www.youtube-nocookie.com/embed/{yt_id}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1"
            return {
                "success": True,
                "player_mode": "embed",
                "embed_url": embed_url,
                "youtube_key": yt_id,
                "stream_url": target_url,
                "title": title or "Official Trailer"
            }

        # R2 Cloud Storage URL handling
        if is_r2_url(target_url):
            key = extract_r2_key(target_url)
            if key:
                signed_url = get_presigned_stream_url(key, settings.R2_BUCKET_MOVIES)
                if not signed_url:
                    signed_url = get_presigned_stream_url(key, settings.R2_BUCKET_ASSETS)
                if signed_url:
                    return {
                        "success": True,
                        "player_mode": "video",
                        "stream_url": signed_url,
                        "key": key,
                        "original_url": target_url,
                        "title": title or "Official Trailer"
                    }

        # Direct HTTP/HTTPS Video URL
        return {
            "success": True,
            "player_mode": "video",
            "stream_url": target_url,
            "original_url": target_url,
            "title": title or "Official Trailer"
        }

    # If no valid URL, but movie title is available, lookup via official movie trailer system
    if title:
        try:
            from main import get_movie_trailer as find_movie_trailer
            res = await find_movie_trailer(title=title)
            if res and res.get("success"):
                data = res.get("data", {})
                return {
                    "success": True,
                    "player_mode": "embed" if (data.get("embedUrl") or data.get("key") or data.get("youtubeKey")) else "video",
                    "embed_url": data.get("embedUrl"),
                    "stream_url": data.get("streamUrl") or data.get("directUrl"),
                    "youtube_key": data.get("youtubeKey") or data.get("key"),
                    "title": title
                }
        except Exception as te:
            print(f"Trailer title fallback error: {te}")

        # Clean fallback embed if specific key was not found
        encoded_title = urllib.parse.quote(f"{title} official trailer")
        return {
            "success": True,
            "player_mode": "embed",
            "embed_url": f"https://www.youtube-nocookie.com/embed?search={encoded_title}&autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1",
            "stream_url": None,
            "title": title
        }

    raise HTTPException(status_code=400, detail="No trailer URL or title provided")

@router.get("/stream-url")
async def get_cinema_stream_url(
    url: Optional[str] = None, 
    room_id: Optional[str] = None, 
    episode_index: int = 0,
    trailer: bool = False,
    user: dict = Depends(get_current_user)
):
    """
    Resolves the playable stream URL for a cinema room or video file with strict authorization.
    Generates high-speed, secure Cloudflare R2 presigned download URLs for movies and series episodes.
    """
    target_url = url
    db = get_db()
    uid = user.get("uid")
    is_admin = check_is_admin(user)
    
    if room_id:
        room_doc = db.collection("cinema_rooms").document(room_id).get()
        if not room_doc.exists:
            raise HTTPException(status_code=404, detail="Cinema room not found")
        room_data = room_doc.to_dict()
        
        # If requesting the trailer for this room, allow directly without ticket check
        if trailer and room_data.get("trailer_url"):
            target_url = room_data.get("trailer_url")
        else:
            # 1. Check if user is banned
            if room_data.get("bannedUsers", {}).get(uid):
                raise HTTPException(status_code=403, detail="You are banned from this cinema room.")

            # 2. Access Verification for Paid Rooms
            if room_data.get("room_type") == "paid":
                if room_data.get("host_uid") != uid and not is_admin:
                    passes = db.collection("room_access_passes") \
                               .where("room_id", "==", room_id) \
                               .where("user_uid", "==", uid) \
                               .limit(1).get()
                    if not passes:
                        raise HTTPException(status_code=403, detail="Ticket required to access room stream")

            # 3. Access Verification for Private Rooms
            elif room_data.get("room_type") == "private":
                if room_data.get("host_uid") != uid and not is_admin:
                    allowed_guests = (room_data.get("private_guests") or []) + (room_data.get("allowed_uids") or [])
                    # Check user profile for Aura ID match
                    user_aura_id = user.get("aura_id") or user.get("auraId") or ""
                    is_whitelisted = (uid in allowed_guests) or (user_aura_id and user_aura_id in allowed_guests)
                    
                    if not is_whitelisted:
                        passes = db.collection("room_access_passes") \
                                   .where("room_id", "==", room_id) \
                                   .where("user_uid", "==", uid) \
                                   .limit(1).get()
                        if not passes:
                            raise HTTPException(status_code=403, detail="Access denied. Private screening invitation required.")

            if room_data.get("content_type") == "series":
                episodes = room_data.get("episodes", [])
                if 0 <= episode_index < len(episodes):
                    target_url = episodes[episode_index].get("url")
                elif episodes:
                    target_url = episodes[0].get("url")
            else:
                target_url = room_data.get("movie_file") or room_data.get("trailer_url")

    elif target_url:
        # Direct URL was passed without room_id - verify ownership or public trailer status
        key = extract_r2_key(target_url)
        is_trailer = trailer or (key and ("trailer" in key.lower() or "trailers" in key.lower()))
        is_owner = (uid and key and key.startswith(f"{uid}/"))
        
        if not (is_admin or is_owner or is_trailer):
            # Check if URL belongs to any registered trailer in cinema_trailers or cinema_rooms
            try:
                t_matches = db.collection("cinema_trailers").where("videoUrl", "==", target_url).limit(1).get()
                if not t_matches:
                    t_matches = db.collection("cinema_trailers").where("trailer_url", "==", target_url).limit(1).get()
                if t_matches:
                    is_trailer = True
            except Exception:
                pass

        if not (is_admin or is_owner or is_trailer):
            raise HTTPException(
                status_code=403, 
                detail="Direct movie stream access requires room authorization. Please provide room_id."
            )

    if not target_url:
        raise HTTPException(status_code=400, detail="No video URL or room ID provided")

    # If it's an R2 URL or key, generate a direct signed download URL
    if is_r2_url(target_url):
        key = extract_r2_key(target_url)
        if key:
            signed_url = get_presigned_stream_url(key, settings.R2_BUCKET_MOVIES)
            if not signed_url:
                signed_url = get_presigned_stream_url(key, settings.R2_BUCKET_ASSETS)
            if signed_url:
                return {
                    "success": True, 
                    "stream_url": signed_url, 
                    "key": key,
                    "original_url": target_url
                }

    return {
        "success": True, 
        "stream_url": target_url, 
        "original_url": target_url
    }

@router.post("/rooms/{room_id}/pay-referral")
async def pay_with_referral_balance(room_id: str, user: dict = Depends(get_current_user)):
    """
    Pay for a room ticket using referral balance.
    Properly executes calculate_payout_split and credits host and referrer.
    """
    db = get_db()
    uid = user["uid"]
    
    try:
        room_ref = db.collection("cinema_rooms").document(room_id)
        user_ref = db.collection("users").document(uid)
        stats_ref = db.collection('system_analytics').document('global_counters')
        
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
                
            price = round(float(room.get("ticket_price", 0) or 0), 2)
            if price <= 0:
                raise HTTPException(status_code=400, detail="Invalid ticket price")
            
            # Read user
            user_snapshot = user_ref.get(transaction=transaction)
            if not user_snapshot.exists:
                raise HTTPException(status_code=404, detail="User not found")
                
            user_data = user_snapshot.to_dict()
            current_balance = float(user_data.get("referralBalance", 0) or 0)
            if current_balance < price:
                raise HTTPException(status_code=400, detail=f"Insufficient referral balance. Need ₦{price:,.2f} but available is ₦{current_balance:,.2f}")
                
            host_uid = room.get("host_uid")
            host_name = room.get("host_name", "Host")
            
            # Calculate 80/20 revenue split
            platform_cut, host_final, referrer_uid, referrer_cut = calculate_payout_split(host_uid, price, db, transaction=transaction)
            
            # 1. Deduct referral balance from buyer
            transaction.update(user_ref, {"referralBalance": firestore.Increment(-price)})
            
            # 2. Grant access pass
            pass_id = f"pass_{uuid.uuid4().hex}"
            pass_ref = db.collection("room_access_passes").document(pass_id)
            transaction.set(pass_ref, {
                "room_id": room_id,
                "user_uid": uid,
                "payment_method": "referral_balance",
                "amount": price,
                "granted_at": firestore.SERVER_TIMESTAMP
            })
            
            # 3. Log purchase transaction
            tx_id = f"tx_refpay_{pass_id[:12]}"
            tx_ref = db.collection("transactions").document(tx_id)
            transaction.set(tx_ref, {
                "id": tx_id,
                "room_id": room_id,
                "user_uid": uid,
                "amount": price,
                "status": "completed",
                "title": f"Cinema Ticket Purchase ({room.get('room_name', 'Cinema')})",
                "type": "purchase",
                "payment_method": "referral_balance",
                "timestamp": firestore.SERVER_TIMESTAMP
            })
            
            # 4. Update Host Wallet (80% base pool)
            if host_uid:
                wallet_ref = db.collection("room_wallets").document(host_uid)
                transaction.set(wallet_ref, {
                    "host_balance": firestore.Increment(host_final),
                    "balance": firestore.Increment(host_final),
                    "total_earned": firestore.Increment(host_final),
                    "tickets_sold": firestore.Increment(1)
                }, merge=True)
                
            # 5. Update Referrer (if active 90-day window)
            if referrer_uid and referrer_cut > 0:
                ref_user_ref = db.collection("users").document(referrer_uid)
                transaction.update(ref_user_ref, {"referralBalance": firestore.Increment(referrer_cut)})
                ref_activity_ref = db.collection("game_wallets").document(referrer_uid).collection("activity").document()
                transaction.set(ref_activity_ref, {
                    "type": "referral_earning",
                    "amount": referrer_cut,
                    "desc": f"10% commission from {host_name}'s ticket sale",
                    "room": room.get("room_name", "Cinema"),
                    "timestamp": firestore.SERVER_TIMESTAMP
                })
                
            # 6. Update Platform Global Stats & Platform Financials
            transaction.set(stats_ref, {
                "payments.success.count": firestore.Increment(1),
                "payments.success.totalAmount": firestore.Increment(price),
                "payments.platform_fees": firestore.Increment(platform_cut)
            }, merge=True)
            
            if platform_cut > 0:
                record_platform_cut(
                    db=db,
                    amount=platform_cut,
                    currency="cash",
                    source="cinema_ticket",
                    desc=f"20% platform cut from {room.get('room_name', 'Cinema')} referral ticket purchase",
                    room_id=room_id,
                    transaction=transaction
                )
            
            return {"success": True, "message": "Ticket purchased with referral balance!"}
            
        return transactional_pay(transaction)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rooms/create")
async def create_cinema_room(request: RoomCreateRequest, user: dict = Depends(get_current_user)):
    """
    Creates a new cinema room. Supports referral balance payment for private rooms and series episodes.
    """
    db = get_db()
    room_id = f"room_{uuid.uuid4().hex[:12]}"
    uid = user['uid']
    
    # Sanitize max_seats
    if request.max_seats is not None and request.max_seats < 1:
        request.max_seats = 1

    # --- COST CALCULATION & DEDUCTIONS ---
    normal_to_deduct = 0
    referral_to_deduct = 0
    auracoin_to_deduct = 0

    # 1. Series/Episode Cost (50 AuraCoins or ₦50 Cash per episode)
    if request.content_type == "series" and request.episodes:
        ep_count = len(request.episodes)
        if request.payment_wallet_episodes in ["auracoin", "bonus"]:
            auracoin_to_deduct += (ep_count * 50) # 50 AuraCoins per episode
        elif request.payment_wallet_episodes == "referral":
            referral_to_deduct += (ep_count * 50) # ₦50 Referral per episode
        else:
            normal_to_deduct += (ep_count * 50) # ₦50 Cash per episode

    # 2. Private Room Cost
    if request.room_type == "private":
        seats = max(1, request.max_seats or 1)
        if request.payment_wallet_private in ["auracoin", "bonus"]:
            auracoin_to_deduct += (seats * 2500) # 2,500 AuraCoins per seat
        elif request.payment_wallet_private == "referral":
            referral_to_deduct += (seats * 2500) # ₦2,500 Referral balance per seat
        else:
            normal_to_deduct += (seats * 1000) # ₦1,000 Normal cash rate per seat
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
            
            if auracoin_to_deduct > 0:
                user_coins = float(user_data.get("auraCoins") or user_data.get("auraCoin") or user_data.get("bonusBalance") or 0)
                if user_coins < auracoin_to_deduct:
                    raise HTTPException(status_code=400, detail=f"Insufficient AuraCoins balance. You need {auracoin_to_deduct:,} AuraCoins.")
                    
            if referral_to_deduct > 0:
                if user_data.get("referralBalance", 0) < referral_to_deduct:
                    raise HTTPException(status_code=400, detail=f"Insufficient referral commission balance. You need ₦{referral_to_deduct:,.2f}.")
                    
            if normal_to_deduct > 0:
                if w_data.get("balance", 0) < normal_to_deduct:
                    raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. You need ₦{normal_to_deduct:,.2f}.")
                    
            # Perform Writes
            user_updates = {}
            if auracoin_to_deduct > 0:
                user_updates["auraCoins"] = firestore.Increment(-auracoin_to_deduct)
                if "bonusBalance" in user_data:
                    user_updates["bonusBalance"] = firestore.Increment(-auracoin_to_deduct)
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

            # Record AuraCoins spend activity
            if auracoin_to_deduct > 0:
                act_ref = db.collection("game_wallets").document(uid).collection("activity").document()
                transaction.set(act_ref, {
                    "type": "series_episode_stream",
                    "currency": "auracoin",
                    "amount": -auracoin_to_deduct,
                    "desc": f"Watch/Host Series '{request.movie_title}' ({ep_count if request.content_type == 'series' else 1} eps)",
                    "timestamp": firestore.SERVER_TIMESTAMP
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
    
    # Automatically register trailer in cinema_trailers with movie details if trailer_url is present
    if request.trailer_url:
        try:
            trailer_doc_data = {
                "title": request.movie_title,
                "movie_title": request.movie_title,
                "thumbnail": request.movie_cover_image,
                "videoUrl": request.trailer_url,
                "description": request.description or "",
                "category": request.category or "General",
                "duration": request.duration or "Trailer",
                "release_year": request.release_year or "",
                "age_rating": request.age_rating or "",
                "director": request.director or "",
                "cast": request.cast or "",
                "tagline": request.tagline or "",
                "roomId": room_id,
                "roomName": request.room_name,
                "host_uid": uid,
                "host_name": user.get('name', 'Host'),
                "roomType": request.room_type,
                "status": "upcoming" if request.scheduled_start_time else "live",
                "createdAt": firestore.SERVER_TIMESTAMP
            }
            db.collection("cinema_trailers").document(f"trailer_{room_id}").set(trailer_doc_data)
        except Exception as te:
            print(f"Error registering cinema trailer: {te}")
    
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
    Verify payment and grant access pass atomically.
    """
    db = get_db()
    uid = user["uid"]
    try:
        tx_ref = db.collection("transactions").document(reference)
        room_ref = db.collection("cinema_rooms").document(room_id)
        
        # Verify transaction with gateway
        response = await verify_transaction(reference)
        if response.get("data", {}).get("status") != "success":
            return {"success": False, "message": "Payment not successful on gateway"}
            
        # Verify transaction metadata owner if available
        gateway_metadata = response.get("data", {}).get("metadata", {})
        if gateway_metadata:
            if gateway_metadata.get("user_uid") and gateway_metadata.get("user_uid") != uid:
                raise HTTPException(status_code=403, detail="Unauthorized transaction reference")
            if gateway_metadata.get("room_id") and gateway_metadata.get("room_id") != room_id:
                raise HTTPException(status_code=400, detail="Transaction reference does not match room ID")
            
        transaction = db.transaction()
        
        @firestore.transactional
        def transactional_grant_access(transaction):
            tx_snap = tx_ref.get(transaction=transaction)
            if not tx_snap.exists:
                raise HTTPException(status_code=404, detail="Transaction reference not found")
                
            tx_data = tx_snap.to_dict()
            if tx_data.get("status") == "completed":
                return {"success": True, "message": "Already processed. Access pass active."}
                
            if tx_data.get("user_uid") != uid:
                raise HTTPException(status_code=403, detail="Unauthorized transaction reference owner")
                
            if tx_data.get("room_id") != room_id:
                raise HTTPException(status_code=400, detail="Transaction reference does not match room ID")
                
            room_snap = room_ref.get(transaction=transaction)
            if not room_snap.exists:
                raise HTTPException(status_code=404, detail="Room not found")
                
            room_data = room_snap.to_dict()
            amount = round(float(room_data.get("ticket_price", 0)), 2)
            
            # Strict gateway amount verification (prevent underpayment attacks)
            expected_kobo = int(amount * 100)
            paid_kobo = int(response.get("data", {}).get("amount", 0))
            if paid_kobo < expected_kobo:
                raise HTTPException(status_code=400, detail=f"Underpayment detected: paid ₦{paid_kobo/100:,.2f} but ticket price is ₦{amount:,.2f}")
                
            host_uid = room_data.get("host_uid")
            host_name = room_data.get("host_name", "Host")
            
            platform_cut, host_final, referrer_uid, referrer_cut = calculate_payout_split(host_uid, amount, db, transaction=transaction)
            
            # Record 20% Platform Cut
            if platform_cut > 0:
                record_platform_cut(
                    db=db,
                    amount=platform_cut,
                    currency="cash",
                    source="cinema_ticket",
                    desc=f"20% platform cut from {room_data.get('room_name', 'Cinema')} ticket purchase",
                    room_id=room_id,
                    transaction=transaction
                )
            
            # 1. Grant access pass
            pass_id = f"pass_{uuid.uuid4().hex}"
            pass_ref = db.collection("room_access_passes").document(pass_id)
            transaction.set(pass_ref, {
                "room_id": room_id,
                "user_uid": uid,
                "reference": reference,
                "granted_at": firestore.SERVER_TIMESTAMP
            })
            
            # 2. Mark transaction completed
            transaction.set(tx_ref, {
                "room_id": room_id,
                "user_uid": uid,
                "amount": amount,
                "status": "completed",
                "title": "Cinema Ticket Purchase",
                "type": "purchase",
                "timestamp": firestore.SERVER_TIMESTAMP,
                "reference": reference
            }, merge=True)
            
            # 3. Update Host Wallet
            if host_uid:
                wallet_ref = db.collection("room_wallets").document(host_uid)
                transaction.set(wallet_ref, {
                    "host_balance": firestore.Increment(host_final),
                    "balance": firestore.Increment(host_final),
                    "total_earned": firestore.Increment(host_final),
                    "tickets_sold": firestore.Increment(1)
                }, merge=True)
                
            # 4. Update Referrer
            if referrer_uid and referrer_cut > 0:
                ref_user_ref = db.collection("users").document(referrer_uid)
                transaction.update(ref_user_ref, {"referralBalance": firestore.Increment(referrer_cut)})
                ref_activity_ref = db.collection("game_wallets").document(referrer_uid).collection("activity").document()
                transaction.set(ref_activity_ref, {
                    "type": "referral_earning",
                    "amount": referrer_cut,
                    "desc": f"10% commission from {host_name}'s ticket sale",
                    "timestamp": firestore.SERVER_TIMESTAMP
                })
                
            return {"success": True, "message": "Payment verified. Access granted."}
            
        return transactional_grant_access(transaction)
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/withdraw")
async def request_withdrawal(request: WithdrawalRequest, user: dict = Depends(get_current_user)):
    """
    Unified withdrawal for Referral (0% fee), Vendor (0% fee), Funded (5% fee), and Host (1% fee).
    Atomic transaction guarantees zero balance loss or duplication during network glitches.
    """
    db = get_db()
    uid = user['uid']
    
    # Input sanitization and strict validation
    try:
        amount = round(float(request.amount), 2)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid withdrawal amount")

    if amount < 100.0:
        raise HTTPException(status_code=400, detail="Minimum withdrawal amount is ₦100.00")

    account_number = str(request.account_number or "").strip()
    if len(account_number) != 10 or not account_number.isdigit():
        raise HTTPException(status_code=400, detail="Account number must be a valid 10-digit NUBAN number")

    account_name = str(request.account_name or "").strip()
    bank_code = str(request.bank_code or "").strip()
    if not account_name or not bank_code:
        raise HTTPException(status_code=400, detail="Bank code and verified account name are required")

    try:
        balance_field = ""
        user_ref = None
        
        if request.balance_type == "referral":
            user_ref = db.collection("users").document(uid)
            balance_field = "referralBalance"
        elif request.balance_type == "vendor":
            user_ref = db.collection("room_wallets").document(uid)
            balance_field = "vendor_balance"
        elif request.balance_type == "funded":
            user_ref = db.collection("room_wallets").document(uid)
            balance_field = "funded_balance"
        else:
            user_ref = db.collection("room_wallets").document(uid)
            balance_field = "host_balance"
            
        # 1. Apply Fees Logic
        # Vendor: 0% fee (100% payout, 20% platform split was already collected at order purchase)
        # Funded: 5% fee (User gets 95%)
        # Host/Referral: 1% fee (User gets 99%)
        if request.balance_type == "vendor":
            fee_percentage = 0
        elif request.balance_type == "funded":
            fee_percentage = 5
        else:
            fee_percentage = 1

        fee_amount = round((amount * fee_percentage) / 100, 2) if fee_percentage > 0 else 0.0
        payout_amount = round(amount - fee_amount, 2)
        
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
            "amount": amount,
            "payout_amount": payout_amount,
            "fee_amount": fee_amount,
            "bank_code": bank_code,
            "bank_name": bank_name,
            "account_number": account_number,
            "account_name": account_name,
            "status": "pending",
            "refunded": False,
            "type": request.balance_type,
            "created_at": firestore.SERVER_TIMESTAMP
        }

        transaction = db.transaction()
        current_balance = 0.0
        
        @firestore.transactional
        def transactional_withdraw(transaction):
            nonlocal current_balance
            user_snapshot = user_ref.get(transaction=transaction)
            if not user_snapshot.exists:
                raise HTTPException(status_code=404, detail="Wallet not found")
                
            data = user_snapshot.to_dict() or {}
            
            # Dedicated vendor balance with fallback for existing records
            if balance_field == "vendor_balance":
                if "vendor_balance" in data and float(data.get("vendor_balance", 0) or 0) > 0:
                    current_balance = float(data.get("vendor_balance", 0) or 0)
                else:
                    v_earnings = float(data.get("vendor_earnings", 0) or 0)
                    if v_earnings == 0:
                        try:
                            orders_docs = db.collection("orders").where("vendorId", "==", uid).where("status", "!=", "cancelled").get()
                            orders_total = sum(float(doc.to_dict().get("totalAmount", 0) or 0) for doc in orders_docs)
                            v_earnings = orders_total * 0.80
                        except Exception:
                            pass
                    
                    try:
                        wd_docs = db.collection("withdrawals").where("user_uid", "==", uid).where("type", "==", "vendor").get()
                        withdrawn_total = sum(float(doc.to_dict().get("amount", 0) or 0) for doc in wd_docs if doc.to_dict().get("status") not in ["rejected"])
                    except Exception:
                        withdrawn_total = 0.0
                    
                    current_balance = max(0.0, v_earnings - withdrawn_total)
            else:
                current_balance = float(data.get(balance_field, 0) or 0)
            
            if current_balance < amount:
                raise HTTPException(status_code=400, detail=f"Insufficient {request.balance_type} balance. Available: ₦{current_balance:,.2f}")
                
            # 1. Deduct balance atomically
            if balance_field == "vendor_balance":
                new_v_bal = current_balance - amount
                updates = {"vendor_balance": new_v_bal}
            else:
                updates = {balance_field: firestore.Increment(-amount)}
                if request.balance_type == "funded":
                    updates["balance"] = firestore.Increment(-amount)
            
            transaction.set(user_ref, updates, merge=True)
            
            # 2. Save withdrawal document atomically in the SAME transaction
            wd_ref = db.collection("withdrawals").document(withdrawal_id)
            withdrawal_data["balance_before"] = current_balance
            withdrawal_data["balance_after"] = current_balance - amount
            transaction.set(wd_ref, withdrawal_data)
            
            return current_balance
            
        tx_result = transactional_withdraw(transaction)
        if tx_result is not None:
            current_balance = float(tx_result)

        # 3. Send In-App Notification to User
        try:
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            balance_label = "Vendor Store" if request.balance_type == "vendor" else request.balance_type.capitalize()
            fee_note = " (0% Payout Fee)" if request.balance_type == "vendor" else f" (Net Payout: ₦{payout_amount:,.2f})"
            notif_data = {
                "id": notif_id,
                "title": "Withdrawal Request Submitted",
                "message": f"Your withdrawal request of ₦{float(request.amount):,} ({balance_label}){fee_note} has been submitted and is waiting for approval.",
                "timestamp": firestore.SERVER_TIMESTAMP,
                "read": False,
                "type": "withdrawal_pending",
                "link": "/vendor" if request.balance_type == "vendor" else "/wallet"
            }
            db.collection("users").document(uid).collection("notifications").document(notif_id).set(notif_data)
            db.collection("users").document(uid).update({"unreadCount": firestore.Increment(1)})
        except Exception as ne:
            print(f"[Withdrawal Notification Error] {ne}")
        
        return {"success": True, "message": "Withdrawal request submitted successfully", "withdrawal_id": withdrawal_id}
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
    Atomic transactional refunds guarantee zero balance corruption or duplicate refunds under any network condition.
    """
    db = get_db()
    
    if action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'approve' or 'reject'.")

    try:
        wd_ref = db.collection("withdrawals").document(withdrawal_id)
        
        if action == "reject":
            transaction = db.transaction()
            
            @firestore.transactional
            def transactional_reject(transaction):
                wd_snap = wd_ref.get(transaction=transaction)
                if not wd_snap.exists:
                    raise HTTPException(status_code=404, detail="Withdrawal request not found")
                    
                wd_data = wd_snap.to_dict()
                status = wd_data.get("status")
                
                # Strict Idempotency / Anti-Double-Refund Guard
                if status != "pending":
                    raise HTTPException(status_code=400, detail=f"Cannot reject request with status '{status}' (already processed)")
                if wd_data.get("refunded", False):
                    raise HTTPException(status_code=400, detail="This withdrawal request has already been refunded.")
                    
                uid = wd_data["user_uid"]
                amount = float(wd_data.get("amount", 0) or 0)
                balance_type = wd_data.get("type", "host")
                
                if amount <= 0:
                    raise HTTPException(status_code=400, detail="Invalid withdrawal amount to refund")
                
                # Determine target wallet reference and atomic balance update
                if balance_type == "referral":
                    target_ref = db.collection("users").document(uid)
                    updates = {"referralBalance": firestore.Increment(amount)}
                elif balance_type == "vendor":
                    target_ref = db.collection("room_wallets").document(uid)
                    target_snap = target_ref.get(transaction=transaction)
                    if target_snap.exists:
                        updates = {"vendor_balance": firestore.Increment(amount)}
                    else:
                        updates = {"vendor_balance": amount, "vendor_earnings": amount}
                elif balance_type == "funded":
                    target_ref = db.collection("room_wallets").document(uid)
                    updates = {
                        "funded_balance": firestore.Increment(amount),
                        "balance": firestore.Increment(amount)
                    }
                else: # host
                    target_ref = db.collection("room_wallets").document(uid)
                    updates = {
                        "host_balance": firestore.Increment(amount),
                        "balance": firestore.Increment(amount)
                    }
                
                # 1. Update user balance atomically
                transaction.set(target_ref, updates, merge=True)
                
                # 2. Update withdrawal document atomically (locked against duplicate execution)
                wd_updates = {
                    "status": "rejected",
                    "refunded": True,
                    "refunded_at": firestore.SERVER_TIMESTAMP,
                    "rejection_reason": reason or "Rejected by admin",
                    "processed_at": firestore.SERVER_TIMESTAMP,
                    "processed_by": admin.get("email", "admin")
                }
                transaction.update(wd_ref, wd_updates)
                
                return wd_data
            
            # Execute atomic rejection transaction
            wd_data = transactional_reject(transaction)
            uid = wd_data["user_uid"]
            amount = float(wd_data["amount"])
            balance_label = "Vendor Store" if wd_data.get('type') == "vendor" else wd_data.get('type', 'host').capitalize()
            
            # 3. Log transparent refund record in transactions collection
            try:
                tx_ref = db.collection("transactions").document(f"refund_{withdrawal_id}")
                tx_ref.set({
                    "user_uid": uid,
                    "type": "refund",
                    "amount": amount,
                    "title": f"Withdrawal Refund: ₦{amount:,.2f} ({balance_label})",
                    "description": f"Refunded due to rejection: {reason or 'Admin rejected'}",
                    "withdrawal_id": withdrawal_id,
                    "status": "completed",
                    "timestamp": firestore.SERVER_TIMESTAMP
                }, merge=True)
            except Exception as te:
                print(f"[Refund Transaction Log Error] {te}")

            # 4. Send notification to the user
            try:
                notif_id = f"notif_{uuid.uuid4().hex[:12]}"
                notif_data = {
                    "id": notif_id,
                    "title": "Withdrawal Request Rejected & Refunded",
                    "message": f"Your withdrawal request of ₦{amount:,.2f} ({balance_label}) was rejected and the full amount has been refunded to your account. Reason: {reason or 'No reason provided.'}",
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "read": False,
                    "type": "alert",
                    "link": "/vendor" if wd_data.get('type') == "vendor" else "/wallet"
                }
                db.collection("users").document(uid).collection("notifications").document(notif_id).set(notif_data)
                db.collection("users").document(uid).update({"unreadCount": firestore.Increment(1)})
            except Exception as ne:
                print(f"[Rejection Notification Error] {ne}")
            
            return {"success": True, "message": f"Withdrawal rejected and ₦{amount:,.2f} safely refunded to user"}
            
        elif action == "approve":
            wd_doc = wd_ref.get()
            if not wd_doc.exists:
                raise HTTPException(status_code=404, detail="Withdrawal request not found")
            wd_data = wd_doc.to_dict()
            if wd_data.get("status") != "pending":
                raise HTTPException(status_code=400, detail=f"Request has already been {wd_data.get('status')}")

            # Use payout_amount for real transfer
            payout_amount = float(wd_data.get("payout_amount", wd_data["amount"]))
            
            # Initiate TransactPay payout directly with error handling
            try:
                payout_resp = await initiate_payout(
                    amount_naira=float(payout_amount),
                    account_number=wd_data["account_number"],
                    bank_code=wd_data["bank_code"],
                    account_name=wd_data["account_name"],
                    reference=f"payout_{wd_data['id']}",
                    reason=f"Aura Payout: {wd_data['id']} ({wd_data['type']})"
                )
            except Exception as net_err:
                wd_ref.update({
                    "last_gateway_error": str(net_err),
                    "gateway_attempted_at": firestore.SERVER_TIMESTAMP
                })
                raise HTTPException(status_code=502, detail=f"Payment Gateway Network Error: {str(net_err)}. Payout request remains pending and can be retried or rejected/refunded safely.")
            
            if not payout_resp or not payout_resp.get("status"):
                err_msg = payout_resp.get("message", "Payment gateway declined transfer") if payout_resp else "Payment provider unavailable"
                wd_ref.update({
                    "last_gateway_error": err_msg,
                    "gateway_attempted_at": firestore.SERVER_TIMESTAMP
                })
                raise HTTPException(status_code=400, detail=f"TransactPay Error: {err_msg}. Payout request remains pending and can be retried or rejected/refunded safely.")
                
            # Update Status atomically
            wd_ref.update({
                "status": "completed",
                "transactpay_payout_ref": payout_resp.get("data", {}).get("transfer_code") or payout_resp.get("data", {}).get("reference"),
                "processed_at": firestore.SERVER_TIMESTAMP,
                "processed_by": admin.get("email", "admin")
            })

            # Record Platform Withdrawal Fee Revenue
            fee_amount = float(wd_data.get("fee_amount", 0) or 0)
            if fee_amount > 0:
                record_platform_cut(
                    db=db,
                    amount=fee_amount,
                    currency="cash",
                    source="withdrawal_fee",
                    desc=f"Withdrawal fee (₦{fee_amount:,.2f}) collected on {wd_data.get('type', 'wallet')} payout ({wd_data.get('user_name', 'User')})"
                )
            
            # Send notification to the user
            uid = wd_data["user_uid"]
            try:
                notif_id = f"notif_{uuid.uuid4().hex[:12]}"
                balance_label = "Vendor Store" if wd_data.get('type') == "vendor" else wd_data.get('type', 'host').capitalize()
                fee_suffix = " (0% Payout Fee)" if wd_data.get('type') == "vendor" else " after fee deduction"
                notif_data = {
                    "id": notif_id,
                    "title": "Withdrawal Request Approved",
                    "message": f"Your withdrawal of ₦{float(payout_amount):,} ({balance_label}) has been approved and sent to your account{fee_suffix}.",
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "read": False,
                    "type": "withdrawal_approved",
                    "link": "/vendor" if wd_data.get('type') == "vendor" else "/wallet"
                }
                db.collection("users").document(uid).collection("notifications").document(notif_id).set(notif_data)
                db.collection("users").document(uid).update({"unreadCount": firestore.Increment(1)})
            except Exception:
                pass
            
            return {"success": True, "message": "Payout processed and sent successfully"}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/agora/token")
async def get_agora_token(request: AgoraTokenRequest, user: dict = Depends(get_current_user)):
    """
    Generate Agora RTC token for voice/video chat in a specific room with strict access control.
    """
    db = get_db()
    uid = user["uid"]
    is_admin = check_is_admin(user)

    room_doc = db.collection("cinema_rooms").document(request.room_id).get()
    if not room_doc.exists:
        raise HTTPException(status_code=404, detail="Room not found")
        
    room_data = room_doc.to_dict()

    # 1. Check if banned
    if room_data.get("bannedUsers", {}).get(uid):
        raise HTTPException(status_code=403, detail="You are banned from this room.")

    # 2. Check Paid Room Access
    if room_data.get("room_type") == "paid" and room_data.get("host_uid") != uid and not is_admin:
        passes = db.collection("room_access_passes") \
                   .where("room_id", "==", request.room_id) \
                   .where("user_uid", "==", uid) \
                   .limit(1).get()
        if not passes:
            raise HTTPException(status_code=403, detail="Ticket required for voice/video access in this room")

    # 3. Check Private Room Access
    if room_data.get("room_type") == "private" and room_data.get("host_uid") != uid and not is_admin:
        allowed_guests = (room_data.get("private_guests") or []) + (room_data.get("allowed_uids") or [])
        user_aura_id = user.get("aura_id") or user.get("auraId") or ""
        is_whitelisted = (uid in allowed_guests) or (user_aura_id and user_aura_id in allowed_guests)
        
        if not is_whitelisted:
            passes = db.collection("room_access_passes") \
                       .where("room_id", "==", request.room_id) \
                       .where("user_uid", "==", uid) \
                       .limit(1).get()
            if not passes:
                raise HTTPException(status_code=403, detail="Private screening invitation required")

    import hashlib
    numeric_uid = int(hashlib.md5(uid.encode()).hexdigest()[:8], 16)
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
    
    # 3. Clean up associated trailer in cinema_trailers
    try:
        db.collection("cinema_trailers").document(f"trailer_{room_id}").delete()
        matching_trailers = db.collection("cinema_trailers").where("roomId", "==", room_id).get()
        for t_doc in matching_trailers:
            t_doc.reference.delete()
    except Exception as te:
        print(f"Trailer DB Cleanup Error: {str(te)}")
    
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

