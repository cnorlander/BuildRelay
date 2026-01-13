from datetime import datetime
import json
import os
import random
import time
import redis
import shutil
from pathlib import Path
from streams import LogStream
from cdn import CDNUploader

# Connect to Valkey
r = redis.Redis(
    host=os.environ.get("VALKEY_HOST", "valkey"),
    port=int(os.environ.get("VALKEY_PORT", 6379)),
    decode_responses=True, 
)

QUEUED_JOBS = "queued_jobs"
RUNNING_JOBS = "running_jobs"
COMPLETE_JOBS = "complete_jobs"

print("Worker started, waiting for jobs...")

while True:
    # block until an item is available
    _, raw = r.blpop(QUEUED_JOBS)

    job = json.loads(raw)
    print("Processing job:", job)
    # Update the job
    job["status"] = "running"
    current_job = json.dumps(job)
    r.rpush(RUNNING_JOBS, current_job)
    stream = LogStream(f'job_stream:{job["id"]}')
    stream.log(f"Analyzing job {job['id']}...")
    file_path = None
    if job.get("ingestPath") and job.get("absoluteIngestPath"):
        ingest_path = job.get("absoluteIngestPath")
        stream.log(f"Ingesting from {job['ingestPath']}...")
        
        if ingest_path and os.path.exists(ingest_path):
            if os.path.isfile(ingest_path):
                stream.log(f"Found file: {ingest_path}")
                file_path = ingest_path
            elif os.path.isdir(ingest_path):
                stream.log(f"Found directory: {ingest_path}, creating zip archive...")
                zip_path = f"/tmp/{job['id']}.zip"
                try:
                    shutil.make_archive(zip_path.replace('.zip', ''), 'zip', ingest_path)
                    stream.log(f"Successfully created zip file: {zip_path}")
                    file_path = zip_path
                except Exception as e:
                    stream.log(f"Error creating zip: {str(e)}", level="error")
        else:
            stream.log(f"Path does not exist: {ingest_path}", level="error")

    if job.get("cdn_destination") and isinstance(job.get("cdn_destination"), dict) and file_path:
        try:
            stream.log(f"Uploading to CDN...")
            uploader = CDNUploader(job['cdn_destination'])
            result = uploader.upload_file(file_path, stream)
            job["cdnUrl"] = result['url']
        except Exception as e:
            stream.log(f"CDN upload failed: {str(e)}", level="error")

    for i in range(100):
        stream.log(f"{i}")
        time.sleep(1.05)  # Simulate work being done
    print("Processed job:", job)