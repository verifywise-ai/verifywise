# Password Reset Reliability — Multi-Agent Plan

## Opportunity Brief

- **Problem:** The reset page omits the server's lowercase-letter rule, and the server consumes reset tokens before password validation.
- **Impact:** Users can lose a valid recovery link after a correctable form error without changing their password.
- **Priority / size:** High / Medium.
- **Scope:** Existing `/set-new-password` page and legacy `POST /api/users/reset-password`, regression tests, and validation.
- **Out of scope:** Password-policy redesign, API contract changes, immediate access-JWT revocation, and unrelated auth refactors.

## Acceptance Criteria

1. A password satisfying every displayed reset-page rule also satisfies the server-domain policy.
2. An invalid password returns the existing validation error without consuming the token or changing password/session state.
3. The same unexpired token can be corrected and retried successfully.
4. A successful reset atomically consumes the token, updates the password, and revokes refresh tokens.
5. Replaying a used token is rejected without another password change.
6. Existing legacy paths and response contracts remain unchanged.

## Discovery Synthesis

- `Clients/.../SetNewPassword/index.tsx` checks length, special character, uppercase, and number, but not lowercase.
- `Servers/domain.layer/validations/password.valid.ts` requires length, lowercase, uppercase, and number.
- `Servers/middleware/resetPassword.middleware.ts` consumes the token before controller password validation.
- Token consumption and refresh-token revocation currently occur outside the controller transaction.
- Reproduction: `PASSWORD1!` passes the page but fails server validation; a corrected retry reports the link as used.

## Architecture Brief

- Keep JWT verification, expiry, and email binding in middleware, but make middleware non-mutating.
- Move conditional single-use token consumption into the controller transaction after domain password validation.
- Pass that transaction to token consumption, password update, and refresh-token revocation.
- Preserve conditional `UPDATE ... WHERE consumed_at IS NULL ... RETURNING` for replay/concurrency safety.
- Align the reset page with the existing frontend password-policy mirror without weakening server validation.
- No migration, route change, generated API document change, or response-schema change is expected.

## Task Board

| ID | Owner | Wave | Task | Status | Expected files |
|---|---|---|---|---|---|
| T1 | Technical Lead + Product Manager | 6A | Record root causes, scope, and acceptance criteria | Complete | `MULTI_AGENT_PLAN.md` |
| T2 | Senior Backend Developer | 6A/6B | Make token consumption and session revocation transactional | Not started | Reset middleware/controller, token utilities, backend tests |
| T3 | Senior Frontend Developer | 6B | Align reset-page checks and messages with server policy | Not started | Reset page, validation, translations, frontend tests |
| T4 | QA + Test Automation | 6C | Prove retry, rollback, success, and replay behavior | Not started | Backend/frontend regression tests |
| T5 | AppSec + Technical Lead | 7/8 | Review security invariants and implementation | Not started | Review evidence in this plan |
| T6 | DevOps / Orchestrator | 9 | Run local checks, open PR, and monitor CI | Not started | PR and CI evidence |

## API Contracts

No contract changes. The existing endpoint, bearer token, request body, and success/error status behavior remain intact.

## Design Decisions

- Do not fix only validation ordering; all post-validation failures must roll back token consumption.
- Do not wire in the unused request schema because it would introduce additional password rules.
- Do not relax backend lowercase validation to match the incomplete UI.
- Keep the fix limited to the existing legacy endpoint and reset page.

## Risk & Blocker Log

- **Replay/concurrency:** Token consumption must remain one conditional SQL statement inside the transaction.
- **Policy drift:** Use the policies actually enforced by the domain and reset UI, not another historical schema.
- **Test environment:** If real-database tests are unavailable locally, unit/orchestration tests and CI must prove the invariant.

## Quality Dashboard

| Check | Status |
|---|---|
| Backend regression tests | Pending |
| Frontend regression tests | Pending |
| Servers build | Pending |
| Clients typecheck | Pending |
| Clients build | Pending |
| Security review | Pending |
| Pull-request CI | Pending |

## Change Log

- Loaded all 62 roster agents across 10 categories, workflow, coding standards, and UI/UX standards.
- Confirmed both defects through cross-layer source investigation.
- Created `fix/password-reset-retry-policy` and recorded the implementation plan.

## Retrospective Notes

To be completed after CI and review.
