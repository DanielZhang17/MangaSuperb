"""
Cloudflare R2 Storage Module
Handles uploading and managing images in R2
"""
import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError
import logging
import os
from typing import Optional
from datetime import datetime
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


IMAGE_TYPE_SIGNATURES = (
    (b'\x89PNG\r\n\x1a\n', 'image/png', '.png'),
    (b'\xff\xd8\xff', 'image/jpeg', '.jpg'),
    (b'GIF87a', 'image/gif', '.gif'),
    (b'GIF89a', 'image/gif', '.gif'),
)


def detect_image_upload_type(image_data: bytes) -> tuple[str, str] | None:
    """Return the MIME type and filename extension implied by image bytes."""

    if image_data[0:4] == b'RIFF' and image_data[8:12] == b'WEBP':
        return 'image/webp', '.webp'

    for signature, content_type, extension in IMAGE_TYPE_SIGNATURES:
        if image_data.startswith(signature):
            return content_type, extension

    return None


def with_image_extension(filename: str, extension: str) -> str:
    """Return filename with an image extension that matches its bytes."""

    stem, _ = os.path.splitext(filename)
    return f'{stem}{extension}'


class R2Storage:
    """Cloudflare R2 storage handler using S3-compatible API"""

    def __init__(self, config):
        """
        Initialize R2 client

        Args:
            config: Application config object with R2 credentials
        """
        self.bucket_name = config.R2_BUCKET_NAME
        base_url = getattr(config, 'R2_PUBLIC_URL', '') or ''
        self.public_url = base_url.rstrip('/')
        self.endpoint_url = getattr(config, 'R2_ENDPOINT_URL', '') or ''
        self.access_key_id = getattr(config, 'R2_ACCESS_KEY_ID', '') or ''
        self.secret_access_key = getattr(config, 'R2_SECRET_ACCESS_KEY', '') or ''
        self.s3_client = None

        if not all(
            [
                self.bucket_name,
                self.endpoint_url,
                self.access_key_id,
                self.secret_access_key,
            ]
        ):
            logger.warning("R2 Storage disabled; missing bucket, endpoint, or credentials")
            return

        # Create S3 client configured for R2
        self.s3_client = boto3.client(
            's3',
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            config=BotoConfig(
                signature_version='s3v4',
                region_name='auto'
            )
        )

        logger.info(f"R2 Storage initialized for bucket: {self.bucket_name}")

    def _build_object_key(self, filename: str, prefix: Optional[str] = None) -> str:
        timestamp = datetime.utcnow().strftime('%Y/%m/%d')
        segments = [segment.strip('/') for segment in [prefix or 'manga', timestamp, filename] if segment]
        return '/'.join(segments)

    def upload_file(
        self,
        file_data: bytes,
        filename: str,
        *,
        content_type: str = 'application/octet-stream',
        prefix: Optional[str] = None,
        cache_control: str = 'public, max-age=31536000',
    ) -> Optional[str]:
        """Upload arbitrary binary data to R2 and return the public URL."""
        if not self.s3_client:
            logger.error("Cannot upload to R2; storage is not configured")
            return None

        try:
            key = self._build_object_key(filename, prefix=prefix)

            logger.info(f"Uploading image to R2: {key}")

            # Upload to R2
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=file_data,
                ContentType=content_type,
                CacheControl=cache_control,
            )

            # Construct public URL
            if self.public_url:
                public_url = f"{self.public_url}/{key}"
            else:
                public_url = key
            logger.info(f"Image uploaded successfully: {public_url}")

            return public_url

        except ClientError as e:
            logger.error(f"Failed to upload to R2: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error uploading to R2: {str(e)}")
            return None

    def upload_image(
        self,
        image_data: bytes,
        filename: str,
        content_type: str = 'image/png'
    ) -> Optional[str]:
        """Upload image to R2"""
        detected = detect_image_upload_type(image_data)
        if detected:
            content_type, extension = detected
            filename = with_image_extension(filename, extension)

        return self.upload_file(
            file_data=image_data,
            filename=filename,
            content_type=content_type,
            prefix='manga',
        )

    def delete_image(self, key: str) -> bool:
        """
        Delete image from R2

        Args:
            key: Object key in R2

        Returns:
            True if successful, False otherwise
        """
        if not self.s3_client:
            logger.error("Cannot delete from R2; storage is not configured")
            return False

        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=key
            )
            logger.info(f"Deleted image from R2: {key}")
            return True

        except ClientError as e:
            logger.error(f"Failed to delete from R2: {str(e)}")
            return False

    def check_bucket_exists(self) -> bool:
        """
        Check if the configured bucket exists

        Returns:
            True if bucket exists, False otherwise
        """
        if not self.s3_client:
            return False

        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            return True
        except ClientError:
            return False

    def _resolve_key(self, url_or_key: str) -> Optional[str]:
        if not url_or_key:
            return None

        cleaned = url_or_key.strip()
        if self.public_url and cleaned.startswith(self.public_url):
            return cleaned[len(self.public_url):].lstrip('/')

        parsed = urlparse(cleaned)
        if parsed.scheme and parsed.netloc:
            # External URL that does not belong to this bucket
            return None

        return cleaned

    def download_file(self, url_or_key: str) -> Optional[bytes]:
        """Fetch an object from R2 using either its public URL or object key."""

        key = self._resolve_key(url_or_key)
        if not key:
            logger.error("Cannot resolve object key for download: %s", url_or_key)
            return None
        if not self.s3_client:
            logger.error("Cannot download from R2; storage is not configured")
            return None

        try:
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
            body = response.get('Body')
            if body:
                return body.read()
            logger.error("No body returned for key %s", key)
        except ClientError as exc:
            logger.error("Failed to download from R2: %s", exc)
        return None
