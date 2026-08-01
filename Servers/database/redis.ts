import IORedis from "ioredis";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";

// `maxRetriesPerRequest: null` means a command issued while disconnected
// waits in ioredis's offline queue for a connection instead of erroring out
// after N retries — the usual choice for a long-lived app client. Without a
// `commandTimeout`, though, that wait has no bound: every call site of this
// singleton (confirmationStore, cache.utils, notification services) wraps its
// Redis call in try/catch expecting a *rejection* on failure, but a hang
// never rejects, so those catches never fire and the caller blocks forever
// instead of degrading gracefully. `commandTimeout` arms a per-command timer
// at send time regardless of whether the command is written immediately or
// parked in the offline queue (see ioredis's Redis#sendCommand), so a command
// issued while Redis is unreachable now rejects with "Command timed out"
// instead of hanging — turning those existing catches from decorative into
// functional. This client is never used for a genuinely long-blocking
// command (BLPOP/BRPOPLPUSH/etc — see BLOCKING_COMMANDS in ioredis), and
// BullMQ's queues/workers open their own connections from REDIS_URL rather
// than reusing this singleton, so they are unaffected by this option.
const redisClient = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  commandTimeout: 3000,
});

export default redisClient;
