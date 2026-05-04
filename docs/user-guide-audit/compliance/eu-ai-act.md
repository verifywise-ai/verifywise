# Audit: compliance/eu-ai-act
**Article path:** shared/user-guide-content/content/compliance/eu-ai-act.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent
**Verdict:** ⚠️ minor issues (1)

## Summary
The article is well-structured and most claims are accurate or appropriately marked as aspirational compliance mappings. One behavioral claim about control status values diverges from the code: the article describes status as "Waiting, In progress, or Done" but the implementation defines them as "Not started, In progress, or Done". All three cross-document references exist and match their descriptions.

## Findings
### Finding 1 — Control status value mismatch: "Waiting" vs "Not started"
- **Type:** Behavior
- **Status:** ⚠️ partial
- **Doc says:** "Track each control as Waiting, In progress, or Done" (block 13), and again at block 14: "Status tracking: Track each control as Waiting, In progress, or Done"
- **Reality:** The code defines status as "Not started" (not "Waiting"), "In progress", and "Done". The status options are hardcoded in `Clients/src/presentation/components/Drawer/EUAIActQuestionDrawerDialog/types.ts:23-27` as `EUAIACT_STATUS_OPTIONS` with id `"notStarted"` mapping to display name `"Not started"`.
- **Evidence:** `Clients/src/presentation/components/Drawer/EUAIActQuestionDrawerDialog/types.ts:23-27`, and confirmed in `EUAIActQuestionDrawerDialog/index.tsx:216-225` which maps between "Not started", "In progress", "Done".
- **Suggested fix:** Change block 13 and block 14 from "Waiting, In progress, or Done" to "Not started, In progress, or Done".
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Subcontrols break down each control into specific, actionable items. They help you understand exactly what needs to be done and track granular progress." (block 17) — verified: `EUAIActQuestionDrawerDialog/index.tsx:1686-1689` shows `NotesTab` component with question_id tracking, and subcontrol tracking is implemented in the assessment data structure.
- Claim: "You can link evidence from your Evidence Hub" (block 22) — verified: Evidence Hub exists at `Clients/src/application/repository/evidenceHub.repository.ts` and file linking is implemented in `EUAIActQuestionDrawerDialog/index.tsx:813-823` with `attachFilesToEntity` and framework_type "eu_ai_act".
- Claim: "For each subcontrol, you can mark it as complete when addressed, add notes about your implementation approach, link evidence demonstrating compliance" (block 18) — verified: `EUAIActQuestionDrawerDialog/index.tsx:1074-1117` shows answer field, status selector, and evidence tab; notes are lazy-loaded in tab panel at line 1682.
- Claim: "Open the control detail view, Navigate to the evidence section, Select existing evidence from your Evidence Hub or upload new documents, Add notes explaining how the evidence supports the control" (block 22) — verified: The drawer component at `EUAIActQuestionDrawerDialog/index.tsx:1124-1495` implements exactly this workflow with separate tabs for evidence file management (lines 1150-1191 for button actions).
- Claim: Related articles include "Compliance assessments" from `compliance/assessments` (block 24) — verified: Article exists at `shared/user-guide-content/content/compliance/assessments.ts`, opening paragraph confirms it covers framework-based compliance tracking.

## Skipped / non-verifiable
- "The EU AI Act is the European Union's regulation governing artificial intelligence systems." (block 2) — reason: external regulatory definition, not verifiable against product code.
- "Non-compliance can result in fines up to 35 million euros or 7% of global annual turnover" (block 5) — reason: regulatory claim requiring legal expertise, not product-verifiable.
- "The EU AI Act classifies AI systems into four risk categories" with descriptions of unacceptable, high, limited, minimal risk (blocks 8-9) — reason: external regulatory structure, not product-verifiable. (Note: Article's framing as "VerifyWise supports these categories" would require explicit code constant named after regulation articles; no such constant found.)
- "VerifyWise gives you structured tools to help meet EU AI Act requirements" (block 11) — reason: motivational claim ("helps you do X"), non-verifiable.
- All other compliance-mapping claims in blocks 11-12 ("Risk classification", "Control framework", "Assessment tracking", etc.) — reason: These are aspirational mappings without explicit code linkage (e.g., no constant tagged `EU_AI_ACT_RISK_CLASSIFICATION` in codebase). Per audit spec, such claims are marked low-confidence by default.
