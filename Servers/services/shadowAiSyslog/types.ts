/**
 * Shared types for the Shadow AI syslog listener.
 */

/** Every parser the listener knows; the API accepts exactly these. */
export const PARSER_TYPES = ["zscaler", "netskope", "squid", "generic_kv"] as const;

export type ParserType = (typeof PARSER_TYPES)[number];

export function isParserType(value: unknown): value is ParserType {
  return typeof value === "string" && (PARSER_TYPES as readonly string[]).includes(value);
}

export type DropReason =
  "no_user" | "no_destination" | "unparseable" | "wrong_sender_ip" | "rate_limited";

/** An event in the same shape the REST ingestion path accepts. */
export interface SyslogEvent {
  user_email: string;
  destination: string;
  timestamp: string;
  uri_path?: string;
  http_method?: string;
  action?: "allowed" | "blocked";
  department?: string;
}

/** `reason: null` is a line that is not an event (skipped, not counted as dropped). */
export type ParseResult =
  { ok: true; event: SyslogEvent } | { ok: false; reason: DropReason | null };
