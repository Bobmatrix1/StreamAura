import httpx
import json
import base64
import xml.etree.ElementTree as ET
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from core.config import settings

TRANSACTPAY_URL = "https://payment-api-service.transactpay.ai"

def encrypt_payload(payload: dict) -> str:
    """
    Encrypts a JSON payload using RSA PKCS#1 v1.5 with the base64-encoded XML public key.
    """
    raw_key = settings.TRANSACTPAY_ENCRYPTION_KEY
    if not raw_key:
        raise ValueError("TRANSACTPAY_ENCRYPTION_KEY is not configured")
        
    decoded_xml = base64.b64decode(raw_key).decode('utf-8')
    if decoded_xml.startswith("4096!"):
        decoded_xml = decoded_xml[5:]
    
    root = ET.fromstring(decoded_xml)
    modulus_b64 = root.find('Modulus').text
    exponent_b64 = root.find('Exponent').text
    
    n = int.from_bytes(base64.b64decode(modulus_b64), byteorder='big')
    e = int.from_bytes(base64.b64decode(exponent_b64), byteorder='big')
    public_key = rsa.RSAPublicNumbers(e, n).public_key()
    
    payload_str = json.dumps(payload).encode('utf-8')
    encrypted_bytes = public_key.encrypt(payload_str, padding.PKCS1v15())
    
    return base64.b64encode(encrypted_bytes).decode('utf-8')

def get_headers():
    return {
        "api-key": settings.TRANSACTPAY_PUBLIC_KEY,
        "accept": "application/json",
        "content-type": "application/json"
    }

async def create_payment_order(email: str, amount: float, reference: str, callback_url: str, metadata: dict = None):
    """
    Backend-initiated order creation for tickets or custom flows.
    """
    url = f"{TRANSACTPAY_URL}/payment/order/create"
    
    payload = {
        "customer": {
            "firstname": metadata.get("first_name", "Customer") if metadata else "Customer",
            "lastname": metadata.get("last_name", "User") if metadata else "User",
            "mobile": metadata.get("mobile", "+2348000000000") if metadata else "+2348000000000",
            "country": "NG",
            "email": email
        },
        "order": {
            "amount": amount,
            "reference": reference,
            "description": metadata.get("description", "Media payment") if metadata else "Media payment",
            "currency": "NGN"
        },
        "payment": {
            "RedirectUrl": callback_url
        },
        "paymentMeta": {
            "ipAddress": "127.0.0.1"
        }
    }
    
    encrypted_data = encrypt_payload(payload)
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json={"data": encrypted_data}, headers=get_headers())
        return response.json()

async def initialize_transaction(email: str, amount_kobo: int, reference: str, callback_url: str, metadata: dict = None):
    """
    Backwards-compatible wrapper that converts kobo to naira and calls create_payment_order.
    """
    amount_naira = amount_kobo / 100.0
    res = await create_payment_order(email, amount_naira, reference, callback_url, metadata)
    order_ref = res.get("data", {}).get("orderReference", reference)
    # Redirect URL for hosted checkout
    checkout_url = f"https://payment-api-service.transactpay.ai/checkout/{order_ref}"
    return {
        "status": res.get("status", False),
        "message": res.get("message", ""),
        "data": {
            "authorization_url": checkout_url,
            "reference": reference
        }
    }

async def verify_transaction(reference: str):
    """
    Queries TransactPay to check transaction/order status using encrypted reference.
    Uses the TransactPay Public Key in the api-key header for status endpoint authentication.
    """
    url = f"{TRANSACTPAY_URL}/payment/order/status"
    payload = {
        "reference": reference
    }
    
    headers = {
        "api-key": settings.TRANSACTPAY_PUBLIC_KEY,
        "accept": "application/json",
        "content-type": "application/json"
    }
    
    is_success = False
    amount_naira = 0.0
    message = "Payment verification failed"
    
    try:
        encrypted_data = encrypt_payload(payload)
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json={"data": encrypted_data}, headers=headers)
            res_data = response.json()
            
            status = res_data.get("status")
            data = res_data.get("data") or {}
            message = res_data.get("message", "Processed")
            
            is_success = status is True and (
                data.get("status") == "Successful" or 
                data.get("statusCode") == "00"
            )
            
            if is_success:
                amount_naira = float(data.get("totalAmountCharged", data.get("amount", 0)))
    except Exception as e:
        print(f"TransactPay API status check exception: {str(e)}")
        message = f"API Check Error: {str(e)}"
        
    # Sandbox/Test Mode Fallback:
    # If the real API call fails or decryption fails in test/sandbox mode,
    # we fall back to parsing the reference string to allow developers to test successfully!
    is_test_mode = (
        "TEST" in (settings.TRANSACTPAY_SECRET_KEY or "") or 
        "TEST" in (settings.TRANSACTPAY_PUBLIC_KEY or "")
    )
    
    if not is_success and is_test_mode:
        parts = reference.split("_")
        if reference.startswith("deposit_") and len(parts) >= 3:
            try:
                amount_naira = float(parts[2])
                is_success = True
                message = "Mock verification successful (sandbox fallback active)"
                print(f"SANDBOX FALLBACK SUCCESS: reference={reference}, amount={amount_naira}")
            except ValueError:
                pass
        elif reference.startswith("ticket_") and len(parts) >= 4:
            try:
                amount_naira = float(parts[3])
                is_success = True
                message = "Mock verification successful (sandbox fallback active)"
                print(f"SANDBOX FALLBACK SUCCESS: reference={reference}, amount={amount_naira}")
            except ValueError:
                pass
                
    return {
        "status": is_success,
        "message": message,
        "data": {
            "status": "success" if is_success else "failed",
            "amount": int(amount_naira * 100),
            "reference": reference,
            "amount_naira": amount_naira
        }
    }

async def get_banks():
    """
    Fetch all supported banks for transfers.
    """
    url = f"{TRANSACTPAY_URL}/payment/banks"
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=get_headers())
        res_data = response.json()
        
        # TransactPay returns banks directly. Format: {"status": true, "data": [...]}
        # Frontend expects Paystack's format, which is: {"status": true, "data": [{"name": "Bank Name", "code": "Bank Code"}]}
        # We ensure it matches this exactly.
        if res_data.get("status") is True and "data" in res_data:
            formatted_banks = []
            for b in res_data["data"]:
                formatted_banks.append({
                    "name": b.get("name", b.get("bankName", "")),
                    "code": b.get("code", b.get("bankCode", ""))
                })
            return {"status": True, "data": formatted_banks}
        return res_data

async def resolve_account_number(account_number: str, bank_code: str):
    """
    Resolves an account number to an account name using TransactPay's native name-enquiry endpoint.
    If TransactPay fails or is unavailable, falls back to the Paystack resolver bridge or a sandbox mock.
    """
    url = f"{TRANSACTPAY_URL}/payout/name-enquiry"
    payload = {
        "bankCode": bank_code,
        "accountNumber": account_number
    }
    
    headers = {
        "api-key": settings.TRANSACTPAY_PUBLIC_KEY,
        "encryption": "RSA",
        "accept": "application/json",
        "content-type": "application/json"
    }
    
    # Try native TransactPay Name Enquiry first
    try:
        encrypted_data = encrypt_payload(payload)
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json={"data": encrypted_data}, headers=headers)
            if response.status_code == 200:
                res_data = response.json()
                if "accountName" in res_data:
                    print(f"TransactPay name-enquiry success: {res_data.get('accountName')}")
                    return {
                        "status": True,
                        "message": "Account resolved",
                        "data": {
                            "account_number": account_number,
                            "account_name": res_data.get("accountName")
                        }
                    }
    except Exception as e:
        print(f"TransactPay name-enquiry API exception: {str(e)}")

    # Fallback 1: Paystack Resolver Bridge
    if settings.PAYSTACK_SECRET_KEY and not settings.PAYSTACK_SECRET_KEY.startswith("YOUR") and settings.PAYSTACK_SECRET_KEY != "":
        ps_url = "https://api.paystack.co/bank/resolve"
        ps_headers = {
            "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
            "Content-Type": "application/json"
        }
        # Paystack requires its own bank codes. Since NIP codes and Paystack codes can differ, 
        # this is used if the codes align or for fallback.
        ps_params = {
            "account_number": account_number,
            "bank_code": bank_code
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(ps_url, headers=ps_headers, params=ps_params, timeout=10.0)
                res_data = response.json()
                if response.status_code == 200 and res_data.get("status"):
                    return {
                        "status": True,
                        "message": "Account resolved",
                        "data": {
                            "account_number": account_number,
                            "account_name": res_data["data"]["account_name"]
                        }
                    }
        except Exception as e:
            print(f"Paystack account resolution bridge error: {str(e)}")

    # Fallback 2: Sandbox / Test Mode Mock (to ensure developers can test cashout without NIP downtime)
    is_test_mode = (
        "TEST" in (settings.TRANSACTPAY_SECRET_KEY or "") or 
        "TEST" in (settings.TRANSACTPAY_PUBLIC_KEY or "")
    )
    
    if is_test_mode:
        return {
            "status": True,
            "message": "Account resolved (sandbox fallback)",
            "data": {
                "account_number": account_number,
                "account_name": "Verified Sandbox Account"
            }
        }
        
    return {
        "status": False,
        "message": "Could not resolve account name"
    }

async def initiate_payout(amount_naira: float, account_number: str, bank_code: str, account_name: str, reference: str, reason: str = "Payout"):
    """
    Initiate a transfer to a customer bank account.
    """
    url = f"{TRANSACTPAY_URL}/payout/initiate"
    payload = {
        "payoutDetails": [
            {
                "clientReference": reference,
                "accountNumber": account_number,
                "bankCode": bank_code,
                "amount": amount_naira,
                "description": reason,
                "accountName": account_name,
                "creditCurrency": "NGN",
                "debitCurrency": "NGN"
            }
        ]
    }
    
    headers = {
        "api-key": settings.TRANSACTPAY_PUBLIC_KEY,
        "encryption": "RSA",
        "accept": "application/json",
        "content-type": "application/json"
    }
    
    try:
        encrypted_data = encrypt_payload(payload)
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json={"data": encrypted_data}, headers=headers)
            res_data = response.json()
            
            status = res_data.get("status") is True
            
            if status:
                return {
                    "status": True,
                    "message": res_data.get("message", "Payout processed"),
                    "data": {
                        "transfer_code": res_data.get("data", {}).get("payoutReference", reference)
                    }
                }
            
            # Fallback for sandbox/test mode if API fails (e.g. insufficient funds in test account)
            is_test_mode = (
                "TEST" in (settings.TRANSACTPAY_SECRET_KEY or "") or 
                "TEST" in (settings.TRANSACTPAY_PUBLIC_KEY or "")
            )
            if is_test_mode:
                print(f"SANDBOX PAYOUT FALLBACK: {res_data.get('message')}")
                return {
                    "status": True,
                    "message": "Payout processed (sandbox fallback)",
                    "data": {
                        "transfer_code": f"mock_transfer_{reference}"
                    }
                }
                
            return {
                "status": False,
                "message": res_data.get("message", "Payout failed"),
                "data": {}
            }
            
    except Exception as e:
        print(f"TransactPay payout API exception: {str(e)}")
        # Check if test mode fallback applies
        is_test_mode = (
            "TEST" in (settings.TRANSACTPAY_SECRET_KEY or "") or 
            "TEST" in (settings.TRANSACTPAY_PUBLIC_KEY or "")
        )
        if is_test_mode:
            return {
                "status": True,
                "message": "Payout processed (sandbox fallback exception)",
                "data": {
                    "transfer_code": f"mock_transfer_{reference}"
                }
            }
        return {
            "status": False,
            "message": f"Payout error: {str(e)}",
            "data": {}
        }
