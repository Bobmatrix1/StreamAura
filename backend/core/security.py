import os
from fastapi import Request, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import auth, credentials
import json

# Ensure Firebase Admin is initialized
try:
    if not firebase_admin._apps:
        # Load from serviceAccountKey.json if present (from previous setup)
        if os.path.exists("serviceAccountKey.json"):
            cred = credentials.Certificate("serviceAccountKey.json")
            firebase_admin.initialize_app(cred)
        else:
            # Fallback to application default credentials if not found locally
            firebase_admin.initialize_app()
except ValueError:
    pass

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """
    Dependency to verify Firebase ID token and return user info.
    """
    token = credentials.credentials
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid authentication credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_admin(user: dict = Depends(get_current_user)):
    """
    Dependency to verify if the user is an admin.
    Assuming 'admin' custom claim is set, or we can check firestore if needed.
    For now, checking custom claims is faster. If custom claims aren't used, 
    this will need a Firestore lookup.
    """
    # Check if 'admin' or 'isAdmin' claim exists
    if user.get("admin") or user.get("isAdmin"):
        return user
    
    # Optional: fallback to Firestore lookup if claims aren't configured yet
    from google.cloud import firestore
    db = firestore.Client()
    user_doc = db.collection('users').document(user['uid']).get()
    if user_doc.exists and user_doc.to_dict().get('isAdmin', False):
        return user
        
    raise HTTPException(status_code=403, detail="Not enough permissions")
