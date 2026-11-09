/**
 * Syslog source keys.
 *
 * Format `vwsl_{organizationId}_{48 hex}`. Only the SHA-256 hash and a display
 * prefix are stored, the same pattern as Shadow AI API keys.
 */

import crypto from "crypto";

export const SOURCE_KEY_RE = /^vwsl_(\d+)_([a-f0-9]{48})$/;

const KEY_PREFIX_LENGTH = 16;

export function hashSourceKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateSourceKey(organizationId: number): {
  key: string;
  hash: string;
  prefix: string;
} {
  const key = `vwsl_${organizationId}_${crypto.randomBytes(24).toString("hex")}`;
  return {
    key,
    hash: hashSourceKey(key),
    prefix: key.slice(0, KEY_PREFIX_LENGTH),
  };
}

export function orgIdFromKey(key: string): number | null {
  const match = SOURCE_KEY_RE.exec(key);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

// A whole whitespace-delimited token `vw_source=<value>` or
// `vw_source="<value>"`. Only the first and the last token of the body count:
// text inside another field (a quoted user agent, a URL, a JSON string) never
// sits at either end, so it can never choose the organization.
const KV_TOKEN_RE = /^vw_source=(?:"([^"]*)"|([^"]*))$/;

function kvKey(token: string | undefined): string | null {
  if (!token) return null;
  const m = KV_TOKEN_RE.exec(token);
  const value = m ? (m[1] ?? m[2]) : undefined;
  return value && SOURCE_KEY_RE.test(value) ? value : null;
}

/** A top-level `"vw_source"` member when the whole body is one JSON object. */
function jsonKey(body: string): { key: string; rest: string } | null {
  const text = body.trim();
  if (!text.startsWith("{") || !text.endsWith("}")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const { vw_source: key, ...others } = parsed as Record<string, unknown>;
  if (typeof key !== "string" || !SOURCE_KEY_RE.test(key)) return null;
  return { key, rest: JSON.stringify(others) };
}

/**
 * Find the source key, validate it and remove it from the line so it is never
 * stored. Accepted places: the first or the last whitespace-delimited token
 * (`vw_source=<key>`), or a top-level `"vw_source"` member when the body is a
 * JSON object. Malformed candidates are ignored. Two different valid keys mean
 * the line cannot be attributed, so it yields `key: null`, as does a line with
 * no valid key; the line is then left alone.
 */
export function extractSourceKey(body: string): {
  key: string | null;
  rest: string;
} {
  const tokens = [...body.matchAll(/\S+/g)];
  const first = tokens[0];
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : undefined;
  const firstKey = kvKey(first?.[0]);
  const lastKey = kvKey(last?.[0]);

  if (!firstKey && !lastKey) return jsonKey(body) ?? { key: null, rest: body };
  if (firstKey && lastKey && firstKey !== lastKey) return { key: null, rest: body };

  // Cut the key token and the whitespace that joins it to the rest.
  const start = firstKey && first ? (tokens[1]?.index ?? body.length) : 0;
  let end = body.length;
  if (lastKey && last) {
    end = last.index;
    while (end > start && /\s/.test(body[end - 1])) end--;
  }
  return { key: (firstKey ?? lastKey) as string, rest: body.slice(start, end) };
}
