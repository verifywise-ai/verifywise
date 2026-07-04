import { sequelize } from "../../database/db";
import bcrypt from "bcrypt";
import { execSync } from "child_process";
import path from "path";

/**
 * Run pending Sequelize migrations against the configured test database.
 * This ensures integration tests see the same schema the application expects
 * without relying on a manually migrated local database.
 */
export function runMigrations(): void {
  execSync("npx sequelize db:migrate", {
    cwd: path.join(__dirname, "../.."),
    stdio: "pipe",
    env: { ...process.env, NODE_ENV: "test" },
  });
}

export async function createTestOrganization(name?: string): Promise<number> {
  const orgName = name || `Test Org ${Date.now()}`;
  const [result] = await sequelize.query(
    `INSERT INTO organizations (name, created_at, updated_at) VALUES (:name, NOW(), NOW()) RETURNING id`,
    { replacements: { name: orgName } },
  );
  return (result as any[])[0].id;
}

export async function createTestUser(
  orgId: number,
  roleId: number,
  email: string,
  password: string,
): Promise<number> {
  const hash = await bcrypt.hash(password, 10);
  const suffix = String(Date.now()).slice(-6);
  const [result] = await sequelize.query(
    `INSERT INTO users (name, surname, email, password_hash, role_id, organization_id, created_at, updated_at)
     VALUES (:name, :surname, :email, :hash, :roleId, :orgId, NOW(), NOW()) RETURNING id`,
    {
      replacements: {
        name: `Test${suffix}`,
        surname: `User${suffix}`,
        email,
        hash,
        roleId,
        orgId,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface TwoOrgsSeed {
  orgA: number;
  orgB: number;
  userA: number;
  userB: number;
  emailA: string;
  emailB: string;
}

/**
 * Create two organizations, each with one user of the requested role.
 * Useful for cross-tenant isolation tests.
 */
export async function seedTwoOrgsAndUsers(roleId: number = 1): Promise<TwoOrgsSeed> {
  const suffix = Date.now();
  const orgA = await createTestOrganization(`Org A ${suffix}`);
  const orgB = await createTestOrganization(`Org B ${suffix}`);
  const emailA = `org-a-${suffix}@test.com`;
  const emailB = `org-b-${suffix}@test.com`;
  const userA = await createTestUser(orgA, roleId, emailA, "Password123!");
  const userB = await createTestUser(orgB, roleId, emailB, "Password123!");
  return { orgA, orgB, userA, userB, emailA, emailB };
}

export async function seedFrameworks(): Promise<void> {
  await sequelize.query(
    `INSERT INTO frameworks (id, name, description, is_organizational)
     VALUES
       (1, 'EU AI Act', 'EU AI Act framework', false),
       (2, 'ISO 42001', 'ISO 42001 framework', true),
       (3, 'ISO 27001', 'ISO 27001 framework', true),
       (4, 'NIST AI RMF', 'NIST AI RMF framework', true)
     ON CONFLICT (id) DO NOTHING`,
  );
}

export async function cleanupDatabase(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await sequelize.query(
        `TRUNCATE TABLE
          governance_control_mappings,
          governance_coverage_cache,
          governance_scenario_rules,
          governance_scenario_activations,
          governance_scenarios,
          audit_ledger,
          event_logs,
          task_assignees,
          projects_risks,
          vendors_projects,
          projects_members,
          projects_frameworks,
          files,
          risks,
          tasks,
          vendors,
          assessments,
          controls_eu,
          subcontrols_eu,
          projects,
          users,
          organizations
        RESTART IDENTITY CASCADE`,
      );
      return;
    } catch (err: any) {
      if (err?.code === "40P01" && attempt < 2) {
        // Deadlock detected — wait and retry
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }
}
