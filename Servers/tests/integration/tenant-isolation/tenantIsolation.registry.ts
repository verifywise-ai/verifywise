/**
 * Tenant isolation registry.
 *
 * This file declares every tenant-scoped entity covered by the cross-tenant
 * isolation test matrix and the schema-drift CI gate.
 *
 * Adding a new scoped entity should require one entry here, one factory, and
 * one thin per-entity test file that imports the reusable harness.
 *
 * @see docs/technical/security/tenant-isolation.md
 */

export interface IsolationEntity {
  /** Human-readable entity name (kebab-case). */
  name: string;
  /** Database tables that store this entity's tenant-scoped data. */
  tables: string[];
  /** Base REST route for the entity. */
  baseRoute: string;
}

/**
 * Registry of entities covered by the isolation matrix.
 *
 * Keep this list in sync with the per-entity test files under
 * `tests/integration/tenant-isolation/` and with the `sharedTables`
 * allow-list in `scripts/auditTenantIsolationCoverage.ts`.
 */
export const tenantIsolationRegistry: IsolationEntity[] = [
  {
    name: "projects",
    tables: ["projects"],
    baseRoute: "/api/projects",
  },
  {
    name: "files",
    tables: ["files"],
    baseRoute: "/api/files",
  },
  {
    name: "users",
    tables: ["users"],
    baseRoute: "/api/users",
  },
  {
    name: "risks",
    tables: ["risks", "projects_risks"],
    baseRoute: "/api/projectRisks",
  },
  {
    name: "tasks",
    tables: ["tasks", "task_assignees"],
    baseRoute: "/api/tasks",
  },
  {
    name: "vendors",
    tables: ["vendors", "vendors_projects"],
    baseRoute: "/api/vendors",
  },
  {
    name: "assessments",
    tables: ["assessments"],
    baseRoute: "/api/assessments",
  },
  {
    name: "controls_eu",
    tables: ["controls_eu", "subcontrols_eu"],
    baseRoute: "/api/eu-ai-act",
  },
  {
    name: "projects_frameworks",
    tables: ["projects_frameworks"],
    baseRoute: "/api/frameworks",
  },
  {
    name: "evidence_hub",
    tables: ["evidence_hub"],
    baseRoute: "/api/evidenceHub",
  },
  {
    name: "audit_ledger",
    tables: ["audit_ledger"],
    baseRoute: "/api/audit-ledger",
  },
  {
    name: "event_logs",
    tables: ["event_logs"],
    baseRoute: "/api/logger/events",
  },
  {
    name: "file_entity_links",
    tables: ["file_entity_links"],
    baseRoute: "/api/files",
  },
  {
    name: "file_change_history",
    tables: ["file_change_history"],
    baseRoute: "/api/file-change-history",
  },
];

/** Flat set of all tenant-scoped tables declared in the registry. */
export const getRegisteredTenantTables = (): string[] =>
  tenantIsolationRegistry.flatMap((entity) => entity.tables);

/** Registry entry lookup by entity name. */
export const getIsolationEntity = (name: string): IsolationEntity | undefined =>
  tenantIsolationRegistry.find((entity) => entity.name === name);
