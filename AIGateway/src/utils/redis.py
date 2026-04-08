"""
Shared Redis connection singleton — used across all gateway services
for rate limiting, session management, anomaly detection, and circuit breakers.
"""

from typing import Optional

import redis.asyncio as aioredis

from config import settings

_redis: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis
