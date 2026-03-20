# Multi-Tenancy Architecture

## Overview

VerifyWise implements a **shared-schema** multi-tenancy strategy using PostgreSQL. All organizations share a single `verifywise` schema, with data isolation enforced at the application level via `organization_id` columns on all tenant-scoped tables.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              PostgreSQL Database                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                        verifywise schema                                │ │
│  │  ─────────────────────────────────────────────────────────────────────  │ │
│  │                                                                         │ │
│  │  SHARED TABLES (no organization_id)                                     │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐ │ │
│  │  │  organizations  │  users        │  roles      │  frameworks       │ │ │
│  │  │  subscriptions  │  tiers        │  *_struct_* │                   │ │ │
│  │  └────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                         │ │
│  │  TENANT-SCOPED TABLES (with organization_id)                            │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐ │ │
│  │  │  projects       │  vendors        │  risks         │  files       │ │ │
│  │  │  model_inventories │  tasks       │  approvals     │  assessments │ │ │
│  │  │  policy_manager │  automations    │  datasets      │  ...30+ more │ │ │
│  │  └────────────────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  public schema (extensions only: uuid-ossp, pgcrypto)                   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## How It Works

### Search Path

Sequelize sets `search_path = verifywise` via an `afterConnect` hook on every database connection:

```typescript
// File: Servers/database/db.ts
hooks: {
  afterConnect: async (connection: any) => {
    await connection.query("SET search_path TO verifywise;");
  },
}
```

This means all application SQL uses **unqualified table names** (e.g., `SELECT * FROM projects`, not `SELECT * FROM verifywise.projects`). The search path resolves them automatically.

### Organization ID Isolation

Every tenant-scoped table has an `organization_id` column:

```sql
-- Example: projects table
CREATE TABLE verifywise.projects (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
  project_title VARCHAR(255),
  ...
);
CREATE INDEX idx_projects_org ON verifywise.projects(organization_id);
```

Every query for tenant-scoped data **must** include `organization_id` in the WHERE clause:

```typescript
// File: Servers/utils/project.utils.ts
const result = await sequelize.query(
  `SELECT * FROM projects WHERE organization_id = :organizationId AND id = :id`,
  { replacements: { organizationId, id } }
);
```

## Request Flow with Tenant Context

```
1. HTTP Request
        │
        ▼
2. Express Middleware Chain
   ├── CORS
   ├── Rate Limiting
   ├── authMiddleware
   │   ├── Extract JWT from Authorization header
   │   ├── Verify token signature
   │   ├── Check user belongs to organization
   │   └── Attach to request:
   │       req.userId = decoded.id
   │       req.organizationId = decoded.organizationId
   │
   └── contextMiddleware
       └── Store in AsyncLocalStorage:
           { userId, organizationId }
                  │
                  ▼
3. Controller
   │  const organizationId = req.organizationId;
   ▼
4. Utils (Database Query)
   │  WHERE organization_id = :organizationId
   ▼
5. PostgreSQL (verifywise schema)
```

## Middleware Implementation

### Authentication Middleware

```typescript
// File: Servers/middleware/auth.middleware.ts

export const authenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(400).json({ message: "Access token missing" });
  }

  try {
    const decoded = getTokenPayload(token);

    // Verify user belongs to organization
    const belongs = await doesUserBelongsToOrganizationQuery(
      decoded.id,
      decoded.organizationId
    );
    if (!belongs.belongs) {
      return res.status(403).json({
        message: "User does not belong to this organization"
      });
    }

    // Attach context to request
    req.userId = decoded.id;
    req.organizationId = decoded.organizationId;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
```

## Query Patterns

### Tenant-scoped query

```typescript
// Unqualified table name — resolved by search_path
const query = `
  SELECT * FROM projects
  WHERE organization_id = :organizationId AND id = :id
`;

const [project] = await sequelize.query(query, {
  replacements: { organizationId, id },
  type: QueryTypes.SELECT
});
```

### Join with shared tables

```typescript
// users table is also in verifywise schema — no prefix needed
const query = `
  SELECT p.*, u.name || ' ' || u.surname AS owner_name
  FROM projects p
  JOIN users u ON p.owner = u.id
  WHERE p.organization_id = :organizationId AND p.id = :id
`;
```

### Insert with organization_id

```typescript
const query = `
  INSERT INTO projects (organization_id, project_title, owner)
  VALUES (:organizationId, :title, :ownerId)
  RETURNING *
`;
```

## Schema Structure

### Shared Tables (no organization_id)

| Table | Purpose |
|-------|---------|
| `organizations` | Organization records |
| `users` | User accounts (has `organization_id` FK) |
| `roles` | System roles (Admin, Reviewer, Editor, Auditor) |
| `frameworks` | Compliance framework definitions |
| `subscriptions` | Billing information |
| `tiers` | Service tier definitions |
| `*_struct_*` | Framework structure tables (shared templates) |

### Tenant-scoped Tables (with organization_id)

| Table | Purpose |
|-------|---------|
| `projects` | AI use cases/projects |
| `vendors` | Third-party vendors |
| `model_inventories` | AI model inventory |
| `risks` | Risk definitions |
| `projects_risks` | Project-risk associations |
| `files` | Uploaded documents |
| `approval_workflows` | Workflow definitions |
| `approval_requests` | Approval instances |
| `tasks` | Task management |
| `policy_manager` | Policies |
| `automations` | Automation rules |
| `datasets` | Dataset registry |
| ...and 30+ more |

## JWT Token Structure

Tokens contain organization context:

```typescript
interface TokenPayload {
  id: number;              // User ID
  email: string;
  name: string;
  surname: string;
  organizationId: number;  // Organization ID (used for data isolation)
  tenantId: string;        // Legacy field (backward compat)
  roleName: string;        // User's role
  expire: Date;
}
```

## Multi-Tenancy Enforcement

### Environment Configuration

```env
# Enable/disable multi-tenancy (SaaS mode)
MULTI_TENANCY_ENABLED=true
```

### Organization Creation Guard

```typescript
// File: Servers/middleware/multiTenancy.middleware.ts

export const checkMultiTenancy = async (req, res, next) => {
  const requestOrigin = req.headers.origin || req.headers.host;
  const organizationExists = await getOrganizationsExistsQuery();

  // Allow if multi-tenancy enabled and from authorized domain,
  // or no organizations exist yet (initial setup)
  if (
    (process.env.MULTI_TENANCY_ENABLED === "true" &&
      (requestOrigin?.includes("app.verifywise.ai") ||
       requestOrigin?.includes("test.verifywise.ai"))) ||
    !organizationExists.exists
  ) {
    return next();
  }

  return res.status(403).json({
    message: "Multi tenancy is not enabled in this server."
  });
};
```

## Security Considerations

### Defense in Depth

1. **JWT validation**: Token must be valid and not expired
2. **Organization membership**: User must belong to the organization in the token
3. **Role verification**: Real-time DB check that role matches token
4. **Query-level isolation**: Every tenant-scoped query includes `organization_id`

### Migration from Schema-per-Tenant

The codebase previously used schema-per-tenant isolation (one PostgreSQL schema per organization). This was migrated to the current shared-schema model. The migration script `Servers/scripts/migrateToSharedSchema.ts` handles moving data from old tenant schemas to the shared `verifywise` schema with `organization_id` columns. No active code uses the old pattern.

## Summary Table

| Aspect | Implementation |
|--------|----------------|
| **Isolation strategy** | Shared schema with `organization_id` column |
| **Schema** | Single `verifywise` schema for all data |
| **Public schema** | Extensions only (uuid-ossp, pgcrypto) |
| **Table references** | Unqualified names (resolved via `search_path`) |
| **Tenant identifier** | `organizationId` (integer) from JWT |
| **Context propagation** | `req.organizationId` from auth middleware |
| **Query pattern** | `WHERE organization_id = :organizationId` |
| **Database connections** | Single connection pool, shared schema |

## Key Files

| File | Purpose |
|------|---------|
| `Servers/database/db.ts` | Sequelize init, search_path hook |
| `Servers/database/config/config.js` | DB config with `schema: "verifywise"` |
| `Servers/middleware/auth.middleware.ts` | JWT validation, org membership check |
| `Servers/middleware/multiTenancy.middleware.ts` | Organization creation guard |
| `Servers/scripts/migrateToSharedSchema.ts` | Legacy migration script |

## Related Documentation

- [Architecture Overview](./overview.md)
- [Authentication](./authentication.md)
- [Database Schema](./database-schema.md)
