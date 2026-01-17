import json
import os
import sys
import time
import redis
from typing import Optional, Dict, Any
from datetime import datetime
from libs.streams import LogStream
from libs.cdn import CDNUploader
from libs.zip import zip_build
from libs.steam import SteamUploader, SteamVDFBuilder
from libs.notifications import NotificationService

# ===============================================================
# Conection & Queue Setup
# ===============================================================

try:
    # Connect to Valkey
    kv_store: redis.Redis = redis.Redis(
        host=os.environ.get("VALKEY_HOST", "valkey"),
        port=int(os.environ.get("VALKEY_PORT", 6379)),
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


def get_zipped_file_path(job: Dict[str, Any], stream: LogStream) -> str:
    """Handle file zipping for job ingestion.
    
    Args:
        job: The job dictionary containing ingest path information
        file_path: Path to the file (unused, file path is determined from job)
        stream: LogStream instance for logging progress
    
    Returns:
        Path to the processed file or zip archive
    
    Raises:
        Exception: If the path does not exist or zip creation fails
    """
    file_path: Optional[str] = None
    # Get the absolute (container internal) path
    absolute_build_path: Optional[str] = job.get("absoluteIngestPath")
    stream.log(f"Ingesting build from filesystem path {job['ingestPath']}...")

    # Check if the path is a file or directory
    if absolute_build_path and os.path.exists(absolute_build_path):
        if os.path.isfile(absolute_build_path):
            # It's a file, we can just upload it directly
            stream.log(f"Found file: {absolute_build_path}")
            # Set the file path for later upload
            file_path = absolute_build_path
        elif os.path.isdir(absolute_build_path):
            # It's a directory, we need to zip it first
            stream.log(f"Found directory: {absolute_build_path}, creating zip archive...")
            # Zip the file and set the file path for later upload
            try:
                file_path = zip_build(job["id"], absolute_build_path, stream)
            except Exception as e:
                stream.log(f"Error creating zip: {str(e)}", level="error")
                raise
    else:
        stream.log(f"Path does not exist: {absolute_build_path}", level="error")
        raise 
    return file_path

def handle_steam_upload(job: Dict[str, Any], file_path: str, stream: LogStream) -> Dict[str, Any]:
    """Handle Steam build upload.
    
    Args:
        job: The job dictionary containing steam_build configuration
        file_path: Path to the build file/directory
        stream: LogStream instance for logging progress
    
    Returns:
        dict with upload results
    
    Raises:
        Exception: If Steam upload fails
    """
    steam_build: Dict[str, Any] = job.get("steam_build", {})
    
    if not steam_build:
        stream.log("No Steam build configuration provided", level="warning")
        return {"success": False, "message": "No Steam build config"}
    
    try:
        app_id: str = steam_build.get("app_id")
        depots: list = steam_build.get("depots", [])
        branch: Optional[str] = steam_build.get("branch")
        description: Optional[str] = steam_build.get("description")
        
        if not app_id or not depots:
            raise ValueError("steam_build must include 'app_id' and 'depots'")
        
        stream.log(f"Preparing Steam upload for app {app_id}...")
        
        # Generate VDF file
        vdf_builder = SteamVDFBuilder(app_id, depots, stream)
        vdf_path: str = vdf_builder.build_vdf(file_path, description, branch)
        
        # Upload to Steam
        uploader = SteamUploader(stream)
        result = uploader.upload_build(app_id, vdf_path, branch)
        
        job["steam_result"] = result
        return result
    
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
        
    # Handle CDN upload if specified and we have a file to upload
    if job.get("cdn_destination") and isinstance(job.get("cdn_destination"), dict):
        # Make sure the build in question exists in the local filesystem
        # If so we should probably zip it up if it's a directory for CDN upload
        file_path: Optional[str] = None
        if job.get("ingestPath") and job.get("absoluteIngestPath"):
            file_path = get_zipped_file_path(job, stream)

        # Upload the file to the CDN
        try:
            stream.log(f"Uploading to CDN...")
            uploader = CDNUploader(job['cdn_destination'])
            result = uploader.upload_file(file_path, stream)
            job["cdnUrl"] = result['url']
        except Exception as e:
            stream.log(f"CDN upload failed: {str(e)}", level="error")
            raise
    
    # Handle Steam upload if specified and we have a file to upload
    if job.get("steam_build") and isinstance(job.get("steam_build"), dict) and job.get("absoluteIngestPath"):
        try:
            handle_steam_upload(job, job.get("absoluteIngestPath"), stream)
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