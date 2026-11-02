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

// "vw_source":"<value>" inside JSON.
const JSON_FIELD_RE = /"vw_source"\s*:\s*"([^"]*)"/;
// vw_source=<value> or vw_source="<value>" as a key=value pair.
const KV_FIELD_RE = /(?<![\w-])vw_source=(?:"([^"]*)"|([^\s"]*))/;

/** Remove body[start, end) plus one adjacent separator. */
function removeKvSpan(body: string, start: number, end: number): string {
  if (/\s/.test(body[end] ?? "")) return body.slice(0, start) + body.slice(end + 1);
  if (start > 0 && /\s/.test(body[start - 1])) {
    return body.slice(0, start - 1) + body.slice(end);
  }
  return body.slice(0, start) + body.slice(end);
}

function removeJsonSpan(body: string, start: number, end: number): string {
  const after = /^\s*,\s*/.exec(body.slice(end));
  if (after) return body.slice(0, start) + body.slice(end + after[0].length);
  const before = /\s*,\s*$/.exec(body.slice(0, start));
  if (before) return body.slice(0, start - before[0].length) + body.slice(end);
  return body.slice(0, start) + body.slice(end);
}

/**
 * Find the source key field, validate it and remove it from the line so it is
 * never stored. A malformed key yields `key: null` and leaves the line alone.
 */
export function extractSourceKey(body: string): {
  key: string | null;
  rest: string;
} {
  const json = JSON_FIELD_RE.exec(body);
  if (json) {
    if (!SOURCE_KEY_RE.test(json[1])) return { key: null, rest: body };
    const end = json.index + json[0].length;
    return { key: json[1], rest: removeJsonSpan(body, json.index, end) };
  }

  const kv = KV_FIELD_RE.exec(body);
  if (kv) {
    const value = kv[1] ?? kv[2] ?? "";
    if (!SOURCE_KEY_RE.test(value)) return { key: null, rest: body };
    const end = kv.index + kv[0].length;
    return { key: value, rest: removeKvSpan(body, kv.index, end) };
  }

  return { key: null, rest: body };
}
