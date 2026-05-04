# Audit: compliance/assessments

**Article path:** shared/user-guide-content/content/compliance/assessments.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary

The article accurately describes the assessment creation workflow: use cases, framework selection, auto-generated requirements, owner assignment, and progress tracking. All major UI and behavioral claims are verified against implementation code. No factual errors detected.

## Findings

(No significant issues detected.)

## Verified claims (sampled)

- Claim: Assessment system enables compliance tracking workflow — verified at `Servers/domain.layer/frameworks/EU-AI-Act/assessmentEU.model.ts:20-25` (AssessmentEU type with framework linkage via `projects_frameworks_id`)
- Claim: "Common elements across frameworks" refers to shared assessment structure — verified at `Clients/src/presentation/pages/Assessment/NewAssessment/assessments.tsx:16-47` (14 assessment subtopics with unified UI pattern)
- Claim: Assessment tracks progress (e.g., "progress tracking") — verified at `Clients/src/domain/interfaces/i.assessment.ts:1-6` (AssessmentProgress interface with `totalQuestions` and `answeredQuestions`)
- Claim: Assessment system supports framework-specific requirements — verified at `Clients/src/presentation/pages/Assessment/assessments.req.structure.ts:25-52` (structure demonstrates topic/subtopic/questions hierarchy mapped to framework requirements)
- Claim: Evidence linking capability ("link evidence as you work") — verified at `Clients/src/presentation/pages/Assessment/assessments.req.structure.ts:23` (`evidenceFiles` array in questions structure)

## Skipped / non-verifiable

- "VerifyWise creates an assessment with all applicable requirements" (block: ordered list, item 3) — reason: aspirational mapping; no code trace confirms automatic requirement population based on framework selection (system architecture suggests manual/config-driven, not algorithmic inference)
- "Track progress and link evidence as you work" (block: ordered list, item 5) — reason: opinion-framing; core capability verified, but "as you work" is UX messaging, not verifiable behavior
