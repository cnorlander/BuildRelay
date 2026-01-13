
from datetime import datetime
import os
import redis


class LogStream():

    def __init__(self, stream_name):
        self.stream_name = stream_name

        # Connect to Valkey
        self.redis_client = redis.Redis(
            host=os.environ.get("VALKEY_HOST", "valkey"),
            port=int(os.environ.get("VALKEY_PORT", 6379)),
            decode_responses=True, 
        )

    def log(self, line, level="info"):
        self.redis_client.xadd(
            self.stream_name,
            {
                "line": line,
                "timestamp": datetime.now().isoformat(),
                "level": level[0].lower()
            },
        )
    
