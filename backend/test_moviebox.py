import asyncio
from moviebox_api.v1.core import Search, Session, SubjectType
from moviebox_api.v1 import MovieDetails, DownloadableMovieFilesDetail

async def test():
    client_session = Session()
    search = Search(client_session, "avatar", subject_type=SubjectType.MOVIES)
    results = await search.get_content()
    print("SEARCH RESULTS KEYS:", results.keys())
    
    items = results.get('items')
    if items:
        print(f"FOUND {len(items)} ITEMS")
        item = items[0]
        print("FIRST ITEM DATA:", item)
        
        # We need the modelled item for MovieDetails
        search_model = await search.get_content_model()
        # Search for 'items' or 'list' in model
        # Pydantic model might use different names
        print("SEARCH MODEL FIELDS:", search_model.__dict__.keys())
        
        target_movie = None
        if hasattr(search_model, 'items'):
            target_movie = search_model.items[0]
        elif hasattr(search_model, 'list'):
            target_movie = search_model.list[0]
            
        if target_movie:
            print("TARGET MOVIE ID:", getattr(target_movie, 'id', 'N/A'))
            md_instance = MovieDetails(target_movie, client_session)
            details = await md_instance.get_content()
            print("DETAILS DATA:", details)
            
            md_model = await md_instance.get_content_model()
            downloadable_files = DownloadableMovieFilesDetail(client_session, md_model)
            files = await downloadable_files.get_content()
            print("FILES DATA:", files)

if __name__ == "__main__":
    asyncio.run(test())
