import os
from typing import Optional
from fastapi import Request, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import auth, credentials
import json

# Firebase initialization is now handled in main.py to ensure correct credentials from env vars.
# We just need references here.
from firebase_admin import auth

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

async def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_optional)):
    """
    Optional dependency to verify Firebase ID token if present. Returns None if unauthenticated.
    """
    if not credentials or not credentials.credentials:
        return None
    try:
        decoded_token = auth.verify_id_token(credentials.credentials)
        if "uid" not in decoded_token:
            decoded_token["uid"] = decoded_token.get("user_id") or decoded_token.get("sub", "")
        return decoded_token
    except Exception:
        return None

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """
    Dependency to verify Firebase ID token and return user info.
    """
    token = credentials.credentials
    try:
        decoded_token = auth.verify_id_token(token)
        if "uid" not in decoded_token:
            decoded_token["uid"] = decoded_token.get("user_id") or decoded_token.get("sub", "")
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
    Checks custom claims and falls back to Firestore document lookup.
    """
    if user.get("admin") or user.get("isAdmin") or user.get("role") == "admin":
        return user
    
    uid = user.get("uid") or user.get("user_id") or user.get("sub")
    if uid:
        try:
            from firebase_admin import firestore
            db = firestore.client()
            user_doc = db.collection('users').document(str(uid)).get()
            if user_doc.exists:
                udata = user_doc.to_dict() or {}
                if udata.get('isAdmin', False) or udata.get('is_admin', False) or udata.get('role') == 'admin':
                    return user
        except Exception:
            pass
        
    raise HTTPException(status_code=403, detail="Not enough permissions")
