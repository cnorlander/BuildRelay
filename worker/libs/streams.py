
from datetime import datetime
import os
import redis
from typing import Optional


class LogStream():
    """A logging stream that writes log entries to a Redis stream."""

    def __init__(self, stream_name: str) -> None:
        self.stream_name: str = stream_name

        # Connect to Valkey
        self.redis_client: redis.Redis = redis.Redis(
            host=os.environ.get("VALKEY_HOST", "valkey"),
            port=int(os.environ.get("VALKEY_PORT", 6379)),
            decode_responses=True, 
        )

    
    def log(self, line: str, level: str = "info") -> None:
        """Log a line to the Redis stream."""
        self.redis_client.xadd(
            self.stream_name,
            {
                "line": line,
                "timestamp": datetime.now().isoformat(),
                "level": level[0].lower()
            },
        )
