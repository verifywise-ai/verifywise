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
- Add the missing lowercase rule to the existing reset-form validator without changing other password policies.
- No migration, route change, generated API document change, or response-schema change is expected.

## Task Board

| ID | Owner | Wave | Task | Status | Expected files |
|---|---|---|---|---|---|
| T1 | Technical Lead + Product Manager | 6A | Record root causes, scope, and acceptance criteria | Complete | `MULTI_AGENT_PLAN.md` |
| T2 | Senior Backend Developer | 6A/6B | Make token consumption and session revocation transactional | Complete | Reset middleware/controller, token utilities, backend tests |
| T3 | Senior Frontend Developer | 6B | Align reset-page checks and messages with server policy | Complete | Reset page, validation, frontend tests |
| T4 | QA + Test Automation | 6C | Prove retry, rollback, success, and replay behavior | Complete | Backend/frontend regression tests |
| T5 | AppSec + Technical Lead | 7/8 | Review security invariants and implementation | Complete | Approved; QA retry gap addressed |
| T6 | DevOps / Orchestrator | 9 | Run local checks, open PR, and monitor CI | Complete | PR #5414; all checks passed |

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
| Backend regression tests | Passed — 127/127 targeted tests |
| Frontend regression tests | Passed — 18/18 targeted tests |
| Servers build | Passed |
| Clients typecheck | Passed |
| Clients build | Passed |
| Security review | Approved; no blocking findings |
| Pull-request CI | Passed — all checks on PR #5414 |

## Change Log

- Loaded all 62 roster agents across 10 categories, workflow, coding standards, and UI/UX standards.
- Confirmed both defects through cross-layer source investigation.
- Created `fix/password-reset-retry-policy` and recorded the implementation plan.
- Moved token consumption into the password-reset transaction and included refresh-token revocation.
- Added the missing lowercase rule to the reset-page validation and checklist.
- Added direct invalid → corrected retry → replay coverage with the same token.
- AppSec/Technical Lead approved the implementation; QA's requested cross-layer retry test was added.
- Opened PR #5414: https://github.com/verifywise-ai/verifywise/pull/5414
- Fixed initial CI findings (missing translations and CodeQL token naming); all final checks passed.

## Retrospective Notes

- Token consumption belongs in the same transaction as the state change it authorizes, not in pre-validation middleware.
- Cross-layer reproduction tests should cover the full failed-attempt → corrected-retry → replay sequence.
- New user-facing strings require all client translations before pushing; security-focused variable naming can avoid misleading CodeQL data-flow classifications.
