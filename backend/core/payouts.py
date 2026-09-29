from firebase_admin import firestore
import time

def calculate_payout_split(host_uid: str, amount: float, db, transaction=None, currency: str = "cash"):
    """
    Calculates the distribution of a payment (ticket or entry fee).
    
    For REAL CASH (currency == 'cash'):
    - Platform Cut: 20% of gross
    - Host Base Pool: 80% of gross
    - Referrer (if active within 90 days): 10% deducted from Host Pool (8% of gross)
    - Host Final: Host Pool - Referrer Cut (72% of gross during referral, 80% otherwise)
    
    For AURACOIN (currency == 'auracoin'):
    - Host Final: 80% of gross
    - Referrer Cut: 10% of gross (if active referral within 90 days)
    - Platform Cut / Burn: Remaining 10% of gross (or 20% if no active referrer)
    
    For Admin:
    - Host Final: 100% of gross
    - Platform Cut: 0%
    - Referrer Cut: 0%
    
    Referral remains active for 90 days from host signup.
    Returns: (platform_cut, host_final, referrer_uid, referrer_cut)
    """
    try:
        host_ref = db.collection("users").document(host_uid)
        if transaction is not None:
            host_doc = host_ref.get(transaction=transaction)
        else:
            host_doc = host_ref.get()
            
        if amount <= 0:
            return 0.0, 0.0, None, 0.0

        if host_doc.exists:
            host_data = host_doc.to_dict() or {}
            
            # Admin host keeps 100%
            if host_data.get("isAdmin", False):
                return 0.0, round(amount, 2), None, 0.0
                
            referred_by = host_data.get("referredBy")
            created_at = host_data.get("createdAt")
            is_referral_active = False
            referrer_uid = None
            
            # Strict self-referral check and 90-day window
            if referred_by and referred_by != host_uid and created_at:
                now = time.time()
                three_months_sec = 90 * 24 * 3600
                
                if hasattr(created_at, 'timestamp'):
                    created_at_ts = created_at.timestamp()
                elif isinstance(created_at, (int, float)):
                    created_at_ts = created_at / 1000 if created_at > 1e11 else created_at
                elif isinstance(created_at, str):
                    try:
                        from datetime import datetime
                        created_at_ts = datetime.fromisoformat(created_at.replace('Z', '+00:00')).timestamp()
                    except Exception:
                        created_at_ts = 0
                else:
                    created_at_ts = 0

                if created_at_ts > 0 and (now - created_at_ts) < three_months_sec:
                    is_referral_active = True
                    referrer_uid = referred_by

            if currency == "auracoin":
                # AuraCoin: 80% Host, 10% Referrer (if active), 10% Platform Burn (or 20% if no active referrer)
                host_final = round(amount * 0.80, 2)
                referrer_cut = round(amount * 0.10, 2) if is_referral_active else 0.0
                platform_cut = round(amount - host_final - referrer_cut, 2)
                return platform_cut, host_final, (referrer_uid if is_referral_active else None), referrer_cut
            else:
                # Real Cash: Platform 20%, Host Pool 80% (Referrer 10% deducted from Host Pool)
                platform_cut = round(amount * 0.20, 2)
                host_pool = round(amount * 0.80, 2)
                if is_referral_active:
                    referrer_cut = round(host_pool * 0.10, 2) # 10% of 80% = 8% of gross
                    host_final = round(host_pool - referrer_cut, 2) # 72% of gross
                    return platform_cut, host_final, referrer_uid, referrer_cut
                else:
                    return platform_cut, host_pool, None, 0.0
                    
    except Exception as e:
        print(f"Payout calculation error: {str(e)}")
        pass

    # Fallback default
    if currency == "auracoin":
        return round(amount * 0.20, 2), round(amount * 0.80, 2), None, 0.0
    else:
        return round(amount * 0.20, 2), round(amount * 0.80, 2), None, 0.0

def record_platform_cut(
    db, 
    amount: float, 
    currency: str = "cash", 
    source: str = "cinema_ticket", 
    desc: str = "",
    room_id: str = None,
    transaction = None
):
    """
    Atomically updates platform financial tracking in Firestore:
    - currency == "auracoin": Increments total_burned_auracoins and source-specific sink counter.
    - currency == "cash": Increments total_platform_cash_earnings and source-specific revenue counter.
    Also logs individual revenue / burn events in platform_revenue_events.
    """
    if not amount or amount <= 0:
        return
        
    try:
        amount = round(float(amount), 2)
        fin_ref = db.collection("system_analytics").document("platform_financials")
        updates = {"last_updated": firestore.SERVER_TIMESTAMP}
        
        event_data = {
            "amount": amount,
            "currency": currency,
            "source": source,
            "desc": desc or f"Platform cut from {source.replace('_', ' ')}",
            "room_id": room_id,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        
        if currency == "auracoin":
            updates["total_burned_auracoins"] = firestore.Increment(amount)
            if source == "game_entry":
                updates["burned_from_entry_fees"] = firestore.Increment(amount)
            else:
                updates["burned_from_forfeits"] = firestore.Increment(amount)
            event_data["type"] = "burned_auracoins"
        else:
            updates["total_platform_cash_earnings"] = firestore.Increment(amount)
            if source == "cinema_ticket":
                updates["cash_from_cinema_tickets"] = firestore.Increment(amount)
            elif source == "game_entry":
                updates["cash_from_game_entries"] = firestore.Increment(amount)
            elif source == "game_forfeit":
                updates["cash_from_game_forfeits"] = firestore.Increment(amount)
            elif source == "vendor_store":
                updates["cash_from_vendor_store"] = firestore.Increment(amount)
            elif source == "withdrawal_fee":
                updates["cash_from_withdrawal_fees"] = firestore.Increment(amount)
            event_data["type"] = "platform_cash_earning"

        event_ref = db.collection("platform_revenue_events").document()

        if transaction is not None:
            transaction.set(fin_ref, updates, merge=True)
            transaction.set(event_ref, event_data)
        else:
            fin_ref.set(updates, merge=True)
            event_ref.set(event_data)
    except Exception as e:
        print(f"[Platform Financial Tracking Error] {e}")

def get_platform_financials_data(db):
    """
    Returns comprehensive platform financials and burned token statistics.
    """
    try:
        fin_ref = db.collection("system_analytics").document("platform_financials")
        fin_doc = fin_ref.get()
        fin_data = fin_doc.to_dict() or {} if fin_doc.exists else {}

        # Fetch total AuraCoins in user accounts
        total_circulation = 0
        try:
            users_docs = db.collection("users").get()
            for u_doc in users_docs:
                u_data = u_doc.to_dict() or {}
                total_circulation += float(u_data.get("auraCoins", 0) or 0)
        except Exception:
            pass

        # Fetch recent revenue and burn events
        recent_events = []
        try:
            events_query = db.collection("platform_revenue_events").order_by("timestamp", direction=firestore.Query.DESCENDING).limit(25)
            for ev in events_query.stream():
                ev_dict = ev.to_dict() or {}
                ev_dict["id"] = ev.id
                if "timestamp" in ev_dict and hasattr(ev_dict["timestamp"], "to_dict"):
                    pass
                elif "timestamp" in ev_dict and hasattr(ev_dict["timestamp"], "isoformat"):
                    ev_dict["timestamp_str"] = ev_dict["timestamp"].isoformat()
                recent_events.append(ev_dict)
        except Exception:
            pass

        burned_total = float(fin_data.get("total_burned_auracoins", 0) or 0)
        cash_total = float(fin_data.get("total_platform_cash_earnings", 0) or 0)
        
        # Historical aggregation fallback if newly initialized
        if cash_total == 0:
            try:
                tx_docs = db.collection("transactions").where("status", "==", "completed").get()
                for tx in tx_docs:
                    tx_dict = tx.to_dict() or {}
                    tx_type = tx_dict.get("type")
                    tx_amt = float(tx_dict.get("amount", 0) or 0)
                    if tx_type == "purchase" or "ticket" in str(tx_dict.get("title", "")).lower():
                        cut = round(tx_amt * 0.20, 2)
                        cash_total += cut
                        fin_data["cash_from_cinema_tickets"] = fin_data.get("cash_from_cinema_tickets", 0) + cut
            except Exception:
                pass

        return {
            "success": True,
            "total_burned_auracoins": burned_total,
            "total_platform_cash_earnings": cash_total,
            "auracoins_breakdown": {
                "burned_from_entry_fees": float(fin_data.get("burned_from_entry_fees", 0) or 0),
                "burned_from_forfeits": float(fin_data.get("burned_from_forfeits", 0) or 0),
                "total_in_circulation": total_circulation
            },
            "cash_breakdown": {
                "cinema_tickets": float(fin_data.get("cash_from_cinema_tickets", 0) or 0),
                "game_entries": float(fin_data.get("cash_from_game_entries", 0) or 0),
                "game_forfeits": float(fin_data.get("cash_from_game_forfeits", 0) or 0),
                "vendor_store": float(fin_data.get("cash_from_vendor_store", 0) or 0),
                "withdrawal_fees": float(fin_data.get("cash_from_withdrawal_fees", 0) or 0)
            },
            "recent_events": recent_events
        }
    except Exception as e:
        print(f"[Get Platform Financials Error] {e}")
        return {
            "success": False,
            "total_burned_auracoins": 0,
            "total_platform_cash_earnings": 0,
            "auracoins_breakdown": { "burned_from_entry_fees": 0, "burned_from_forfeits": 0, "total_in_circulation": 0 },
            "cash_breakdown": { "cinema_tickets": 0, "game_entries": 0, "game_forfeits": 0, "vendor_store": 0, "withdrawal_fees": 0 },
            "recent_events": []
        }

