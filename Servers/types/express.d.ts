import 'express';

declare module 'express' {
  interface Request {
    userId?: number;
    role?: string;
    /**
     * Organization ID for tenant isolation in shared-schema multi-tenancy.
     * Use this for database queries with WHERE organization_id = :organizationId
     */
    organizationId?: number;
    /**
     * Tenant hash string derived from organizationId.
     * Use this for tenant-schema queries like FROM "${tenantHash}".table_name
     * or for log file paths.
     */
    tenantHash?: string;
    /**
     * @deprecated Legacy tenant identifier - now set to organizationId (number)
     * Will be removed once all queries are migrated to use organizationId directly.
     * For new code, use organizationId instead.
     */
    tenantId?: number;
    /** Virtual key context, set by virtualKeyAuth middleware for /v1/* proxy routes */
    virtualKey?: {
      id: number;
      organizationId: number;
      name: string;
      allowed_endpoint_ids: number[];
      metadata: Record<string, string>;
    };
  }
}