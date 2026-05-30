import asyncio
import websockets
import json

async def test_ws():
    uri = "ws://localhost:8000/api/ws/cinema/test_room/ws"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected!")
            greeting = await websocket.recv()
            print(f"Received: {greeting}")
    except Exception as e:
        print(f"Failed: {e}")

asyncio.run(test_ws())
