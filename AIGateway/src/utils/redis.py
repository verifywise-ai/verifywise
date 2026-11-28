"""
Shared Redis connection singleton — used across all gateway services
for rate limiting, session management, anomaly detection, and circuit breakers.
"""

from typing import Optional

import redis.asyncio as aioredis

from config import settings

REDIS_CONNECT_TIMEOUT_SECONDS = 2
REDIS_SOCKET_TIMEOUT_SECONDS = 5

_redis: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        # Short timeouts so an unreachable Redis fails fast: every caller fails
        # open, which only helps if the failure arrives before the client's own
        # timeout (no gateway code uses blocking Redis commands).
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=REDIS_CONNECT_TIMEOUT_SECONDS,
            socket_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
        )
    return _redis
