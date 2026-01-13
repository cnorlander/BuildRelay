import json
import os
import redis

# Connect to Valkey
r = redis.Redis(
    host=os.environ.get("VALKEY_HOST", "valkey"),
    port=int(os.environ.get("VALKEY_PORT", 6379)),
    decode_responses=True, 
)

QUEUED_JOBS = "queued_jobs"
RUNNING_JOBS = "running_jobs"

print("Worker started, waiting for jobs...")

while True:
    # block until an item is available
    _, raw = r.blpop(QUEUED_JOBS)

    job = json.loads(raw)
    

    # Update the job
    job["status"] = "running"
    r.rpush(RUNNING_JOBS, json.dumps(job))

    # Output result
    print("Processed job:", job)