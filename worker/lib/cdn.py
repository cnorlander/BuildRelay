import os
import boto3
from pathlib import Path
from typing import Optional, Dict, Any
from lib.zip import zip_build
from lib.streams import LogStream


def prepare_cdn_file(job: Dict[str, Any], stream: LogStream) -> str:
    """Prepare build file for CDN upload (zip if directory).
    
    Args:
        job: The job dictionary containing ingest path information
        stream: LogStream instance for logging progress
    
    Returns:
        Path to the file or zip archive for CDN upload
    
    Raises:
        Exception: If the path does not exist or zip creation fails
    """
    absolute_build_path: Optional[str] = job.get("absoluteIngestPath")
    stream.log(f"Preparing build for CDN upload from {job['ingestPath']}...")

    if not absolute_build_path or not os.path.exists(absolute_build_path):
        stream.log(f"Path does not exist: {absolute_build_path}", level="error")
        raise Exception(f"Build path does not exist: {absolute_build_path}")
    
    if os.path.isfile(absolute_build_path):
        stream.log(f"Found file: {absolute_build_path}")
        return absolute_build_path
    elif os.path.isdir(absolute_build_path):
        stream.log(f"Found directory: {absolute_build_path}, creating zip archive...")
        try:
            return zip_build(job["id"], absolute_build_path, stream)
        except Exception as e:
            stream.log(f"Error creating zip: {str(e)}", level="error")
            raise
    else:
        raise Exception(f"Invalid path: {absolute_build_path}")


class CDNUploader:
    """Handles uploading files to S3-compatible CDN services"""
    
    def __init__(self, cdn_destination: Dict[str, Any]) -> None:
        """Initialize CDN uploader with destination config"""
        if not cdn_destination:
            raise ValueError("cdn_destination cannot be None or empty")
        
        self.config: Dict[str, Any] = cdn_destination
        self._init_s3_client()
    
    def _init_s3_client(self) -> None:
        """Initialize boto3 S3 client"""
        # Validate required fields
        required_fields = ['region', 'accessKeyId', 'secretAccessKey', 'bucketName']
        for field in required_fields:
            if not self.config.get(field):
                raise ValueError(f"CDN destination must include '{field}'")
        
        session_kwargs = {
            'region_name': self.config.get('region'),
            'aws_access_key_id': self.config.get('accessKeyId'),
            'aws_secret_access_key': self.config.get('secretAccessKey'),
        }
        
        session = boto3.Session(**session_kwargs)
        
        # Create S3 client with optional custom endpoint
        client_kwargs = {}
        if self.config.get('endpoint'):
            client_kwargs['endpoint_url'] = self.config.get('endpoint')
        
        self.s3_client = session.client('s3', **client_kwargs)
    
    def upload_file(self, file_path: str, stream_logger: Optional[Any] = None) -> Dict[str, Any]:
        """
        Upload a file to the CDN
        
        Args:
            file_path: Path to the file to upload
            stream_logger: Optional LogStream instance for logging progress
        
        Returns:
            dict with keys: url, bucket, key, etag
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        bucket = self.config.get('bucketName')
        if not bucket:
            raise ValueError("CDN destination must include 'bucketName'")
        
        # Build S3 key with path prefix
        path_prefix = self.config.get('path', '').strip('/')
        file_name = Path(file_path).name
        s3_key = f"{path_prefix}/{file_name}" if path_prefix else file_name
        
        try:
            if stream_logger:
                stream_logger.log(f"Uploading {file_name} to S3...")
            
            # Upload file
            response = self.s3_client.upload_file(
                file_path,
                bucket,
                s3_key
            )
            
            # Make file public if isPublic flag is set
            if self.config.get('isPublic'):
                if stream_logger:
                    stream_logger.log(f"Setting object ACL to public...")
                try:
                    self.s3_client.put_object_acl(
                        Bucket=bucket,
                        Key=s3_key,
                        ACL='public-read'
                    )
                    if stream_logger:
                        stream_logger.log(f"Object is now publicly readable")
                except Exception as acl_err:
                    if stream_logger:
                        stream_logger.log(f"Warning: Could not set public ACL: {str(acl_err)}", level="error")
            
            # Build public URL
            if self.config.get('endpoint'):
                # Custom endpoint (like MinIO)
                url = f"{self.config.get('endpoint')}/{bucket}/{s3_key}"
            else:
                # AWS S3
                region = self.config.get('region', 'us-east-1')
                url = f"https://{bucket}.s3.{region}.amazonaws.com/{s3_key}"
            
            # Log success of upload
            if stream_logger:
                stream_logger.log(f"Successfully uploaded to {url}")
            
            # Return some basic info about the uploaded file
            return {
                'url': url,
                'bucket': bucket,
                'key': s3_key,
                'isPublic': self.config.get('isPublic', False)
            }
        
        # Log any errors that occur during upload
        except Exception as e:
            if stream_logger:
                stream_logger.log(f"CDN upload error: {str(e)}", level="error")
            raise
