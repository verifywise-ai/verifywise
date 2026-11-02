# Audit: shadow-ai/integration-guide
**Article path:** shared/user-guide-content/content/shadow-ai/integration-guide.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The integration guide contains accurate claims about REST API endpoints and batch sizes. The syslog claims in the earlier audit were checked only against config storage code, not a listener, and were wrong: no listener existed then. The syslog section was rewritten on 2026-11-02 from `Servers/services/shadowAiSyslog/`.

## Findings
(No issues found during audit.)

## Verified claims (sampled)

- **Claim:** "The endpoint accepts batches of up to 10,000 events per request." (block: step-2-send-events) — verified at `Servers/controllers/shadowAiIngestion.ctrl.ts:29` where `MAX_EVENTS_PER_REQUEST = 10000`; also line 110 enforces this limit with HTTP 413 on overflow.
- **Claim:** "**Endpoint:** `POST /api/v1/shadow-ai/events`" (block: step-2-send-events) — verified at `Servers/controllers/shadowAiIngestion.ctrl.ts:70` function name `ingestEvents` with comment "POST /api/v1/shadow-ai/events".
- **Correction (2026-11-02):** the earlier entry here said the listener defaults to port 5514 and called it verified. That was wrong: the audit read only config-storage code and no listener existed. The listener defaults to port 6514 (`Servers/services/shadowAiSyslog/config.ts:19`), is off unless `SHADOW_AI_SYSLOG_ENABLED=true` (`config.ts:36`), and is enabled with six `SHADOW_AI_SYSLOG_*` variables.
- **Claim:** "Select the **parser type** that matches your data source (Zscaler, Netskope, Squid proxy, or Generic key-value)" (block: syslog-step-2) — verified at `Servers/utils/shadowAiConfig.utils.ts:36` where `parser_type` field is stored in `shadow_ai_syslog_config` table; Clients/src/application/repository/shadowAi.repository.ts:314-320 confirms API accepts `parser_type` in create and update operations.
- **Correction (2026-11-02):** the earlier entry said the listener matches connections by source IP and silently drops unknown IPs. Lines are routed by a per-source key carried as `vw_source=<key>` (`sourceKey.ts`, `listener.ts`). The optional Allowed sender IP is an extra check, and IP-only matching is a self-hosted, single-tenant mode (`SHADOW_AI_SYSLOG_ALLOW_IP_ONLY`).

## Skipped / non-verifiable
- "This guide walks you through connecting your network infrastructure to VerifyWise Shadow AI detection" — opinion/motivation only.
- "The REST API is the most flexible integration method" — opinion (integration methodology preference).
- "Syslog integration is ideal for network proxies and firewalls" — opinion (use-case suitability claim).
- Example log lines (Zscaler, Netskope, Squid, Generic) — example claims; verifiable only with live parser, not in static code. Marked for browser escalation if parsing fidelity is critical, but claim structure is sound.
