import asyncio
from moviebox_api.v1.core import Search, Session, SubjectType

async def test():
    client_session = Session()
    # Search for something common
    search = Search(client_session, "GOAT", subject_type=SubjectType.MOVIES)
    results = await search.get_content()
    
    items = results.get('items', [])
    if items:
        print("FOUND ITEMS:", len(items))
        for i, item in enumerate(items[:3]):
            print(f"\nITEM {i+1} KEYS:", item.keys())
            print(f"ITEM {i+1} DATA:", item)
    else:
        print("NO ITEMS FOUND")

if __name__ == "__main__":
    asyncio.run(test())
