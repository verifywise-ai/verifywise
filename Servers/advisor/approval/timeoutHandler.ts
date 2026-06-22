/**
 * Phase 2 — Timeout Handler
 *
 * Periodically checks for pending approvals past their TTL
 * and auto-rejects them.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { logStructured } from "../../utils/logger/fileLogger";
import type { StateHistoryEntry } from "./types";

const fileName = "timeoutHandler.ts";
const DEFAULT_TTL_MINUTES = 10;
const CHECK_INTERVAL_MS = 60_000; // Check every minute

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Expire pending approvals that have been waiting longer than the TTL.
 */
async function expirePendingApprovals(): Promise<number> {
  const functionName = "expirePendingApprovals";

  try {
    // Find all pending approvals older than TTL
    const expired = (await sequelize.query(
      `SELECT id, organization_id, state_history, tool_name
       FROM ai_action_approvals
       WHERE state = 'pending_approval'
         AND created_at < NOW() - INTERVAL '${DEFAULT_TTL_MINUTES} minutes'
       LIMIT 100`,
      { type: QueryTypes.SELECT },
    )) as any[];

    if (expired.length === 0) return 0;

    for (const record of expired) {
      const stateHistory: StateHistoryEntry[] =
        typeof record.state_history === "string"
          ? JSON.parse(record.state_history)
          : record.state_history || [];

      stateHistory.push({
        state: "rejected",
        timestamp: new Date().toISOString(),
        actor: "system",
        reason: `timeout: exceeded ${DEFAULT_TTL_MINUTES}m TTL`,
      });

      await sequelize.query(
        `UPDATE ai_action_approvals
         SET state = 'rejected',
             state_history = :stateHistory,
             error_message = :errorMessage,
             updated_at = NOW()
         WHERE id = :id AND organization_id = :organizationId AND state = 'pending_approval'`,
        {
          replacements: {
            id: record.id,
            organizationId: record.organization_id,
            stateHistory: JSON.stringify(stateHistory),
            errorMessage: `Auto-rejected: exceeded ${DEFAULT_TTL_MINUTES}m approval timeout`,
          },
          type: QueryTypes.UPDATE,
        },
      );
    }

    logStructured(
      "successful",
      `expired ${expired.length} pending approval(s)`,
      functionName,
      fileName,
    );
    return expired.length;
  } catch (error) {
    logStructured("error", `timeout handler error: ${error}`, "expirePendingApprovals", fileName);
    return 0;
  }
}

/**
 * Start the periodic timeout check.
 */
export function startTimeoutHandler(): void {
  if (intervalId) return; // Already running

  logStructured(
    "successful",
    `timeout handler started (check every ${CHECK_INTERVAL_MS / 1000}s, TTL ${DEFAULT_TTL_MINUTES}m)`,
    "startTimeoutHandler",
    fileName,
  );

  intervalId = setInterval(expirePendingApprovals, CHECK_INTERVAL_MS);

  // Run once immediately on startup
  expirePendingApprovals().catch(() => {});
}

/**
 * Stop the periodic timeout check.
 */
export function stopTimeoutHandler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
