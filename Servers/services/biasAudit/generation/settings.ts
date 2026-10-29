export interface GatewaySettings {
  baseUrl: string;
  /** Non-enumerable: absent from JSON.stringify, spread and util.inspect. */
  readonly apiKey: string;
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

/** Thrown when a variable is set but unusable. Names the variable, never the value. */
export class GatewayConfigError extends Error {
  readonly code = "gateway_config_invalid" as const;
  readonly variable: string;

  constructor(variable: string, reason: string) {
    super(`Generation is misconfigured on this deployment: ${variable} ${reason}.`);
    this.name = "GatewayConfigError";
    this.variable = variable;
  }
}

const KEY = "BIAS_AUDIT_LLM_API_KEY";
const URL_VAR = "BIAS_AUDIT_LLM_BASE_URL";
const MODEL = "BIAS_AUDIT_LLM_MODEL";
const VARIABLES = [KEY, URL_VAR, MODEL] as const;

function read(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] ?? "").trim();
}

export function getGatewaySettings(env: NodeJS.ProcessEnv = process.env): GatewaySettings {
  const missing = VARIABLES.filter((n) => read(env, n) === "");
  if (missing.length > 0) throw new GatewayNotConfiguredError([...missing]);

  const apiKey = read(env, KEY);
  if (!/^[\x21-\x7e]+$/.test(apiKey)) {
    throw new GatewayConfigError(KEY, "must be printable ASCII with no whitespace");
  }

  let parsed: URL;
  try {
    parsed = new URL(read(env, URL_VAR));
  } catch {
    throw new GatewayConfigError(URL_VAR, "is not a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new GatewayConfigError(URL_VAR, "must use https");
  }

  const settings = {
    baseUrl: parsed.toString().replace(/\/+$/, ""),
    model: read(env, MODEL),
  } as GatewaySettings;
  Object.defineProperty(settings, "apiKey", { value: apiKey, enumerable: false });
  const redacted = () => ({
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: "[redacted]",
  });
  Object.defineProperty(settings, "toJSON", { value: redacted, enumerable: false });
  Object.defineProperty(settings, Symbol.for("nodejs.util.inspect.custom"), {
    value: redacted,
    enumerable: false,
  });
  return settings;
}

export function isGatewayConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    getGatewaySettings(env);
    return true;
  } catch {
    return false;
  }
}
