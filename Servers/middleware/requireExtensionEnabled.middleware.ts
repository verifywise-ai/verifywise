import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { ExtensionModel } from "../domain.layer/models/extension/extension.model";
import { ExtensionEnablementModel } from "../domain.layer/models/extension/extensionEnablement.model";
import { sanitizeForLog } from "../utils/validations/validation.utils";

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

export function requireExtensionEnabled(extensionKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
            STATUS_CODE[404](`Extension '${sanitizeForLog(extensionKey)}' not found in catalog`),
          );
        return;
      }

      const enablement = await ExtensionEnablementModel.findByExtensionId(
        extensionId,
        organizationId,
      );
      if (!enablement || !enablement.enabled) {
        res
          .status(403)
          .json(
            STATUS_CODE[403](
              `Extension '${sanitizeForLog(extensionKey)}' is not enabled for this organization`,
            ),
          );
        return;
      }

      next();
    } catch (err) {
      res.status(500).json(STATUS_CODE[500]((err as Error).message));
    }
  };
}
