# Plan: invitation expiry one month

Spec: `docs/superpowers/specs/2026-10-06-invitation-expiry-one-month-design.md`

1. **Constant** (`Servers/utils/jwt.utils.ts`): add
   `INVITATION_LIFETIME_MS = THIRTY_DAYS_MS`; make it the default of
   `generateInviteToken`; update its doc comment; export it; remove
   `ONE_WEEK_MS`.
2. **Invite email** (`Servers/utils/inviteEmail.utils.ts`): set `expiresAt`
   from `INVITATION_LIFETIME_MS`.
3. **Super-admin invite** (`Servers/controllers/superAdmin.ctrl.ts`): set
   `invitationExpiresAt` from `INVITATION_LIFETIME_MS`.
4. **Tests**
   - `jwt.utils.test.ts`: an invite token's `expire` is 30 days out by default;
     an explicit lifetime still wins (password reset).
   - `inviteEmail.utils.test.ts`: `expiresAt` is 30 days out.
   - `register.middleware` test: a token 29 days old is accepted; one 31 days
     old gets 406 "This invitation link is expired…".
   - Update any test that mocks `ONE_WEEK_MS`.
5. **Docs**: note the 30-day lifetime where invitations are documented
   (`docs/technical/architecture/authentication.md` if it covers invites).
6. **Gates**: `cd Servers && npm run build && npm run format-check &&
   npm run test`; Clients unaffected (Team page reads `expires_at`).
7. **PR** to `develop`, then `/code-review`.
