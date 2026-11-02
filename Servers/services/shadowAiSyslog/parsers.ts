/**
 * Log line parsers for the Shadow AI syslog listener.
 *
 * Each parser is a pure function of the message body (source key already
 * removed). It returns an event in the REST ingestion shape or a drop reason.
 * Timestamp order: payload field, then syslog header, then receive time.
 */

import { isEmail } from "../../utils/validations/email.utils";
import { ParseResult, ParserType, SyslogEvent } from "./types";

type Fields = Record<string, string>;

const KV_PAIR_RE = /(?<=^|[\s|])([A-Za-z_][\w.-]*)=(?:"([^"]*)"|(\S*))/g;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

const BLOCKED_ACTIONS = ["block", "deny", "denied", "drop", "reset", "reject"];
const ALLOWED_ACTIONS = ["allow", "permit", "pass", "accept"];

function parseKeyValues(body: string): Fields {
  const fields: Fields = {};
  for (const m of body.matchAll(KV_PAIR_RE)) {
    if (!(m[1] in fields)) fields[m[1]] = m[2] ?? m[3] ?? "";
  }
  return fields;
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

function normalizeMethod(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toUpperCase();
  return /^[A-Z]{1,16}$/.test(value) ? value : undefined;
}

function nonEmpty(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
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
      : Date.parse(text);
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
  if (!user || !isEmail(user)) return { ok: false, reason: "no_user" };
  if (!c.host) return { ok: false, reason: "no_destination" };

  const event: SyslogEvent = {
    user_email: user,
    destination: c.host,
    timestamp: parseTimestamp(c.timestamp) ?? headerTimestamp ?? receivedAt.toISOString(),
  };
  if (c.path) event.uri_path = c.path;
  const method = normalizeMethod(c.method);
  if (method) event.http_method = method;
  const action = normalizeAction(c.action);
  if (action) event.action = action;
  const department = nonEmpty(c.department);
  if (department) event.department = department;
  return { ok: true, event };
}

function parseZscaler(
  body: string,
  headerTimestamp: string | undefined,
  receivedAt: Date,
): ParseResult {
  const f = parseKeyValues(body);
  if (Object.keys(f).length === 0) return { ok: false, reason: "unparseable" };
  const uri = f.uri ? hostAndPath(f.uri) : null;
  return buildEvent(
    {
      user: f.user,
      host: nonEmpty(f.dst)?.toLowerCase() ?? uri?.host,
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
  const f = parseKeyValues(body);
  if (Object.keys(f).length === 0) return { ok: false, reason: "unparseable" };
  const request = f.request ? hostAndPath(f.request) : null;
  return buildEvent(
    {
      user: f.suser,
      host: nonEmpty(f.dhost)?.toLowerCase() ?? request?.host,
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
      action: j.activity,
      department: j.department,
      timestamp: j.timestamp,
    },
    headerTimestamp,
    receivedAt,
  );
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
  // CONNECT lines carry host:port instead of a URL, so they have no path.
  const target = hostAndPath(fields[6]);
  return buildEvent(
    {
      user: fields[7],
      host: target?.host,
      path: method.toUpperCase() === "CONNECT" ? undefined : target?.path,
      method,
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
