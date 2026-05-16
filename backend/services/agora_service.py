import time
from agora_token_builder import RtcTokenBuilder
from core.config import settings

def generate_rtc_token(channel_name: str, uid: int, role_type: str = 'publisher', expiration_time_in_seconds: int = 3600):
    """
    Generates an Agora RTC token for joining voice/video channels in Cinema Rooms.
    uid must be an integer. For string uids, usually Agora allows String uid mapping or 
    we assign a temporary integer uid mapped to the user in our DB/Redis.
    """
    app_id = settings.AGORA_APP_ID
    app_certificate = settings.AGORA_APP_CERTIFICATE
    
    current_timestamp = int(time.time())
    privilege_expired_ts = current_timestamp + expiration_time_in_seconds

    # RtcTokenBuilder.Role.Role_Publisher = 1
    # RtcTokenBuilder.Role.Role_Subscriber = 2
    role = 1 if role_type == 'publisher' else 2

    token = RtcTokenBuilder.buildTokenWithUid(
        app_id, 
        app_certificate, 
        channel_name, 
        uid, 
        role, 
        privilege_expired_ts
    )
    
    return token
