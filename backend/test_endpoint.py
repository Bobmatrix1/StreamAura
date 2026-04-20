import httpx
import asyncio

async def test():
    async with httpx.AsyncClient() as client:
        try:
            # Try to hit the local server directly
            response = await client.get("http://localhost:8000/api/analytics/country")
            print("STATUS:", response.status_code)
            print("BODY:", response.text)
        except Exception as e:
            print("ERROR:", e)

if __name__ == "__main__":
    asyncio.run(test())
