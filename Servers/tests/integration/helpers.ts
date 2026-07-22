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

export async function createTestProject(
  ownerId: number,
  overrides: Partial<{
    project_title: string;
    start_date: string;
    geography: number;
    ai_risk_classification: string;
    type_of_high_risk_role: string;
    goal: string;
    target_industry: string;
    description: string;
    status: string;
  }> = {},
): Promise<number> {
  const suffix = String(Date.now()).slice(-6);
  const title = overrides.project_title || `Test Project ${suffix}`;
  const [result] = await sequelize.query(
    `INSERT INTO projects (
      project_title, owner, start_date, geography,
      ai_risk_classification, type_of_high_risk_role, goal,
      target_industry, description, last_updated, last_updated_by, status,
      created_at, updated_at
    ) VALUES (
      :title, :owner, :startDate, :geography,
      :aiRiskClassification, :typeOfHighRiskRole, :goal,
      :targetIndustry, :description, NOW(), :lastUpdatedBy, :status,
      NOW(), NOW()
    ) RETURNING id`,
    {
      replacements: {
        title,
        owner: ownerId,
        startDate: overrides.start_date || "2024-06-01",
        geography: overrides.geography || 1,
        aiRiskClassification: overrides.ai_risk_classification || "Limited risk",
        typeOfHighRiskRole: overrides.type_of_high_risk_role || "Deployer",
        goal: overrides.goal || "Test goal",
        targetIndustry: overrides.target_industry || "Technology",
        description: overrides.description || "Test description",
        lastUpdatedBy: ownerId,
        status: overrides.status || "Not started",
      },
    },
  );
  return (result as any[])[0].id;
}

export async function createTestVendor(
  orgId: number,
  assigneeId: number,
  overrides: Partial<{
    vendor_name: string;
    vendor_provides: string;
    website: string;
    vendor_contact_person: string;
    review_status: string;
  }> = {},
): Promise<number> {
  const suffix = String(Date.now()).slice(-6);
  const [result] = await sequelize.query(
    `INSERT INTO vendors (
      vendor_name, vendor_provides, assignee, website, vendor_contact_person,
      review_result, review_status, review_date, organization_id,
      is_demo, created_at, updated_at
    ) VALUES (
      :name, :provides, :assignee, :website, :contactPerson,
      :reviewResult, :reviewStatus, NOW(), :orgId,
      false, NOW(), NOW()
    ) RETURNING id`,
    {
      replacements: {
        name: overrides.vendor_name || `Test Vendor ${suffix}`,
        provides: overrides.vendor_provides || "AI Services",
        assignee: assigneeId,
        website: overrides.website || "https://example.com",
        contactPerson: overrides.vendor_contact_person || "John Doe",
        reviewResult: "",
        reviewStatus: overrides.review_status || "Not started",
        orgId,
      },
    },
  );
  return (result as any[])[0].id;
}

export async function createTestModelInventory(
  orgId: number,
  overrides: Partial<{
    provider: string;
    model: string;
    version: string;
    capabilities: string;
    status: string;
    status_date: string;
    reference_link: string;
    biases: string;
    limitations: string;
    hosting_provider: string;
  }> = {},
): Promise<number> {
  const suffix = String(Date.now()).slice(-6);
  const [result] = await sequelize.query(
    `INSERT INTO model_inventories (
      provider, model, version, capabilities, status, status_date,
      reference_link, biases, limitations, hosting_provider,
      security_assessment, is_demo, organization_id, created_at, updated_at
    ) VALUES (
      :provider, :model, :version, :capabilities, :status, :statusDate,
      :referenceLink, :biases, :limitations, :hostingProvider,
      false, false, :orgId, NOW(), NOW()
    ) RETURNING id`,
    {
      replacements: {
        provider: overrides.provider || "OpenAI",
        model: overrides.model || `gpt-test-${suffix}`,
        version: overrides.version || "1.0",
        capabilities: overrides.capabilities || "Text generation",
        status: overrides.status || "Pending",
        statusDate: overrides.status_date || "2024-06-01",
        referenceLink: overrides.reference_link || "https://example.com/model",
        biases: overrides.biases || "Unknown",
        limitations: overrides.limitations || "Test limitations",
        hostingProvider: overrides.hosting_provider || "OpenAI",
        orgId,
      },
    },
  );
  return (result as any[])[0].id;
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
          model_inventory_change_history,
          model_inventory_history,
          vendor_risk_change_history,
          vendor_change_history,
          model_inventories,
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
