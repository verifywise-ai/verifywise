/**
 * Log line parsers for the Shadow AI syslog listener.
 *
 * Each parser is a pure function of the message body (source key already
 * removed). It returns an event in the REST ingestion shape or a drop reason.
 * Timestamp order: payload field, then syslog header, then receive time.
 */

import { isEmail } from "../../utils/validations/email.utils";
import { SHADOW_AI_EVENT_LIMITS } from "../../utils/shadowAiEventLimits";
import { ParseResult, ParserType, SyslogEvent } from "./types";

type Fields = Record<string, string>;

// Quoted values honour backslash escapes; unquoted values may contain `\=` and
// other escaped characters (CEF).
const KV_PAIR_RE = /(?<=^|[\s|])([A-Za-z_][\w.-]*)=(?:"((?:[^"\\]|\\.)*)"|((?:[^\s\\]|\\.)*))/g;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

const BLOCKED_ACTIONS = ["block", "deny", "denied", "drop", "reset", "reject"];
const ALLOWED_ACTIONS = ["allow", "permit", "pass", "accept"];

// Netskope verdicts outside allow/block. Alerts and bypassed coaching let the
// request through; the restrict actions stopped what the user tried to do.
const NETSKOPE_VERDICTS: Record<string, "allow" | "block"> = {
  alert: "allow",
  useralert: "allow",
  bypass: "allow",
  restricttoview: "block",
  restrictaccess: "block",
  disabledownload: "block",
};

function netskopeVerdict(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  return NETSKOPE_VERDICTS[raw.trim().toLowerCase()] ?? raw;
}

// Keys that become event fields. A line repeating one of them is ambiguous:
// free text (a user agent, a URL) placed before the real key could supply the
// value that wins, or an attacker could append a second one. Such a line is
// rejected rather than guessing which copy is real.
const EVENT_KEYS = new Set([
  "user",
  "suser",
  "dst",
  "dhost",
  "uri",
  "request",
  "action",
  "act",
  "method",
  "requestMethod",
  "department",
  "timestamp",
]);

function unescapeValue(raw: string): string {
  return raw.replace(/\\(.)/g, "$1");
}

// CEF header: `CEF:0|Vendor|Product|Version|SignatureId|Name|Severity|`. The
// extension (key=value pairs) follows the seventh pipe. Header fields escape a
// literal pipe as `\|`.
const CEF_HEADER_RE = /^CEF:\d+(?:\|(?:[^|\\]|\\.)*){6}\|/;
// A CEF extension key sits at the start or after whitespace and ends at `=`.
const CEF_KEY_RE = /(?:^|\s)([A-Za-z_][\w.-]*)=/g;

/**
 * CEF extension pairs. Unlike plain key=value, a CEF value may contain
 * spaces (only `=` and `\` are escaped), so a value runs until the next
 * ` key=`. Quotes have no meaning in CEF and are kept as written.
 */
function parseCefExtension(extension: string): Fields | null {
  const fields: Fields = {};
  const keys = [...extension.matchAll(CEF_KEY_RE)];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i][1];
    const valueStart = keys[i].index! + keys[i][0].length;
    const valueEnd = i + 1 < keys.length ? keys[i + 1].index! : extension.length;
    if (key in fields) {
      if (EVENT_KEYS.has(key)) return null;
      continue;
    }
    fields[key] = unescapeValue(extension.slice(valueStart, valueEnd).trimEnd());
  }
  return fields;
}

/** Key=value pairs, or null when an event key appears more than once. */
function parseKeyValues(body: string, cef = false): Fields | null {
  const header = cef ? CEF_HEADER_RE.exec(body) : null;
  if (header) return parseCefExtension(body.slice(header[0].length));
  const fields: Fields = {};
  for (const m of body.matchAll(KV_PAIR_RE)) {
    const key = m[1];
    if (key in fields) {
      if (EVENT_KEYS.has(key)) return null;
      continue;
    }
    fields[key] = unescapeValue(m[2] ?? m[3] ?? "");
  }
  return fields;
}

/** Normalised host of a bare host field (`dst`, `dhost`), or undefined. */
function hostField(raw: unknown): string | undefined {
  const value = nonEmpty(raw);
  return value ? (hostAndPath(value)?.host ?? undefined) : undefined;
}

/** Host and path of a URL, or of a bare `host[:port][/path]` string. */
function hostAndPath(raw: string): { host: string; path?: string } | null {
  try {
    const url = new URL(SCHEME_RE.test(raw) ? raw : `http://${raw}`);
    const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (!host) return null;
    return {
      host: host.toLowerCase(),
      path: url.pathname !== "/" ? url.pathname : undefined,
    };
  } catch {
    return null;
  }
}

function normalizeAction(raw: unknown): SyslogEvent["action"] {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  if (BLOCKED_ACTIONS.some((a) => value.startsWith(a))) return "blocked";
  if (ALLOWED_ACTIONS.some((a) => value.startsWith(a))) return "allowed";
  return undefined;
}

// Column widths of shadow_ai_events (tenant-tables migration). A value over
// its column fails the multi-row insert and loses the whole batch, so every
// field is bounded here. Lengths are in characters, as VARCHAR counts them.
const MAX_EMAIL_CHARS = SHADOW_AI_EVENT_LIMITS.user_email;
const MAX_DESTINATION_CHARS = SHADOW_AI_EVENT_LIMITS.destination;
const MAX_DEPARTMENT_CHARS = SHADOW_AI_EVENT_LIMITS.department;
const MAX_METHOD_CHARS = SHADOW_AI_EVENT_LIMITS.http_method;
// TEXT column; a longer path is left out (it is optional) to keep rows small.
const MAX_URI_PATH_CHARS = SHADOW_AI_EVENT_LIMITS.uri_path;
// Payload and header timestamps are ignored when they are more than a year
// before the receive time, or more than a day after it (clock skew only; a
// far-future epoch would otherwise be stored as year +275760).
const MAX_TIMESTAMP_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_TIMESTAMP_AHEAD_MS = 24 * 60 * 60 * 1000;

const charLength = (value: string): number => [...value].length;

/** Remove NUL characters, which PostgreSQL text columns reject. */
const stripNul = (value: string): string => value.replace(/\u0000/g, "");

function normalizeMethod(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = stripNul(raw).trim().toUpperCase();
  return value.length <= MAX_METHOD_CHARS && /^[A-Z]+$/.test(value) ? value : undefined;
}

function nonEmpty(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = stripNul(raw).trim();
  return value || undefined;
}

/**
 * The first timestamp from up to a year before to a day after the receive
 * time, else the receive time.
 */
function pickTimestamp(receivedAt: Date, ...candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const ms = Date.parse(candidate);
    if (Number.isNaN(ms)) continue;
    const offset = ms - receivedAt.getTime();
    if (offset >= -MAX_TIMESTAMP_AGE_MS && offset <= MAX_TIMESTAMP_AHEAD_MS) return candidate;
  }
  return receivedAt.toISOString();
}

// A time of day, and a trailing zone: Z, an offset (+02:00, -0500) or a name.
const TIME_OF_DAY_RE = /\d:\d\d/;
const TRAILING_ZONE_RE = /(?:Z|[+-]\d{2}(?::?\d{2})?|\b(?:GMT|UTC|UT|[ECMP][SD]T))\s*$/i;

/**
 * Date.parse reads a timestamp with a time but no zone (`2026-11-02 10:00:00`,
 * Zscaler's `Mon Jun 20 15:29:11 2022`) in the server's local zone. Senders do
 * not say which zone they use, so read it as UTC, like the syslog header.
 */
function parseDateText(text: string): number {
  if (TIME_OF_DAY_RE.test(text) && !TRAILING_ZONE_RE.test(text)) {
    return /^\d{4}-\d{2}-\d{2}[T ]/.test(text)
      ? Date.parse(`${text.replace(" ", "T")}Z`)
      : Date.parse(`${text} UTC`);
  }
  return Date.parse(text);
}

/** ISO string from an ISO date or an epoch (seconds or milliseconds). */
function parseTimestamp(raw: unknown): string | undefined {
  let ms: number;
  if (typeof raw === "number") {
    ms = raw < 1e12 ? raw * 1000 : raw;
  } else if (typeof raw === "string" && raw.trim()) {
    const text = raw.trim();
    ms = /^\d+(\.\d+)?$/.test(text)
      ? Number(text) * (Number(text) < 1e12 ? 1000 : 1)
      : parseDateText(text);
  } else {
    return undefined;
  }
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

interface Candidate {
  user?: unknown;
  host?: string;
  path?: string;
  method?: unknown;
  action?: unknown;
  department?: unknown;
  timestamp?: unknown;
}

/** Shared tail of every parser: validate, apply timestamp fallbacks, build. */
function buildEvent(
  c: Candidate,
  headerTimestamp: string | undefined,
  receivedAt: Date,
): ParseResult {
  const user = nonEmpty(c.user);
  if (!user || charLength(user) > MAX_EMAIL_CHARS || !isEmail(user)) {
    return { ok: false, reason: "no_user" };
  }
  const host = nonEmpty(c.host);
  if (!host || charLength(host) > MAX_DESTINATION_CHARS) {
    return { ok: false, reason: "no_destination" };
  }

  const event: SyslogEvent = {
    user_email: user,
    destination: host,
    timestamp: pickTimestamp(receivedAt, parseTimestamp(c.timestamp), headerTimestamp),
  };
  const path = c.path ? stripNul(c.path) : undefined;
  if (path && charLength(path) <= MAX_URI_PATH_CHARS) event.uri_path = path;
  const method = normalizeMethod(c.method);
  if (method) event.http_method = method;
  const action = normalizeAction(c.action);
  if (action) event.action = action;
  const department = nonEmpty(c.department);
  if (department) event.department = [...department].slice(0, MAX_DEPARTMENT_CHARS).join("");
  return { ok: true, event };
}

function parseZscaler(
  body: string,
  headerTimestamp: string | undefined,
  receivedAt: Date,
): ParseResult {
  const f = parseKeyValues(body);
  if (!f || Object.keys(f).length === 0) return { ok: false, reason: "unparseable" };
  const uri = f.uri ? hostAndPath(f.uri) : null;
  return buildEvent(
    {
      user: f.user,
      host: hostField(f.dst) ?? uri?.host,
      path: uri?.path,
      method: f.method,
      action: f.action,
      department: f.department,
      timestamp: f.timestamp,
    },
    headerTimestamp,
    receivedAt,
  );
}

function parseGenericKv(
  body: string,
  headerTimestamp: string | undefined,
  receivedAt: Date,
): ParseResult {
  const f = parseKeyValues(body, true);
  if (!f || Object.keys(f).length === 0) return { ok: false, reason: "unparseable" };
  const request = f.request ? hostAndPath(f.request) : null;
  return buildEvent(
    {
      user: f.suser,
      host: hostField(f.dhost) ?? request?.host,
      path: request?.path,
      method: f.requestMethod,
      action: f.act,
      department: f.department,
      timestamp: f.timestamp,
    },
    headerTimestamp,
    receivedAt,
  );
}

function parseNetskope(
  body: string,
  headerTimestamp: string | undefined,
  receivedAt: Date,
): ParseResult {
  // The JSON object may follow a prefix.
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end < start) return { ok: false, reason: "unparseable" };

  let json: unknown;
  try {
    json = JSON.parse(body.slice(start, end + 1));
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, reason: "unparseable" };
  }

  const j = json as Record<string, unknown>;
  const url = typeof j.url === "string" ? hostAndPath(j.url) : null;
  return buildEvent(
    {
      user: j.user,
      host: url?.host,
      path: url?.path,
      method: j.method,
      // `action` is Netskope's policy verdict (allow, block, ...); `activity`
      // is what the user did (Upload, Login, ...). `activity` is read only
      // when there is no `action`, for senders that followed an older guide.
      action: netskopeVerdict(j.action ?? j.activity),
      department: j.department,
      timestamp: j.timestamp,
    },
    headerTimestamp,
    receivedAt,
  );
}

/** Squid escapes the user name (`%[un`), so `alice@corp.com` may arrive as `alice%40corp.com`. */
function decodeSquidUser(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function parseSquid(
  body: string,
  headerTimestamp: string | undefined,
  receivedAt: Date,
): ParseResult {
  // Native access.log: time elapsed client code/status bytes method URL user ...
  const fields = body.trim().split(/\s+/);
  if (fields.length < 8) return { ok: false, reason: "unparseable" };
  const timestamp = parseTimestamp(fields[0]);
  if (!timestamp || !/^\d+(\.\d+)?$/.test(fields[0])) {
    return { ok: false, reason: "unparseable" };
  }

  const method = fields[5];
  // The result code (field 4, `CODE/status`) says whether Squid itself refused
  // the request: TCP_DENIED and TCP_DENIED_REPLY are ACL denials. A 403 from
  // the origin server (TCP_MISS/403) was let through, so only the code counts.
  const resultCode = fields[3].split("/")[0].toUpperCase();
  const action = /(^|_)DENIED(_|$)/.test(resultCode) ? "blocked" : "allowed";
  // CONNECT lines carry host:port instead of a URL, so they have no path.
  const target = hostAndPath(fields[6]);
  return buildEvent(
    {
      user: decodeSquidUser(fields[7]),
      host: target?.host,
      path: method.toUpperCase() === "CONNECT" ? undefined : target?.path,
      method,
      action,
      timestamp,
    },
    headerTimestamp,
    receivedAt,
  );
}

export function parseLine(
  parser: ParserType,
  body: string,
  headerTimestamp?: string,
  receivedAt: Date = new Date(),
): ParseResult {
  switch (parser) {
    case "zscaler":
      return parseZscaler(body, headerTimestamp, receivedAt);
    case "netskope":
      return parseNetskope(body, headerTimestamp, receivedAt);
    case "squid":
      return parseSquid(body, headerTimestamp, receivedAt);
    case "generic_kv":
      return parseGenericKv(body, headerTimestamp, receivedAt);
    default:
      return { ok: false, reason: "unparseable" };
  }
}
