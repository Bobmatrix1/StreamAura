import redis.asyncio as redis
from core.config import settings
import json

# Upstash Redis requires SSL
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

async def set_room_state(room_id: str, state: dict):
    await redis_client.set(f"room:{room_id}:state", json.dumps(state))

async def get_room_state(room_id: str) -> dict:
    state_str = await redis_client.get(f"room:{room_id}:state")
    if state_str:
        return json.loads(state_str)
    return {}

async def update_room_time(room_id: str, current_time: float, status: str = "playing"):
    # Store current playback time and status (playing/paused)
    data = {"time": current_time, "status": status, "updated_at": await redis_client.time()}
    await redis_client.set(f"room:{room_id}:time", json.dumps(data))

async def get_room_time(room_id: str):
    data_str = await redis_client.get(f"room:{room_id}:time")
    if data_str:
        return json.loads(data_str)
    return None

async def add_user_to_room(room_id: str, uid: str, seat: str = None):
    # Add to a set of active users
    await redis_client.sadd(f"room:{room_id}:users", uid)
    if seat:
        await redis_client.hset(f"room:{room_id}:seats", seat, uid)

async def remove_user_from_room(room_id: str, uid: str):
    await redis_client.srem(f"room:{room_id}:users", uid)
    # Remove from seat if applicable
    seats = await redis_client.hgetall(f"room:{room_id}:seats")
    for seat, user_uid in seats.items():
        if user_uid == uid:
            await redis_client.hdel(f"room:{room_id}:seats", seat)

async def get_room_user_count(room_id: str) -> int:
    return await redis_client.scard(f"room:{room_id}:users")

async def add_chat_message(room_id: str, message: dict):
    # Store recent messages in a list, cap at 100
    key = f"room:{room_id}:chat"
    await redis_client.rpush(key, json.dumps(message))
    await redis_client.ltrim(key, -100, -1)

async def get_recent_chat(room_id: str) -> list:
    key = f"room:{room_id}:chat"
    messages = await redis_client.lrange(key, 0, -1)
    return [json.loads(m) for m in messages]
