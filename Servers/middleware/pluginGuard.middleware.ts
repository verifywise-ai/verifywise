/**
 * Plugin Guard Middleware
 *
 * Generic middleware factory that checks whether a specific plugin is installed
 * for the authenticated tenant before allowing access to the route.
 */

import { Request, Response, NextFunction } from "express";
import { findByPlugin } from "../utils/pluginInstallation.utils";

/**
 * Returns Express middleware that checks if a plugin is installed for the tenant.
 * Returns 404 if not installed, calls next() if installed.
 *
 * Usage:
 *   router.use(requirePlugin("plugin-key"));
 */
export function requirePlugin(pluginKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const installation = await findByPlugin(pluginKey, organizationId);
      if (!installation || installation.status !== "installed") {
        return res.status(404).json({
          message: `The '${pluginKey}' plugin is not installed`,
        });
      }

      return next();
    } catch (error) {
      console.error(`[pluginGuard] Error checking plugin '${pluginKey}':`, error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
