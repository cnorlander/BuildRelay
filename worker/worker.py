import json
import os
import sys
import time
import redis
from typing import Optional, Dict, Any
from datetime import datetime
from libs.streams import LogStream
from libs.cdn import CDNUploader
from libs.zip import zip_build, unzip_build
from libs.steam import SteamUploader, SteamVDFBuilder
from libs.notifications import NotificationService

# ===============================================================
# Conection & Queue Setup
# ===============================================================

try:
    # Connect to Valkey
    use_ssl = os.environ.get("VALKEY_USE_SSL", "false").lower() == "true"
    kv_store: redis.Redis = redis.Redis(
        host=os.environ.get("VALKEY_HOST", "valkey"),
        port=int(os.environ.get("VALKEY_PORT", 6379)),
        password=os.environ.get("VALKEY_PASSWORD", "change_in_production"),
        ssl=use_ssl,
        decode_responses=True, 
    )
except Exception as e:
    print(f"Error connecting to valkey: {str(e)}", file=sys.stderr)
    exit(1)

# Define job queues
QUEUED_JOBS: str = "queued_jobs"
RUNNING_JOBS: str = "running_jobs"
COMPLETE_JOBS: str = "complete_jobs"
FAILED_JOBS: str = "failed_jobs"

# Initialize notification service
notification_service: NotificationService = NotificationService()

# ===============================================================
# Utility Functions
# ===============================================================

def abbort_job(job: Dict[str, Any], stream: LogStream, error_message: str) -> None:
    """Abort the job, log the error, and move it to the failed jobs list.
    
    Args:
        job: The job dictionary to abort
        stream: LogStream instance for logging
        error_message: The error message to log and store
    """
    stream.log(f"Aborting job {job['id']}: {error_message}", level="error")
    print(f"Error aborting job {job['id']}: {error_message}", file=sys.stderr)
    # Note: It's important to remove from running jobs before altering the job dict to allow proper matching.
    kv_store.lrem(RUNNING_JOBS, 0, json.dumps(job))
    job["status"] = "failed"
    job["error"] = error_message
    kv_store.rpush(FAILED_JOBS, json.dumps(job))
    
    # Send notification about job failure
    notification_service.send_job_notification(job, 'failed', error_message)


def get_cdn_file_path(job: Dict[str, Any], stream: LogStream) -> str:
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


def get_steam_build_path(job: Dict[str, Any], stream: LogStream) -> str:
    """Prepare build directory for Steam upload (unzip if needed).
    
    Args:
        job: The job dictionary containing ingest path information
        stream: LogStream instance for logging progress
    
    Returns:
        Path to the directory containing the build for Steam upload
    
    Raises:
        Exception: If the path does not exist or unzip fails
    """
    absolute_build_path: Optional[str] = job.get("absoluteIngestPath")
    stream.log(f"Preparing build for Steam upload from {job['ingestPath']}...")

    if not absolute_build_path or not os.path.exists(absolute_build_path):
        stream.log(f"Path does not exist: {absolute_build_path}", level="error")
        raise Exception(f"Build path does not exist: {absolute_build_path}")
    
    if os.path.isdir(absolute_build_path):
        # Already a directory, return it as-is
        stream.log(f"Found directory: {absolute_build_path}")
        return absolute_build_path
    elif os.path.isfile(absolute_build_path):
        # Check if it's a zip file
        if absolute_build_path.lower().endswith('.zip'):
            stream.log(f"Found zip file: {absolute_build_path}, extracting to temp directory...")
            return unzip_build(absolute_build_path, job['id'], stream)
        else:
            # Single file, use parent directory as build path
            stream.log(f"Found single file (not zip): {absolute_build_path}, using parent directory")
            return os.path.dirname(absolute_build_path)
    else:
        raise Exception(f"Invalid path: {absolute_build_path}")


def handle_steam_upload(job: Dict[str, Any], file_path: str, stream: LogStream) -> Dict[str, Any]:
    """Handle Steam build uploads for all configured Steam channels.
    
    Args:
        job: The job dictionary containing steam_channels array
        file_path: Path to the build file/directory
        stream: LogStream instance for logging progress
    
    Returns:
        dict with upload results for each channel
    
    Raises:
        Exception: If any Steam upload fails
    """
    steam_channels: list = job.get("steam_channels", [])
    
    if not steam_channels:
        stream.log("No Steam channels configured for this job", level="warning")
        return {"success": False, "message": "No Steam channels configured"}
    
    results = []
    
    try:
        for channel in steam_channels:
            stream.log(f"Preparing Steam upload to channel '{channel.get('label')}' for app {channel.get('appId')}...")
            
            app_id: str = channel.get("appId")
            depots: list = channel.get("depots", [])
            branch: Optional[str] = channel.get("branch")
            
            if not app_id or not depots:
                raise ValueError(f"Steam channel '{channel.get('label')}' must include 'appId' and 'depots'")
            
            # Generate VDF file
            vdf_builder = SteamVDFBuilder(app_id, depots, stream)
            vdf_path: str = vdf_builder.build_vdf(file_path, job.get("description"), branch)
            
            # Upload to Steam
            uploader = SteamUploader(stream)
            result = uploader.upload_build(app_id, vdf_path, branch)
            results.append({
                "channel": channel.get("label"),
                "app_id": app_id,
                "result": result
            })
        
        job["steam_results"] = results
        return {"success": True, "channels_uploaded": len(results)}
    
    except Exception as e:
        stream.log(f"Steam upload failed: {str(e)}", level="error")
        raise

# ===============================================================
# Main Job Handling Function
# ===============================================================

def handle_job(job: Dict[str, Any], stream: LogStream) -> None:
    """Process a single job.
    
    Args:
        job: The job dictionary to process
        stream: LogStream instance for logging job progress
    
    Raises:
        Exception: If job processing fails (caught and handled by caller)
    """
    # Update the job status to running and keep a clean copy of the 
    job["status"] = "running"
    job["startedAt"] = datetime.utcnow().isoformat() + "Z"
    current_job: str = json.dumps(job)

    # Add the job to the running jobs list
    kv_store.rpush(RUNNING_JOBS, current_job)
    
    # Initialize results tracking
    job["upload_results"] = {
        "cdn": [],
        "steam": []
    }
    
    # Handle CDN uploads for all configured CDN channels
    cdn_channels: list = job.get("cdn_channels", [])
    if cdn_channels and job.get("ingestPath") and job.get("absoluteIngestPath"):
        try:
            cdn_file_path = get_cdn_file_path(job, stream)
            for channel in cdn_channels:
                stream.log(f"Uploading to CDN channel '{channel.get('label')}'...")
                uploader = CDNUploader(channel)
                result = uploader.upload_file(cdn_file_path, stream)
                job["upload_results"]["cdn"].append({
                    "channel": channel.get("label"),
                    "url": result.get("url"),
                    "success": True
                })
        except Exception as e:
            stream.log(f"CDN upload failed: {str(e)}", level="error")
            raise
    
    # Handle Steam uploads for all configured Steam channels
    steam_channels: list = job.get("steam_channels", [])
    if steam_channels and job.get("ingestPath") and job.get("absoluteIngestPath"):
        try:
            steam_build_path = get_steam_build_path(job, stream)
            handle_steam_upload(job, steam_build_path, stream)
            # Add Steam results to tracking
            for result in job.get("steam_results", []):
                job["upload_results"]["steam"].append({
                    "channel": result.get("channel"),
                    "app_id": result.get("app_id"),
                    "success": True
                })
        except Exception as e:
            stream.log(f"Steam upload failed: {str(e)}", level="error")
            raise
    
    # Remove job from running and add to complete marking it complete.
    kv_store.lrem(RUNNING_JOBS, 0, current_job)
    job["status"] = "complete"
    job["completedAt"] = datetime.utcnow().isoformat() + "Z"
    kv_store.rpush(COMPLETE_JOBS, json.dumps(job))
    print("Processed job:", job.get("id"))
    
    # Send notification about successful completion
    notification_service.send_job_notification(job, 'completed')

# ===============================================================
# Main worker loop
# ===============================================================

print("Worker started, waiting for jobs...")
while True:
    # block until an item is available
    _, raw = kv_store.blpop(QUEUED_JOBS)

    try:
        job: Dict[str, Any] = json.loads(raw)
        print("Processing job:", job.get("id"))
    except json.JSONDecodeError:
        print("Invalid JSON encoding for job data:", raw, file=sys.stderr)
        continue

    # Create a log stream for this job
    stream: LogStream = LogStream(f'job_stream:{job["id"]}')
    stream.log(f"Analyzing job {job['id']}...")
    try:
        handle_job(job, stream)
    except Exception as e:
        # Log any errors and abort the job.
        stream.log(f"Job processing failed: {str(e)}", level="error")
        abbort_job(job, stream, f"Job processing failed: {str(e)}")
        continue