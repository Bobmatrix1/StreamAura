from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class RoomCreateRequest(BaseModel):
    room_name: str
    room_type: str # 'free', 'paid', 'private'
    content_type: str # 'movie', 'series'
    movie_title: str
    movie_cover_image: str
    movie_file: Optional[str] = None # For movies
    episodes: Optional[List[Dict[str, Any]]] = None # For series
    
    trailer_url: Optional[str] = None
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

    payment_wallet_episodes: Optional[str] = "normal" # 'normal', 'referral'
    payment_wallet_private: Optional[str] = "normal" # 'normal', 'referral'
    auto_start_at: Optional[int] = None

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
    balance_type: str = "host" # "funded" or "host" or "referral"

class AgoraTokenRequest(BaseModel):
    room_id: str
    role: str = "publisher" # publisher or subscriber

class MultipartInitiateRequest(BaseModel):
    file_name: str
    content_type: str
    bucket_type: str # 'assets' or 'movies'

class MultipartPartRequest(BaseModel):
    upload_id: str
    key: str
    part_number: int
    bucket_type: str

class MultipartCompleteRequest(BaseModel):
    upload_id: str
    key: str
    parts: List[Dict[str, Any]] # [{'ETag': '...', 'PartNumber': 1}, ...]
    bucket_type: str
