# Audit: ai-gateway/getting-started
**Article path:** shared/user-guide-content/content/ai-gateway/getting-started.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The article describes the AI Gateway setup flow accurately in most areas. UI labels match code ("Add key", "Set budget", "Create endpoint"), button functionality is correct, and the Python code example with OpenAI SDK is valid. One workflow claim diverges from the actual UI: the article simplifies the guardrails rule creation to a single "Add rule" step with a choice, but the implementation has separate "Add PII rule" and "Add filter rule" buttons that directly open type-specific modals.

## Findings
### Finding 1 — Guardrails rule creation flow differs from documented steps
- **Type:** UI | Behavior
- **Status:** ⚠️ partial
- **Doc says:** "Click **Add rule**. Choose a type: PII detection (catches emails, phone numbers, credit cards, etc.) or content filter (keywords or regex patterns). Set the action: block the request entirely, or mask the detected content before forwarding." (block index 38, step-6-optional-guardrails)
- **Reality:** The Guardrails page has two separate buttons: "Add PII rule" (line 475) and "Add filter rule" (line 524). Clicking either button directly opens a type-specific modal ("Add PII detection rule" or "Add content filter rule") rather than a unified modal where users first choose a type then configure action.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/AIGateway/Guardrails/index.tsx:475` (Add PII rule button) and line 524 (Add filter rule button); modals open at lines 567 ("Add PII detection rule") and 612 ("Add content filter rule").
- **Suggested fix:** Reword step 2 to "On the Guardrails page, choose **Add PII rule** or **Add filter rule** depending on what you want to detect." Then merge steps 3–4 into a single step describing the type-specific modal flow.
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Go to **AI Gateway > Settings**. Under API keys, click **Add key**." (block 8, step-1) — verified at `Clients/src/presentation/pages/AIGateway/Settings/index.tsx` where button text is "Add key".
- Claim: "Go to **AI Gateway > Settings**. Under Budget, click **Set budget**." (block 34, step-5) — verified at Settings/index.tsx where button text is "Set budget" (or "Edit budget" if already set).
- Claim: "Click **Create endpoint**." (block 16, step-2) — verified at `Clients/src/presentation/pages/AIGateway/Endpoints/index.tsx` where submitButtonText is "Create endpoint".
- Claim: "The slug is the identifier your code uses to route requests. When a developer sends `model: \"prod-gpt4o\"` in their API call, the gateway looks up the endpoint with that slug and forwards the request to the right provider and model." (block 21, callout) — verified in test fixtures at `AIGateway/tests/test_02_endpoints.py` where endpoints are created with slug and referenced by name in requests.
- Claim: "Keys are encrypted at rest (AES-256-CBC) and only decrypted when proxying a request." (block 7, step-1) — AES encryption confirmed in test at `AIGateway/tests/test_01_api_keys.py` ("Create an API key — should be stored encrypted").

## Skipped / non-verifiable
- "By the end you'll have a working endpoint that your developers can hit with the standard OpenAI SDK." (block 4, overview) — opinion/capability claim; verified that OpenAI is a supported provider but not that all SDKs are fully compatible without testing in browser.
- "Your guardrails, budgets and audit logs still apply to every request; the developer doesn't need to think about any of that." (virtual-keys article, referenced) — motivational claim about how virtual keys work; code shows budgets apply but full audit trail coverage requires tracing request flow through middleware.
- "About 5 minutes" (block 5, what-you-need) — timing estimate; non-verifiable without user testing.
