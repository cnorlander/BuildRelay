from datetime import datetime
import json
import os
import random
import time
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
    STREAM_NAME = f'job_stream:{job["id"]}'
    STREAM_NAME = 'test_stream'
    DURATION_SECONDS = 60
    INTERVAL_SECONDS = 0.1
    start_time = time.monotonic()
    line = 0

    while True:
        elapsed = time.monotonic() - start_time
        if elapsed >= DURATION_SECONDS:
            break

        r.xadd(
            STREAM_NAME,
            {
                "line": "this is a test " + str(line),
                "timestamp": datetime.now().isoformat(),
                "level": "s"
            },
        )
        line += 1

        time.sleep(INTERVAL_SECONDS)
    

    # Update the job
    job["status"] = "running"
    r.rpush(RUNNING_JOBS, json.dumps(job))

    # Output result
    print("Processed job:", job)