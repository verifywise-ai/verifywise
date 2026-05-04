# Audit: llm-evals/bias-audits
**Article path:** shared/user-guide-content/content/llm-evals/bias-audits.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The article accurately documents the bias audit feature with correct metric modes and navigation. One quantitative claim requires flagging: the article claims "15 compliance frameworks" when the backend provides 16 presets (including custom). The sidebar icon is verified as `FlaskConical`.

## Findings
### Finding 1 — Framework count mismatch
- **Type:** Quantitative
- **Status:** ⚠️ partial
- **Doc says:** "VerifyWise ships with 15 compliance frameworks out of the box" (block index 2)
- **Reality:** EvalServer /presets/bias_audits/ contains 16 .json preset files: nyc_ll144, eeoc_guidelines, california_feha, eu_ai_act, colorado_sb169, colorado_sb205, illinois_hb3773, texas_traiga, new_jersey, brazil_bill2338, south_korea, singapore_wfa, uk_gdpr_equality, iso_42001, nist_ai_rmf, custom
- **Evidence:** `/Users/gorkemcetin/verifywise/EvalServer/src/presets/bias_audits/` directory listing confirms 16 .json files
- **Suggested fix:** Update to "16 compliance frameworks out of the box" or clarify why custom is excluded from count
- **Confidence:** high

## Verified claims (sampled)
- Claim: "three kinds of outcome data" — verified: MetricMode Literal at `EvalServer/src/engines/bias_audit/models.py:9` defines exactly "selection_rate" | "scoring_rate" | "fairness_metrics" ✓
- Claim: "Open LLM Evals from the flask icon in the sidebar" (block 5) — verified: EvalsDashboard.tsx uses `<FlaskConical>` icon for LLM Evals menu item ✓
- Claim: "calculates per-group rates, cross-group disparities and flags groups" (block 1) — verified: GroupResult model has selection_rate, impact_ratio, flagged fields at `EvalServer/src/engines/bias_audit/models.py:75-78` ✓
- Claim: "three audit metrics: selection rate, scoring rate, fairness metrics" (blocks 8-13) — verified: MetricMode = Literal["selection_rate", "scoring_rate", "fairness_metrics"] ✓
- Claim: "Step 1: Select a compliance framework, Frameworks grouped by audit mode" (blocks 20-22) — verified: BiasAuditConfig supports mode and preset_id fields ✓

## Skipped / non-verifiable
- "You upload records with demographic columns and one of three kinds of outcome data" — instructional/procedural, not falsifiable claim
- "The tool isn't LLM-specific; it works for any system" — opinion about use case
- "interactive results dashboard, raw JSON export and formal PDF report" — output format claims require UI/browser test
