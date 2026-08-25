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
 *   npx ts-node scripts/seedE2EAdmin.ts [orgId] [options]
 *
 * Positional arguments:
 *   - orgId (optional): The organization ID to place the admin in. If omitted,
 *     a new organization is created.
 *
 * Options:
 *   --output-file=<path>   Write full credentials (including password) to path
 *   --email=<email>        Override the admin email (default: env or deterministic)
 *   --password=<password>  Override the admin password
 *   --name=<name>          Override the admin first name
 *   --surname=<surname>    Override the admin surname
 *
 * Environment variables:
 *   - E2E_ADMIN_EMAIL   (default: e2e-admin@verifywise.local)
 *   - E2E_ADMIN_PASSWORD (default: E2EAdmin#1)
 *   - E2E_ADMIN_NAME     (default: E2E)
 *   - E2E_ADMIN_SURNAME  (default: Admin)
 *   - E2E_ORG_NAME       (default: E2E Org <timestamp>)
 *
 * Output:
 *   Prints a single line of JSON metadata: { orgId, userId, email, credentialsFile }
 *   If --output-file is provided, the full credential JSON (including password) is
 *   written to that file with mode 0o600; otherwise the password is omitted from
 *   stdout entirely.
 */

import { sequelize } from "../database/db";
import bcrypt from "bcrypt";
import { writeFileSync, chmodSync } from "fs";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-admin@verifywise.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "E2EAdmin#1";
const ADMIN_NAME = process.env.E2E_ADMIN_NAME || "E2E";
const ADMIN_SURNAME = process.env.E2E_ADMIN_SURNAME || "Admin";

interface ParsedArgs {
  inputOrgId: string | undefined;
  outputFile: string | undefined;
  email: string;
  password: string;
  name: string;
  surname: string;
}

async function findExistingUser(email: string): Promise<number | null> {
  const [rows] = await sequelize.query(
    `SELECT id, organization_id FROM verifywise.users WHERE email = :email`,
    { replacements: { email } },
  );
  const row = (rows as any[])[0];
  return row ? row.id : null;
}

async function createOrganization(name: string): Promise<number> {
  const [result] = await sequelize.query(
    `INSERT INTO verifywise.organizations (name, created_at, updated_at)
     VALUES (:name, NOW(), NOW()) RETURNING id`,
    { replacements: { name } },
  );
  return (result as any[])[0].id;
}

async function createAdminUser(orgId: number, args: ParsedArgs): Promise<number> {
  const hash = await bcrypt.hash(args.password, 10);
  const [result] = await sequelize.query(
    `INSERT INTO verifywise.users (
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
        name: args.name,
        surname: args.surname,
        email: args.email,
        hash,
        roleId: 1, // Admin
        orgId,
      },
    },
  );
  return (result as any[])[0].id;
}

function parseArgs(rawArgs: string[]): ParsedArgs {
  const inputOrgId = rawArgs.find((a) => /^\d+$/.test(a));
  const outputFileArg = rawArgs.find((a) => a.startsWith("--output-file="));
  const emailArg = rawArgs.find((a) => a.startsWith("--email="));
  const passwordArg = rawArgs.find((a) => a.startsWith("--password="));
  const nameArg = rawArgs.find((a) => a.startsWith("--name="));
  const surnameArg = rawArgs.find((a) => a.startsWith("--surname="));

  return {
    inputOrgId,
    outputFile: outputFileArg ? outputFileArg.split("=")[1] : undefined,
    email: emailArg ? emailArg.split("=")[1] : ADMIN_EMAIL,
    password: passwordArg ? passwordArg.split("=")[1] : ADMIN_PASSWORD,
    name: nameArg ? nameArg.split("=")[1] : ADMIN_NAME,
    surname: surnameArg ? surnameArg.split("=")[1] : ADMIN_SURNAME,
  };
}

function writeCredentialsFile(
  path: string,
  credentials: { orgId: number | null; userId: number; email: string; password: string },
): void {
  writeFileSync(path, JSON.stringify(credentials), { mode: 0o600 });
  chmodSync(path, 0o600);
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);

  const existingUserId = await findExistingUser(args.email);
  if (existingUserId !== null) {
    // Re-seed the same user so credentials stay stable across runs.
    const [rows] = await sequelize.query(
      `SELECT organization_id FROM verifywise.users WHERE id = :id`,
      { replacements: { id: existingUserId } },
    );
    const existingOrgId = (rows as any[])[0]?.organization_id ?? null;
    const credentials = {
      orgId: existingOrgId,
      userId: existingUserId,
      email: args.email,
      password: args.password,
    };
    if (args.outputFile) {
      writeCredentialsFile(args.outputFile, credentials);
    }
    console.log(
      JSON.stringify({
        orgId: existingOrgId,
        userId: existingUserId,
        email: args.email,
        credentialsFile: args.outputFile || null,
      }),
    );
    return;
  }

  let orgId: number;
  if (args.inputOrgId) {
    orgId = parseInt(args.inputOrgId, 10);
  } else {
    const orgName = process.env.E2E_ORG_NAME || `E2E Org ${Date.now()}`;
    orgId = await createOrganization(orgName);
  }

  const userId = await createAdminUser(orgId, args);
  const credentials = {
    orgId,
    userId,
    email: args.email,
    password: args.password,
  };
  if (args.outputFile) {
    writeCredentialsFile(args.outputFile, credentials);
  }

  console.log(
    JSON.stringify({
      orgId,
      userId,
      email: args.email,
      credentialsFile: args.outputFile || null,
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
