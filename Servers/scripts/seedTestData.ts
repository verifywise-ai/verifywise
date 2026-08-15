/**
 * Seeds the database with known test data for E2E tests.
 *
 * Usage:
 *   cd Servers
 *   npx ts-node scripts/seedTestData.ts
 *
 * This script:
 *   1. Creates a test organization
 *   2. Creates a test user (verifywise@email.com / Verifywise#1)
 *   3. Creates sample vendors, projects, risks for testing
 *
 * Prerequisites: Database must be migrated first.
 */

import { sequelize } from "../database/db";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

async function seedTestData() {
  const transaction = await sequelize.transaction();

  try {
    console.log("Seeding test data...");

    // 0. Ensure the E2E super-admin exists. Post-2026-08-13, SuperAdmin is
    // an overlay: bootstrap users have role_id = NULL, organization_id =
    // NULL, plus a row in super_admins. Upsert on email (which is unique)
    // and make sure the mapping row exists.
    const superAdminEmail = process.env.SUPERADMIN_EMAIL;
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD;
    if (superAdminEmail && superAdminPassword) {
      const superAdminHash = await bcrypt.hash(superAdminPassword, SALT_ROUNDS);
      await sequelize.query(
        `INSERT INTO users (name, surname, email, password_hash, role_id, organization_id, created_at, last_login, is_demo)
         VALUES ('Super', 'Admin', :email, :passwordHash, NULL, NULL, NOW(), NOW(), false)
         ON CONFLICT (email) DO UPDATE
           SET password_hash = :passwordHash,
               role_id = NULL,
               organization_id = NULL,
               updated_at = NOW()`,
        {
          replacements: { email: superAdminEmail, passwordHash: superAdminHash },
          transaction,
        },
      );
      await sequelize.query(
        `INSERT INTO super_admins (user_id)
         SELECT id FROM users WHERE email = :email
         ON CONFLICT (user_id) DO NOTHING`,
        { replacements: { email: superAdminEmail }, transaction },
      );
      console.log(`  Super-admin ensured: ${superAdminEmail}`);
    } else {
      console.log("  SUPERADMIN_EMAIL/PASSWORD not set — skipping super-admin upsert");
    }

    // 1. Create organization (if not exists)
    const [orgRows] = await sequelize.query(
      `INSERT INTO organizations (name, created_at, updated_at)
       VALUES ('Test Organization', NOW(), NOW())
       ON CONFLICT DO NOTHING
       RETURNING id`,
      { transaction },
    );
    const orgId =
      (orgRows as { id: number }[])[0]?.id ??
      (
        (
          await sequelize.query(`SELECT id FROM organizations LIMIT 1`, {
            transaction,
          })
        )[0] as { id: number }[]
      )[0]?.id;

    console.log(`  Organization ID: ${orgId}`);

    // 2. Create test user
    const hashedPassword = await bcrypt.hash("Verifywise#1", SALT_ROUNDS);
    await sequelize.query(
      `INSERT INTO users (name, surname, email, password_hash, role_id, organization_id, created_at)
       VALUES ('Test', 'User', 'verifywise@email.com', :password, 1, :orgId, NOW())
       ON CONFLICT (email) DO UPDATE SET password_hash = :password`,
      {
        replacements: { password: hashedPassword, orgId },
        transaction,
      },
    );
    console.log("  Test user created: verifywise@email.com");

    await transaction.commit();
    console.log("Test data seeded successfully!");
  } catch (error) {
    await transaction.rollback();
    console.error("Failed to seed test data:", error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seedTestData();
