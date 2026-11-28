"""
Shared Redis connection singleton — used across all gateway services
for rate limiting, session management, anomaly detection, and circuit breakers.

Every caller fails open on a Redis error, so an outage should cost as little
time as possible: connections use short timeouts, and after a failed connect
Redis is treated as down for REDIS_RETRY_AFTER_SECONDS. In that window
get_redis() raises RedisUnavailableError at once instead of each caller waiting
for its own connect timeout; the first call after the window tries again.
"""

import logging
import time
from typing import Optional

import redis.asyncio as aioredis
from redis.asyncio.connection import Connection, ConnectionPool, parse_url
from redis.exceptions import ConnectionError as RedisConnectionError

from config import settings

logger = logging.getLogger("uvicorn")

REDIS_CONNECT_TIMEOUT_SECONDS = 2
REDIS_SOCKET_TIMEOUT_SECONDS = 5
REDIS_RETRY_AFTER_SECONDS = 10

_redis: Optional[aioredis.Redis] = None
_down_until = 0.0


class RedisUnavailableError(RedisConnectionError):
    """Redis failed to connect moments ago; not tried again until the window ends."""


def _mark_down() -> None:
    global _down_until
    if _down_until == 0.0:
        logger.warning(
            "Redis unreachable; Redis-backed features fail open, next try in %ss",
            REDIS_RETRY_AFTER_SECONDS,
        )
    _down_until = time.monotonic() + REDIS_RETRY_AFTER_SECONDS


def _mark_up() -> None:
    global _down_until
    if _down_until:
        logger.info("Redis reachable again")
    _down_until = 0.0


def _tracked(base: type) -> type:
    """The URL's connection class (plain, TLS or Unix socket), recording
    whether connecting worked."""

    class TrackedConnection(base):
        async def connect(self):
            # connect() returns at once for a pooled connection that still
            # looks open, which proves nothing: only a new connection counts.
            was_connected = self.is_connected
            try:
                await super().connect()
            except Exception:
                _mark_down()
                raise
            if not was_connected:
                _mark_up()

    TrackedConnection.__name__ = f"Tracked{base.__name__}"
    return TrackedConnection


def _build_client(url: str) -> aioredis.Redis:
    # ConnectionPool.from_url would let the URL override connection_class, so
    # the pool is built from the parsed URL with the tracked class instead.
    # As with from_url, options in the URL win over the defaults here.
    options = {
        "decode_responses": True,
        "socket_connect_timeout": REDIS_CONNECT_TIMEOUT_SECONDS,
        "socket_timeout": REDIS_SOCKET_TIMEOUT_SECONDS,
        **parse_url(url),
    }
    options["connection_class"] = _tracked(options.get("connection_class", Connection))
    return aioredis.Redis(connection_pool=ConnectionPool(**options))


def log_fail_open(log: logging.Logger, what: str, exc: Exception) -> None:
    """Log a Redis-backed feature failing open. Skipped while Redis is marked
    down: that was logged once when it happened, and each call would repeat it."""
    if not isinstance(exc, RedisUnavailableError):
        log.warning(f"{what} failed (fail-open): {exc}")


async def get_redis() -> aioredis.Redis:
    """The shared client. Raises RedisUnavailableError while Redis is marked down."""
    global _redis
    if _down_until and time.monotonic() < _down_until:
        raise RedisUnavailableError("Redis unreachable (retrying shortly)")
    if _redis is None:
        _redis = _build_client(settings.redis_url)
    return _redis
