export class JiraIncidentsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraIncidentsValidationError";
  }
}

const OVERRIDE_VAR = "JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const SITE_URL_MESSAGE =
  "Enter your Jira Cloud site URL, for example https://your-company.atlassian.net";

/** The local-URL override counts only in development and test. */
export function localSiteUrlAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env[OVERRIDE_VAR] === "true" && (env.NODE_ENV === "development" || env.NODE_ENV === "test")
  );
}

export function warnIfLocalOverrideIgnored(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = console.warn,
): void {
  if (env[OVERRIDE_VAR] === "true" && !localSiteUrlAllowed(env)) {
    warn(
      `${OVERRIDE_VAR} is ignored outside development and test (NODE_ENV=${env.NODE_ENV ?? "unset"}).`,
    );
  }
}

export function normalizeSiteUrl(raw: unknown, env: NodeJS.ProcessEnv = process.env): string {
  if (typeof raw !== "string" || raw.trim() === "")
    throw new JiraIncidentsValidationError(SITE_URL_MESSAGE);
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new JiraIncidentsValidationError(SITE_URL_MESSAGE);
  }
  if (url.username || url.password) throw new JiraIncidentsValidationError(SITE_URL_MESSAGE);
  const host = url.hostname.toLowerCase();
  const isLocal = LOCAL_HOSTS.has(host) && localSiteUrlAllowed(env);
  if (isLocal) {
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new JiraIncidentsValidationError(SITE_URL_MESSAGE);
    return `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`;
  }
  const label = host.endsWith(".atlassian.net") ? host.slice(0, -".atlassian.net".length) : "";
  if (url.protocol !== "https:" || !/^[a-z0-9][a-z0-9-]*$/.test(label) || url.port) {
    throw new JiraIncidentsValidationError(SITE_URL_MESSAGE);
  }
  return `https://${host}`;
}
