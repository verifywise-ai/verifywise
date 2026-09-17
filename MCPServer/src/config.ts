/**
 * Deployment profile resolution.
 *
 * VerifyWise runs as separate deployments, so the target URL and API token are
 * not baked into the server. They live in a profile file owned by whoever
 * installs it:
 *
 *   {
 *     "profiles": {
 *       "acme": { "url": "https://acme.verifywise.ai", "token": "..." }
 *     }
 *   }
 *
 * Every tool call names its profile. There is no default and no fallback: a
 * call either names a deployment that exists or it fails.
 *
 * The file is read on every tool call rather than cached at startup, so adding
 * a deployment takes effect without restarting the MCP client. Tokens never
 * leave this process: tools take a profile NAME, never a credential.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Profile {
  name: string;
  url: string;
  token: string;
}

/** How a deployment is named in error messages. */
export function deploymentLabel(profile: Profile): string {
  return `${profile.name} (${profile.url})`;
}

interface ProfileFile {
  profiles?: Record<string, { url?: unknown; token?: unknown }>;
}

export const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".verifywise", "mcp.json");

const EXAMPLE = `{
  "profiles": {
    "acme": { "url": "https://acme.verifywise.ai", "token": "<api token>" }
  }
}`;

/**
 * Config file location: `--config <path>` if given, otherwise
 * ~/.verifywise/mcp.json.
 */
export function configPath(argv: string[] = process.argv): string {
  const i = argv.indexOf("--config");
  if (i !== -1) {
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--config requires a file path");
    }
    return value;
  }
  return DEFAULT_CONFIG_PATH;
}

function parseUrl(raw: unknown, profileName: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`Profile "${profileName}" is missing a "url".`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error(`Profile "${profileName}" has an invalid url: ${raw}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Profile "${profileName}" must use http or https, got "${parsed.protocol}".`);
  }
  // Normalised so callers can append "/api/..." without doubling slashes.
  return raw.trim().replace(/\/+$/, "");
}

export function loadProfiles(file: string = configPath()): Map<string, Profile> {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error(`No VerifyWise profile file at ${file}. Create it with:\n\n${EXAMPLE}`);
  }

  let parsed: ProfileFile;
  try {
    parsed = JSON.parse(raw) as ProfileFile;
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${(error as Error).message}`);
  }

  const entries = parsed.profiles;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new Error(`${file} must contain a "profiles" object. Expected:\n\n${EXAMPLE}`);
  }

  const profiles = new Map<string, Profile>();
  for (const [name, value] of Object.entries(entries)) {
    if (!value || typeof value !== "object") {
      throw new Error(`Profile "${name}" must be an object with "url" and "token".`);
    }
    if (typeof value.token !== "string" || value.token.trim() === "") {
      throw new Error(`Profile "${name}" is missing a "token".`);
    }
    profiles.set(name, { name, url: parseUrl(value.url, name), token: value.token.trim() });
  }

  if (profiles.size === 0) {
    throw new Error(`${file} defines no profiles. Expected:\n\n${EXAMPLE}`);
  }

  return profiles;
}

/**
 * Resolve the deployment a tool call targets.
 *
 * The name is required and must match a defined profile. Nothing is inferred:
 * guessing here means writing to the wrong customer's deployment.
 */
export function resolveProfile(name: string, file: string = configPath()): Profile {
  const profiles = loadProfiles(file);

  const profile = profiles.get(name);
  if (!profile) {
    const available = [...profiles.keys()].join(", ");
    throw new Error(`Unknown profile "${name}". Available profiles: ${available}`);
  }
  return profile;
}
