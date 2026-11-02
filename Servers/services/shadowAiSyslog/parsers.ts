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

// Verdict words, matched against the first word of the action value.
const BLOCKED_ACTIONS = new Set([
  "block",
  "blocked",
  "deny",
  "denied",
  "drop",
  "dropped",
  "reset",
  "reject",
  "rejected",
]);
const ALLOWED_ACTIONS = new Set([
  "allow",
  "allowed",
  "permit",
  "permitted",
  "pass",
  "passed",
  "accept",
  "accepted",
]);

const NEGATION_WORDS = new Set(["not", "no", "never"]);

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
// extension (key=value pairs) follows the seventh pipe. A forwarder may put a
// short prefix (a host name, a syslog tag) before `CEF:`: at most two
// whitespace-separated tokens, with no `=` or quotes. The header is NOT searched
// for anywhere in the line, or free text in a plain key=value line (a user
// agent) could carry a fake header and supply the user and destination.
// Header fields escape a literal pipe as `\|`.
const CEF_HEADER_RE = /^\s*(?:[^\s="']+\s+){0,2}CEF:\d+(?:\|(?:[^|\\]|\\.)*){6}\|/;
// A CEF extension key sits at the start or after whitespace and ends at `=`.
const CEF_KEY_RE = /(?:^|\s)([A-Za-z_][\w.-]*)=/g;

/**
 * CEF extension pairs. Unlike plain key=value, a CEF value may contain
 * spaces (only `=` and `\` are escaped), so a value runs until the next
 * ` key=`. Quotes have no meaning in CEF and are kept as written.
 */
function parseCefExtension(extension: string): Fields | null {
  const fields: Fields = Object.create(null);
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
  const fields: Fields = Object.create(null);
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
    if (!/[a-z0-9]/i.test(host)) return null;
    // Without a scheme the value must look like a host (dotted name, IPv4 or
    // IPv6), so placeholders such as `-`, `N/A`, `none` and `null` are not read
    // as a host called "-" or "n" and the next field gets its turn.
    if (!SCHEME_RE.test(raw) && !host.includes(".") && !host.includes(":")) return null;
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
  // First run of letters, so "Blocked by policy" is a verdict but
  // "password_reset" and "dropbox-upload" (first words "password", "dropbox")
  // are not.
  const [word, next] = raw.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!word) return undefined;
  if (BLOCKED_ACTIONS.has(word)) return "blocked";
  if (ALLOWED_ACTIONS.has(word)) return "allowed";
  // A negated allow is a refusal: "Not allowed", "not_permitted", "unallowed",
  // "disallowed". "Not blocked" and other negations are left unset.
  if (NEGATION_WORDS.has(word) && next && ALLOWED_ACTIONS.has(next)) return "blocked";
  const prefixed = /^(?:un|dis)([a-z]+)$/.exec(word)?.[1];
  if (prefixed && ALLOWED_ACTIONS.has(prefixed)) return "blocked";
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

// A time of day (`15:29`, `15:29:11`, `15:29:11.250`); anything after it can
// name the zone.
const TIME_OF_DAY_RE = /\d:\d\d(?::\d\d)?(?:[.,]\d+)?/;
// Words that may follow the time without being a zone.
const NON_ZONE_WORDS = new Set([
  "am",
  "pm",
  "t",
  "mon",
  "tue",
  "tues",
  "wed",
  "thu",
  "thur",
  "thurs",
  "fri",
  "sat",
  "sun",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]);
// Zone abbreviations Date.parse cannot read (it knows GMT, UT, UTC, Z and the
// US EST..PDT), as UTC offsets. Only abbreviations with one common meaning are
// listed; an unlisted one (IST, ...) makes the payload time unreadable and the
// header or receive time is used instead.
const ZONE_OFFSETS: Record<string, string> = {
  WET: "+0000",
  WEST: "+0100",
  BST: "+0100",
  CET: "+0100",
  CEST: "+0200",
  EET: "+0200",
  EEST: "+0300",
  MSK: "+0300",
  JST: "+0900",
  KST: "+0900",
  AEST: "+1000",
  AEDT: "+1100",
  ACST: "+0930",
  AWST: "+0800",
  NZST: "+1200",
  NZDT: "+1300",
};

/** Whether the text after the time of day states a zone: Z, an offset or a name. */
function statesZone(tail: string): boolean {
  if (/^(?:[.,]\d+)?\s*[+-]\d{2}(?::?\d{2})?\b/.test(tail)) return true;
  if (/\s[+-]\d{2}:?\d{2}\b/.test(tail)) return true;
  const words = tail.match(/[a-z]+/gi) ?? [];
  return words.some((w) => !NON_ZONE_WORDS.has(w.toLowerCase()));
}

/**
 * Date.parse reads a timestamp with a time but no zone (`2026-11-02 10:00:00`,
 * Zscaler's `Mon Jun 20 15:29:11 2022`) in the server's local zone. Senders do
 * not say which zone they use, so read it as UTC, like the syslog header. A
 * zone stated anywhere after the time (`... PST 2022`, `... GMT+0200 (CEST)`,
 * `...Z`, `+02:00`) is honoured.
 */
function parseDateText(text: string): number {
  const time = TIME_OF_DAY_RE.exec(text);
  if (!time) return Date.parse(text);
  const tail = text.slice(time.index + time[0].length);
  if (!statesZone(tail)) {
    return /^\d{4}-\d{2}-\d{2}[T ]/.test(text)
      ? Date.parse(`${text.replace(" ", "T")}Z`)
      : Date.parse(`${text} UTC`);
  }
  // Swap the first listed name (with its brackets, if any) for its GMT offset.
  const zoneWord = /\(?\b([a-z]+)\b\)?/gi;
  let zone: RegExpExecArray | null;
  while ((zone = zoneWord.exec(tail))) {
    const name = zone[1].toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(ZONE_OFFSETS, name)) continue;
    const start = text.length - tail.length + zone.index;
    return Date.parse(
      `${text.slice(0, start)}GMT${ZONE_OFFSETS[name]}${text.slice(start + zone[0].length)}`,
    );
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

// A JSON object may follow a prefix and be followed by trailing text. Try the
// slice ending at each closing brace, last first, a bounded number of times.
const MAX_JSON_END_ATTEMPTS = 8;

function extractJsonObject(body: string): Record<string, unknown> | null {
  const start = body.indexOf("{");
  if (start === -1) return null;
  let end = body.lastIndexOf("}");
  for (let attempt = 0; attempt < MAX_JSON_END_ATTEMPTS && end > start; attempt++) {
    try {
      const parsed: unknown = JSON.parse(body.slice(start, end + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      end = body.lastIndexOf("}", end - 1);
    }
  }
  return null;
}

/** A host-shaped value (dotted name or IP), normalised; free text is rejected. */
function dottedHost(raw: unknown): string | undefined {
  if (typeof raw !== "string" || /\s/.test(raw)) return undefined;
  const host = hostField(raw);
  return host && (host.includes(".") || host.includes(":")) ? host : undefined;
}

function parseNetskope(
  body: string,
  headerTimestamp: string | undefined,
  receivedAt: Date,
): ParseResult {
  const j = extractJsonObject(body);
  if (!j) return { ok: false, reason: "unparseable" };

  const url = typeof j.url === "string" ? hostAndPath(j.url) : null;
  // `url` is the destination. Without it, `domain` (then `site`) is read when
  // it looks like a host. `hostname` is NOT used: in Netskope events it is the
  // user's device, not the site the user reached.
  const host = url?.host ?? dottedHost(j.domain) ?? dottedHost(j.site);
  return buildEvent(
    {
      user: j.user,
      host,
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
  // Squid always writes an epoch; anything else is not an access.log line.
  const timestamp = /^\d+(\.\d+)?$/.test(fields[0]) ? parseTimestamp(fields[0]) : undefined;
  if (!timestamp) return { ok: false, reason: "unparseable" };

  // `NONE` stands in for the method when no request was read (aborted
  // connections); it is not an HTTP method, so it is not stored as one.
  const method = fields[5].toUpperCase() === "NONE" ? undefined : fields[5];
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
      path: method?.toUpperCase() === "CONNECT" ? undefined : target?.path,
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
