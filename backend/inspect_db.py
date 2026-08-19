import os
import firebase_admin
from firebase_admin import credentials, firestore

if os.path.exists("serviceAccountKey.json"):
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
else:
    firebase_admin.initialize_app()

db = firestore.client()

print("--- USERS ---")
for u in db.collection("users").stream():
    print(f"UID: {u.id} | Name: {u.to_dict().get('displayName')} | isAdmin: {u.to_dict().get('isAdmin')} | referralBalance: {u.to_dict().get('referralBalance')}")

print("\n--- GAME WALLETS ---")
for w in db.collection("game_wallets").stream():
    print(f"UID: {w.id} | Balance: {w.to_dict().get('balance')}")

print("\n--- RECENT TRANSACTIONS ---")
txs = db.collection("transactions").order_by("timestamp", direction=firestore.Query.DESCENDING).limit(10).stream()
for tx in txs:
    d = tx.to_dict()
    print(f"ID: {tx.id} | User: {d.get('user_uid')} | Title: {d.get('title')} | Amount: {d.get('amount')} | Type: {d.get('type')}")

print("\n--- RECENT GAME ROOMS ---")
rooms = db.collection("game_rooms").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(5).stream()
for r in rooms:
    d = r.to_dict()
    print(f"ID: {r.id} | Host: {d.get('hostUid')} | Name: {d.get('roomName')} | entryFee: {d.get('entryFee')} | prizeAmount: {d.get('prizeAmount')} | rounds: {d.get('numberOfRounds')} | status: {d.get('status')}")
