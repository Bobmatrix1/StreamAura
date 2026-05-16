import httpx
from core.config import settings

PAYSTACK_URL = "https://api.paystack.co"

def get_headers():
    return {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json"
    }

async def initialize_transaction(email: str, amount: int, reference: str, callback_url: str):
    url = f"{PAYSTACK_URL}/transaction/initialize"
    payload = {
        "email": email,
        "amount": amount,
        "reference": reference,
        "callback_url": callback_url
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=get_headers())
        return response.json()

async def verify_transaction(reference: str):
    url = f"{PAYSTACK_URL}/transaction/verify/{reference}"
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=get_headers())
        return response.json()

async def get_banks():
    url = f"{PAYSTACK_URL}/bank"
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=get_headers())
        return response.json()

async def resolve_account_number(account_number: str, bank_code: str):
    url = f"{PAYSTACK_URL}/bank/resolve?account_number={account_number}&bank_code={bank_code}"
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=get_headers())
        return response.json()

async def create_transfer_recipient(name: str, account_number: str, bank_code: str):
    url = f"{PAYSTACK_URL}/transferrecipient"
    payload = {
        "type": "nuban",
        "name": name,
        "account_number": account_number,
        "bank_code": bank_code,
        "currency": "NGN"
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=get_headers())
        return response.json()

async def initiate_transfer(amount: int, recipient_code: str, reason: str):
    url = f"{PAYSTACK_URL}/transfer"
    payload = {
        "source": "balance",
        "amount": amount,
        "recipient": recipient_code,
        "reason": reason
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=get_headers())
        return response.json()
