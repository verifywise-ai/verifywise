import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { ExtensionModel } from "../domain.layer/models/extension/extension.model";
import { ExtensionEnablementModel } from "../domain.layer/models/extension/extensionEnablement.model";
import { sanitizeForLog } from "../utils/validations/validation.utils";
import { logStructuredError } from "../utils/logger/fileLogger";

/**
 * Per-extension route gate. Fails with 403 when the caller's organization
 * has not enabled the extension. Fails with 404 if the extension key is
 * unknown (catalog missing the row).
 *
 * Extension.id lookup is cached in-process — the catalog is seeded once
 * and never changes at runtime, so a single lookup per key is sufficient.
 */
const extensionIdCache = new Map<string, number>();

async function resolveExtensionId(key: string): Promise<number | null> {
  const cached = extensionIdCache.get(key);
  if (cached !== undefined) return cached;
  const extension = await ExtensionModel.findByKey(key);
  if (!extension) return null;
  extensionIdCache.set(key, extension.id);
  return extension.id;
}

/**
 * The gate's lookup outside a request: whether the organization has enabled
 * the extension. An extension missing from the catalog counts as disabled.
 */
export async function isExtensionEnabledForOrganization(
  extensionKey: string,
  organizationId: number,
): Promise<boolean> {
  const extensionId = await resolveExtensionId(extensionKey);
  if (extensionId === null) return false;
  const enablement = await ExtensionEnablementModel.findByExtensionId(extensionId, organizationId);
  return !!enablement?.enabled;
}

async function checkEnabled(
  extensionKey: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const organizationId = (req as any).organizationId;
  if (!organizationId) {
    res.status(401).json(STATUS_CODE[401](req.t!("User not authenticated")));
    return;
  }

  try {
    const extensionId = await resolveExtensionId(extensionKey);
    if (extensionId === null) {
      res
        .status(404)
        .json(
          STATUS_CODE[404](
            req.t!("Extension '{key}' not found in catalog", { key: sanitizeForLog(extensionKey) }),
          ),
        );
      return;
    }

    // Same lookup the background senders use, so the gate and they agree.
    if (!(await isExtensionEnabledForOrganization(extensionKey, organizationId))) {
      res.status(403).json(
        STATUS_CODE[403](
          req.t!("Extension '{key}' is not enabled for this organization", {
            key: sanitizeForLog(extensionKey),
          }),
        ),
      );
      return;
    }

    next();
  } catch (err) {
    // The cause goes to the log only: a database error message is not for the client.
    logStructuredError(
      `Extension gate: enablement check failed for '${sanitizeForLog(extensionKey)}' (org ${organizationId})`,
      err,
      "checkEnabled",
      "requireExtensionEnabled.middleware.ts",
    );
    res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
}

export function requireExtensionEnabled(extensionKey: string) {
  return (req: Request, res: Response, next: NextFunction): Promise<void> =>
    checkEnabled(extensionKey, req, res, next);
}

/** The same gate with the key taken from a route parameter (for example /:key/runs). */
export function requireExtensionEnabledFromParam(param = "key") {
  return (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const raw = req.params[param];
    const key = Array.isArray(raw) ? String(raw[0]) : String(raw ?? "");
    return checkEnabled(key, req, res, next);
  };
}
