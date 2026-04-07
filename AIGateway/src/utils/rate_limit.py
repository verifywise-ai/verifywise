"""
Shared rate limiter — Redis sorted-set sliding window.
Used by both LLM proxy and MCP Gateway.
"""

import logging
import time

from utils.redis import get_redis

logger = logging.getLogger("uvicorn")

RATE_LIMIT_WINDOW = 60  # seconds


async def check_rate_limit(key: str, rpm: int) -> bool:
    """Check RPM rate limit using Redis sorted set. Returns True if allowed. Fail-open on Redis error."""
    if rpm <= 0:
        return True
    try:
        r = await get_redis()
        redis_key = f"gw:rate:{key}"
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW

        pipe = r.pipeline()
        pipe.zremrangebyscore(redis_key, 0, window_start)
        pipe.zcard(redis_key)
        pipe.zadd(redis_key, {str(now): now})
        pipe.expire(redis_key, RATE_LIMIT_WINDOW + 10)
        results = await pipe.execute()

        count = results[1]
        return count < rpm
    except Exception as e:
        logger.warning(f"Rate limit check failed (fail-open): {e}")
        return True
