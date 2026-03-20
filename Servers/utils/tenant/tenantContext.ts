import { asyncLocalStorage } from '../context/context';
import path from 'path';
import fs from 'fs';

export interface TenantContext {
  tenantId?: number;  // Now stores organizationId (number) instead of tenant hash (string)
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
        tenantId: store?.tenantId,
        organizationId: store?.organizationId,
        userId: store?.userId
    };
}

/**
 * Get the tenant ID for logging purposes
 * Falls back to 'default' if no tenant context is available
 */
export function getTenantIdForLogging(): string {
    try {
        const context = getCurrentTenantContext();
        // Convert organizationId to string for logging directory
        return context.organizationId?.toString() || context.tenantId?.toString() || 'default';
    } catch (error) {
        // If we're outside of a request context, use 'default'
        return 'default';
    }
}

/**
 * Get the base log directory path based on environment
 */
export function getLogBaseDirectory(): string {
    const isDev = process.env.NODE_ENV !== 'production';
    return isDev
        ? path.join(process.cwd(), 'logs')
        : path.join('/app/logs');
}

/**
 * Get the tenant-specific log directory path
 * @param tenantId - The tenant ID, if not provided will use current context
 */
export function getTenantLogDirectory(tenantId?: string): string {
    const tenant = tenantId || getTenantIdForLogging();
    const logBaseDir = getLogBaseDirectory();
    return path.join(logBaseDir, tenant);
}

/**
 * Ensure tenant log directory exists and return the path
 * @param tenantId - The tenant ID, if not provided will use current context
 */
export function ensureTenantLogDirectory(tenantId?: string): string {
    const tenantLogDir = getTenantLogDirectory(tenantId);

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
    return now.toISOString().split('T')[0];
}