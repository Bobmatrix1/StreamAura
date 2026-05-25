from firebase_admin import firestore
import time

def calculate_payout_split(host_uid: str, amount: float, db):
    """
    Calculates the distribution of a payment (ticket or entry fee).
    Revenue Split:
    - Platform: 30%
    - Host Pool: 70%
    - Referrer: 10% of Host Pool (if active)
    - Host Final: Host Pool - Referrer Cut
    
    Referral remains active for 90 days from host signup.
    Returns: (platform_cut, host_final, referrer_uid, referrer_cut)
    """
    platform_rate = 0.30
    host_base_rate = 0.70
    referral_rate_of_host = 0.10 # 10% of the 70%
    
    platform_cut = amount * platform_rate
    host_pool = amount * host_base_rate
    
    referrer_uid = None
    referrer_cut = 0
    
    try:
        # Check if host was referred
        host_doc = db.collection("users").document(host_uid).get()
        if host_doc.exists:
            host_data = host_doc.to_dict()
            referred_by = host_data.get("referredBy")
            created_at = host_data.get("createdAt")
            
            if referred_by and created_at:
                now = time.time()
                # 90 days = 3 months
                three_months_sec = 90 * 24 * 3600
                
                # Handle both Firestore Timestamp objects and Unix numbers
                if hasattr(created_at, 'timestamp'):
                    created_at_ts = created_at.timestamp()
                elif isinstance(created_at, (int, float)):
                    created_at_ts = created_at / 1000 if created_at > 1e11 else created_at
                else:
                    created_at_ts = 0

                if (now - created_at_ts) < three_months_sec:
                    referrer_uid = referred_by
                    referrer_cut = host_pool * referral_rate_of_host # 10% of the 70% (e.g. 700 from 7000)
                    host_pool -= referrer_cut # Host keeps the rest (e.g. 6300)
    except Exception as e:
        print(f"Payout calculation error: {str(e)}")
        pass
                
    return platform_cut, host_pool, referrer_uid, referrer_cut
