"""
Cloudflare R2 Storage Module
Handles uploading and managing images in R2
"""
import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError
import logging
from typing import Optional
import os
from datetime import datetime

logger = logging.getLogger(__name__)

class R2Storage:
    """Cloudflare R2 storage handler using S3-compatible API"""

    def __init__(self, config):
        """
        Initialize R2 client

        Args:
            config: Application config object with R2 credentials
        """
        self.bucket_name = config.R2_BUCKET_NAME
        self.public_url = config.R2_PUBLIC_URL

        # Create S3 client configured for R2
        self.s3_client = boto3.client(
            's3',
            endpoint_url=config.R2_ENDPOINT_URL,
            aws_access_key_id=config.R2_ACCESS_KEY_ID,
            aws_secret_access_key=config.R2_SECRET_ACCESS_KEY,
            config=BotoConfig(
                signature_version='s3v4',
                region_name='auto'
            )
        )

        logger.info(f"R2 Storage initialized for bucket: {self.bucket_name}")

    def upload_image(
        self,
        image_data: bytes,
        filename: str,
        content_type: str = 'image/png'
    ) -> Optional[str]:
        """
        Upload image to R2

        Args:
            image_data: Image bytes
            filename: Filename to use in R2
            content_type: MIME type of the image

        Returns:
            Public URL of the uploaded image, or None if failed
        """
        try:
            # Generate a unique path
            timestamp = datetime.utcnow().strftime('%Y/%m/%d')
            key = f"manga/{timestamp}/{filename}"

            logger.info(f"Uploading image to R2: {key}")

            # Upload to R2
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=image_data,
                ContentType=content_type,
                CacheControl='public, max-age=31536000',  # 1 year cache
            )

            # Construct public URL
            public_url = f"{self.public_url}/{key}"
            logger.info(f"Image uploaded successfully: {public_url}")

            return public_url

        except ClientError as e:
            logger.error(f"Failed to upload to R2: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error uploading to R2: {str(e)}")
            return None

    def delete_image(self, key: str) -> bool:
        """
        Delete image from R2

        Args:
            key: Object key in R2

        Returns:
            True if successful, False otherwise
        """
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
        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            return True
        except ClientError:
            return False
