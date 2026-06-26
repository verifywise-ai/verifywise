/**
 * @fileoverview JWT Authentication Middleware
 *
 * Provides comprehensive JWT token validation and user authentication for protected routes.
 * Implements multi-layered security checks including token verification, expiration validation,
 * role validation, and multi-tenant organization isolation.
 *
 * Security Layers:
 * 1. Token presence validation
 * 2. JWT signature verification
 * 3. Token expiration check
 * 4. Payload structure validation
 * 5. Organization membership verification
 * 6. Role consistency validation
 *
 * Multi-Tenancy:
 * Uses shared-schema multi-tenancy with organization_id for tenant isolation.
 * All tenant data is in the public schema with organization_id column.
 *
 * Features:
 * - Bearer token extraction from Authorization header
 * - Comprehensive token payload validation
 * - Multi-tenant organization isolation via organizationId
 * - Role-based access control integration
 * - AsyncLocalStorage context propagation
 * - Detailed error responses for debugging
 *
 * @module middleware/auth
 */

import { NextFunction, Request, Response } from "express";
import { getTokenPayload } from "../utils/jwt.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { doesUserBelongsToOrganizationQuery, getUserByIdQuery } from "../utils/user.utils";
import { asyncLocalStorage } from "../utils/context/context";
import { getTenantHash } from "../tools/getTenantHash";
import { getRoleNameById } from "../utils/roleMap";
import {
  getActiveApiTokenByHashQuery,
  hashApiToken,
  touchApiTokenLastUsedQuery,
} from "../utils/tokens.utils";

/**
 * Express middleware for JWT authentication and authorization
 *
 * Validates JWT tokens and enforces multi-tenant organization isolation.
 * Attaches user information to request object for downstream route handlers.
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next middleware function
 * @returns {Promise<void|Response>} Continues to next middleware or returns error response
 *
 * @security
 * - Validates JWT signature using secret key
 * - Checks token expiration timestamp
 * - Verifies user belongs to claimed organization
 * - Validates role hasn't changed since token issuance
 * - Prevents token reuse across organizations
 *
 * @validation_flow
 * 1. Extract Bearer token from Authorization header
 * 2. Verify JWT signature and decode payload
 * 3. Check token expiration
 * 4. Validate payload structure (id, roleName, organizationId)
 * 5. Verify organization membership in database
 * 6. Validate role consistency with current user role
 * 7. Attach user context to request
 * 8. Initialize AsyncLocalStorage for request tracing
 *
 * @example
 * // Protect a route with authentication
 * app.get('/api/protected', authenticateJWT, (req, res) => {
 *   console.log(`User ${req.userId} from org ${req.organizationId}`);
 *   // req.userId, req.role, req.organizationId, req.tenantHash available
 * });
 *
 * @example
 * // Make authenticated request
 * fetch('/api/protected', {
 *   headers: {
 *     'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 *   }
 * });
 */
const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  // Test bypass: integration tests may inject mock auth context via
  // createTestApp({ bypassAuth: true }). Only active in test environment.
  if (process.env.NODE_ENV === "test" && req.testBypassAuth === true) {
    return asyncLocalStorage.run(
      {
        userId: req.userId ?? 1,
        organizationId: req.organizationId ?? 1,
      },
      () => {
        next();
      },
    );
  }

  // Extract Bearer token from Authorization header
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: req.t!("Token not found"),
      }),
    );
  }

  try {
    // Verify JWT signature and decode payload
    const decoded = getTokenPayload(token);

    if (!decoded)
      return res.status(401).json(
        STATUS_CODE[401]({
          message: req.t!("Unauthorized **"),
        }),
      );

    // Check token expiration
    if (decoded.expire < Date.now())
      return res.status(406).json(STATUS_CODE[406]({ message: req.t!("Token expired") }));

    // Validate payload structure
    if (
      !decoded.id ||
      typeof decoded.id !== "number" ||
      decoded.id <= 0 ||
      !decoded.roleName ||
      typeof decoded.roleName !== "string"
    ) {
      return res.status(400).json({ message: req.t!("Invalid token") });
    }

    // API tokens carry a `type: "api_token"` claim and must additionally exist
    // as an active row in the api_tokens table. This is what makes them
    // revocable: a correctly-signed, unexpired JWT is still rejected once its
    // row is revoked or deleted. Session JWTs have no `type` claim and skip
    // this database round-trip entirely.
    let apiTokenRowId: number | null = null;
    if (decoded.type === "api_token") {
      const tokenHash = hashApiToken(token);
      const tokenRow = await getActiveApiTokenByHashQuery(decoded.organizationId, tokenHash);
      if (!tokenRow) {
        return res.status(401).json(
          STATUS_CODE[401]({
            message: req.t!("API token is invalid or has been revoked"),
          }),
        );
      }
      apiTokenRowId = tokenRow.id;
    }

    // Validate role hasn't changed since token was issued. The expected role
    // name is sourced live from the roles table (cached, TTL 60s, invalidated
    // on role CRUD) so adding/renaming a role doesn't need a code change.
    const user = await getUserByIdQuery(decoded.id);
    const expectedRoleName = await getRoleNameById(user.role_id);
    if (decoded.roleName !== expectedRoleName) {
      return res.status(403).json({ message: req.t!("Not allowed to access") });
    }

    const isSuperAdmin = decoded.roleName === "SuperAdmin";

    if (isSuperAdmin) {
      // Super-admin: skip org membership check, resolve org from header
      req.userId = decoded.id;
      req.isSuperAdmin = true;

      req.role = decoded.roleName;

      const headerOrgId = req.headers["x-organization-id"];
      if (headerOrgId) {
        const orgId = parseInt(headerOrgId as string, 10);
        if (!isNaN(orgId) && orgId > 0) {
          req.organizationId = orgId;
          req.tenantHash = getTenantHash(orgId);
        }
      }
      // If no X-Organization-Id header, organizationId stays undefined (super-admin-only routes)
    } else {
      // Normal user: verify org membership
      const belongs = await doesUserBelongsToOrganizationQuery(decoded.id, decoded.organizationId);
      if (!belongs.belongs) {
        return res
          .status(403)
          .json({ message: req.t!("User does not belong to this organization") });
      }

      // Attach user context to request for downstream handlers
      req.userId = decoded.id;
      req.role = decoded.roleName;
      req.organizationId = decoded.organizationId;
      // tenantHash is the cache-key seed derived from organizationId.
      // It is NOT a schema name; the shared-schema design uses
      // unqualified table names + the search_path.
      req.tenantHash = getTenantHash(decoded.organizationId);
    }

    // Enforce read-only mode for super-admin viewing an org
    if (req.isSuperAdmin && req.organizationId) {
      const readOnlyMethods = ["GET", "HEAD", "OPTIONS"];
      const isSuperAdminRoute =
        req.path.startsWith("/api/super-admin") || req.baseUrl?.startsWith("/api/super-admin");
      if (!readOnlyMethods.includes(req.method.toUpperCase()) && !isSuperAdminRoute) {
        return res
          .status(403)
          .json(
            STATUS_CODE[403](
              req.t!("Super-admin has read-only access when viewing an organization"),
            ),
          );
      }
    }

    // Record API token usage on the fully-authenticated path. Best-effort:
    // a failure to update last_used_at must not block an otherwise valid
    // request.
    if (apiTokenRowId !== null) {
      try {
        await touchApiTokenLastUsedQuery(apiTokenRowId, decoded.organizationId);
      } catch {
        // swallow — usage tracking is non-critical
      }
    }

    // Initialize AsyncLocalStorage context for request tracing
    asyncLocalStorage.run(
      {
        userId: decoded.id,
        organizationId: req.organizationId ?? 0,
      },
      () => {
        next();
      },
    );
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export default authenticateJWT;
