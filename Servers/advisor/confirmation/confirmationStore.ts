/**
 * Human Confirmation Flow — Redis Storage
 *
 * Stores pending write operation confirmations in Redis with a 10-minute TTL.
 * Confirmations auto-expire, requiring no cron job cleanup.
 */

import { v4 as uuidv4 } from "uuid";
import redisClient from "../../database/redis";
import { getFromCache, setInCache, deleteFromCache } from "../../utils/cache.utils";
import type { ConfirmationRequest, ConfirmationStatus } from "./types";

const CONFIRMATION_TTL = 600; // 10 minutes
const KEY_PREFIX = "confirm";

function buildKey(organizationId: number, id: string): string {
  return `${KEY_PREFIX}:org_${organizationId}:${id}`;
}

export function generateConfirmationId(): string {
  return uuidv4();
}

export async function storeConfirmation(request: ConfirmationRequest): Promise<void> {
  const key = buildKey(request.organizationId, request.id);
  await setInCache(key, request, CONFIRMATION_TTL);
}

export async function getConfirmation(
  organizationId: number,
  id: string,
): Promise<ConfirmationRequest | null> {
  const key = buildKey(organizationId, id);
  return getFromCache<ConfirmationRequest>(key);
}

export async function resolveConfirmation(
  organizationId: number,
  id: string,
  status: "approved" | "rejected",
  userId: number,
  result?: unknown,
  error?: string,
): Promise<ConfirmationRequest | null> {
  const key = buildKey(organizationId, id);

  // Atomic check-and-update using Redis WATCH for race-condition safety.
  // If two users approve simultaneously, only the first succeeds.
  const raw = await redisClient.get(key);
  if (!raw) return null;

  let request: ConfirmationRequest;
  try {
    request = JSON.parse(raw);
  } catch {
    return null;
  }
  if (request.status !== "pending") return null;

  const resolved: ConfirmationRequest = {
    ...request,
    status: status as ConfirmationStatus,
    resolvedAt: new Date().toISOString(),
    resolvedBy: userId,
    ...(result !== undefined && { result }),
    ...(error !== undefined && { error }),
  };

  // Atomic set-if-unchanged: use Redis WATCH + MULTI/EXEC to prevent races
  await redisClient.watch(key);
  const currentRaw = await redisClient.get(key);
  if (!currentRaw) {
    await redisClient.unwatch();
    return null;
  }
  const current = JSON.parse(currentRaw);
  if (current.status !== "pending") {
    await redisClient.unwatch();
    return null;
  }

  const ttl = await redisClient.ttl(key);
  const pipeline = redisClient.multi();
  pipeline.setex(key, ttl > 0 ? ttl : 60, JSON.stringify(resolved));
  const execResult = await pipeline.exec();

  // exec returns null if WATCH detected a change (race condition)
  if (!execResult) {
    return null;
  }

  return resolved;
}

export async function listPendingConfirmations(
  organizationId: number,
): Promise<ConfirmationRequest[]> {
  const pattern = `${KEY_PREFIX}:org_${organizationId}:*`;
  const keys = await redisClient.keys(pattern);

  if (keys.length === 0) return [];

  const results: ConfirmationRequest[] = [];
  for (const key of keys) {
    const data = await getFromCache<ConfirmationRequest>(key);
    if (data && data.status === "pending") {
      results.push(data);
    }
  }

  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function deleteConfirmation(organizationId: number, id: string): Promise<void> {
  const key = buildKey(organizationId, id);
  await deleteFromCache(key);
}
