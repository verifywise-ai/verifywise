# Shadow AI syslog listener

A TCP listener inside the backend process that receives proxy logs for Shadow
AI. It is off by default. Code: `Servers/services/shadowAiSyslog/`. Startup and
shutdown are in `Servers/index.ts`. The Settings page is
`Clients/src/presentation/pages/ShadowAI/SettingsPage.tsx`. Source list,
create, edit and delete are under `/api/shadow-ai/config/syslog` in
`Servers/routes/shadowAi.route.ts`. The listener status and key regeneration
are on the versioned API, `/api/v1/shadow-ai-syslog`
(`Servers/routes/v1/shadowAiSyslog.route.ts`): `GET /status` and
`POST /sources/:id/regenerate-key`. Source management is Admin only.

## How a line is routed

1. A connection opens. The first byte decides the transport: `0x16` is a TLS
   handshake, anything else is plaintext. Plaintext is refused unless
   `SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT=true`.
2. Framing accepts octet counting and newline-delimited messages (RFC 6587).
   An RFC 5424 or RFC 3164 header is stripped when present.
3. The line must carry `vw_source=<key>` as its first or last
   whitespace-delimited token (trailing whitespace and CR are allowed), or, when
   the body is one JSON object, as a top-level `"vw_source"` member. A key
   anywhere else (inside a quoted value, a URL, a JSON string or a nested
   object, or joined by `|`) is ignored, so a user who controls a field such as
   the user agent cannot route lines to an organisation whose key they hold.
   Two different valid keys at the two ends make the line unroutable. The key is `vwsl_<organizationId>_<48 hex characters>`. It is removed from
   the line before parsing, so it is never stored.
4. The key is hashed (SHA-256) and looked up in the source cache. A match gives
   the organisation, the parser type and the optional allowed sender IP. Only
   the hash and a display prefix are stored.
5. The parser turns the line into an event, or counts a drop. Events are
   buffered per source and written in a transaction under that organisation.

Raw lines and keys are never logged. The peer IP is logged at debug level only.

In IP-only mode (`SHADOW_AI_SYSLOG_ALLOW_IP_ONLY=true`) a line without a valid
key is matched by the connection's peer IP against the sources' allowed sender
IP. If two sources list the same IP, neither claims the line and each gets a
`wrong_sender_ip` drop.

## Environment variables

Booleans are on only for the exact string `true`.

| Variable | Default | Meaning |
|----------|---------|---------|
| `SHADOW_AI_SYSLOG_ENABLED` | off | Start the listener. |
| `SHADOW_AI_SYSLOG_PORT` | `6514` | TCP port. An invalid value falls back to 6514. |
| `SHADOW_AI_SYSLOG_TLS_CERT_FILE` | unset | Path to the PEM certificate. Needs the key file. |
| `SHADOW_AI_SYSLOG_TLS_KEY_FILE` | unset | Path to the PEM private key. Needs the certificate file. |
| `SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT` | off | Accept plain TCP. Required when no certificate is set. |
| `SHADOW_AI_SYSLOG_ALLOW_IP_ONLY` | off | Match key-less lines by sender IP. Self-hosted only. |

The listener does not start, and the backend logs the reason, when:

- only one of the certificate and key files is set
- neither a certificate nor `SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT=true` is set
- `SHADOW_AI_SYSLOG_ALLOW_IP_ONLY=true` and `MULTI_TENANCY_ENABLED=true`
- the certificate or key file cannot be read

A failed start does not stop the rest of the backend. The minimum TLS version is
1.2. The certificate and key are read once, when the backend starts. After you
rotate them (including a Kubernetes Secret), restart the backend. TCP only: there is no UDP listener.

## Limits

| Limit | Value |
|-------|-------|
| Message size | 64 KiB. Larger messages are discarded. |
| Connections per process | 500 |
| Idle connection | closed after 5 minutes |
| TLS handshake | 30 seconds |
| Connection with no valid key | closed after 100 lines or 60 seconds |
| Batch flush | at 500 events per source, or every 2 seconds |
| Pending events per process | 20,000. Beyond that, new events are dropped as `rate_limited`. |
| Source cache | 60 seconds |

The source cache holds every active source. The replica that serves a create,
edit, delete or key change drops it as soon as the change commits (with RLS
enforcement, when the response finishes), so the next lookup reloads it.
Other replicas pick the change up within 60 seconds, so a regenerated or
deleted key can keep working on them for up to a minute. The batch flush also
applies the organisation's hourly Shadow AI rate limit (Settings, Rate
limiting); events over it are dropped as `rate_limited`. The flush reuses the
limit it read up to 30 seconds earlier. Events that are counted but not
stored (the write rolled back, or a row did not fit) are given back to the
hour's quota. A flush that fails is logged and its events are discarded; it
never ends the process.

## Parsers

| Parser | Reads | Action |
|--------|-------|--------|
| Zscaler | `key=value`: `user`, `dst` (or host of `uri`), `uri`, `method`, `action`, `department`, `timestamp` | `action` |
| Netskope | JSON object (from the first `{` followed by a key or `}`, so a brace in a prefix is passed over; a later `{` is never tried, so a broken object is not replaced by a nested one): `user`, `url` (else `domain`, then `site` when host-shaped; an undotted `url` host such as `localhost` is used only when neither is; never `hostname`, which is the user's device), `method`, `action`, `department`, `timestamp` | `action` (Netskope's policy verdict, e.g. `allow` or `block`). `activity` is what the user did (`Upload`, `Login Attempt`) and is read only when there is no `action`. `alert`, `useralert` and `bypass` count as allowed (the request went through); `restrictToView`, `restrictAccess` and `disableDownload` count as blocked |
| Squid | native access.log fields: 1 epoch time, 4 result code, 6 method, 7 URL, 8 user | result code (`*_DENIED` is blocked, anything else allowed). `NONE` in the method field (aborted connections) is not stored as a method. |
| Generic key-value | `suser`, `dhost` (or host of `request`), `request`, `requestMethod`, `act`, `department`, `timestamp` (else CEF `rt`, `end`, `start`) | `act` |

In generic key-value lines that start with a CEF header (`CEF:0|...|`, optionally
after a forwarder prefix of at most two tokens without `=` or quotes, such as a
host name and tag), the extension after the header is parsed the CEF way: a value may contain spaces and runs until the
next ` key=`, and quotes are not special. Other lines split values on
whitespace, with double quotes to keep spaces. A repeated event key rejects
the line in both modes. A CEF header deeper in the line is not recognised.

Squid access logs have no allowed or blocked field, so the Squid parser reads
the result code (field 4): a code containing `DENIED` (`TCP_DENIED`,
`TCP_DENIED_REPLY`) is blocked and every other code is allowed. For the other parsers, the first word of
the action value (the first run of letters) decides: `block`, `blocked`, `deny`,
`denied`, `drop`, `dropped`, `reset`, `reject` or `rejected` is stored as
blocked, and `allow`, `allowed`, `permit`, `permitted`, `pass`, `passed`,
`accept` or `accepted` as allowed, so `Blocked by policy` is blocked. A
negated allow (`Not allowed`, `not_permitted`, `unallowed`, `disallowed`) is
blocked. A word
that only begins with one of these (`password_reset`, `dropbox-upload`) and any
other value is left unset. Netskope's `alert`, `useralert`, `bypass` and the
`restrict*` / `disableDownload` verdicts are mapped before this step.

The user must be a valid email address. A repeated `user`, `suser`, `dst`,
`dhost`, `uri`, `request`, `action`, `act`, `method`, `requestMethod`,
`department` or `timestamp` key (and, in generic key-value lines, `rt`, `end`
or `start`) makes the line ambiguous and it is dropped as `unparseable`. Repeats of keys the parser does not read are
ignored.

Timestamp order: the payload `timestamp` (Squid: field 1; generic key-value
uses the first of `timestamp`, `rt`, `end`, `start` that reads as a time), then the syslog
header, then the receive time. A payload or header timestamp more than a year
before the receive time, or more than 24 hours after it, is skipped. A payload timestamp that carries a time but
no zone (`2026-11-02 10:00:00`, `Mon Jun 20 15:29:11 2022`) is read as UTC, like
the RFC 3164 header, never as the server's local time. A zone stated anywhere after the time is honoured: `Z`, an offset
(`+02:00`), `GMT+0200 (CEST)`, `PST 2022`, or one of CET, CEST, WET, WEST, BST,
EET, EEST, MSK, JST, KST, AEST, AEDT, ACST, AWST, NZST, NZDT (any case, also
inside brackets such as `(Tokyo JST)` or right after the digits). A listed name
is cut out and applied as an offset in minutes; brackets are removed because
Date.parse treats them as comments. A numeric offset wins over a name that
disagrees with it. ISO dates with `T`, a comma before the fraction, or AM/PM
are accepted. A zone name the parser does not know (such as IST, bare or in
brackets) makes the payload time unreadable and the header or receive time is used. Send an offset
or `Z` if the source logs in another zone.

Destination values must look like a host: a dotted name, or an IPv4 or IPv6
address (bare `2001:db8::1` or bracketed; a bare IP is stored as written), or a
URL with a scheme. Placeholders such as `-`, `N/A`, `none` and
`null` are skipped and the next field (`uri`, `request`, Netskope `domain`) is
used instead.

Every field is bounded to its `shadow_ai_events` column, because one value
over its column would fail the multi-row insert and lose the whole batch: an
email over 255 characters drops the line as `no_user`, a destination over 512
as `no_destination`; a method over 10 characters is left out and a department
is cut to 255; a URI path over 2048 characters is left out. NUL characters
are removed from every string field. A model name captured from the path that
is longer than `detected_model` (255) is not stored (the event keeps no model).

As a second check, `ingestShadowAiEvents` validates every row, derived
`detected_model` included, against `utils/shadowAiEventLimits.ts` before any
tool or counter work. The listener passes `skipInvalidRows`, so an offending
row is dropped as `unparseable` and the rest of the batch is stored. The REST
path keeps its contract: such a batch fails with 500, as it did when the
INSERT itself failed, but now before anything is written.

## Drop reasons

Counted per source and shown on the Settings page.

| Code | Settings page wording |
|------|-----------------------|
| `no_user` | No user email in the log line |
| `no_destination` | No destination host in the log line |
| `unparseable` | Line does not match the parser type |
| `wrong_sender_ip` | Sent from an IP that isn't allowed or is shared with another source |
| `rate_limited` | Over the hourly event limit (also used when the listener's queue is full) |

Lines with no valid key or no IP-only match belong to no source, so they are
not counted per source. They add to a process-wide counter
(`getRefusedLineCount` in `listener.ts`) that is not shown in the UI.

## Deployment

- **Docker Compose:** publish the port (`- "6514:6514"`, commented in
  `docker-compose.yml`), mount the certificate and key into the backend
  container and set the variables. In the prod overlay, set them in `.env.prod`.
- **Helm:** set `shadowAiSyslog.enabled=true` and `shadowAiSyslog.tlsSecretName`
  (a TLS Secret with `tls.crt` and `tls.key`). The chart adds the container
  port, the env vars, the Secret mount and a `backend-syslog` Service. Use
  `shadowAiSyslog.serviceType=LoadBalancer` if the proxy is outside the cluster.
  With default values nothing is added.
- **Ansible:** set `shadow_ai_syslog_*` in `group_vars/all.yml`.

Two points apply behind any TCP load balancer or NAT:

- The listener sees the load balancer's address as the sender. The allowed
  sender IP and IP-only mode need the real sender address, so they do not work
  there. Route by key instead. The listener does not read the PROXY protocol.
- Keys travel inside the log line. Use TLS, or a private network, between the
  proxy and the listener.

The worker process does not run the listener.

### Hosted (app.verifywise.ai)

The hosted deployment does not offer syslog yet. It needs a TLS certificate and
a TCP load balancer on port 6514 in front of the backend, then
`SHADOW_AI_SYSLOG_ENABLED=true`. Until the operator does that, customers on the
hosted service should use the REST API.

## Status endpoint

`GET /api/v1/shadow-ai-syslog/status` (Admin) returns the configuration
(`enabled`, `port`, `tls`, `plaintext`, `ipOnly`) and the state of the
listener in the process that answers: `running` (bound and accepting) and
`startError` (`{ code, message }` from the last failed start, else null).
Codes are `INVALID_CONFIG`, `TLS_LOAD_FAILED`, an errno code such as
`EADDRINUSE`, or `START_FAILED`; messages name variables and errno codes, never
paths or file contents. Settings shows "Syslog listener failed to start. Check
the server log." when `enabled` is true and `running` is false. With several
backend replicas, each answers for its own listener.

## Verifying

1. In Settings, add a source and copy the key (shown once).
2. Send one test line through the proxy or by hand, for example
   `openssl s_client -connect host:6514` and paste a line ending in
   `vw_source=<key>`.
3. Within a few seconds the source's Accepted count and Last received change.
4. If Dropped rises instead, the Last drop reason names the cause.

Only events to a destination that matches a known AI tool count as AI usage in
Insights. Other events are stored but do not count there.
