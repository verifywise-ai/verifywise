# Audit: ai-governance/evidence-collection
**Article path:** shared/user-guide-content/content/ai-governance/evidence-collection.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The article accurately describes evidence collection features with appropriate abstraction for a user guide. It groups the 15 enum evidence types into 6 user-friendly categories, which is a good UX choice. All verified UI claims (sidebar navigation path, drag-drop upload, expiry tracking, model linking) match the implemented code. No significant inaccuracies found.

## Findings
None found. All sampled claims are accurate.

## Verified claims (sampled)
- Claim: "You can access it from Assurance > Evidence in the sidebar" (block 48) — verified at `Clients/src/presentation/components/Sidebar/index.tsx:162` where "Evidence" is a menu item under ASSURANCE group
- Claim: "Upload evidence files by dragging and dropping or clicking to browse" (block 91 caption) — verified in `Clients/src/presentation/components/Modals/FileManagerUpload/index.tsx` which implements `onDrop` and `onDragOver` handlers plus click-to-browse via file input
- Claim: "Expiry tracking for time-sensitive documents" (block 56 checklist) — verified in evidence domain: `docs/technical/domains/evidence.md` confirms Files table has `expiry_date` (TIMESTAMP, nullable) field for document expiration
- Claim: "Linking between evidence and AI models" (block 55 checklist) — verified in `Clients/src/domain/models/Common/evidenceHub/evidenceHub.model.ts` and evidence domain which confirms multi-entity linking to model_id
- Claim: Evidence types grouped into "Technical documentation, Risk assessments, Testing and validation, Policies and procedures, Data documentation, Contracts and agreements" (blocks 106-135) — verified against enum containing 15 specific types (MODEL_CARD, RISK_ASSESSMENT_REPORT, BIAS_AND_FAIRNESS_REPORT, etc.). Article uses conceptual grouping, not technical enum listing; this is appropriate for user guide abstraction.

## Skipped / non-verifiable
- "Evidence collection is the practice of gathering and organizing documentation that proves your AI governance activities are actually happening" (block 13) — opinion/motivation statement about why evidence matters
- "Transform your answer from 'we have a process' to 'here's the documented proof'" (block 17) — motivational framing, not a verifiable claim
- "Without organized evidence, even well-governed AI programs struggle to show their practices" (block 17) — aspirational compliance claim; no code linkage exists for this guarantee
- "Respond quickly to audit requests with organized documentation" (block 28) — benefit framing, not a measurable feature claim
