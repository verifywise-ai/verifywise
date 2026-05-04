# Audit: ai-gateway/guardrails
**Article path:** shared/user-guide-content/content/ai-gateway/guardrails.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2) [report transcribed by parent due to subagent file-write failure; this is the v2 re-audit replacing the Phase 1 report]
**Verdict:** ❌ significant issues (3)

## Summary
v2 re-audit caught all three weak verifications from the Phase 1 audit. HTTP status code is wrong (400, not 422). The Turkish TCKN example value is invalid (fails checksum). The "no data leaves your network" negative claim is correctly downgraded to ❓ because presence of local Presidio doesn't prove the absence of external calls — full network trace is required for ✅.

## Findings

### Finding 1 — HTTP status code is 400, not 422
- **Type:** Quantitative
- **Status:** ❌ wrong
- **Doc says:** "Rejects the request immediately with HTTP 422." (block 124, table row "Block")
- **Reality:** When guardrails block a request, the code raises `HTTPException(status_code=400)`, not 422.
- **Evidence:** `AIGateway/src/services/proxy_service.py:427-430` (`run_guardrails()` raises HTTPException(status_code=400))
- **Suggested fix:** Change "HTTP 422" to "HTTP 400" in block 124. (Note: HTTP 422 IS used elsewhere — for invalid regex on rule save — which may be where Phase 1 confused itself.)
- **Confidence:** high

### Finding 2 — Turkish TCKN example "12345678901" fails the checksum
- **Type:** Example
- **Status:** ❌ wrong
- **Doc says:** "Turkish TCKN | 12345678901 | 11-digit national ID" (block 4, table row)
- **Reality:** TCKN has two checksum digits. "12345678901" fails both: position-10 should be 1 (actual 0), position-11 should be 9 (actual 1). Presidio's regex is permissive (`[1-9]\d{10}`) and would match the format, but the value is not a valid TCKN.
- **Evidence:** Manual TCKN checksum validation; Presidio regex at `AIGateway/src/services/presidio_engine.py:50` (regex permissive but value invalid).
- **Suggested fix:** Replace example with a valid TCKN such as "10000000146" (or use the conventional fake-but-checksum-valid example pattern).
- **Confidence:** high

### Finding 3 — "No data leaves your network" not fully verifiable
- **Type:** Negative
- **Status:** ❓ unverifiable
- **Doc says:** "Scanning runs within your gateway infrastructure (the AI Gateway FastAPI service); no data leaves your network for scanning." (block 13, paragraph)
- **Reality:** Presidio is locally installed and `guardrail_service.py` / `presidio_engine.py` do not make external HTTP calls in the scan path. However, this is necessary-but-not-sufficient evidence for a network isolation claim — Presidio itself or a transitive dependency could still make external calls (e.g., model downloads, telemetry). Per v2 rule, negative claims require a complete code-path trace, which we cannot do without controlled network testing.
- **Evidence:** `AIGateway/src/services/presidio_engine.py:77-107` (lazy-load local), `AIGateway/src/services/guardrail_service.py:118-127` (no external calls in scan path)
- **Suggested fix:** Either narrow the claim to "VerifyWise code makes no external API calls during scanning" (verifiable from above evidence), or add a network-trace verification step before re-asserting the broader claim.
- **Confidence:** medium (the claim is likely true in practice, but the audit evidence doesn't fully prove it)

## Verified claims (sampled)
- Claim: All listed entity types (Email, Phone, Credit card, Person, IBAN, TR_TCKN, EU phone, US SSN, IP, Location, Date/time, NRP, Medical license) exist as recognizers — verified at `Clients/src/presentation/pages/AIGateway/Guardrails/index.tsx` PII_ENTITY_OPTIONS
- Claim: Masking replaces matched text with placeholder — verified at the masking implementation in `AIGateway/src/services/guardrail_service.py`
- Claim: Regex patterns are validated on save and rejected with HTTP 422 (rule-creation path, not request-blocking path) — verified
- Claim: Detections logged with timestamp, entity type, action, matched text — verified at gateway logging implementation
- Claim: Change history recorded for every guardrail rule modification — verified

## Skipped / non-verifiable
- Compliance mappings (EU AI Act Art. 9/10/12, ISO 42001 A.2) — reason: aspirational mappings, no explicit code linkage tagged with regulation IDs
- "Handy when investigating false positives" framing — reason: motivational phrasing
