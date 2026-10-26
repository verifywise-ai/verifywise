import os
import redis.asyncio as aioredis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

redis = None

async def get_redis():
    global redis
    if not redis:
        redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    return redis

async def close_redis():
    global redis
    if redis:
        await redis.close()
        redis = None

async def get_next_job_id():
    r = await get_redis()
    # Use Redis INCR to generate unique job IDs
    job_id = await r.incr("job_id_counter")
    return job_id
