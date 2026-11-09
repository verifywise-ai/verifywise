/**
 * The environment the E2E run points at. Anything other than a loopback host
 * is a deployed environment (staging, production), where the seeding setups
 * (global.setup.ts, risk-inheritance.setup.ts) must not run: they delete and
 * recreate organizations and seed data.
 *
 * Read lazily, so playwright.config.ts sees values loaded by dotenv.
 */
export function e2eBaseUrl(): string {
  return process.env.E2E_BASE_URL || "http://localhost:5173";
}

/** Same default as factories/api.factory.ts, which sends the seeding API calls here. */
export function e2eBackendUrl(): string {
  return process.env.E2E_BACKEND_URL || "http://localhost:3000";
}

/** Session saved by canary.setup.ts and loaded by the canary project. */
export const CANARY_AUTH_STATE_PATH = "e2e/.auth/canary.json";

/** null when the value is not an http(s) URL, e.g. "localhost:5173" without a scheme. */
function parseHttpUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0" ||
    /^127(\.\d{1,3}){3}$/.test(hostname)
  );
}

export function isDeployedTarget(baseUrl: string = e2eBaseUrl()): boolean {
  const parsed = parseHttpUrl(baseUrl);
  // An unparseable URL is treated as deployed, so the destructive setups refuse it
  return !parsed || !isLoopbackHost(parsed.hostname);
}

/**
 * Throws unless both the frontend and the backend the run talks to are local.
 * Call it first in every setup that creates, seeds or deletes data.
 * E2E_ALLOW_DEPLOYED_SETUP=1 lifts it for a disposable environment.
 */
export function assertNotDeployed(setupName: string): void {
  if (process.env.E2E_ALLOW_DEPLOYED_SETUP === "1") return;

  const targets = [
    ["E2E_BASE_URL", e2eBaseUrl()],
    ["E2E_BACKEND_URL", e2eBackendUrl()],
  ] as const;
  for (const [name, url] of targets) {
    if (!parseHttpUrl(url)) {
      throw new Error(
        `${name}=${url} is not an http(s) URL; include the scheme, e.g. http://${url}`,
      );
    }
    if (isDeployedTarget(url)) {
      throw new Error(
        `${setupName} refuses to run against ${name}=${url}: it deletes and recreates organizations. ` +
          "Run the canary project for deployed environments, or set E2E_ALLOW_DEPLOYED_SETUP=1 for a disposable one.",
      );
    }
  }
}
