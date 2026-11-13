/**
 * @fileoverview Public address helpers
 *
 * Works out the address outside callers (GitHub, email recipients) use to
 * reach this deployment, and whether a host is reachable from the internet.
 *
 * @module utils/publicUrl
 */

import net from "net";

/** Where a public base address came from. */
export type PublicBaseUrlSource = "API_PUBLIC_URL" | "client" | "FRONTEND_URL";

const MAX_URL_LENGTH = 500;

/** A trimmed http(s) URL without trailing slashes, or null when not usable. */
function normaliseHttpUrl(value: string | undefined | null): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return trimmed.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function isPrivateIpv4(host: string): boolean {
  const [a, b] = host.split(".").map(Number);
  return (
    a === 0 || // 0.0.0.0/8 ("this host")
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 carrier-grade NAT
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

function isPrivateIpv6(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "::" || lower === "::1") return true;

  // IPv4-mapped (::ffff:a.b.c.d, which URL parsing turns into ::ffff:xxxx:xxxx).
  const mapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const high = parseInt(mapped[1], 16);
    const low = parseInt(mapped[2], 16);
    return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if (lower.startsWith("::ffff:") && net.isIPv4(lower.slice(7))) {
    return isPrivateIpv4(lower.slice(7));
  }

  const firstHextet = parseInt(lower.split(":")[0] || "0", 16);
  return (
    (firstHextet & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (firstHextet & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (firstHextet & 0xff00) === 0xff00 // multicast
  );
}

/**
 * Whether GitHub (or anyone on the internet) could reach this host. False for
 * loopback, private, link-local and carrier-grade NAT addresses, single-label
 * names and names that only resolve on a local network or inside Docker.
 */
export function isPublicHostname(hostname: string): boolean {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!host) return false;

  if (net.isIPv4(host)) return !isPrivateIpv4(host);
  if (net.isIPv6(host)) return !isPrivateIpv6(host);

  if (!host.includes(".")) return false; // localhost, backend, intranet names
  return !/\.(localhost|local|internal|lan|home\.arpa)$/.test(host);
}

/**
 * The public base address of this deployment's API, used to build URLs that
 * outside services call (the GitHub webhook URL).
 *
 * Order:
 * 1. `API_PUBLIC_URL`, when the operator set the API's public address
 *    explicitly (needed when the API is on a different host from the app).
 * 2. The address the browser app talks to (`VITE_APP_API_BASE_URL`), passed
 *    in by the caller, when it is absolute and on a public host.
 * 3. `FRONTEND_URL`: deployments serve the API under the app's address
 *    (nginx proxies /api/ to the backend).
 * 4. The browser app's address even when it is not public, so the caller can
 *    still show it with a warning.
 *
 * Returns null when none of them is a usable http(s) URL. No localhost
 * fallback: a made-up address would look valid and be wrong.
 */
export function getPublicBaseUrl(
  options: { clientApiBaseUrl?: string | null } = {},
): { url: string; source: PublicBaseUrlSource } | null {
  const explicit = normaliseHttpUrl(process.env.API_PUBLIC_URL);
  if (explicit) return { url: explicit, source: "API_PUBLIC_URL" };

  const client = normaliseHttpUrl(options.clientApiBaseUrl);
  if (client && isPublicHostname(new URL(client).hostname)) {
    return { url: client, source: "client" };
  }

  const frontend = normaliseHttpUrl(process.env.FRONTEND_URL);
  if (frontend) return { url: frontend, source: "FRONTEND_URL" };

  return client ? { url: client, source: "client" } : null;
}
