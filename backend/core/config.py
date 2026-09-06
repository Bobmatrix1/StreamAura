import os
from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")
try:
    from pydantic_settings import BaseSettings
except ImportError:
    try:
        from pydantic import BaseSettings
    except ImportError:
        from pydantic import BaseModel as BaseSettings

class Settings(BaseSettings):
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "")
    
    # Agora
    AGORA_APP_ID: str = os.getenv("AGORA_APP_ID", "")
    AGORA_APP_CERTIFICATE: str = os.getenv("AGORA_APP_CERTIFICATE", "")
    
    # Cloudflare R2
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_ASSETS: str = os.getenv("R2_BUCKET_ASSETS", "")
    R2_BUCKET_MOVIES: str = os.getenv("R2_BUCKET_MOVIES", "")
    R2_PUBLIC_BASE_URL: str = os.getenv("R2_PUBLIC_BASE_URL", "")
    
    # Paystack
    PAYSTACK_SECRET_KEY: str = os.getenv("PAYSTACK_SECRET_KEY", "")
    PAYSTACK_PUBLIC_KEY: str = os.getenv("PAYSTACK_PUBLIC_KEY", "")
    PAYSTACK_WEBHOOK_SECRET: str = os.getenv("PAYSTACK_WEBHOOK_SECRET", "")
    
    # TransactPay
    TRANSACTPAY_PUBLIC_KEY: str = os.getenv("TRANSACTPAY_PUBLIC_KEY", "")
    TRANSACTPAY_SECRET_KEY: str = os.getenv("TRANSACTPAY_SECRET_KEY", "")
    TRANSACTPAY_ENCRYPTION_KEY: str = os.getenv("TRANSACTPAY_ENCRYPTION_KEY", "")
    
    # App URLs
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "")
    API_BASE_URL: str = os.getenv("API_BASE_URL", "")
    SOCKET_BASE_URL: str = os.getenv("SOCKET_BASE_URL", "")

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
