import { MESSAGE_MAX_LENGTH } from "./types";

/** A run of this extension is live for the organization, or a job is already waiting. */
export class SyncInProgressError extends Error {
  constructor(message = "A sync is already running for this extension") {
    super(message);
    this.name = "SyncInProgressError";
  }
}

/** The run's row is no longer its own `started` row; the run stops and writes nothing more. */
export class RunSupersededError extends Error {
  constructor(public readonly runId: number) {
    super(`Run ${runId} was closed by another run; stopping`);
    this.name = "RunSupersededError";
  }
}

export class UnknownSyncProviderError extends Error {
  constructor(public readonly key: string) {
    super(`No sync provider is registered for "${key}"`);
    this.name = "UnknownSyncProviderError";
  }
}

/** A provider's readiness refused the run; the route answers with `status` and the reason. */
export class SyncNotReadyError extends Error {
  constructor(
    public readonly status: 400 | 404,
    reason: string,
  ) {
    super(reason);
    this.name = "SyncNotReadyError";
  }
}

/** Bad input to an engine route (400). */
export class SyncValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncValidationError";
  }
}

/**
 * Message for any thrown value; never empty. Moved unchanged from
 * jiraAssets.service.ts (`errorMessage`), which re-exports it.
 */
export function errorMessage(err: unknown): string {
  try {
    const message = (err as { message?: unknown } | null | undefined)?.message;
    if (typeof message === "string" && message) return message;
    if (err !== undefined && err !== null) {
      const text = String(err);
      if (text) return text;
    }
  } catch {
    // A throwing getter or toString; fall through to the generic message.
  }
  return "Unknown error";
}

/** The error's string `code` (Node and Postgres errors carry one), or null. */
export function errorCode(err: unknown): string | null {
  let code: unknown;
  try {
    code = (err as { code?: unknown } | null | undefined)?.code;
  } catch {
    return null;
  }
  return typeof code === "string" && code.length > 0 && code.length <= 64 ? code : null;
}

export function truncateMessage(message: string): string {
  return message.length > MESSAGE_MAX_LENGTH ? message.slice(0, MESSAGE_MAX_LENGTH) : message;
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { name?: string; parent?: { code?: string }; original?: { code?: string } };
  return (
    e?.name === "SequelizeUniqueConstraintError" ||
    e?.parent?.code === "23505" ||
    e?.original?.code === "23505"
  );
}
