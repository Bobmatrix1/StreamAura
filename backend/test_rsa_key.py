import base64
import xml.etree.ElementTree as ET
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric import padding

key_b64 = "NDA5NiE8UlNBS2V5VmFsdWU+PE1vZHVsdXM+cW16Uzh5dUEvQnVPUjdTSk51ZEpZZzhsZ2JpcysvREd2UXM3SnB2WTBsRkx3YklmZysyNG1kZXd2NHlQV0UxcVNxeTl4Sno1UjB1bFRDNWVIMTZnZTR3alE3c1AvRmZraEJSMVRkSExBVGNmNjhWWUdvRFFwY2JRV2ZOUUMwcmMvQUl6cE9peVovNEM1NytEZUJ3T0N5OHBVd29UK09tcFN2VEM5Tm1qUTJWYXVJYnZzelpiVUhEaklHWmdDTnBRSGZwTWU2YzBtckdMeHA4U2RBYmFnMkJyY0RQZHR4UkMwVUZsUGY0dHF1ZEUxS3gvWTVPbWUxMDlKblJWUmFUQ0oycjlBYmZja0dZbXY1SklFNkdQVFVYSHJENnAvU1I3VWVULzd1MkU5MFlWRkxqckxCQ3NJcjBwL3plYnZheTNWc3hzakZ3d01ZRmxIRUVYb2hXTzUrMUJUYVBqWFpuY0VMb3Bld1l0V3k0MC9kWFlBZHJyUFFiT3lvT1lUSXgyODFsbkIxa0xEMk54SEFuU0hhZ21sa3FXTzZyUWl2SjNOdE43SkNLNThZZzNlcmZWejF4ZWtVNExxekdVTjBGR0RoYzNVcUI1VjlteXNGeWIvd08zc2l4a3NVKzNBUnVPNVBTYXZDZEw2U1pENEpTbVZINkc1RWlzNHoxTHVKbEFNMVV0UUs3SzRqOU1pL3dVVXVPWC9vU010WUEydHFQK3ZGWU5GZVd0WmpGSG1YbmlxQzdxMEtwdmxkUkRrRE42QjdMaGlab0xaem5xU2Y2UU5kb3U1Tk9hMk5GTmRucTVCT1JjdDJyWlJNM3ZYeVdxbjZibTZlSUgvZnUrZ1NmUlZwb0pjeGFJT3JCejY2NHZCQjlTcHZSWDZBZm9BdndIaHZlUDBReHNlaDg9PC9Nb2R1bHVzPjxFeHBvbmVudD5BUUFCPC9FeHBvbmVudD48L1JTQUtleVZhbHVlPg=="

try:
    decoded = base64.b64decode(key_b64).decode('utf-8')
    print("Decoded string sample:", decoded[:100])
    if decoded.startswith("4096!"):
        decoded = decoded[5:]
    
    root = ET.fromstring(decoded)
    modulus_b64 = root.find('Modulus').text
    exponent_b64 = root.find('Exponent').text
    
    n_bytes = base64.b64decode(modulus_b64)
    e_bytes = base64.b64decode(exponent_b64)
    
    n = int.from_bytes(n_bytes, byteorder='big')
    e = int.from_bytes(e_bytes, byteorder='big')
    
    public_key = rsa.RSAPublicNumbers(e, n).public_key()
    print("Success: RSA public key loaded. Key size:", public_key.key_size)
    
    message = b"test payload"
    encrypted = public_key.encrypt(message, padding.PKCS1v15())
    encrypted_b64 = base64.b64encode(encrypted).decode('utf-8')
    print("Encrypted base64 length:", len(encrypted_b64))
except Exception as ex:
    print("Error:", ex)
