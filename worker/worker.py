import json
import os
import sys
import time
import redis
from typing import Optional, Dict, Any
from libs.streams import LogStream
from libs.cdn import CDNUploader
from libs.zip import zip_build

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

    # Simulate some processing time to test log streaming.
    for i in range(100):
        stream.log(f"{i}")
        time.sleep(1)  # Simulate work being done
    
    # Remove job from running and add to complete marking it complete.
    kv_store.lrem(RUNNING_JOBS, 0, current_job)
    job["status"] = "complete"
    kv_store.rpush(COMPLETE_JOBS, json.dumps(job))
    print("Processed job:", job.get("id"))

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