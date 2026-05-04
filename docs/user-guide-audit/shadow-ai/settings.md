# Audit: shadow-ai/settings
**Article path:** shared/user-guide-content/content/shadow-ai/settings.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article accurately documents parser types, retention defaults (30/365/90 days), and risk score weights (40%/25%/15%/20%). Two issues found: the REST API endpoint path omits `/api` prefix in the documentation, and the authentication error response is not defined in the API contract. Department sensitivity score for Finance/Legal/HR is verified at (80).

## Findings

### Finding 1 — REST API endpoint path incorrect
- **Type:** Reference
- **Status:** ❌ wrong
- **Doc says:** "Send events via `POST /api/v1/shadow-ai/events`" (block 3, code block)
- **Reality:** Endpoint is defined as `POST /v1/shadow-ai/events` (no `/api` prefix)
- **Evidence:** `/Users/gorkemcetin/verifywise/docs/api-docs/src/config/endpoints.ts:6707` shows `path: '/v1/shadow-ai/events'`
- **Suggested fix:** Change documentation to `POST /v1/shadow-ai/events`
- **Confidence:** high

### Finding 2 — Authentication 401 response not in API contract
- **Type:** Behavior
- **Status:** ⚠️ partial
- **Doc says:** "Requests without a valid key receive a 401 response" (block 10, callout)
- **Reality:** Endpoint definition shows `requiresAuth: false` with responses [201, 500] only; no 401 defined
- **Evidence:** `/Users/gorkemcetin/verifywise/docs/api-docs/src/config/endpoints.ts:6707-6712` endpoint definition
- **Suggested fix:** Either (a) add 401 to API contract responses, or (b) clarify in doc that authentication is handled separately from HTTP responses
- **Confidence:** medium

## Verified claims (sampled)

- Claim: "Zscaler, Netskope, Squid proxy, Generic key-value" parser types (block 5, table) — verified at `Clients/src/presentation/pages/ShadowAI/SettingsPage.tsx:627-630` enum { zscaler, netskope, squid, generic_kv }
- Claim: "Raw events...30 days, Daily rollups...365 days, Alert history...90 days" (block 19, table) — verified in `pdf-templates/shadow-ai.tsx` product specification
- Claim: "Approval status 40%, Data & compliance 25%, Usage volume 15%, Department sensitivity 20%" (block 24, table) — verified at `Clients/src/presentation/pages/ShadowAI/SettingsPage.tsx:1157-1160` RISK_WEIGHTS constant
- Claim: "Finance, Legal and HR are rated highest (80)" (block 24, table) — verified at `pdf-templates/shadow-ai.tsx` risk score description: "Finance, Legal, and HR carry a base score of 80"
- Claim: "API key is only displayed once at creation time" (block 1, callout warning) — verified UI flow at `Clients/src/presentation/pages/ShadowAI/SettingsPage.tsx:152-176` newlyCreatedKey state management shows key cleared after display

## Skipped / non-verifiable

- "This protects the system from being overwhelmed" (block 16) — motivation/opinion only, not verifiable
- "Consider a shorter retention period for raw events" (block 21, callout) — recommendation, not factual claim
- "Finance, Legal and HR are rated highest" comparative ranking without explicit numerical justification — requires product design review to verify "highest" is correct designation
