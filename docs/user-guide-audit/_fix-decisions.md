# Fix-pass decisions (rolling, made during review gates)

Capture user decisions made at review gates so they're not lost before the fix pass starts. FIX = doc edit. PRODUCT = the app needs to change, not the doc. SKIP = leave as-is.

## getting-started

- **FIX**: Remove "Controls hub" references from both `getting-started/dashboard.ts` (block 16, sidebar bullet) and `getting-started/quick-start.ts` (block 10, "Assurance → Controls hub"). Verified absent across `Clients/src/` and `Servers/` on 2026-04-29; feature does not exist in the app.

## training/training-tracking — SKIPPED (no fix needed)

- Audit Finding 2: enum value is `InProgress = "In Progress"` (capital P), but the UI label and the article both use "In progress" (lowercase p). The user-facing text matches; the inconsistency is at the enum level, not the documentation. No doc change needed.

## shadow-ai/rules — SKIPPED (verification-only)

- Audit Finding 2: cross-doc reference verification — the Settings article exists and matches. No doc change needed.

## compliance/ce-marking — SKIPPED (needs product input)

- Audit Findings 1+2: doc lists Title Case status values for declaration ("Draft, Ready for signature, Signed, Archived") and registration ("Not registered, Pending, Registered, Rejected"), but backend only has `"draft"` and `"not_registered"` as defaults — no formal enum exists. The other values may be UI display labels, may be aspirational, or may simply not exist yet. Needs product confirmation of the intended status set before fixing the doc.

## ai-governance/model-lifecycle — RESOLVED (doc was correct)

- The audit was looking at a different enum (control-assessment statuses in Status.ts). The actual Project type at `Clients/src/domain/types/Project.ts:31` defines exactly the 7 statuses the article lists: "Not started", "In progress", "Under review", "Completed", "Closed", "On hold", "Rejected". No doc change needed.

## ai-gateway/mcp-guardrails — RESOLVED (doc was correct)

- Article's `-32003` error code IS in the code at `AIGateway/src/routers/mcp_proxy.py:171` (defined inline, not as a named constant — that's why grep missed it).
- Approval-flow-priority claim ("guardrails run after approval") is also correct: lines 143–171 of mcp_proxy.py check `requires_approval` first (returns -32001) and only run `scan_tool_input` after approval is granted.
- No doc change needed; audit's evidence was incomplete but the documentation is accurate.

## shadow-ai/settings — RESOLVED (doc was correct)

- Doc says X-API-Key auth returns 401 on invalid key. Verified at `Servers/controllers/shadowAiIngestion.ctrl.ts:79,94` — returns 401 for both "Missing X-API-Key header" and "Invalid or revoked API key". The OpenAPI contract the auditor referenced is incomplete (doesn't document 401), but the runtime behavior matches the doc. Optional follow-up: update the OpenAPI spec to include 401, but the user-guide doc is accurate.

## ❓ unverifiable findings — investigation results

Each ❓ finding from the audit was traced to source. Summary:

- **ai-gateway/guardrails Finding 3** (no data leaves network) — RESOLVED in ❌ pass: claim narrowed to "VerifyWise code makes no external API calls during scanning".
- **ai-governance/datasets Finding 1** (49 PII keywords) — FIXED: actual count is 40, found at `Clients/src/presentation/pages/Datasets/BulkUpload/piiDetection.ts:8-49`. Doc updated to "40 known PII keywords".
- **compliance/fria Finding 1** (risk score formula) — RESOLVED: formula IS in code at `Servers/utils/fria.utils.ts:540-569` (severity×15 + confidence×5 per flagged right; likelihood×severity×3 per risk item; cap 100; thresholds 30/60). Audit's evidence pointed to wrong file but the doc is accurate.
- **getting-started/dashboard Finding 2** (Due soon: 7 days) — RESOLVED: confirmed at `Servers/utils/dashboard.utils.ts:81` (`due_date <= CURRENT_DATE + INTERVAL '7 days'`). Doc accurate.
- **integrations/api-access Finding 1** (max API keys) — FIXED: confirmed limit of 10 at `Servers/middleware/tokens.middleware.ts:16-18`. Doc updated to specify "up to 10 API keys".
- **integrations/integration-overview Finding 1** (MLflow hourly sync) — FIXED: no scheduled sync exists in code, only on-demand `POST /api/plugins/mlflow/sync`. Doc updated to "On-demand model sync" + "Manual sync trigger".
- **risk-management/risk-mitigation Finding 3** (Audit/Residual/Target risk) — FIXED: code has `currentRiskLevel` field + calculated residual risk only (no Audit/Target). Doc updated to match the actual two measurements.
- **shadow-ai/rules Finding 1** (50 alerts per batch) — RESOLVED: confirmed at `Servers/services/shadowAiAlertNotification.service.ts:34` (`MAX_ALERTS_PER_BATCH = 50`). Doc accurate.
- **ai-gateway/mcp-guardrails Finding 2** (approval flow priority) — RESOLVED above: code path verified at `AIGateway/src/routers/mcp_proxy.py:143-171`.

## policies — needs decision (structural)

- The collection has two articles that both cover templates:
  - `policy-approval.ts` (id `policy-approval`, title "Policy templates", content = templates)
  - `policy-templates.ts` (id `policy-templates`, title "Policy templates library", content = templates from a library/browser angle)
- There is **no article** covering the actual policy approval workflow, even though the codebase has approval features.
- **Decision needed:**
  1. Rename `policy-approval.ts` to something semantic (e.g., merge into `policy-templates.ts` or split content cleanly), AND
  2. Decide whether to write a new approval-workflow article (or skip if approvals are documented in `ai-governance/approval-workflows.ts` already — needs check during ai-governance audit).
