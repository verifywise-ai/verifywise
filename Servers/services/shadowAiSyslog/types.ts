/**
 * Shared types for the Shadow AI syslog listener.
 */

export type ParserType = "zscaler" | "netskope" | "squid" | "generic_kv";

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

export type ParseResult = { ok: true; event: SyslogEvent } | { ok: false; reason: DropReason };
