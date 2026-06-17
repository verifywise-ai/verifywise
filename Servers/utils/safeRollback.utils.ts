/**
 * Transaction rollback with dual-context error logging.
 *
 * Most controllers wrap their work in a Sequelize transaction and roll back
 * in the catch block. If the rollback itself fails the original exception
 * is often swallowed — a `console.warn` masks the rollback error and the
 * caller never learns *why* the rollback was triggered. This helper:
 *
 *  - performs the rollback
 *  - on rollback failure, logs **both** the rollback error and the
 *    originating error via {@link logFailure}, including
 *    `organizationId`, the request method, and the request path
 *  - never throws
 *
 * Call it from the catch block alongside (not instead of) the existing
 * `logFailure` for the originating error.
 *
 * @module utils/safeRollback
 */

import type { Request } from "express";
import type { Transaction } from "sequelize";
import { logFailure } from "./logger/logHelper";

export interface SafeRollbackContext {
  /** The originating Express request — used for `organizationId`, method, path. */
  req: Request;
  /** Calling function name, surfaced into the rollback-failure log line. */
  functionName: string;
  /** Calling file name, surfaced into the rollback-failure log line. */
  fileName: string;
  /** The error that triggered the rollback. */
  originatingError: unknown;
}

function requestPath(req: Request): string {
  return `${req.method ?? "?"} ${req.originalUrl ?? req.url ?? "?"}`;
}

function originatingMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Roll back a Sequelize transaction and log any rollback failure with full
 * dual context. Safe to call with `null` / `undefined` — does nothing.
 *
 * @example
 * } catch (error) {
 *   await safeRollback(transaction, {
 *     req,
 *     functionName: "createDataset",
 *     fileName: "dataset.ctrl.ts",
 *     originatingError: error,
 *   });
 *   await logFailure({ eventType: "Create", description: ..., ... });
 *   return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
 * }
 */
export async function safeRollback(
  transaction: Transaction | null | undefined,
  ctx: SafeRollbackContext,
): Promise<void> {
  if (!transaction) return;

  try {
    await transaction.rollback();
  } catch (rollbackError) {
    try {
      await logFailure({
        eventType: "Error",
        description: `Transaction rollback failed in ${ctx.functionName} at ${requestPath(
          ctx.req,
        )}. Originating error: ${originatingMessage(ctx.originatingError)}`,
        functionName: ctx.functionName,
        fileName: ctx.fileName,
        error: rollbackError as Error,
        userId: ctx.req.userId ?? 0,
        organizationId: ctx.req.organizationId,
      });
    } catch (loggingError) {
      // Logger itself failed — last-resort console so the rollback failure
      // is not entirely swallowed.
      // eslint-disable-next-line no-console
      console.error(
        `[safeRollback] rollback AND logFailure failed in ${ctx.functionName} at ${requestPath(
          ctx.req,
        )}:`,
        { rollbackError, loggingError, originatingError: ctx.originatingError },
      );
    }
  }
}
