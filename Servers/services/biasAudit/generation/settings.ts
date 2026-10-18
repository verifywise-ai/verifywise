export interface GatewaySettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Thrown when generation is attempted without the deployment variables. */
export class GatewayNotConfiguredError extends Error {
  readonly code = "gateway_not_configured" as const;
  /** Variable names only, never values. */
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Generation is not configured on this deployment: ${missing.join(", ")} unset.`);
    this.name = "GatewayNotConfiguredError";
    this.missing = missing;
  }
}

const VARIABLES = ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"] as const;

function read(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] ?? "").trim();
}

export function getGatewaySettings(env: NodeJS.ProcessEnv = process.env): GatewaySettings {
  const missing = VARIABLES.filter((n) => read(env, n) === "");
  if (missing.length > 0) throw new GatewayNotConfiguredError([...missing]);
  return {
    apiKey: read(env, "LLM_API_KEY"),
    baseUrl: read(env, "LLM_BASE_URL").replace(/\/+$/, ""),
    model: read(env, "LLM_MODEL"),
  };
}

export function isGatewayConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return VARIABLES.every((n) => read(env, n) !== "");
}
