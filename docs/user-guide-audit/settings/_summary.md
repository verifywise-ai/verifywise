# Collection summary — settings
**Date:** 2026-04-29
**Articles audited:** 5 (1 from Phase 1, 4 from Phase 2)
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| notifications | ⚠️ minor (1) | 0 | 1 | 0 |
| organization-settings | ❌ significant (2) | 2 | 0 | 0 |
| role-configuration (P1) | ✅ clean | 0 | 0 | 0 |
| super-admin | ✅ clean | 0 | 0 | 0 |
| user-management | ❌ significant (2) | 2 | 0 | 0 |

## Verification

Verification subagent reported "3 false-positives" but on inspection, those "failures" are claims that were already correctly captured as Findings in the audit reports (e.g., the verifier flagged "Editor can modify org settings" — which is exactly what `organization-settings.md` Finding 2 already documents). The verifier appears to have spot-checked claims that the audit had already marked as ❌, then re-flagged them, instead of picking from the Verified claims list.

**Net result:** the verification subagent's *new* finding count is effectively 0 — it didn't catch any real false-positive verifications; it re-discovered findings the audit already made. Roles, organization name limit, and notifications categorization were all flagged correctly by the audit subagents.

This is a method-quality observation about the verification subagent itself (logged for global summary): the verifier prompt should explicitly say "pick claims ONLY from the 'Verified claims (sampled)' section, NOT from the Findings section."

## Assessment

Permission/role drift is significant in this collection:
- `organization-settings`: 2 ❌ — char limit (100→50), Editor permission (Editor cannot edit, only Admin can)
- `user-management`: 2 ❌ — Super Admin omitted from role lists despite being role 5
- `notifications`: abstract category list doesn't match the 28-member NotificationType enum

Strong articles: `role-configuration` (already clean from Phase 1), `super-admin` (multi-tenancy and role definitions all match).

Permission drift specifically is a high-priority fix-pass concern: documentation that misrepresents who can do what is a compliance/security issue, not just a style one.

Ready to move on.
