# Collection summary — ai-governance
**Date:** 2026-04-29
**Articles audited:** 16
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| agent-discovery | ⚠️ minor (2) | 1 | 1 | 0 |
| ai-trust-center | ⚠️ minor (2) | 0 | 2 | 0 |
| approval-workflows | ⚠️ minor (1) | 1 | 0 | 0 |
| datasets | ⚠️ minor (1) | 0 | 0 | 1 |
| entity-graph | ⚠️ minor (2) | 0 | 2 | 0 |
| evidence-collection | ✅ clean | 0 | 0 | 0 |
| incident-management | ✅ clean | 0 | 0 | 0 |
| intake-forms | ⚠️ minor (1) | 0 | 1 | 0 |
| linked-models | ✅ clean | 0 | 0 | 0 |
| model-inventory | ✅ clean | 0 | 0 | 0 |
| model-lifecycle | ⚠️ minor (2) | 0 | 1 | 1 |
| project-overview | ❌ significant (1) | 1 | 0 | 0 |
| share-links | ⚠️ minor (2) | 1 | 1 | 0 |
| task-management | ⚠️ minor (2) | 0 | 2 | 0 |
| use-cases | ✅ clean | 0 | 0 | 0 |
| watchtower | ❌ significant (1) | 1 | 0 | 0 |

## Verification

27/32 spot-checks passed. **5 failed:**
1. `datasets.md` — claimed "description" column exists; verifier found it absent
2. `model-lifecycle.md` — MLFlow stages marked verified but auditor also said "non-verifiable, requires UI testing" (self-contradictory)
3-5. Three claims (email expiration 7 days, compliance Article 60/ISO 42001, audit trail) marked verified but lack supporting code evidence

The verification subagent picked up 5 weak verifications across the largest collection. Most are not "wrong" claims — they're "not supported by the cited evidence" claims. The doc may still be correct; the audit's evidence trail is broken on those items.

## Assessment

This is the largest content surface (16 articles) and produced 5 ✅ clean, 9 ⚠️ minor, 2 ❌ — a generally healthy ratio. The findings cluster around the same patterns as elsewhere:

- **Enum/list count drift** continues: project-overview's risk severity ("very high/high/medium/low/very low") vs actual enum (Negligible/Minor/Moderate/Major/Critical); model-lifecycle missing 2 risk classifications (GPAI, General Risk); task-management missing 2 of 5 statuses; ai-trust-center missing NIST AI RMF badge; agent-discovery missing form fields.
- **UI label mismatches**: button labeled "Sync now" not "Refresh"; watchtower table columns don't match doc.
- **Permission model drift**: share-links revoke permission documented as Admin but code is creator-only — same family as the settings/organization-settings finding.

**Approval-workflows finding** is interesting in light of the policies-collection structural finding: the article documents an approval workflow but lists "Expired" as a status that doesn't exist in the enum. This is the article that potentially covers what `policies/policy-approval.ts` should cover. The audit didn't conclude whether ai-governance/approval-workflows is the canonical location for policy-approval flow content — that needs human judgment.

`evidence-collection`, `incident-management`, `linked-models`, `model-inventory`, `use-cases` are all ✅ clean — solid foundation across core governance objects.

Ready to move on to the final collection (ai-gateway).
