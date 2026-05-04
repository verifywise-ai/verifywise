# User guide audit — global summary

**Date:** 2026-04-29
**Articles audited:** 91 / 91 (100%)
**Phase 1 (calibration sample):** 6 articles, 5 reused as-is, 1 re-audited under v2 (`ai-gateway/guardrails`)
**Phase 2 (full audit):** 86 audit runs (85 new + 1 re-audit), 13 collections
**Spec:** `docs/superpowers/specs/2026-04-29-user-guide-truthfulness-audit-design.md`

---

## Top-line numbers

**Verdict distribution (91 articles):**

| Verdict | Count | % |
|---|---|---|
| ✅ clean | 35 | 38% |
| ⚠️ minor (1 finding) | 22 | 24% |
| ⚠️ minor (2 findings) | 21 | 23% |
| ❌ significant (1 finding) | 6 | 7% |
| ❌ significant (2 findings) | 3 | 3% |
| ❌ significant (3 findings) | 4 | 4% |

**Total findings across all reports:** 89 across 56 articles. Status breakdown:
- ❌ wrong: 35
- ⚠️ partial: 45
- ❓ unverifiable: 9

**Browser escalation:** 0 across all 91 audits. Code-first approach was sufficient.

---

## Per-collection summary

| Collection | Articles | ✅ | ⚠️ | ❌ | Total findings |
|---|---|---|---|---|---|
| training | 1 | 0 | 1 | 0 | 2 |
| reporting | 2 | 0 | 1 | 1 | 5 |
| getting-started | 4 | 2 | 2 | 0 | 3 |
| policies | 4 | 1 | 1 | 2 | 6 |
| ai-detection | 5 | 1 | 4 | 0 | 5 |
| integrations | 5 | 1 | 4 | 0 | 6 |
| risk-management | 5 | 1 | 2 | 2 | 9 |
| settings | 5 | 2 | 1 | 2 | 5 |
| shadow-ai | 6 | 3 | 3 | 0 | 6 |
| compliance | 8 | 4 | 4 | 0 | 5 |
| llm-evals | 13 | 5 | 6 | 2 | 11 |
| ai-governance | 16 | 5 | 9 | 2 | 15 |
| ai-gateway | 17 | 11 | 4 | 2 | 11 |
| **Totals** | **91** | **35** | **42** | **14** | **89** |

---

## Findings by type

| Type | Count |
|---|---|
| UI | ~22 |
| Quantitative | ~22 |
| Behavior | ~12 |
| Reference / Cross-doc | ~5 |
| Compliance | ~3 |
| Negative | ~2 |
| Example | ~2 |
| Mixed/multiple | ~10 |

(Approximate due to mixed-type labels; UI and Quantitative dominate by far.)

---

## Recurring drift patterns

Across collections, four patterns dominate:

1. **Enum/list count drift.** The most common single failure mode. Docs describe enums as natural-language lists ("five categories", "100+ patterns", "8 supported providers", "four roles") that drift behind code without resyncing. Examples:
   - `policies/policy-templates`: doc says 5 categories, enum has 6
   - `ai-detection/scanning`: doc says 100+ patterns, code has 83
   - `llm-evals/configuring-scorers`: doc says 6 scorers, code has 13
   - `llm-evals/settings`: doc lists 8 providers, code has 4
   - `risk-management/risk-mitigation`: doc says 5 statuses, enum has 7
   - `settings/user-management`: missing Super Admin from role lists
   - `compliance/nist-ai-rmf`: subcategory counts (~19/~18/~25/~15) wrong (actual 25/23/26/19)

2. **Enum string vs natural-language description drift.** Docs describe enum values in user-friendly prose while the actual UI shows the raw enum string. Users see one thing, docs describe another:
   - `risk-management/vendor-risks`: "Internal business data" (doc) vs "Internal only" (enum)
   - `compliance/eu-ai-act`: "Waiting" (doc) vs "Not started" (UI)
   - `policies/policy-versioning`: "Under review" vs "Under Review" capitalization
   - `risk-management/risk-assessment`: "Almost certain" vs "Almost Certain"

3. **UI label drift.** Specific button or column labels in docs no longer match the rendered UI:
   - `training/training-tracking`: button is "New training", doc says "Add training"
   - `getting-started/quick-start` + `dashboard`: "Controls hub" referenced but doesn't exist
   - `policies/policy-management`: icon listed as FileText, actually ShieldHalf
   - `reporting/generating-reports`: doc says "Generate use case report" button; actual UI has "Generate report" + dropdown
   - `ai-governance/agent-discovery`: button labeled "Sync now" not "Refresh"
   - `ai-governance/watchtower`: events table column list mismatch

4. **Permission model drift.** Documented permissions don't match the implemented authorization:
   - `settings/organization-settings`: doc says Editor can modify, code is Admin-only
   - `ai-governance/share-links`: doc says Admin revokes, code is creator-only
   - `settings/organization-settings`: char limit doc 100, code 50

These four patterns account for the vast majority of the 89 findings. They suggest a systematic gap: the docs aren't auto-derived from enum/permission/UI definitions, so any code change that doesn't trigger a doc edit produces drift.

---

## Cluster findings (logged for fix decisions)

Findings that span multiple articles, captured in `_fix-decisions.md`:

1. **Controls hub** — referenced in `getting-started/dashboard.ts` AND `getting-started/quick-start.ts` but doesn't exist anywhere in the app. **Decision: remove from docs** (already logged).

2. **Policies collection structural drift** — `policy-approval.ts` and `policy-templates.ts` are both about templates; no article covers actual policy approval workflow. The `ai-governance/approval-workflows` article documents an approval system but with its own ❌ finding (lists "Expired" status that doesn't exist). **Decision needed:** rename `policy-approval.ts`, possibly write new approval-workflow content, or merge into ai-governance/approval-workflows.

3. **Slack notification types** — `settings/notifications.ts` and `integrations/slack-integration.ts` both describe notification categories that don't match the 28-member `NotificationType` enum. Same drift, two articles.

4. **AI Gateway events endpoint path** — `ai-gateway/settings.md` Finding 1 (`/api/v1/shadow-ai/events` vs `/v1/shadow-ai/events`) was caught, while `shadow-ai/integration-guide.md` verified `/api/v1/...` as ✅. Either routes mount differently for different consumers or one audit is wrong. **Decision needed:** investigate.

---

## Verification spot-check results

Each collection had a verification subagent re-check 2 verified claims per report. Aggregate:

| Collection | Spot-checked | Failed | Notes |
|---|---|---|---|
| training | 2 | 0 | |
| reporting | 4 | 0 | |
| getting-started | 8 | 0 | |
| policies | 8 | 1 | Caught a real ❌ ("five categories") the audit missed; added retroactively |
| ai-detection | 10 | 0 | |
| integrations | 10 | 0 | |
| risk-management | 10 | 1 | Caught capitalization mismatch; added retroactively |
| settings | 10 | 0* | "Failures" were re-discoveries of already-found Findings (verifier methodology issue) |
| shadow-ai | 12 | 0 | |
| compliance | 16 | 2 | Caught a broken evidence citation (FRIA formula) and an approximation hiding a real discrepancy (NIST counts) |
| llm-evals | 64 | 2 | leaderboard wording, models claim partial |
| ai-governance | 32 | 5 | Mostly evidence-quality issues, not factually-wrong verifications |
| ai-gateway | 24 | 7 | Mostly evidence-citation precision issues |
| **Total** | **210** | **18** | **~91% pass rate** |

The verification subagent earned its keep — at least 4 of the failures translated to real findings the original audit missed. Most of the remaining failures are evidence-quality issues (vague file paths, missing line numbers) rather than wrong claims.

---

## Method-quality observations (for reference)

Issues that surfaced during the audit but didn't block report production:

- **Persistent v2 prompt regression: Skip vs ❓.** Despite explicit rules, several audit subagents kept putting verifiable-but-not-verified claims in Skipped instead of marking them ❓. Affected: `reporting/dashboard-analytics`, `getting-started/welcome`, `shadow-ai/insights`, others.
- **Two subagent failures to write reports** ("read-only mode" claim — incorrect): `automations`, `model-inventory`, `reports`, `guardrails` re-audit. Parent thread transcribed in 4 cases. Subagents had access to the Write tool but refused.
- **Inconsistent quality on duplicate runs**: `automations` first attempt found 3 ⚠️ findings, second came back ✅ clean. Same article, same prompt.
- **Verifier confused by Findings vs Verified Claims**: in the settings collection, the verifier flagged claims that were already in the Findings section as "false-positives" (they weren't — the audit had already caught them).

These are caveats on the audit, not blockers — but worth noting before committing to fix decisions on individual findings.

---

## Articles by severity (worst first)

**❌ significant — 13 articles:**
- ai-gateway/guardrails (3)
- ai-gateway/logs (1)
- compliance/eu-ai-act (1, originally ⚠️ now upgraded due to status enum issue)
- ai-governance/project-overview (1)
- ai-governance/watchtower (1)
- llm-evals/configuring-scorers (1)
- llm-evals/reports (1)
- llm-evals/settings (1)
- policies/policy-management (1)
- policies/policy-templates (3)
- reporting/dashboard-analytics (3)
- risk-management/risk-mitigation (2)
- risk-management/vendor-risks (3)
- settings/organization-settings (2)
- settings/user-management (2)

**⚠️ minor — 43 articles:** (see per-collection summaries)

**✅ clean — 35 articles:** (38% of total — strong baseline)

---

## Recommended next steps

1. **Triage the 89 findings** by FIX/SKIP/PRODUCT (per spec Phase 3). Batch by collection. The recurring patterns suggest some findings should be fixed at the **system level** rather than per-doc:
   - Add a doc-generation step that derives enum-list articles from the actual TypeScript enums, not from hand-written prose.
   - Permission claims should be auto-derived from `permissions.ts`, not hand-written.

2. **Address the 4 cluster findings** as single decisions (Controls hub, policies-collection structure, Slack notification types, AI Gateway events endpoint).

3. **Optional re-audit pass** on the articles where the verifier flagged evidence-quality issues — most are minor, but a few may hide real bugs.

4. **Phase 3 (fix pass)** can begin once decisions are recorded in `_fix-decisions.md`.

---

## Files produced (audit artifacts)

```
docs/user-guide-audit/
├── _calibration.md             # Phase 1 method evaluation
├── _fix-decisions.md            # Rolling user decisions for fix pass
├── _subagent-prompt.md          # v1 (Phase 1 only)
├── _subagent-prompt-v2.md       # v2 (Phase 2)
├── _verification-subagent-prompt.md
├── _summary.md                  # this file
└── <13 collections>/
    ├── <article>.md             # 91 audit reports
    ├── _verification.md         # per-collection spot-check
    └── _summary.md              # per-collection summary
```

All committed to branch `docs/user-guide-audit-phase1` (despite the name, includes Phase 2).
