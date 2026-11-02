# Shadow AI syslog listener

**Date:** 2026-11-02
**Status:** design. Direction from the user: build the listener, not on port 5514; hosted customers on app.verifywise.ai need syslog during their testing; identify senders with keys or tokens, not IP addresses. Calls marked *my call* are mine.

## Why

The Shadow AI user guide (`shared/user-guide-content/content/shadow-ai/integration-guide.ts`, `settings.ts`) tells customers to stream proxy and firewall logs to VerifyWise over syslog on port 5514, with Zscaler, Netskope, Squid and generic key-value parsers. None of that receive path exists. On develop there is only:

- the `shadow_ai_syslog_config` table (`organization_id`, `is_active`, `source_identifier`, `parser_type`, `created_at`; migration `20260226234302-tenant-tables.js:1809`),
- Admin-only CRUD for it (`Servers/controllers/shadowAi.ctrl.ts:1060-1190`, `Servers/utils/shadowAiConfig.utils.ts`, validator `Servers/middleware/validators/shadowAi.validator.ts:70-84`),
- the "Syslog sources" section of the Shadow AI Settings page (`Clients/src/presentation/pages/ShadowAI/SettingsPage.tsx:428`).

A customer who follows the guide gets no data. The REST path (`POST /api/v1/shadow-ai/events`, `Servers/controllers/shadowAiIngestion.ctrl.ts`) works and stays the primary path. Syslog matters because many proxies and firewalls can stream syslog natively but cannot POST VerifyWise's JSON format without a forwarding script.

The hosted app (app.verifywise.ai) serves many customers from one server. Several customers can send from the same IP address (a vendor's cloud log shipper, a shared NAT gateway), and one customer must never be able to claim another's traffic. So the sender's IP address cannot be the identity.

## Goals

1. A syslog receiver that turns log lines from a registered source into Shadow AI events, through the same matching, counting and alerting as the REST path.
2. Each source is identified by a secret **source key** the sender includes in its log lines. Safe on the shared hosted app.
3. The four parser types the UI already offers (`zscaler`, `netskope`, `squid`, `generic_kv`), accepting the example lines in the current guide once the key is added.
4. Admins can see whether a source is sending and why lines are dropped, without reading server logs.
5. Works on the hosted app and in customer Docker Compose and Helm deployments; off unless enabled.
6. The user guide describes what is built, nothing more.

## Non-goals

- UDP syslog (unreliable, spoofable).
- Mutual TLS client certificates. Keys cover the identity need and work with devices that cannot present a client certificate.
- PROXY protocol. Only the optional IP restriction needs the real sender IP; behind a load balancer that hides it, leave the restriction empty.
- Full CEF header parsing. `generic_kv` reads `key=value` pairs anywhere in the message, which covers the CEF extension fields the guide lists.
- Any change to the REST ingestion contract.

## Anti-goals (a build that does these has failed, even if it works)

- A line without a valid, active key lands in any organization (the IP-only mode below is the single, opt-in exception for self-hosted servers).
- One organization's key, or anything else a sender controls, puts events into another organization.
- A flood of lines degrades the HTTP API.
- Raw log lines or full keys end up in application logs.

## Design

### Network and process (*my call*)

- **Port 6514/TCP by default** (IANA "syslog-tls", RFC 5425), set with `SHADOW_AI_SYSLOG_PORT`. Unprivileged, so no root in the container.
- **Off unless `SHADOW_AI_SYSLOG_ENABLED=true`.**
- **TLS** when `SHADOW_AI_SYSLOG_TLS_CERT_FILE` and `SHADOW_AI_SYSLOG_TLS_KEY_FILE` are set. **Plain TCP** is accepted only when `SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT=true`, for senders that cannot do TLS (Squid's `access_log tcp://`, on-premises Zscaler NSS) on a private network. The key travels inside each line, so the hosted app runs TLS only. Both modes share the one port: the listener peeks at the first byte of each connection (`0x16` = TLS handshake) and wraps the socket in TLS or not. If neither TLS nor plaintext is allowed, the listener refuses to start and logs why.
- Runs **inside the backend process** (`Servers/index.ts`, next to `app.listen`), started after the DB is ready and closed on shutdown. Every backend replica listens.
- Startup log line: `Shadow AI syslog listener started on port 6514 (tls: on, plaintext: off, ip-only: off)`.

### Source keys

- Format `vwsl_{organizationId}_{48 hex chars}`, generated server-side when a source is created, shown to the Admin once, stored only as a SHA-256 hash (`key_hash`) plus a display prefix (`key_prefix`), the same pattern as Shadow AI API keys (`Servers/utils/shadowAiApiKey.utils.ts`).
- **Regenerate key** replaces the hash; the old key stops working within the cache window below.
- The sender puts the key in each line as the literal field `vw_source=<key>` as the first or last whitespace-delimited token of the message (final review ruling: a key anywhere else could come from a user-controlled field and route the line to another organization). Every target format can carry it:
  - Zscaler NSS feed format and `generic_kv`: add `vw_source=<key>` to the feed's output format string.
  - Squid: add the literal to the `logformat` used by `access_log`.
  - Netskope and other JSON senders: either a top-level `"vw_source":"<key>"` member of the JSON object, or the literal before or after the JSON.
  - rsyslog or syslog-ng relays: add it in the template.
- The listener finds the field, removes it from the line before parsing (so it is never stored), hashes it, and looks the hash up in a cache (`hash → { organizationId, configId, parserType, allowedIp, isActive }`, 60 s TTL, invalidated at once in the process that served a create, update, regenerate or delete). The organization ID embedded in the key must equal the row's `organization_id`.
- Routing is **per line**, so one connection (for example from a relay) can carry several sources.

### Optional IP restriction

`source_identifier` becomes an optional **Allowed sender IP**. When set, a line is accepted only if the connection's peer IP (IPv4-mapped IPv6 normalised to IPv4) equals it. Two sources, even in different organizations, may list the same IP. Validated as IPv4 or IPv6 when the field is present in a create or update payload.

### IP-only mode (self-hosted only)

For devices that cannot add any text to their lines, `SHADOW_AI_SYSLOG_ALLOW_IP_ONLY=true` lets a line **without** a key be routed to the single active source whose allowed sender IP equals the peer IP. If more than one active source lists that IP, the line is dropped and both sources show "Sender IP shared with another source". The listener refuses to start with this flag on when `MULTI_TENANCY_ENABLED=true`, so it is never on for the hosted app. *(my call)*

### Connection handling

- Limits: 64 KiB per message, 500 concurrent connections per process, 5 minute idle timeout, 30 s TLS handshake timeout.
- A connection that sends 100 lines, or stays open 60 s, without a single valid key (and without an IP-only match) is closed. Refused lines are counted in a process-level counter, logged at debug with the peer IP only, never the line.

### Framing and syslog header

- Both RFC 6587 framings on the same connection: octet counting (`<len> <msg>`) when the frame starts with a digit run and a space, otherwise newline-delimited (LF, tolerate CRLF).
- Strip an RFC 5424 header (`<PRI>1 TIMESTAMP HOST APP PROCID MSGID SD`) or an RFC 3164 header (`<PRI>Mmm dd hh:mm:ss HOST TAG:`) when present; keep the header timestamp as a fallback. Lines with no header (Squid) go straight to key extraction and the parser.

### Parsers

Each parser takes the message body (key removed) and returns an event in the REST shape (`user_email`, `destination`, `timestamp`, optional `uri_path`, `http_method`, `action`, `department`) or a drop reason. Every example line in the current guide must parse once a `vw_source` field is added.

| Parser | Input | Mapping |
|---|---|---|
| `zscaler` | `key=value` pairs (values may be quoted) | `user`→email, `dst` or host of `uri`→destination, path of `uri`→uri_path, `method`, `action` (`blocked`/`allowed`), `department` |
| `netskope` | JSON object, possibly after a prefix | `user`→email, host of `url`→destination, path→uri_path, `method`, `activity`→action, `department`, `timestamp` |
| `squid` | native access.log (space-delimited) | field 1 epoch seconds→timestamp, field 6 method, field 7 URL→destination and path (or `host:port` for CONNECT), field 8 user→email |
| `generic_kv` | `key=value` pairs, CEF extensions | `suser`→email, `dhost`→destination, `requestMethod`, `act`, `request` (URL) if present |

Timestamp order: payload field, then syslog header, then receive time. Drop reasons: `no_user` (missing or not an email, e.g. Squid `-`), `no_destination`, `unparseable`, `wrong_sender_ip`, `rate_limited`. Parsers are pure functions with unit tests from the guide's examples plus variants (quoted values, IPv6 hosts, CONNECT lines).

### Shared ingestion service

Move the body of `ingestEvents` after validation (normalise → match domain → extract model → ensure tenant tool → insert → update counters → evaluate rules) into `Servers/services/shadowAiIngestion.service.ts` as `ingestShadowAiEvents(organizationId, events)`. The HTTP controller keeps API-key auth, body validation and its responses, and calls the service. Move `checkRateLimit` into the service so both paths share the per-organization hourly budget (per process, as today). HTTP behaviour and responses do not change.

### Batching and tenant scoping

The listener buffers parsed events per source and flushes at 500 events or every 2 seconds. Each flush re-checks the source against the cache (dropped if it was deleted, deactivated or its key regenerated) and runs inside an RLS-scoped transaction for that organization (`SET LOCAL app.current_org`, the same mechanism as `Servers/middleware/rls.middleware.ts`), so it works with `RLS_ENFORCEMENT_ENABLED=true`. Over the hourly limit, the batch is dropped and counted as `rate_limited`. A failed flush is counted and logged once per source per minute; events are not retried.

### Schema changes (one migration)

On `shadow_ai_syslog_config`:
- add `key_hash VARCHAR(64) NULL` with a unique index, `key_prefix VARCHAR(20) NULL`,
- add `last_event_at TIMESTAMPTZ NULL`, `events_accepted BIGINT NOT NULL DEFAULT 0`, `events_dropped BIGINT NOT NULL DEFAULT 0`, `last_drop_reason VARCHAR(50) NULL`,
- make `source_identifier` nullable (it becomes the optional allowed sender IP).

Existing rows keep their values and get no key. Settings shows them as "No key yet" with a Generate key action; they receive nothing until a key exists (or, self-hosted, IP-only mode matches them). A legacy `source_identifier` that is not an IP address (the old guide's example was a hostname) is left as is and flagged "Not an IP address. Clear it or enter the sender's IP." The IP check runs only when `source_identifier` is in an update payload, so toggling `is_active` or changing `parser_type` on a legacy row keeps working. The listener updates the status columns once per source per flush, never per line.

### API

- `POST /api/shadow-ai/config/syslog` returns the full key once, in the response body only.
- `POST /api/shadow-ai/config/syslog/:id/regenerate-key` (Admin) returns the new key once.
- `GET /api/shadow-ai/config/syslog/status` (Admin): listener on or off, port, TLS, plaintext, IP-only.
- List and update responses never include `key_hash`.

### Settings page

In "Syslog sources":
- Add source: parser type, optional allowed sender IP. After saving, a dialog shows the key once with a copy button and the exact `vw_source=...` text to add to the sender's format.
- Each row: key prefix, "Last received" (relative time or "Never"), accepted and dropped counts, last drop reason in plain words ("No user email in the log line"), Regenerate key.
- A status line at the top from the status endpoint, including the host and port to send to. When the listener is off, the section says so.
- New strings get de, fr and es translations.

### Deployment

- `.env.example` and the Compose files: the variables, commented, plus a commented port mapping `6514:6514` on the backend.
- Helm: `shadowAiSyslog.enabled`, `.port`, `.tls.secretName`, `.allowPlaintext`, `.allowIpOnly`; a separate Service (type `LoadBalancer`) and the container port, only when enabled. Mention the listener in the raw `kubernetes/` manifests' comments only.
- `install.sh` and Ansible pass the variables through where they template the backend env; nothing new is required.
- **Hosted app:** enabling it on app.verifywise.ai means a TLS certificate for the syslog hostname and a TCP load balancer for 6514. That is an operations task outside this repo; the design only has to make it possible.

### Documentation

Rewrite the syslog sections of `integration-guide.ts` and `settings.ts`: port 6514, TLS, the source key and where to put it per product, the optional allowed IP, IP-only mode for self-hosted, the status columns and drop reasons. Remove claims of anything not built. Mirror changed guide files to `~/website/verifywise/content/user-guide/`. Add a `docs/technical` note on the listener and its environment variables, and regenerate API docs (`npm run generate:swagger && npm run generate:endpoints`).

## Testing

- Unit: each parser; key extraction and removal (start, middle, end, inside JSON); framing (octet counting, LF, CRLF, split across TCP chunks, oversize); header stripping; IP normalisation.
- Integration (scratch DB through `npm run test:integration`, plus the RLS-enforced run): start the listener on an ephemeral port; lines with a valid key over plain TCP and TLS (self-signed cert generated in the test) land in the right organization with tools and counters; a key from org A never writes to org B; an unknown, revoked or regenerated key writes nothing; allowed-IP mismatch drops; IP-only mode with one and with two matching sources; the listener refuses IP-only when multi-tenancy is on; migration on rows with legacy hostnames.
- The HTTP ingestion tests pass unchanged after the service extraction.
- Frontend: Settings section renders status, counts, the key dialog and the legacy-row flags.

## Left to the builder

- Module layout under `Servers/services/shadowAiSyslog/`.
- Refused-line counting can be a log counter; add OTel counters if the setup in `docs/technical/infrastructure/observability.md` makes it trivial.
- Wording of drop reasons and Settings copy, within the house UI rules (sentence case, task-first, no em dashes).
