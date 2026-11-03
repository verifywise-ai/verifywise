# Shadow AI syslog listener Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive Shadow AI events over syslog (TCP/TLS, port 6514), identify each source by a secret key in every line, and feed the same ingestion pipeline as the REST API.

**Architecture:** Pure modules (framing, header, key extraction, parsers) under `Servers/services/shadowAiSyslog/`; a listener started from `Servers/index.ts` that routes each line by key through a cached source map, batches per source and flushes through a shared `ingestShadowAiEvents` service inside an RLS-scoped transaction. Source keys, status columns and a status endpoint extend the existing syslog config CRUD; the Settings page shows them.

**Tech Stack:** Node 22 `net`/`tls`, Express 4, Sequelize 6 raw queries, PostgreSQL, Jest (unit + `npm run test:integration` on a scratch DB), React 19 + MUI 7, Vitest, Helm.

**Spec:** `docs/superpowers/specs/2026-11-02-shadow-ai-syslog-listener-design.md` (read it before any task).

## Global Constraints

- Port default `6514`; env vars exactly: `SHADOW_AI_SYSLOG_ENABLED`, `SHADOW_AI_SYSLOG_PORT`, `SHADOW_AI_SYSLOG_TLS_CERT_FILE`, `SHADOW_AI_SYSLOG_TLS_KEY_FILE`, `SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT`, `SHADOW_AI_SYSLOG_ALLOW_IP_ONLY`. Booleans are on only for the string `"true"`.
- Key format `vwsl_{organizationId}_{48 lowercase hex}`; stored as SHA-256 hex `key_hash` + `key_prefix` (first 16 chars); full key returned once only, never logged.
- Line field literal: `vw_source=<key>`; JSON field `"vw_source"`.
- Limits: 64 KiB per message, 500 connections per process, 5 min idle, 30 s TLS handshake, close after 100 lines or 60 s with no valid key, flush at 500 events or 2 s, source cache TTL 60 s.
- Drop reasons exactly: `no_user`, `no_destination`, `unparseable`, `wrong_sender_ip`, `rate_limited`.
- Never log raw lines or keys; peer IP only, at debug.
- Repo rules: work in `~/verifywise-syslog` only; run Servers gates from `Servers` (`npm run build`, `npm run format-check`), Clients gates from `Clients` (`npm run typecheck`, `npm run i18n:audit:strict`, `npm run format-check`); never run bare `npx jest <pattern>` (use `npm run test -- <pattern>` or add `--testPathIgnorePatterns=/tests/integration/`); integration tests only via `npm run test:integration` with a scratch `DB_NAME` (memory note `local-integration-tests-scratch-db.md`); UI copy sentence case, no em dashes; pixel-string spacing; house components (`CustomizableButton`, `StandardModal`).
- Install deps once before Task 1: `cd Servers && npm ci` and `cd Clients && npm ci`.

## Review Focus

1. A key split across two TCP chunks, or a line split mid-key: the line must still route correctly (Task 1 framing test with chunk boundary inside `vw_source=`; Task 4 integration test writes a line in two `socket.write` calls).
2. The same key appearing on lines of two organizations' parsers on one relay connection: each line routes to its own source (Task 4 test "one connection, two sources").
3. Squid lines where the user is `-` or a non-email username: dropped as `no_user`, counted, connection stays open (Task 1 parser test; Task 4 counts).
4. A regenerated or deleted key keeps arriving on an open connection: after cache invalidation, lines write nothing (Task 4 test using `invalidateSourceCache`).
5. Legacy rows with a hostname in `source_identifier`: PATCH `{ is_active: false }` succeeds, PATCH `{ source_identifier: "proxy-01.corp.com" }` is 400 (Task 3 test).

---

### Task 1: Pure syslog modules (framing, header, key, IP, parsers)

**Files:**
- Create: `Servers/services/shadowAiSyslog/framing.ts`, `header.ts`, `sourceKey.ts`, `ip.ts`, `parsers.ts`, `types.ts`
- Test: `Servers/services/shadowAiSyslog/__tests__/framing.test.ts`, `header.test.ts`, `sourceKey.test.ts`, `parsers.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `type ParserType = "zscaler" | "netskope" | "squid" | "generic_kv"`; `type DropReason = "no_user" | "no_destination" | "unparseable" | "wrong_sender_ip" | "rate_limited"`; `interface SyslogEvent { user_email: string; destination: string; timestamp: string; uri_path?: string; http_method?: string; action?: "allowed" | "blocked"; department?: string }`; `type ParseResult = { ok: true; event: SyslogEvent } | { ok: false; reason: DropReason }`.
  - `framing.ts`: `class SyslogFramer { constructor(maxMessageBytes = 65536); push(chunk: Buffer): { messages: string[]; oversized: number } }` handling RFC 6587 octet counting and LF/CRLF on the same stream.
  - `header.ts`: `stripSyslogHeader(msg: string): { body: string; headerTimestamp?: string }` for RFC 5424, RFC 3164 or none.
  - `sourceKey.ts`: `SOURCE_KEY_RE = /^vwsl_(\d+)_([a-f0-9]{48})$/`; `generateSourceKey(organizationId: number): { key: string; hash: string; prefix: string }`; `hashSourceKey(key: string): string`; `orgIdFromKey(key: string): number | null`; `extractSourceKey(body: string): { key: string | null; rest: string }` (finds `vw_source=<key>` or `"vw_source":"<key>"`, removes it and one adjacent separator).
  - `ip.ts`: `normalizeIp(ip: string): string | null` (IPv4-mapped IPv6 → IPv4, IPv6 lowercased and compressed via `net.isIP` + `new URL("http://[x]")` or equivalent; invalid → null).
  - `parsers.ts`: `parseLine(parser: ParserType, body: string, headerTimestamp?: string, receivedAt?: Date): ParseResult`.

- [ ] **Step 1: Write failing tests**

`parsers.test.ts` uses the four guide examples verbatim (from `shared/user-guide-content/content/shadow-ai/integration-guide.ts:271,299,328,373`) and asserts e.g.:

```ts
expect(parseLine("zscaler", "user=alice@company.com dst=chat.openai.com method=POST uri=https://chat.openai.com/v1/chat action=allowed department=Engineering"))
  .toEqual({ ok: true, event: expect.objectContaining({ user_email: "alice@company.com", destination: "chat.openai.com", uri_path: "/v1/chat", http_method: "POST", action: "allowed", department: "Engineering" }) });
expect(parseLine("squid", "1707489120.000 200 10.0.0.1 TCP_MISS/200 1024 POST https://chat.openai.com/v1/chat alice@company.com DIRECT/chat.openai.com"))
  .toEqual({ ok: true, event: expect.objectContaining({ user_email: "alice@company.com", destination: "chat.openai.com", timestamp: "2024-02-09T14:32:00.000Z", http_method: "POST" }) });
expect(parseLine("squid", "1707489120.000 200 10.0.0.1 TCP_TUNNEL/200 0 CONNECT chat.openai.com:443 - HIER_DIRECT/1.2.3.4")).toEqual({ ok: false, reason: "no_user" });
expect(parseLine("squid", "1707489120.000 200 10.0.0.1 TCP_TUNNEL/200 0 CONNECT chat.openai.com:443 bob@x.io HIER_DIRECT/1.2.3.4")).toEqual({ ok: true, event: expect.objectContaining({ destination: "chat.openai.com" }) });
expect(parseLine("netskope", 'vendor {"user":"alice@company.com","url":"https://chat.openai.com/v1/chat","method":"POST","activity":"allowed","timestamp":"2026-02-09T14:32:00Z"}').ok).toBe(true);
expect(parseLine("generic_kv", "suser=alice@company.com dhost=chat.openai.com requestMethod=POST act=blocked")).toEqual({ ok: true, event: expect.objectContaining({ action: "blocked" }) });
expect(parseLine("zscaler", 'user="alice@company.com" dst=chat.openai.com').ok).toBe(true);      // quoted value
expect(parseLine("generic_kv", "dhost=chat.openai.com")).toEqual({ ok: false, reason: "no_user" });
expect(parseLine("generic_kv", "suser=a@b.co")).toEqual({ ok: false, reason: "no_destination" });
expect(parseLine("netskope", "{not json")).toEqual({ ok: false, reason: "unparseable" });
```
Timestamp fallback: no payload timestamp + `headerTimestamp` → header value; neither → `receivedAt.toISOString()`.

`framing.test.ts`: two LF lines in one chunk; CRLF; octet-counted `"12 <34>1 hello!"`-style frame; a frame split across three `push` calls with the boundary inside `vw_source=`; a 70 000-byte line → `oversized: 1` and the next line still delivered.
`header.test.ts`: RFC 5424 (`<165>1 2026-02-09T14:32:00Z host app - - [sd@1 a="b"] body`) → body `body`, headerTimestamp set; RFC 3164 (`<34>Feb  9 14:32:00 host tag: body`) → `body`; no header → unchanged.
`sourceKey.test.ts`: generated key matches `SOURCE_KEY_RE`, `hashSourceKey(key) === hash`, `orgIdFromKey` returns org; `extractSourceKey` at start, middle, end, inside JSON, absent (`key: null`), malformed key (`key: null`, line unchanged). `normalizeIp("::ffff:10.0.0.1") === "10.0.0.1"`, `normalizeIp("2001:DB8:0:0::1") === "2001:db8::1"`, `normalizeIp("proxy-01.corp.com") === null`.

- [ ] **Step 2: Run, expect FAIL** — `cd Servers && npm run test -- services/shadowAiSyslog` → modules not found.
- [ ] **Step 3: Implement the modules** to the interfaces above. Parsers reuse `isEmail` from `Servers/utils/validations/email.utils.ts`.
- [ ] **Step 4: Run, expect PASS** — same command.
- [ ] **Step 5: Commit** — `feat(shadow-ai): syslog framing, header, source key and log parsers`

### Task 2: Shared ingestion service (HTTP behaviour unchanged)

**Files:**
- Create: `Servers/services/shadowAiIngestion.service.ts`
- Modify: `Servers/controllers/shadowAiIngestion.ctrl.ts:33-60` (rate limiter) and `:74-320` (body → service call)
- Test: `Servers/tests/integration/shadowAiIngestion.test.ts` (new, characterises today's REST behaviour)

**Interfaces:**
- Produces: `checkShadowAiRateLimit(organizationId: number, batchSize: number): Promise<boolean>` (reads `getSettingsQuery`, same in-memory buckets as today; settings failure → allow); `ingestShadowAiEvents(organizationId: number, events: ShadowAiIngestionRequest["events"], options?: { transaction?: Transaction }): Promise<{ ingested: number }>` (normalise → match → model → ensure tool → insert → counters → commit → `evaluateRulesForBatch` fire-and-forget; uses `options.transaction` when given and does not commit it).

- [ ] **Step 1: Write the characterisation test first** (passes against current code): with a scratch org + API key created via `generateApiKey`/insert utils, `POST /api/v1/shadow-ai/events` with two events (one to `chat.openai.com`, one to `example.com`) → 200 `{ ingested: 2 }`; one `shadow_ai_tools` row for the org; `shadow_ai_events` has 2 rows, one with `detected_tool_id` null; missing key → 401; bad email → 400; 10 001 events → 413; other org has 0 rows.
- [ ] **Step 2: Run it green on current code** — `cd Servers && DB_NAME=verifywise_it_syslog npm run test:integration -- shadowAiIngestion` → PASS.
- [ ] **Step 3: Extract** the service and make the controller call it. Responses and status codes unchanged.
- [ ] **Step 4: Run again** → PASS; `npm run build` exit 0.
- [ ] **Step 5: Commit** — `refactor(shadow-ai): move event ingestion into a shared service`

### Task 3: Source keys, status columns, API and validation

**Files:**
- Create: `Servers/database/migrations/20261102120000-shadow-ai-syslog-source-keys.js`
- Modify: `Servers/utils/shadowAiConfig.utils.ts:11-125`, `Servers/controllers/shadowAi.ctrl.ts` (syslog section ~1058-1200), `Servers/middleware/validators/shadowAi.validator.ts:67-84`, `Servers/routes/shadowAi.route.ts:83-86`, `Servers/domain.layer/interfaces/i.shadowAi.ts` (`IShadowAiSyslogConfig`), `Servers/locales/*` for new messages
- Test: `Servers/tests/integration/shadowAiSyslogConfig.test.ts`

**Interfaces:**
- Consumes: `generateSourceKey`, `normalizeIp` (Task 1).
- Produces:
  - Columns per spec: `key_hash VARCHAR(64) NULL` unique, `key_prefix VARCHAR(20) NULL`, `last_event_at TIMESTAMPTZ NULL`, `events_accepted BIGINT NOT NULL DEFAULT 0`, `events_dropped BIGINT NOT NULL DEFAULT 0`, `last_drop_reason VARCHAR(50) NULL`, `source_identifier` nullable. Down migration reverses.
  - `listActiveSyslogSourcesQuery(): Promise<Array<{ id; organization_id; parser_type; source_identifier: string | null; key_hash: string | null }>>` (cross-org, `is_active = true`, used only by the listener).
  - `recordSyslogSourceStatsQuery(organizationId: number, configId: number, accepted: number, dropped: number, lastDropReason: DropReason | null, transaction?: Transaction): Promise<void>` (one UPDATE; sets `last_event_at = NOW()` when `accepted > 0`).
  - `regenerateSyslogKeyQuery(organizationId, configId): Promise<{ config: IShadowAiSyslogConfig; key: string } | null>`.
  - Routes: `POST /config/syslog` → 201 `{ ...config, key }`; `POST /config/syslog/:id/regenerate-key` → 200 `{ ...config, key }`; `GET /config/syslog/status` → 200 `{ enabled, port, tls, plaintext, ipOnly }` (from the listener config reader in Task 4; until then read env directly through `readSyslogListenerConfig` defined here in `Servers/services/shadowAiSyslog/config.ts`: `readSyslogListenerConfig(env = process.env): { enabled: boolean; port: number; tlsCertFile?: string; tlsKeyFile?: string; allowPlaintext: boolean; allowIpOnly: boolean; multiTenancy: boolean }`). All Admin/SuperAdmin only, same 403 copy as today. No response ever includes `key_hash`. After create/update/regenerate/delete call `invalidateSourceCache()` (export a no-op stub from `Servers/services/shadowAiSyslog/sourceCache.ts` in this task; Task 4 fills it in).
  - Validation: `source_identifier` optional on create; when present (create or PATCH), must satisfy `normalizeIp(value) !== null` and is stored normalised; empty string or null clears it.

- [ ] **Step 1: Failing tests** — create returns a key matching `SOURCE_KEY_RE` once; GET list has `key_prefix` and no `key_hash`/`key`; regenerate returns a different key and the old hash is gone; create with `source_identifier: "::ffff:10.0.0.9"` stores `10.0.0.9`; create with `"proxy-01.corp.com"` → 400; a legacy row inserted directly with `source_identifier = 'proxy-01.corp.com'` can be PATCHed `{ is_active: false }` (200) but PATCH `{ source_identifier: "proxy-01.corp.com" }` → 400; Editor → 403 on all four routes; org B cannot regenerate org A's source (404); status endpoint reflects env (set `process.env` in test); migration up then down then up on a DB with a legacy row keeps that row.
- [ ] **Step 2: Run, expect FAIL** — `DB_NAME=verifywise_it_syslog npm run test:integration -- shadowAiSyslogConfig`.
- [ ] **Step 3: Implement** migration, utils, controller, validator, routes, i18n keys (Servers locales follow existing pattern).
- [ ] **Step 4: Run, expect PASS**; then `npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`, `npm run build`, `npm run format-check` all exit 0.
- [ ] **Step 5: Commit** — `feat(shadow-ai): source keys, status columns and status endpoint for syslog sources`

### Task 4: Listener, source cache, batching and startup

**Files:**
- Create: `Servers/services/shadowAiSyslog/listener.ts`, `sourceCache.ts` (replace stub), `batcher.ts`, `config.ts` (extend if needed)
- Modify: `Servers/index.ts:118-160` (start after `app.listen`, stop in `shutdown`)
- Test: `Servers/services/shadowAiSyslog/__tests__/config.test.ts`, `Servers/tests/integration/shadowAiSyslogListener.test.ts`

**Interfaces:**
- Consumes: Task 1 modules; `ingestShadowAiEvents`, `checkShadowAiRateLimit` (Task 2); `listActiveSyslogSourcesQuery`, `recordSyslogSourceStatsQuery`, `readSyslogListenerConfig` (Task 3).
- Produces:
  - `sourceCache.ts`: `resolveByKeyHash(hash: string): Promise<CachedSource | null>`; `resolveByIp(ip: string): Promise<CachedSource | "ambiguous" | null>`; `invalidateSourceCache(): void`; `interface CachedSource { configId: number; organizationId: number; parserType: ParserType; allowedIp: string | null }`. Reload all active rows at most every 60 s; a key whose embedded org differs from the row's org never resolves.
  - `batcher.ts`: `class SourceBatcher { add(src: CachedSource, event: SyslogEvent): void; drop(src: CachedSource, reason: DropReason): void; flushAll(): Promise<void> }` flushing per source at 500 events or 2 s; each flush re-resolves the source (gone → discard), checks `checkShadowAiRateLimit` (over → count `rate_limited`), then in one `sequelize.transaction()` runs `SET LOCAL app.current_org = :orgId`, `ingestShadowAiEvents(orgId, events, { transaction })`, `recordSyslogSourceStatsQuery(...)`, commit. Failure → rollback, count, log once per source per minute.
  - `listener.ts`: `startSyslogListener(cfg = readSyslogListenerConfig()): Promise<SyslogListenerHandle | null>`; `interface SyslogListenerHandle { port: number; close(): Promise<void> }`. Returns `null` when disabled. Throws a descriptive error (caught and logged in `index.ts`, backend keeps running) when neither TLS files nor plaintext are allowed, or when `allowIpOnly && multiTenancy`. First-byte peek: `0x16` → `tls.TLSSocket` wrap with the cert/key (refuse if no TLS configured); else plaintext (refuse if not allowed). Per line: framer → `stripSyslogHeader` → `extractSourceKey` → resolve by key hash, else (IP-only on) resolve by peer IP (`"ambiguous"` → drop, and both sources get `last_drop_reason` via the batcher) → allowed-IP check (`wrong_sender_ip`) → `parseLine` → batcher. Connection limits from Global Constraints.
  - Startup log line exactly `Shadow AI syslog listener started on port ${port} (tls: on|off, plaintext: on|off, ip-only: on|off)`.

- [ ] **Step 1: Failing tests** — `config.test.ts`: defaults (`enabled false`, `port 6514`), `"true"`-only booleans. Integration (listener on port 0, plaintext allowed, and a second run with TLS using a cert made by `execFileSync("openssl", ["req","-x509","-newkey","rsa:2048","-nodes","-subj","/CN=localhost","-days","1","-keyout",k,"-out",c])` in a temp dir): a zscaler line with org A's key → after `flushAll()` one event in org A, tool created, `events_accepted = 1`, `last_event_at` set; same line with org B's key → org B only; one connection carrying both → both orgs get theirs; line with no key → nothing written, connection closed after 100 such lines; unknown key → nothing; regenerate org A's key + `invalidateSourceCache()` → old-key line writes nothing; allowed IP `10.9.9.9` set → `wrong_sender_ip` counted; Squid `-` user → `events_dropped = 1`, `last_drop_reason = 'no_user'`; line written in two `socket.write` calls split inside `vw_source=` → accepted; `startSyslogListener` with `allowIpOnly: true, multiTenancy: true` rejects; IP-only with one matching source routes, with two → nothing written and both sources' `last_drop_reason` set. Run the suite also with `RLS_ENFORCEMENT_ENABLED=true`.
- [ ] **Step 2: Run, expect FAIL** — `npm run test -- services/shadowAiSyslog/__tests__/config` and `DB_NAME=verifywise_it_syslog npm run test:integration -- shadowAiSyslogListener`.
- [ ] **Step 3: Implement** cache, batcher, listener; wire into `index.ts` (start after `app.listen`; on failure `logger.error` and continue; `await handle?.close()` in `shutdown` before `server.close` callback work).
- [ ] **Step 4: Run, expect PASS** (both RLS modes); `npm run build`, `npm run format-check` exit 0; Task 2 test still PASS.
- [ ] **Step 5: Commit** — `feat(shadow-ai): syslog listener with per-source keys`

### Task 5: Settings page

**Files:**
- Modify: `Clients/src/application/repository/shadowAi.repository.ts`, `Clients/src/domain/interfaces/i.shadowAi.ts`, `Clients/src/presentation/pages/ShadowAI/SettingsPage.tsx:428-` (`SyslogConfigSection`), `Clients/src/i18n/translations.ts` (de/fr/es), `Clients/src/test/mocks/data/shadowAi.ts`
- Test: `Clients/src/presentation/pages/ShadowAI/__tests__/SettingsPage.test.tsx`, `Clients/src/application/repository/tests/shadowAi.repository.test.ts`

**Interfaces:**
- Consumes: Task 3 routes and response shapes.
- Produces: repository `regenerateSyslogKey(id: number): Promise<IShadowAiSyslogConfig & { key: string }>`, `getSyslogListenerStatus(): Promise<{ enabled: boolean; port: number; tls: boolean; plaintext: boolean; ipOnly: boolean }>`; `IShadowAiSyslogConfig` gains `source_identifier: string | null`, `key_prefix`, `last_event_at`, `events_accepted`, `events_dropped`, `last_drop_reason`.

UI per spec "Settings page": status line ("Syslog listener is on. Send to {host}:{port} over TLS." / "Syslog listener is off. Set SHADOW_AI_SYSLOG_ENABLED=true on the server to turn it on."), Add source fields (parser type; "Allowed sender IP (optional)"), key dialog via `StandardModal` showing the key once with a copy button and the line `vw_source=<key>`, row columns (key prefix or "No key yet" + "Generate key", "Last received", accepted, dropped, last drop reason in plain words), legacy flag "Not an IP address. Clear it or enter the sender's IP." Host shown is `window.location.hostname`.

- [ ] **Step 1: Failing tests** — status on/off copy renders; creating a source opens the dialog containing `vw_source=vwsl_`; a row with `key_prefix: null` shows "No key yet" and "Generate key"; a row with `source_identifier: "proxy-01.corp.com"` shows the legacy flag; drop reason `no_user` renders "No user email in the log line".
- [ ] **Step 2: Run, expect FAIL** — `cd Clients && npx vitest run src/presentation/pages/ShadowAI src/application/repository/tests/shadowAi.repository.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**; `npm run typecheck`, `npm run i18n:audit:strict`, `npm run format-check` exit 0.
- [ ] **Step 5: Commit** — `feat(shadow-ai): syslog source keys and status in Settings`

### Task 6: Deployment and documentation

**Files:**
- Modify: `Servers/.env.example`, `docker-compose.yml`, `docker-compose.prod.yml` (commented vars + `# - "6514:6514"`), `kubernetes/helm/verifywise/values.yaml`, `templates/backend-deployment.yaml`, `templates/configmap.yaml`, new `templates/shadow-ai-syslog-service.yaml` (rendered only when `shadowAiSyslog.enabled`), `kubernetes/backend-deployment.yaml` (comment only), `ansible/templates/.env.j2` + `ansible/group_vars/all.yml` (pass-through, default off), `install.sh` only if it writes backend env, `shared/user-guide-content/content/shadow-ai/integration-guide.ts` and `settings.ts` (syslog sections), `docs/deployment/CONFIGURATION_REFERENCE.md` (new "Shadow AI syslog listener" section), new `docs/technical/infrastructure/shadow-ai-syslog.md`, `CLAUDE.md` Detailed References row
- Test: `helm template kubernetes/helm/verifywise --set shadowAiSyslog.enabled=true` renders the Service and port; with default values it renders neither.

- [ ] **Step 1:** Helm and Compose changes; verify with `helm template ... | grep -c 6514` (≥2 when enabled, 0 by default). If `helm` is missing, say so and verify by reading the template.
- [ ] **Step 2:** Rewrite the guide's syslog sections per spec "Documentation": port 6514, TLS, the `vw_source=<key>` field with one example per product (each guide example line with the field added), optional allowed IP, IP-only for self-hosted, status columns and drop reasons, no claims beyond what is built. Run the humanizer rules (no em dashes, sentence case).
- [ ] **Step 3:** Mirror changed guide files to `~/website/verifywise/content/user-guide/` (do not commit the website repo).
- [ ] **Step 4:** Gates: Servers `npm run build`, `npm run format-check`; Clients `npm run typecheck` (guide content is compiled into Clients).
- [ ] **Step 5: Commit** — `docs(shadow-ai): syslog listener setup, deployment values and guide`
