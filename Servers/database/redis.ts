import IORedis from "ioredis";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";

const redisClient = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

export default redisClient;
