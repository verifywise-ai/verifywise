/**
 * SSRF hardening for user-configured outbound URLs.
 *
 * Several extensions (mlflow, azure-ai-foundry, jira-assets) let an org
 * admin store a URL and then the backend `fetch()`es it. That is an SSRF
 * primitive by construction — CodeQL flags the fetch call sites as
 * "URL depends on a user-provided value". This helper is the single choke
 * point for validating those URLs before they hit `fetch()`.
 *
 * VerifyWise runs on-prem in many deployments, so we can't simply block all
 * private IP space — a user's MLflow / JIRA Data Center server frequently
 * IS on 10.x, 172.16.x, or 192.168.x. What we DO block:
 *
 *   • Non-http(s) protocols (file:, gopher:, ftp:, dict:, jar:, …).
 *   • Cloud metadata endpoints (169.254.169.254 AWS/GCP, fd00:ec2::254 IPv6).
 *   • 0.0.0.0 / [::] / :: (kernel wildcards; often route to loopback).
 *   • URLs with embedded credentials (`https://user:pass@host/…`) — those
 *     get logged and leaked in error messages; the extension config carries
 *     credentials separately.
 *
 * The returned string has any trailing slashes removed via a bounded
 * quantifier to sidestep the ReDoS finding on the previous
 * `/\/+$/` regex.
 */

const BLOCKED_HOSTS = new Set<string>([
  // Cloud instance metadata (AWS, GCP, Azure IMDS). Node's WHATWG URL
  // keeps IPv6 hostnames wrapped in brackets, so store the bracketed form.
  "169.254.169.254",
  "[fd00:ec2::254]",
  // Kernel wildcards — often loopback in practice.
  "0.0.0.0",
  "[::]",
]);

export class UnsafeOutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeOutboundUrlError";
  }
}

/**
 * Validate a user-configured outbound URL and return it normalized
 * (protocol + host preserved, trailing slashes trimmed).
 *
 * Throws `UnsafeOutboundUrlError` on any policy violation. Callers should
 * surface that as a 400 to the user, not a 500.
 */
export function assertSafeOutboundUrl(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new UnsafeOutboundUrlError("URL is required");
  }
  // Bounded trim (max 32 trailing slashes) — sidesteps ReDoS while covering
  // any realistic input.
  const trimmed = raw.replace(/\/{1,32}$/, "");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UnsafeOutboundUrlError(`URL is not parseable: ${raw}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeOutboundUrlError(
      `URL protocol '${parsed.protocol}' is not allowed (only http/https)`,
    );
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new UnsafeOutboundUrlError(
      "URL must not embed credentials (use the extension's dedicated auth fields)",
    );
  }

  // hostname is URL-normalized (lowercase, IPv6 brackets stripped).
  const host = parsed.hostname;
  if (!host) {
    throw new UnsafeOutboundUrlError("URL has no hostname");
  }
  if (BLOCKED_HOSTS.has(host)) {
    throw new UnsafeOutboundUrlError(
      `URL host '${host}' is not allowed (cloud metadata / wildcard target)`,
    );
  }

  // Preserve pathname, search, and hash verbatim — the caller may have
  // baked query strings (e.g. `?api-version=v1`) into the URL and losing
  // them would silently break the API contract. Only strip trailing
  // slashes on the pathname component so appended sub-paths stay clean.
  const trimmedPath = parsed.pathname.replace(/\/{1,32}$/, "");
  return `${parsed.protocol}//${parsed.host}${trimmedPath}${parsed.search}${parsed.hash}`;
}

/**
 * Compose a fetch URL from a user-provided base and a fixed
 * caller-controlled path suffix, running the base through
 * `assertSafeOutboundUrl` first. Prefer this over string-concatenating
 * with a raw config value so every outbound fetch has a validation seam.
 */
export function composeSafeOutboundUrl(base: string, path: string): string {
  const safeBase = assertSafeOutboundUrl(base);
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${safeBase}${safePath}`;
}
