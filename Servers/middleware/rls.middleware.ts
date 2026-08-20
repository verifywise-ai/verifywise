/**
 * @fileoverview RLS Phase 2 — Runtime Tenant Enforcement (feature-flagged)
 *
 * OFF by default (RLS_ENFORCEMENT_ENABLED=false). When enabled, every
 * authenticated request runs its queries inside a transaction scoped by
 * `SET LOCAL app.current_org = :orgId`, so the Phase 1 row-level-security
 * policies enforce tenant isolation in the database itself — independent of
 * application-level WHERE clauses.
 *
 * Design (see docs/technical/security/rls-rollout.md, Phase 2):
 * - `rlsEnforcement` is invoked by `authenticateJWT` at the downstream
 *   boundary, after req.organizationId has been resolved (routes mount
 *   authenticateJWT individually, so there is no global post-auth hook).
 * - `SET LOCAL` is mandatory (transaction-scoped): a plain `SET` would leak
 *   the org id into the next request reusing the pooled connection.
 * - The org id is always bound via replacements, never interpolated.
 * - Fail closed: a non-super-admin request without an organization context
 *   is rejected with 500 instead of running unscoped.
 * - Exempt: SuperAdmin / no-org contexts (public share links, AI Trust
 *   Centre). Per the runbook these must go through the owner/bypass role and
 *   are designed separately before enforcement is switched on.
 * - `enableRlsQueryScoping` (called once from database/db.ts) routes every
 *   sequelize.query issued inside the request's AsyncLocalStorage context
 *   through the request's RLS transaction.
 *
 * @module middleware/rls
 */

// Triple-slash reference: ts-node (used by scripts/*.ts) compiles files
// lazily and does not load the tsconfig `include` set, so the global Request
// augmentation in types/express.d.ts would otherwise be invisible here.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/express.d.ts" />

import { NextFunction, Request, Response } from "express";
import type { Sequelize, Transaction } from "sequelize";
import { asyncLocalStorage } from "../utils/context/context";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger from "../utils/logger/fileLogger";

/**
 * Whether RLS runtime enforcement is active. Fail closed: only the explicit
 * string "true" enables it; anything else (including unset) keeps the
 * historical behavior.
 */
export const isRlsEnforcementEnabled = (): boolean =>
  (process.env.RLS_ENFORCEMENT_ENABLED ?? "").trim().toLowerCase() === "true";

/**
 * Establishes the per-request RLS transaction and GUC. Invoked from
 * authenticateJWT once req.organizationId (and req.isSuperAdmin) are set.
 * Pass-through when the flag is off.
 *
 * @async
 * @param {Request} req - Express request (organizationId set by authenticateJWT)
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next middleware function
 * @returns {Promise<void|Response>} Continues downstream or fails closed
 */
export const rlsEnforcement = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  if (!isRlsEnforcementEnabled()) {
    return next();
  }

  const organizationId = req.organizationId;

  if (organizationId === undefined || organizationId === null) {
    // Exempt: SuperAdmin cross-org / no-org contexts go through the
    // owner/bypass role per the runbook and are out of scope for the
    // app-role GUC.
    if (req.isSuperAdmin) {
      return next();
    }
    // Fail closed: an authenticated non-super-admin request without an org
    // context must never reach the query layer unscoped.
    logger.error("RLS enforcement enabled but the request has no organization context");
    return res.status(500).json(STATUS_CODE[500]("Missing organization context"));
  }

  // Lazy require: the Sequelize pool must not be initialized when the flag
  // is off or in unit tests that never reach this branch.

  const { sequelize } = require("../database/db");

  let transaction: Transaction;
  try {
    transaction = await sequelize.transaction();
    // Bind the org id — never interpolate it into the SQL string.
    await sequelize.query("SET LOCAL app.current_org = :orgId", {
      replacements: { orgId: organizationId },
      transaction,
    });
  } catch (error) {
    logger.error(`Failed to establish RLS tenant context: ${(error as Error).message}`);
    return res.status(500).json(STATUS_CODE[500]("Failed to establish tenant security context"));
  }

  req.rlsTransaction = transaction;

  // Propagate the transaction through AsyncLocalStorage so
  // enableRlsQueryScoping() can route this request's queries through it.
  const store = asyncLocalStorage.getStore();
  if (store) {
    asyncLocalStorage.enterWith({ ...store, transaction });
  }

  let settled = false;
  const settle = (commit: boolean) => {
    if (settled) return;
    settled = true;
    const outcome = commit ? transaction.commit() : transaction.rollback();
    outcome.catch((error: Error) =>
      logger.error(`Failed to ${commit ? "commit" : "rollback"} RLS transaction: ${error.message}`),
    );
  };

  // Commit only when the response completed successfully; roll back on
  // error responses or aborted connections so nothing half-written persists.
  res.on("finish", () => settle(res.statusCode < 400));
  res.on("close", () => settle(false));

  return next();
};

/**
 * Wraps sequelize.query so that, when enforcement is enabled, every query
 * issued inside a request's AsyncLocalStorage context automatically runs in
 * that request's RLS-scoped transaction (unless an explicit transaction was
 * already provided). No-op when the flag is off. Called once at startup
 * from database/db.ts.
 *
 * @param {Sequelize} sequelizeInstance - The shared Sequelize instance
 */
export const enableRlsQueryScoping = (sequelizeInstance: Sequelize): void => {
  if (!isRlsEnforcementEnabled()) {
    return;
  }

  const originalQuery = sequelizeInstance.query.bind(sequelizeInstance);
  (sequelizeInstance as any).query = (sql: any, options?: any) => {
    const transaction = asyncLocalStorage.getStore()?.transaction;
    if (transaction && !options?.transaction) {
      options = { ...(options ?? {}), transaction };
    }
    return (originalQuery as any)(sql, options);
  };
};
