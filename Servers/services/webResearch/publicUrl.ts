/**
 * The URL and address policy of the web research toolkit.
 *
 * The model chooses which URL the server requests, and it reads text that anyone can write, so
 * every URL passes `parsePublicUrl` and every address a host resolves to passes
 * `isPublicAddress` before a connection is made. This is deliberately not
 * `utils/safeOutboundUrl.ts`: that helper lets private ranges through on purpose (on-premises
 * MLflow and Jira servers), which is the opposite of what an untrusted URL needs.
 */
import net from "net";

export const MAX_URL_CHARS = 2048;

export type UnsafeUrlReason =
  "invalid_url" | "scheme" | "credentials" | "port" | "ip_literal" | "reserved_host";

/** Thrown for a URL the policy refuses. The message never repeats any part of the URL. */
export class UnsafeUrlError extends Error {
  constructor(
    readonly reason: UnsafeUrlReason,
    message: string,
  ) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const MESSAGES: Record<UnsafeUrlReason, string> = {
  invalid_url: "The address is not a valid web address.",
  scheme: "Only http and https addresses can be read.",
  credentials: "An address with a user name or password cannot be read.",
  port: "Only the standard web ports, 80 and 443, can be read.",
  ip_literal: "An address that names a server by its IP number cannot be read.",
  reserved_host: "The host name is not a public website.",
};

function refuse(reason: UnsafeUrlReason): UnsafeUrlError {
  return new UnsafeUrlError(reason, MESSAGES[reason]);
}

/** The URL parser gives "" for the scheme's own default port (80 for http, 443 for https). */
const ALLOWED_PORTS = new Set(["", "80", "443"]);

/** One label of a host name: letters, digits and inner hyphens, at most 63 characters. */
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Names that are reserved for private networks; a host on one of them is never a public website. */
const RESERVED_DOMAINS = ["localhost", "local", "internal", "home.arpa"];

/**
 * The URL without its fragment, or an UnsafeUrlError when the policy refuses it.
 *
 * The checks run in a fixed order, and the first one that fails gives the reason: length and
 * syntax, scheme, user name or password, port, IP address, then the shape of the host name. A
 * trailing dot on the host is removed. The URL parser has already lower-cased the host, turned an
 * internationalised name into punycode and turned every spelling of an IPv4 address (2130706433,
 * 0x7f.1) into dotted decimal, which is why `net.isIP` sees them.
 *
 * The length limit holds for the URL as it is written and as the parser writes it: a character
 * that a URL cannot carry is percent-encoded, which can make the address up to nine times as long.
 * So a URL this function returns passes it again.
 */
export function parsePublicUrl(raw: string): URL {
  if (typeof raw !== "string" || raw.length > MAX_URL_CHARS) throw refuse("invalid_url");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw refuse("invalid_url");
  }
  if (url.href.length > MAX_URL_CHARS) throw refuse("invalid_url");

  if (url.protocol !== "http:" && url.protocol !== "https:") throw refuse("scheme");
  if (url.username !== "" || url.password !== "") throw refuse("credentials");
  if (!ALLOWED_PORTS.has(url.port)) throw refuse("port");

  const host = url.hostname.endsWith(".") ? url.hostname.slice(0, -1) : url.hostname;
  if (host.startsWith("[") || net.isIP(host) !== 0) throw refuse("ip_literal");

  const labels = host.split(".");
  if (
    labels.length < 2 ||
    !labels.every((label) => HOST_LABEL.test(label)) ||
    RESERVED_DOMAINS.some((domain) => isOnDomain(host, domain))
  ) {
    throw refuse("reserved_host");
  }

  if (host !== url.hostname) url.hostname = host;
  url.hash = "";
  return url;
}

/**
 * The ranges that are not public, as listed in section 7.2 of the design. `::ffff:0:0/96` is
 * blocked as a whole, so an IPv4 address written in IPv6 form is refused whatever it holds. Three
 * more IPv6 prefixes carry an IPv4 address and are blocked for the same reason: an AAAA record
 * under one of them could reach an internal IPv4 address through a translator or a tunnel.
 *
 * There is one list per family, and an address is only checked against the list of its own
 * family. Node matches an IPv4 address against an IPv6 range as if it were IPv4-mapped, so in one
 * shared list `::ffff:0:0/96` would match every IPv4 address and nothing would be public.
 */
const BLOCKED_IPV4 = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED_IPV4.addSubnet(network, prefix, "ipv4");
}

const BLOCKED_IPV6 = new net.BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  // The deprecated IPv4-compatible form: ::7f00:1 is 127.0.0.1. It holds the two entries above.
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  // RFC 8215 local-use NAT64; the /96 above does not cover it.
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  // 6to4: the IPv4 address sits in bits 16 to 47.
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  // Site-local, deprecated by RFC 3879 but still routed inside some networks.
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED_IPV6.addSubnet(network, prefix, "ipv6");
}

/**
 * True only for a public, routable IPv4 or IPv6 address. Anything that is not an IP address, such
 * as a host name, an empty string or an address with a zone id ("fe80::1%eth0"), is false.
 */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0 || address.includes("%")) return false;
  return family === 4 ? !BLOCKED_IPV4.check(address, "ipv4") : !BLOCKED_IPV6.check(address, "ipv6");
}

/**
 * True when `host` is `domain` or a subdomain of it. Both are lower-cased and lose one trailing
 * dot first, and whole labels are compared: "acme.com.evil.example" and "notacme.com" are not on
 * "acme.com". An empty host or domain is never on anything.
 */
export function isOnDomain(host: string, domain: string): boolean {
  const normalisedHost = normaliseName(host);
  const normalisedDomain = normaliseName(domain);
  if (normalisedHost === "" || normalisedDomain === "") return false;
  return normalisedHost === normalisedDomain || normalisedHost.endsWith(`.${normalisedDomain}`);
}

function normaliseName(name: string): string {
  const lower = name.toLowerCase();
  return lower.endsWith(".") ? lower.slice(0, -1) : lower;
}
