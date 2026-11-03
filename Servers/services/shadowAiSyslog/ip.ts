/**
 * IP address normalisation for comparing a connection's peer address with a
 * source's allowed sender IP.
 */

import net from "net";

const MAPPED_V4_HEX_RE = /^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/;

/**
 * IPv4-mapped IPv6 becomes IPv4; other IPv6 is lowercased and compressed.
 * Returns null for anything that is not an IP address (hostnames included).
 */
export function normalizeIp(ip: string): string | null {
  const value = ip.trim().split("%")[0];
  const family = net.isIP(value);
  if (family === 4) return value;
  if (family !== 6) return null;

  let hostname: string;
  try {
    hostname = new URL(`http://[${value}]`).hostname;
  } catch {
    return null;
  }

  // WHATWG URL rewrites ::ffff:a.b.c.d as ::ffff:hhhh:hhhh.
  const mapped = MAPPED_V4_HEX_RE.exec(hostname);
  if (mapped) {
    const hi = parseInt(mapped[1], 16);
    const lo = parseInt(mapped[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return hostname.slice(1, -1);
}
