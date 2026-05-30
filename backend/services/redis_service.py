import redis.asyncio as redis
from core.config import settings
import json
import logging
import time

logger = logging.getLogger(__name__)

# In-memory fallback for local development without Redis
_memory_store = {}

# Upstash Redis requires SSL. If REDIS_URL is missing, we'll handle it in the wrapper.
redis_client = None
if settings.REDIS_URL:
    try:
        redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception as e:
        logger.warning(f"Failed to initialize Redis client: {e}")

async def safe_redis_call(func, *args, **kwargs):
    if redis_client:
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            logger.error(f"Redis error in {func.__name__}: {e}")
    return None

async def set_room_state(room_id: str, state: dict):
    key = f"room:{room_id}:state"
    if redis_client:
        try:
            await redis_client.set(key, json.dumps(state))
            return
        except Exception: pass
    _memory_store[key] = json.dumps(state)

async def get_room_state(room_id: str) -> dict:
    key = f"room:{room_id}:state"
    state_str = None
    if redis_client:
        try:
            state_str = await redis_client.get(key)
        except Exception: pass
    
    if not state_str:
        state_str = _memory_store.get(key)
        
    if state_str:
        return json.loads(state_str)
    return {}

async def update_room_time(room_id: str, current_time: float, status: str = "playing"):
    # Store current playback time and status (playing/paused)
    data = {"time": current_time, "status": status, "updated_at": time.time() if redis_client else 0}
    key = f"room:{room_id}:time"
    if redis_client:
        try:
            data["updated_at"] = (await redis_client.time())[0]
            await redis_client.set(key, json.dumps(data))
            return
        except Exception: pass
    _memory_store[key] = json.dumps(data)

async def get_room_time(room_id: str):
    key = f"room:{room_id}:time"
    data_str = None
    if redis_client:
        try:
            data_str = await redis_client.get(key)
        except Exception: pass
        
    if not data_str:
        data_str = _memory_store.get(key)
        
    if data_str:
        return json.loads(data_str)
    return None

async def add_user_to_room(room_id: str, uid: str, seat: str = None):
    key_users = f"room:{room_id}:users"
    key_seats = f"room:{room_id}:seats"
    if redis_client:
        try:
            await redis_client.sadd(key_users, uid)
            if seat:
                await redis_client.hset(key_seats, seat, uid)
            return
        except Exception: pass
    
    # Memory fallback
    if key_users not in _memory_store: _memory_store[key_users] = set()
    _memory_store[key_users].add(uid)
    if seat:
        if key_seats not in _memory_store: _memory_store[key_seats] = {}
        _memory_store[key_seats][seat] = uid

async def remove_user_from_room(room_id: str, uid: str):
    key_users = f"room:{room_id}:users"
    key_seats = f"room:{room_id}:seats"
    if redis_client:
        try:
            await redis_client.srem(key_users, uid)
            seats = await redis_client.hgetall(key_seats)
            for seat, user_uid in seats.items():
                if user_uid == uid:
                    await redis_client.hdel(key_seats, seat)
            return
        except Exception: pass
        
    # Memory fallback
    if key_users in _memory_store:
        _memory_store[key_users].discard(uid)
    if key_seats in _memory_store:
        for seat, user_uid in list(_memory_store[key_seats].items()):
            if user_uid == uid:
                del _memory_store[key_seats][seat]

async def get_room_user_count(room_id: str) -> int:
    key = f"room:{room_id}:users"
    if redis_client:
        try:
            return await redis_client.scard(key)
        except Exception: pass
    return len(_memory_store.get(key, set()))

async def get_room_users(room_id: str) -> list:
    key = f"room:{room_id}:users"
    if redis_client:
        try:
            return list(await redis_client.smembers(key))
        except Exception: pass
    return list(_memory_store.get(key, set()))

async def add_chat_message(room_id: str, message: dict):
    key = f"room:{room_id}:chat"
    if redis_client:
        try:
            await redis_client.rpush(key, json.dumps(message))
            await redis_client.ltrim(key, -100, -1)
            return
        except Exception: pass
        
    # Memory fallback
    if key not in _memory_store: _memory_store[key] = []
    _memory_store[key].append(json.dumps(message))
    if len(_memory_store[key]) > 100:
        _memory_store[key] = _memory_store[key][-100:]

async def get_recent_chat(room_id: str) -> list:
    key = f"room:{room_id}:chat"
    messages = []
    if redis_client:
        try:
            messages = await redis_client.lrange(key, 0, -1)
        except Exception: pass
    
    if not messages:
        messages = _memory_store.get(key, [])
        
    return [json.loads(m) for m in messages]
