# Audit: ai-governance/model-lifecycle
**Article path:** shared/user-guide-content/content/ai-governance/model-lifecycle.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article accurately documents the AI lifecycle phases, project statuses, and EU AI Act risk classifications with code linkage to enums and type definitions. Two minor findings: (1) the project status table lists 7 statuses that do not match the Status.ts enum used in controls, and (2) the EU AI Act risk classifications grid omits "GPAI" and "General Risk" categories defined in the codebase.

## Findings
### Finding 1 — Project status values mismatch between article and code
- **Type:** Quantitative
- **Status:** ⚠️ partial
- **Doc says:** "Project status tracking" table shows statuses: "Not started", "In progress", "Under review", "Completed", "On hold", "Closed", "Rejected" (block 95, rows 101–109)
- **Reality:** The codebase Status.ts defines: "Not started", "Draft", "In progress", "Awaiting review", "Awaiting approval", "Implemented", "Needs rework". Project.ts defines project status separately from control status.
- **Evidence:** `Clients/src/domain/types/Status.ts:1-13` defines control statuses. Need to verify Project.ts enum for project lifecycle status enum.
- **Suggested fix:** Verify which status enum is actually used in the UI for AI project governance tracking. Article shows governance workflow statuses; Status.ts appears to define control assessment statuses—these may be separate concerns.
- **Confidence:** medium

### Finding 2 — EU AI Act risk classifications incomplete
- **Type:** Quantitative
- **Status:** ⚠️ partial
- **Doc says:** Grid cards show 4 risk categories: "Prohibited", "High risk", "Limited risk", "Minimal risk" (block 168, items 171–175)
- **Reality:** AiRiskClassification enum defines 6 values: "Prohibited", "High risk", "Limited risk", "Minimal risk", "GPAI", "General Risk"
- **Evidence:** `Clients/src/domain/enums/aiRiskClassification.enum.ts:1-9`
- **Suggested fix:** Add "GPAI" and "General Risk" to grid cards with descriptions, or document in article why these classifications are internal-only.
- **Confidence:** high

## Verified claims (sampled)
- Claim: Seven lifecycle phases are tracked: "Problem definition & planning", "Data collection & processing", "Model development & training", "Model validation & testing", "Deployment & integration", "Monitoring & maintenance", "Decommissioning & retirement" (block 45–82) — verified at `AiLifeCyclePhase enum` with exact matches.
- Claim: "Prohibited", "High risk", "Limited risk", "Minimal risk" are valid risk classifications (block 171–175) — verified at `aiRiskClassification.enum.ts` with all four present as enum values.
- Claim: "Lifecycle audit trail" section states status changes are logged with timestamps and user attribution (block 205) — supported by ProjectRisk type definition including timestamp tracking for transitions.
- Claim: Model approval workflow has statuses "Pending", "Approved", "Restricted", "Blocked" (block 128–133) — present in aiApprovalWorkflow enum structure in codebase.
- Claim: MLFlow lifecycle stages are "Staging", "Production", "Archived" (block 148–150) — standard MLFlow stage names; integration claim requires UI testing (non-verifiable from code analysis).

## Skipped / non-verifiable
- "AI models degrade over time, their training data gets stale" (block 13) — domain knowledge claim; motivational framing, not system-specific.
- "Development needs flexibility; production needs stability. You apply different controls depending on the phase" (block 28) — governance philosophy; no code-based variance in controls to verify.
- "Regulators want to see how a model went from development to production" (block 30) — regulatory expectation; motivational framing.
- "For high-risk systems, you also record your organization's role. Different roles have different obligations under the EU AI Act" (block 185) — regulatory compliance interpretation; non-verifiable without EU AI Act statutory text linkage.
- "Define clear criteria for each lifecycle transition in your AI governance policy" (block 212) — best practice recommendation; opinion-based.
