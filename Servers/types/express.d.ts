import "express";
import type { SupportedLang, Translator } from "../utils/i18n.utils";

declare module "express" {
  interface Request {
    userId?: number;
    role?: string;
    /** Resolved request language from Accept-Language. Set by i18nMiddleware. */
    lang?: SupportedLang;
    /** Translator bound to req.lang. Set by i18nMiddleware. */
    t?: Translator;
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
     * True when the authenticated user is a SuperAdmin (role_id = 5).
     * Set by authenticateJWT middleware.
     */
    isSuperAdmin?: boolean;
    /** Test bypass flag set by createTestApp({ bypassAuth: true }) for integration tests */
    testBypassAuth?: boolean;
    /** Virtual key context, set by virtualKeyAuth middleware for /v1/* proxy routes */
    virtualKey?: {
      id: number;
      organizationId: number;
      name: string;
      allowed_endpoint_ids: number[];
      metadata: Record<string, string>;
    };
    /**
     * MRM ingestion-token context, set by mrmIngestionAuth middleware on the
     * machine-auth metric-push route. Distinct from JWT auth: pushes come from
     * headless customer pipelines, not a logged-in user.
     * `modelInventoryId` is null for an org-wide token, or a model id for a
     * per-model-scoped token.
     */
    mrmIngestionToken?: {
      tokenId: number;
      organizationId: number;
      modelInventoryId: number | null;
    };
  }
}
