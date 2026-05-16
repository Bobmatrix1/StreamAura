from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class RoomCreateRequest(BaseModel):
    room_name: str
    room_type: str # 'free', 'paid', 'private'
    movie_title: str
    movie_cover_image: str
    movie_file: str # Cloudflare R2 object key
    
    description: Optional[str] = None
    max_seats: Optional[int] = None
    category: Optional[str] = None
    scheduled_start_time: Optional[int] = None
    room_theme: Optional[str] = None
    text_chat_enabled: Optional[bool] = True
    voice_enabled: Optional[bool] = False
    camera_enabled: Optional[bool] = False
    custom_banner: Optional[str] = None
    
    ticket_price: Optional[float] = None # For paid rooms
    
    invite_only: Optional[bool] = False # For private rooms
    private_theme: Optional[str] = None

class PresignedUrlRequest(BaseModel):
    file_name: str
    content_type: str
    bucket_type: str # 'assets' or 'movies'

class PaystackInitRequest(BaseModel):
    room_id: str

class WithdrawalRequest(BaseModel):
    amount: float
    bank_code: str
    account_number: str
    account_name: str

class AgoraTokenRequest(BaseModel):
    room_id: str
    role: str = "publisher" # publisher or subscriber
