import { asyncLocalStorage } from "../context/context";
import path from "path";
import fs from "fs";

export interface TenantContext {
  organizationId?: number;
  userId?: number;
}

/**
 * Get the current tenant context from AsyncLocalStorage
 * This function should be called within the context of an authenticated request
 */
export function getCurrentTenantContext(): TenantContext {
  const store = asyncLocalStorage.getStore();
  return {
    organizationId: store?.organizationId,
    userId: store?.userId,
  };
}

/**
 * Get the tenant scope identifier (organizationId as string) for logging directory names.
 * Falls back to 'default' if no tenant context is available.
 */
export function getTenantIdForLogging(): string {
  try {
    const context = getCurrentTenantContext();
    return context.organizationId?.toString() || "default";
  } catch (error) {
    // If we're outside of a request context, use 'default'
    return "default";
  }
}

/**
 * Get the base log directory path based on environment
 */
export function getLogBaseDirectory(): string {
  const isDev = process.env.NODE_ENV !== "production";
  return isDev ? path.join(process.cwd(), "logs") : path.join("/app/logs");
}

/**
 * Get the tenant-specific log directory path
 * @param tenant - The tenant scope (string). If not provided uses current context.
 */
export function getTenantLogDirectory(tenant?: string): string {
  const resolved = tenant || getTenantIdForLogging();
  const logBaseDir = getLogBaseDirectory();
  return path.join(logBaseDir, resolved);
}

/**
 * Ensure tenant log directory exists and return the path
 * @param tenant - The tenant scope (string). If not provided uses current context.
 */
export function ensureTenantLogDirectory(tenant?: string): string {
  const tenantLogDir = getTenantLogDirectory(tenant);

  if (!fs.existsSync(tenantLogDir)) {
    fs.mkdirSync(tenantLogDir, { recursive: true });
  }

  return tenantLogDir;
}

/**
 * Get current date in YYYY-MM-DD format using UTC timezone
 * This ensures consistency with winston-daily-rotate-file when utc: true
 */
export function getCurrentDateStringUTC(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}
