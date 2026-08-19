import os
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase
if not firebase_admin._apps:
    if os.path.exists("serviceAccountKey.json"):
        cred = credentials.Certificate("serviceAccountKey.json")
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app()

db = firestore.client()

# Fetch all transactions that should only be in game activity
tx_ref = db.collection("transactions")
docs = tx_ref.get()

deleted_count = 0
for doc in docs:
    data = doc.to_dict()
    title = data.get("title", "")
    if "Funded Game Prize" in title or "Entry Fee" in title:
        print(f"Deleting transaction doc ID {doc.id} | Title: {title} | Amount: {data.get('amount')}")
        tx_ref.document(doc.id).delete()
        deleted_count += 1

print(f"Total deleted incorrect game transactions from main wallet: {deleted_count}")
