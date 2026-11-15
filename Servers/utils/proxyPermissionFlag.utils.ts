/**
 * Shared logic for proxies that tell a downstream service (EvalServer, AI
 * Gateway) whether the caller holds a permission, through a header the proxy
 * alone sets. The downstream service trusts that header the way it trusts
 * x-role, so the path match and the lookup must fail closed.
 */
import type { NextFunction, Request, Response } from "express";
import { requestHasPermission } from "./rolePermissions.utils";
import type { PermissionKey } from "../config/rolePermissions.config";

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Whether `path` is `prefix` or under it, compared segment by segment after
 * decoding and lower-casing. Empty segments (`//`) are ignored; a `.` or `..`
 * segment never matches, so `/keys/../endpoints` is not a key route. A
 * spelling that doesn't match only means the flag is not set (fail closed).
 */
export function isUnderPathPrefix(path: string, prefix: string): boolean {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Malformed escape: keep the raw path.
  }
  const segments = decoded.toLowerCase().split("/").filter(Boolean);
  if (segments.some((s) => s === "." || s === "..")) return false;
  const wanted = prefix.toLowerCase().split("/").filter(Boolean);
  return wanted.every((segment, i) => segments[i] === segment);
}

export interface PermissionFlagOptions<F extends string> {
  /** Path prefix, relative to the router mount, whose writes need the lookup. */
  pathPrefix: string;
  permission: PermissionKey;
  /** Request property the proxy reads when building the header. */
  flag: F;
  /** Roles the downstream service already accepts by name; no lookup needed. */
  skipLookupForRoles?: readonly string[];
  /** Log prefix for a failed lookup. */
  logLabel: string;
}

/**
 * Middleware that sets `req[flag]` to whether the caller holds `permission`,
 * for writes under `pathPrefix`. Reads and other paths skip the lookup and
 * leave the flag false. On a lookup error the flag stays false.
 */
export function createPermissionFlagMiddleware<F extends string>({
  pathPrefix,
  permission,
  flag,
  skipLookupForRoles = [],
  logLabel,
}: PermissionFlagOptions<F>) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const flags = req as unknown as Record<string, boolean>;
    flags[flag] = false;
    const needsLookup =
      !READ_ONLY_METHODS.has(req.method) &&
      isUnderPathPrefix(req.path, pathPrefix) &&
      !skipLookupForRoles.includes(req.role ?? "");
    if (needsLookup) {
      try {
        flags[flag] = await requestHasPermission(req, permission);
      } catch (error) {
        console.error(`[${logLabel}] Permission lookup failed:`, error);
      }
    }
    next();
  };
}
