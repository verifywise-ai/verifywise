/**
 * E2E admin seed script.
 *
 * Creates a deterministic admin user inside an organization so the Playwright
 * E2E suite can run the critical journey as a real Admin (role_id = 1) instead
 * of the read-only super-admin.
 *
 * This script is intended for local development and CI only. It is never
 * executed in production.
 *
 * Usage:
 *   npx ts-node scripts/seedE2EAdmin.ts [orgId]
 *
 * Environment variables:
 *   - E2E_ADMIN_EMAIL   (default: e2e-admin@verifywise.local)
 *   - E2E_ADMIN_PASSWORD (default: E2EAdmin#1)
 *   - E2E_ORG_NAME      (default: E2E Org <timestamp>)
 *
 * Output:
 *   Prints a single line of JSON: { orgId, userId, email, password }
 */

import { sequelize } from "../database/db";
import bcrypt from "bcrypt";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-admin@verifywise.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "E2EAdmin#1";
const ADMIN_NAME = "E2E";
const ADMIN_SURNAME = "Admin";

async function findExistingUser(email: string): Promise<number | null> {
  const [rows] = await sequelize.query(
    `SELECT id, organization_id FROM users WHERE email = :email`,
    { replacements: { email } },
  );
  const row = (rows as any[])[0];
  return row ? row.id : null;
}

async function createOrganization(name: string): Promise<number> {
  const [result] = await sequelize.query(
    `INSERT INTO organizations (name, created_at, updated_at)
     VALUES (:name, NOW(), NOW()) RETURNING id`,
    { replacements: { name } },
  );
  return (result as any[])[0].id;
}

async function createAdminUser(orgId: number): Promise<number> {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const [result] = await sequelize.query(
    `INSERT INTO users (
       name, surname, email, password_hash, role_id, organization_id,
       created_at, updated_at
     )
     VALUES (
       :name, :surname, :email, :hash, :roleId, :orgId,
       NOW(), NOW()
     )
     RETURNING id`,
    {
      replacements: {
        name: ADMIN_NAME,
        surname: ADMIN_SURNAME,
        email: ADMIN_EMAIL,
        hash,
        roleId: 1, // Admin
        orgId,
      },
    },
  );
  return (result as any[])[0].id;
}

async function main(): Promise<void> {
  const inputOrgId = process.argv[2];

  const existingUserId = await findExistingUser(ADMIN_EMAIL);
  if (existingUserId !== null) {
    // Re-seed the same user so credentials stay stable across runs.
    const [rows] = await sequelize.query(`SELECT organization_id FROM users WHERE id = :id`, {
      replacements: { id: existingUserId },
    });
    const existingOrgId = (rows as any[])[0]?.organization_id;
    console.log(
      JSON.stringify({
        orgId: existingOrgId,
        userId: existingUserId,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      }),
    );
    return;
  }

  let orgId: number;
  if (inputOrgId) {
    orgId = parseInt(inputOrgId, 10);
  } else {
    const orgName = process.env.E2E_ORG_NAME || `E2E Org ${Date.now()}`;
    orgId = await createOrganization(orgName);
  }

  const userId = await createAdminUser(orgId);

  console.log(
    JSON.stringify({
      orgId,
      userId,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  );
}

main()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await sequelize.close();
    process.exit(1);
  });
