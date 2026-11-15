/**
 * SSRF hardening for user-configured outbound URLs.
 *
 * Several extensions (mlflow, azure-ai-foundry, jira-assets, jira-incidents)
 * let an org admin store a URL and then the backend fetches it. That is an
 * SSRF primitive by construction. This module is the single choke point:
 * every outbound call to a user-configured address goes through `safeFetch`
 * or `safeFetchWithBase`.
 *
 * Policy
 * ------
 * VerifyWise runs on-prem in many deployments, and a customer's MLflow or
 * Jira Data Center server is often on 10.x, 172.16.x or 192.168.x, so
 * private ranges are allowed by default. What is always refused:
 *
 *   • Non-http(s) protocols (file:, gopher:, ftp:, dict:, jar:, …).
 *   • URLs with embedded credentials (`https://user:pass@host/…`); the
 *     extension config carries credentials in its own fields.
 *   • Loopback: 127.0.0.0/8, ::1, and the `localhost` / `*.localhost` names.
 *   • Link-local: 169.254.0.0/16 (covers the AWS/GCP/Azure metadata service
 *     at 169.254.169.254 and the ECS task endpoint at 169.254.170.2) and
 *     fe80::/10.
 *   • Unspecified / "this network": 0.0.0.0/8 and ::.
 *   • Cloud metadata: fd00:ec2::254 and the name `metadata.google.internal`.
 *   • The same IPv4 ranges written as IPv4-mapped (::ffff:a.b.c.d),
 *     IPv4-compatible (::a.b.c.d) or NAT64 (64:ff9b::a.b.c.d) IPv6, in any
 *     notation (WHATWG URL parsing canonicalises hex, octal and integer
 *     IPv4 forms before the check).
 *   • HTTP redirects: requests use `redirect: "manual"` and any 3xx is a
 *     failure, so an allowed host cannot bounce the request elsewhere.
 *
 * Environment flags:
 *   • OUTBOUND_BLOCK_PRIVATE_NETWORKS=true also refuses 10.0.0.0/8,
 *     172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10 (carrier-grade NAT) and
 *     fc00::/7. Meant for hosted deployments; off by default.
 *   • OUTBOUND_ALLOW_LOOPBACK=true allows loopback (only loopback, never
 *     link-local or metadata) for local development and tests that run fake
 *     servers on 127.0.0.1. Never set it on a shared deployment.
 *
 * Where the checks run
 * --------------------
 * `assertSafeOutboundUrl` is synchronous and checks what the URL itself
 * says: protocol, credentials, blocked host names, and IP literals.
 * A host name is only checked after DNS: `safeFetch` sends every request
 * through an undici Agent whose `connect.lookup` resolves the name, checks
 * every returned address against the policy, and refuses the connection if
 * any is blocked. The check runs on the same resolution the socket connects
 * to, so a name that re-resolves between a check and the connect (DNS
 * rebinding) cannot slip through. Node skips `lookup` for IP literals, which
 * is why `assertSafeOutboundUrl` checks those itself. Requests use undici's
 * own `fetch` with that dispatcher, not the global fetch, so the Agent and
 * fetch come from the same undici build.
 *
 * Errors are `UnsafeOutboundUrlError`; the message names the reason
 * ("resolves to a loopback address") but never the resolved address.
 *
 * -----------------------------------------------------------------------
 * On the CodeQL `js/request-forgery` alert on `safeFetch`'s fetch call:
 * -----------------------------------------------------------------------
 * CodeQL's taint tracker does not recognise custom runtime sanitizers.
 * The user-configured URL flows through `assertSafeOutboundUrl` and out
 * to `fetch()`, and no matter which module contains the fetch call,
 * CodeQL will report "URL depends on a user-provided value".
 *
 * The only sanitizer patterns CodeQL recognises are (a) a static host
 * allowlist and (b) a fully hard-coded URL. Neither applies here — the
 * whole point of these extensions is that an admin points them at
 * their MLflow / JIRA / Azure endpoint, which we cannot ship a static
 * allowlist for.
 *
 * Accepted risk, gated by:
 *   • Extension config mutation requires Admin role (see
 *     `Servers/routes/extension.route.ts` — `authorize(["Admin"])`).
 *   • Every outbound call goes through the policy above.
 *   • Extensions themselves are opt-in per organization.
 *
 * This file is excluded from CodeQL analysis via the inline
 * `config: paths-ignore:` block in `.github/workflows/codeql.yml`
 * (same justification, one entry). GitHub Code Scanning does not honour
 * inline `// lgtm[…]` / `// codeql[…]` suppression comments — the
 * workflow-level config is the supported mechanism. If a
 * `js/request-forgery` alert on this file appears anyway (e.g. on a
 * legacy scan run before the config was picked up), dismiss it in the
 * GitHub UI as "Won't fix — used safely" and cite this header.
 */

import dns from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

/**
 * Why a URL was refused, for callers that word their own message:
 * `invalid-url` (missing, unparseable, not http(s), or no host), `credentials`
 * (user name or password in the URL), `blocked-address` (the host or an
 * address it resolves to is refused by the policy), `redirect` (the server
 * answered with a redirect).
 */
export type UnsafeOutboundUrlCode = "invalid-url" | "credentials" | "blocked-address" | "redirect";

export class UnsafeOutboundUrlError extends Error {
  constructor(
    message: string,
    readonly code: UnsafeOutboundUrlCode,
  ) {
    super(message);
    this.name = "UnsafeOutboundUrlError";
  }
}

type BlockReason = "loopback" | "link-local" | "unspecified" | "metadata" | "private";

const REASON_LABEL: Record<BlockReason, string> = {
  loopback: "a loopback address",
  "link-local": "a link-local address",
  unspecified: "an unspecified address",
  metadata: "a cloud metadata address",
  private: "a private network address",
};

/** Host names refused before any DNS lookup. */
const METADATA_HOSTS = new Set(["metadata.google.internal"]);

/**
 * IPv4 ranges per reason. Each is also added in its IPv4-mapped
 * (::ffff:0:0/96), IPv4-compatible (::/96) and NAT64 (64:ff9b::/96) form.
 */
const IPV4_RANGES: Record<BlockReason, Array<[string, number]>> = {
  loopback: [["127.0.0.0", 8]],
  "link-local": [["169.254.0.0", 16]],
  unspecified: [["0.0.0.0", 8]],
  metadata: [],
  private: [
    ["10.0.0.0", 8],
    ["172.16.0.0", 12],
    ["192.168.0.0", 16],
    ["100.64.0.0", 10],
  ],
};

const IPV6_RANGES: Record<BlockReason, Array<[string, number]>> = {
  loopback: [["::1", 128]],
  "link-local": [["fe80::", 10]],
  unspecified: [["::", 128]],
  metadata: [["fd00:ec2::254", 128]],
  private: [["fc00::", 7]],
};

const IPV6_EMBEDDING_PREFIXES = ["::ffff:", "::", "64:ff9b::"];

function buildBlockList(reason: BlockReason): BlockList {
  const list = new BlockList();
  for (const [network, prefix] of IPV4_RANGES[reason]) {
    list.addSubnet(network, prefix, "ipv4");
    for (const embed of IPV6_EMBEDDING_PREFIXES) {
      list.addSubnet(`${embed}${network}`, 96 + prefix, "ipv6");
    }
  }
  for (const [network, prefix] of IPV6_RANGES[reason]) {
    list.addSubnet(network, prefix, "ipv6");
  }
  return list;
}

// Checked in this order, so an address in two lists gets the more specific
// reason: fd00:ec2::254 is "metadata", not "private", and ::1 is "loopback"
// (so OUTBOUND_ALLOW_LOOPBACK covers it), not the IPv4-compatible form of
// 0.0.0.1 in the "unspecified" range.
const BLOCK_LISTS: Array<[BlockReason, BlockList]> = (
  ["metadata", "loopback", "unspecified", "link-local", "private"] as BlockReason[]
).map((reason) => [reason, buildBlockList(reason)]);

function isEnabled(name: string, env: NodeJS.ProcessEnv): boolean {
  return env[name] === "true";
}

/**
 * Why an IP address is refused under the current environment, or null if
 * it is allowed. `address` must be a bare IPv4 or IPv6 address.
 */
export function blockedAddressReason(
  address: string,
  env: NodeJS.ProcessEnv = process.env,
): BlockReason | null {
  const family = isIP(address);
  if (family === 0) return null;
  const type = family === 4 ? "ipv4" : "ipv6";
  for (const [reason, list] of BLOCK_LISTS) {
    if (!list.check(address, type)) continue;
    if (reason === "loopback" && isEnabled("OUTBOUND_ALLOW_LOOPBACK", env)) return null;
    if (reason === "private" && !isEnabled("OUTBOUND_BLOCK_PRIVATE_NETWORKS", env)) return null;
    return reason;
  }
  return null;
}

function unsafeTarget(reason: BlockReason): UnsafeOutboundUrlError {
  const suffix = reason === "private" ? "which this deployment blocks" : "which is not allowed";
  return new UnsafeOutboundUrlError(
    `The URL resolves to ${REASON_LABEL[reason]}, ${suffix}`,
    "blocked-address",
  );
}

/** Static check of a URL host name: blocked names and IP literals. */
function blockedHostReason(hostname: string, env: NodeJS.ProcessEnv): BlockReason | null {
  // WHATWG URL keeps IPv6 literals in brackets and lowercases names; a
  // trailing dot is the same DNS name.
  const host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (METADATA_HOSTS.has(host)) return "metadata";
  if (host === "localhost" || host.endsWith(".localhost")) {
    return isEnabled("OUTBOUND_ALLOW_LOOPBACK", env) ? null : "loopback";
  }
  return blockedAddressReason(host, env);
}

/**
 * Validate a user-configured outbound URL and return it normalized
 * (protocol + host preserved, trailing slashes trimmed).
 *
 * Synchronous: checks protocol, embedded credentials, blocked host names
 * and IP literals. Host names are checked again after DNS resolution inside
 * `safeFetch`.
 *
 * Throws `UnsafeOutboundUrlError` on any policy violation. Callers should
 * surface that as a 400 to the user, not a 500.
 */
export function assertSafeOutboundUrl(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new UnsafeOutboundUrlError("URL is required", "invalid-url");
  }
  // Bounded trim (max 32 trailing slashes) — sidesteps ReDoS while covering
  // any realistic input.
  const trimmed = raw.replace(/\/{1,32}$/, "");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UnsafeOutboundUrlError(`URL is not parseable: ${raw}`, "invalid-url");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeOutboundUrlError(
      `URL protocol '${parsed.protocol}' is not allowed (only http/https)`,
      "invalid-url",
    );
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new UnsafeOutboundUrlError(
      "URL must not embed credentials (use the extension's dedicated auth fields)",
      "credentials",
    );
  }

  if (!parsed.hostname) {
    throw new UnsafeOutboundUrlError("URL has no hostname", "invalid-url");
  }
  const reason = blockedHostReason(parsed.hostname, process.env);
  if (reason) throw unsafeTarget(reason);

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

type AllAddressesCallback = (err: null, addresses: dns.LookupAddress[]) => void;

/**
 * `net.connect` lookup that resolves a host name and refuses the
 * connection when any returned address is blocked. Handles both callback
 * shapes Node uses (one address, or the full list when `all: true`, which
 * happy-eyeballs connects ask for).
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    if (addresses.length === 0) {
      const notFound = Object.assign(new Error(`No addresses for ${hostname}`), {
        code: "ENOTFOUND",
      });
      return callback(notFound, "", 0);
    }
    for (const entry of addresses) {
      const reason = blockedAddressReason(entry.address);
      if (reason) return callback(unsafeTarget(reason), "", 0);
    }
    if (options.all) {
      // Node's typings only describe the one-address callback; with
      // `all: true` net.connect expects the list.
      (callback as unknown as AllAddressesCallback)(null, addresses);
      return;
    }
    callback(null, addresses[0].address, addresses[0].family);
  });
};

const outboundAgent = new Agent({ connect: { lookup: guardedLookup } });

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Validated `fetch` wrapper for user-configured outbound URLs.
 *
 * All outbound HTTP calls from an extension to a user-configured endpoint
 * (mlflow tracking server, azure project endpoint, jira base URL, etc.)
 * MUST go through this helper. It:
 *
 *   1. Runs the URL through `assertSafeOutboundUrl` (protocol, credentials,
 *      blocked names, IP literals).
 *   2. Connects through an Agent that checks every resolved address
 *      (see the file header).
 *   3. Refuses redirects: a 3xx answer throws instead of being followed.
 *
 * Throws `UnsafeOutboundUrlError` on policy violation. Callers should
 * catch and surface it as a 400 to the user; anything else is left for
 * the caller's own error handling.
 */
export async function safeFetch(rawUrl: string, init?: RequestInit): Promise<Response> {
  const safeUrl = assertSafeOutboundUrl(rawUrl);
  let response;
  try {
    response = await undiciFetch(safeUrl, {
      ...(init as UndiciRequestInit),
      redirect: "manual",
      dispatcher: outboundAgent,
    });
  } catch (err) {
    // A refused lookup surfaces as `TypeError: fetch failed` with the
    // policy error as its cause.
    const cause = (err as { cause?: unknown })?.cause;
    if (cause instanceof UnsafeOutboundUrlError) throw cause;
    throw err;
  }
  if (REDIRECT_STATUSES.has(response.status)) {
    await response.body?.cancel().catch(() => undefined);
    throw new UnsafeOutboundUrlError(
      `The server answered with a redirect (HTTP ${response.status}), which is not followed`,
      "redirect",
    );
  }
  // undici's Response implements the same Fetch API the callers use.
  return response as unknown as Response;
}

/**
 * `safeFetch` variant that takes a validated base + path (mirrors
 * `composeSafeOutboundUrl`). Use when the caller already knows the API
 * path suffix separately from the user-supplied base.
 */
export async function safeFetchWithBase(
  base: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return safeFetch(composeSafeOutboundUrl(base, path), init);
}
