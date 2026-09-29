import boto3
from botocore.exceptions import ClientError
from core.config import settings

def get_s3_client():
    return boto3.client(
        's3',
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto" # R2 requires 'auto'
    )

def generate_presigned_upload_url(bucket_name: str, object_name: str, content_type: str, expiration=3600):
    """
    Generate a presigned URL to share an S3 object
    """
    s3_client = get_s3_client()
    try:
        response = s3_client.generate_presigned_url('put_object',
                                                    Params={'Bucket': bucket_name,
                                                            'Key': object_name,
                                                            'ContentType': content_type},
                                                    ExpiresIn=expiration)
    except ClientError as e:
        print(e)
        return None

    # Return both the upload URL and the final public URL
    public_url = f"{settings.R2_PUBLIC_BASE_URL}/{object_name}"
    return {"upload_url": response, "public_url": public_url}

def initiate_multipart_upload(bucket_name: str, object_name: str, content_type: str):
    """
    Initiate a multipart upload and return the UploadId
    """
    s3_client = get_s3_client()
    try:
        response = s3_client.create_multipart_upload(
            Bucket=bucket_name,
            Key=object_name,
            ContentType=content_type
        )
        public_url = f"{settings.R2_PUBLIC_BASE_URL}/{object_name}"
        return {
            "upload_id": response['UploadId'],
            "key": object_name,
            "public_url": public_url
        }
    except Exception as e:
        print(f"Error initiating multipart: {e}")
        return None

def generate_presigned_part_url(bucket_name: str, object_name: str, upload_id: str, part_number: int, expiration=3600):
    """
    Generate a presigned URL for a specific part of a multipart upload
    """
    s3_client = get_s3_client()
    try:
        url = s3_client.generate_presigned_url(
            'upload_part',
            Params={
                'Bucket': bucket_name,
                'Key': object_name,
                'UploadId': upload_id,
                'PartNumber': part_number
            },
            ExpiresIn=expiration
        )
        return url
    except Exception as e:
        print(f"Error generating part URL: {e}")
        return None

def complete_multipart_upload(bucket_name: str, object_name: str, upload_id: str, parts: list):
    """
    Complete a multipart upload by joining all parts
    Parts list should look like: [{'ETag': '...', 'PartNumber': 1}, ...]
    """
    s3_client = get_s3_client()
    try:
        response = s3_client.complete_multipart_upload(
            Bucket=bucket_name,
            Key=object_name,
            UploadId=upload_id,
            MultipartUpload={'Parts': parts}
        )
        return True
    except Exception as e:
        print(f"Error completing multipart: {e}")
        return False

def generate_presigned_download_url(bucket_name: str, object_name: str, expiration=86400):
    """
    Generate a presigned URL to download an S3 object securely.
    Used for signed URLs in cinema rooms (defaults to 24 hours).
    """
    s3_client = get_s3_client()
    try:
        response = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': bucket_name,
                                                            'Key': object_name},
                                                    ExpiresIn=expiration)
    except ClientError as e:
        print(f"R2 Presigned Download Error: {e}")
        return None
    return response

def get_presigned_stream_url(key_or_url: str, bucket_name: str = None, expiration: int = 86400):
    """
    Given an R2 key or CDN URL, extract the clean key and generate a valid presigned download URL.
    """
    if not key_or_url or not isinstance(key_or_url, str):
        return None

    # Clean query params and hash fragments
    clean = key_or_url.split("?")[0].split("#")[0].strip()
    
    # Extract key
    key = clean
    base_url = (settings.R2_PUBLIC_BASE_URL or "").rstrip("/")
    if base_url and base_url in clean:
        key = clean.split(base_url)[-1].lstrip("/")
    elif "r2.cloudflarestorage.com" in clean:
        parts = clean.split(".r2.cloudflarestorage.com/")[-1].split("/")
        if len(parts) > 1:
            key = "/".join(parts[1:]) # Strip bucket name if in path
        else:
            key = parts[0]
    elif clean.startswith("http://") or clean.startswith("https://"):
        import urllib.parse
        parsed = urllib.parse.urlparse(clean)
        key = parsed.path.lstrip("/")

    # Strip bucket prefixes if any
    if settings.R2_BUCKET_MOVIES and key.startswith(f"{settings.R2_BUCKET_MOVIES}/"):
        key = key[len(settings.R2_BUCKET_MOVIES) + 1:]
    if settings.R2_BUCKET_ASSETS and key.startswith(f"{settings.R2_BUCKET_ASSETS}/"):
        key = key[len(settings.R2_BUCKET_ASSETS) + 1:]

    # Default to movies bucket
    target_bucket = bucket_name or settings.R2_BUCKET_MOVIES
    return generate_presigned_download_url(target_bucket, key, expiration)

def delete_object(bucket_name: str, object_name: str):
    s3_client = get_s3_client()
    try:
        s3_client.delete_object(Bucket=bucket_name, Key=object_name)
        return True
    except ClientError as e:
        print(e)
        return False

