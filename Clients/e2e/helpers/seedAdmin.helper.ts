import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, unlinkSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVERS_DIR = path.resolve(__dirname, "../../../Servers");

/**
 * Seed (or re-seed) an Admin into an organization through
 * Servers/scripts/seedE2EAdmin.ts and return its credentials. The script
 * writes the password to a restricted temp file rather than to stdout; the
 * file is read once and deleted. Shared by every setup project that needs its
 * own auth state.
 *
 * The script finds an existing admin by email and returns it whatever org it
 * is in, so a setup that needs an admin of a different org must pass its own
 * `--email=` in extraArgs; otherwise the two setups share one user and
 * whichever runs first decides the org for both.
 */
export interface SeedOutput {
  orgId: number;
  userId: number;
  email: string;
  password: string;
  credentialsFile: string | null;
}

const E2E_NODE_ENV = process.env.E2E_NODE_ENV || "test";

export function seedAdminInOrg(orgId: number, extraArgs: string[] = []): SeedOutput {
  // seedE2EAdmin.ts connects via Servers/database/db.ts, whose config resolves
  // DB_* with Servers/database/config/loadEnv.js: under NODE_ENV=test, exported
  // env > Servers/.env.test > Servers/.env. The backend (index.ts) uses the
  // same loader, so a backend started with NODE_ENV=test and this seed reach
  // the same database. Copying .env.test over the child env here (as this
  // helper used to) made .env.test beat an exported DB_NAME for the seed only.
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: E2E_NODE_ENV };

  const tmpDir = mkdtempSync(path.join(tmpdir(), "vw-e2e-"));
  const credentialsFile = path.join(tmpDir, "e2e-credentials.json");

  const stdout = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "ts-node",
      "scripts/seedE2EAdmin.ts",
      String(orgId),
      `--output-file=${credentialsFile}`,
      ...extraArgs,
    ],
    {
      cwd: SERVERS_DIR,
      encoding: "utf-8",
      env,
      shell: true,
    },
  );
  const lastLine = stdout.trim().split("\n").pop() || "";
  const metadata = JSON.parse(lastLine) as Omit<SeedOutput, "password">;

  if (!metadata.credentialsFile) {
    throw new Error("seedE2EAdmin did not write a credentials file");
  }

  const credentials = JSON.parse(readFileSync(metadata.credentialsFile, "utf-8")) as SeedOutput;

  // Clean up the temporary credentials file as soon as we've read it.
  try {
    unlinkSync(metadata.credentialsFile);
  } catch {
    // Best-effort cleanup; don't fail the setup if the file is already gone.
  }

  return credentials;
}
