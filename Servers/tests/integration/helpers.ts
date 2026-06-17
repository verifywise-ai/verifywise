import { sequelize } from "../../database/db";
import bcrypt from "bcrypt";

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
        `TRUNCATE TABLE event_logs, audit_ledger, projects_members, projects_frameworks, projects, users, organizations RESTART IDENTITY CASCADE`,
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
