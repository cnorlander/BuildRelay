
from datetime import datetime
import os
import redis
from typing import Optional


class LogStream():
    """A logging stream that writes log entries to a Redis stream."""

    def __init__(self, stream_name: str) -> None:
        self.stream_name: str = stream_name

        # Connect to Valkey
        use_ssl = os.environ.get("VALKEY_USE_SSL", "false").lower() == "true"
        self.redis_client: redis.Redis = redis.Redis(
            host=os.environ.get("VALKEY_HOST", "valkey"),
            port=int(os.environ.get("VALKEY_PORT", 6379)),
            password=os.environ.get("VALKEY_PASSWORD", "change_in_production"),
            ssl=use_ssl,
            decode_responses=True, 
        )

    # Log a line to the stream    
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
