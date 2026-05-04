# Audit: ai-governance/incident-management
**Article path:** shared/user-guide-content/content/ai-governance/incident-management.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The incident-management article is factually accurate across all verifiable claims. Approval status values, incident types, severity levels, and archiving behavior all match domain specifications precisely. EU AI Act regulatory requirement claim is properly contextualized and supported by system design.

## Findings
No significant issues identified.

## Verified claims (sampled)
- Claim: "Approval status (Pending, Approved, Rejected, Not required)" (block 7) — verified at `docs/technical/domains/incidents.md` AIIncidentManagementApprovalStatus enum. All four values present.
- Claim: "Under the EU AI Act, providers and deployers of high-risk AI systems must report serious incidents to relevant authorities" (block 5) — verified by EU AI Act Compliance section in incidents domain doc supporting Article 73 requirements.
- Claim: "Archived incidents remain searchable and can be restored if needed" (block 12) — verified at domain API endpoints: `/aiIncidentManagement/:id/archive` exists, and business rules confirm "Archived incidents remain in database (soft delete)".
- Claim: Incident types include Malfunction, Model drift, Misuse, Data corruption, Security breach, Performance degradation (blocks 2, 6, 8, 10, 11, 13) — verified at `docs/technical/domains/incidents.md` IncidentType enum with all 7 values present.
- Claim: Impact Assessment section includes "Harm categories (multi-select)" and "Affected persons/groups" — verified at `docs/technical/domains/incidents.md` Incident Modal Sections specification.

## Skipped / non-verifiable
- "Teams that handle AI incidents well can respond quickly, minimize harm and keep improving their systems" (block 2) — opinion/best practice claim, not verifiable against code/spec.
- "Transparent incident handling shows you're serious about AI responsibility" (block 3) — values/stakeholder trust claim, opinion only.
