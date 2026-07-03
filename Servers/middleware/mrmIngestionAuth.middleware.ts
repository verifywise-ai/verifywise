/**
 * @fileoverview MRM Ingestion-Token Authentication Middleware
 *
 * Authenticates the MRM metric-push endpoint, which is a MACHINE-to-machine
 * surface used by a customer's headless monitoring pipeline — NOT a logged-in
 * user. It is deliberately separate from `authenticateJWT`:
 *
 *   - The credential is an opaque Bearer INGESTION token (not a JWT).
 *   - Only a SHA-256 hash of the token is stored; the presented token is hashed
 *     and looked up by hash (the same scheme as the API-token path).
 *   - The token itself establishes the organization — there is no user session.
 *
 * On success it attaches `req.mrmIngestionToken = { tokenId, organizationId,
 * modelInventoryId }` for the ingestion controller to read, and best-effort
 * stamps `last_used_at`.
 *
 * Errors (spec §3.5):
 *   401 — missing / malformed / unknown / revoked token
 *   (403 for a model-scope mismatch is enforced in the controller, which knows
 *    the path model.)
 *
 * @module middleware/mrmIngestionAuth
 */

import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger from "../utils/logger/fileLogger";
import {
  getActiveIngestionTokenByHashQuery,
  hashIngestionToken,
  touchIngestionTokenLastUsedQuery,
} from "../utils/mrmMonitoring.utils";

const mrmIngestionAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  // Extract Bearer token from Authorization header.
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;

  if (!token) {
    return res.status(401).json(
      STATUS_CODE[401]({
        message: req.t!("Missing or invalid ingestion token"),
      }),
    );
  }

  try {
    const tokenHash = hashIngestionToken(token);
    const tokenRow = await getActiveIngestionTokenByHashQuery(tokenHash);

    if (!tokenRow) {
      // Unknown or revoked — indistinguishable to the caller by design.
      return res.status(401).json(
        STATUS_CODE[401]({
          message: req.t!("Ingestion token is invalid or has been revoked"),
        }),
      );
    }

    req.mrmIngestionToken = {
      tokenId: tokenRow.id,
      organizationId: tokenRow.organization_id,
      modelInventoryId: tokenRow.model_inventory_id ?? null,
    };
    // Tenant isolation for downstream queries — the token IS the org context.
    req.organizationId = tokenRow.organization_id;

    // Best-effort usage stamp; a failure here must not block a valid push.
    try {
      await touchIngestionTokenLastUsedQuery(tokenRow.id);
    } catch {
      // swallow — usage tracking is non-critical
    }

    return next();
  } catch (error) {
    logger.error("❌ Error in mrmIngestionAuth:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export default mrmIngestionAuth;
