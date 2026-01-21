import json
import os
import sys
import redis
from typing import Optional, Dict, Any
from datetime import datetime
from lib.streams import LogStream
from lib.cdn import CDNUploader, prepare_cdn_file
from lib.zip import zip_build
from lib.steam import SteamUploader, SteamVDFBuilder, prepare_steam_build, handle_steam_upload
from lib.notifications import NotificationService
from lib.unity_cloud import download_unity_cloud_artifact

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

def abort_job(job: Dict[str, Any], stream: LogStream, error_message: str) -> None:
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
    # Update the job status to running and keep a clean copy of the current job state
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
    
    # ================================================================
    # Handle Unity Cloud Build artifact downloads
    # ================================================================
    if job.get("source") == "unity-cloud":
        try:
            stream.log("Processing Unity Cloud Build job...")
            
            # Download the artifact from Unity Cloud Build
            artifact_path = download_unity_cloud_artifact(job, stream)
            stream.log(f"Downloaded artifact: {artifact_path}")
            
            # Set ingest paths for the downstream steam/cdn functions
            # They will handle extraction if needed (prepare_steam_build handles zips,
            # prepare_cdn_file can work with files or directories)
            job["ingestPath"] = artifact_path
            job["absoluteIngestPath"] = artifact_path
            
        except Exception as e:
            stream.log(f"Failed to process Unity Cloud Build artifact: {str(e)}", level="error")
            raise
    
    # Handle CDN uploads for all configured CDN channels
    cdn_channels: list = job.get("cdn_channels", [])
    if cdn_channels and job.get("ingestPath") and job.get("absoluteIngestPath"):
        try:
            # Prepare the file for CDN upload
            # e.g., zip if it's a directory
            cdn_file_path = prepare_cdn_file(job, stream)
            for channel in cdn_channels:
                stream.log(f"Uploading to CDN channel '{channel.get('label')}'...")

                # Initialize CDN uploader and upload the file
                uploader = CDNUploader(channel)
                result = uploader.upload_file(cdn_file_path, stream)

                # Add CDN upload result to tracking
                job["upload_results"]["cdn"].append({
                    "channel": channel.get("label"),
                    "url": result.get("url"),
                    "success": True
                })
        # Handle exceptions during CDN upload        
        except Exception as e:
            stream.log(f"CDN upload failed: {str(e)}", level="error")
            raise
    
    # Handle Steam uploads for all configured Steam channels
    steam_channels: list = job.get("steam_channels", [])
    if steam_channels and job.get("ingestPath") and job.get("absoluteIngestPath"):
        try:
            # Prepare the build for Steam upload
            # e.g., create Steam VDF files, zip if necessary
            steam_build_path = prepare_steam_build(job, stream)
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

    # Parse the job data
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
        # try to handle the job 
        handle_job(job, stream)
    except Exception as e:
        # Log any errors and abort the job.
        stream.log(f"Job processing failed: {str(e)}", level="error")
        abort_job(job, stream, f"Job processing failed: {str(e)}")
        continue