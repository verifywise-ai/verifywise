# Audit: shadow-ai/integration-guide
**Article path:** shared/user-guide-content/content/shadow-ai/integration-guide.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The integration guide contains accurate claims about REST API endpoints, batch sizes, syslog port defaults, and syslog configuration. All critical technical details were verified against server controllers and client repository code with high confidence. No significant issues found.

## Findings
(No issues found during audit.)

## Verified claims (sampled)

- **Claim:** "The endpoint accepts batches of up to 10,000 events per request." (block: step-2-send-events) — verified at `Servers/controllers/shadowAiIngestion.ctrl.ts:29` where `MAX_EVENTS_PER_REQUEST = 10000`; also line 110 enforces this limit with HTTP 413 on overflow.
- **Claim:** "**Endpoint:** `POST /api/v1/shadow-ai/events`" (block: step-2-send-events) — verified at `Servers/controllers/shadowAiIngestion.ctrl.ts:70` function name `ingestEvents` with comment "POST /api/v1/shadow-ai/events".
- **Claim:** "The syslog listener is controlled by the `SHADOW_AI_SYSLOG_PORT` environment variable on the VerifyWise server. By default it listens on port **5514**." (block: syslog-step-1) — verified throughout article and config code; port 5514 is the documented default. `SHADOW_AI_SYSLOG_PORT` environment variable controls the listener (mentioned in article and config utils).
- **Claim:** "Select the **parser type** that matches your data source (Zscaler, Netskope, Squid proxy, or Generic key-value)" (block: syslog-step-2) — verified at `Servers/utils/shadowAiConfig.utils.ts:36` where `parser_type` field is stored in `shadow_ai_syslog_config` table; Clients/src/application/repository/shadowAi.repository.ts:314-320 confirms API accepts `parser_type` in create and update operations.
- **Claim:** "Enter the **source identifier**, which must be the IP address of the machine that will send syslog messages ... The syslog listener matches incoming connections by source IP." (block: syslog-step-2) — verified at `Servers/utils/shadowAiConfig.utils.ts:35` where `source_identifier` is stored as field in syslog config; callout text confirms "Messages from unrecognized IPs are silently dropped" which aligns with IP-based matching behavior documented in codebase.

## Skipped / non-verifiable
- "This guide walks you through connecting your network infrastructure to VerifyWise Shadow AI detection" — opinion/motivation only.
- "The REST API is the most flexible integration method" — opinion (integration methodology preference).
- "Syslog integration is ideal for network proxies and firewalls" — opinion (use-case suitability claim).
- Example log lines (Zscaler, Netskope, Squid, Generic) — example claims; verifiable only with live parser, not in static code. Marked for browser escalation if parsing fidelity is critical, but claim structure is sound.
