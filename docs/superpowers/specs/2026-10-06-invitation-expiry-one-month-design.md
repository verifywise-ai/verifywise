# Invitation expiry: one week → one month

**Date:** 2026-10-06
**Status:** Approved (requested by the product owner)

## Goal

An invitation stays valid for one month after it is sent (or resent). Before
that it can be used to create an account; after it, it cannot.

"One month" is **30 days**, a fixed duration. A calendar month varies (28–31
days), and the invite token needs a fixed lifetime in milliseconds.

## How an invitation's lifetime works today

An invitation has two expiry records, both set from the same constant,
`ONE_WEEK_MS` (`Servers/utils/jwt.utils.ts`):

| Record | Set in | Enforced / shown in |
| --- | --- | --- |
| Invite link token (JWT, `expire` + `exp`) | `generateInviteToken` default, called by `sendInviteEmail` (`Servers/utils/inviteEmail.utils.ts`) | `register.middleware.ts`: `decoded.expire < Date.now()` → 406 "This invitation link is expired…"; `getTokenPayload` (`jwt.verify`) also rejects past `exp` |
| `invitations.expires_at` | `sendInviteEmail` (`expiresAt`), stored by `createInvitationQuery` / `updateInvitationExpiryQuery`; super-admin invite (`superAdmin.ctrl.ts`) | Team page: `isExpired = expires_at <= now` → "Expired" / "Pending" chip |

There is no database default for `expires_at`, and no email, UI or user-guide
copy states the duration.

`generateInviteToken` is also used for password reset, which passes its own
`ONE_HOUR_MS` and is not affected.

## Design

- Add `INVITATION_LIFETIME_MS` (30 days) in `jwt.utils.ts`, the single source
  for invitation lifetime. It is its own value, not an alias of
  `THIRTY_DAYS_MS`, which also sets refresh and API token lifetimes.
- `generateInviteToken` defaults to it (password reset keeps passing 1 hour).
- Tokens are signed against an absolute expiry (`signTokenUntil`): the custom
  `expire` claim and the standard `exp` claim come from one timestamp. This
  applies to every token type; lifetimes are unchanged.
- `sendInviteEmail` fixes `expiresAt` once, before the SMTP round trip, and
  signs the link to expire at exactly that instant (`generateInviteTokenUntil`).
  A caller that has already stored the invitation row (the super-admin invite)
  passes its `expires_at` in. So the link and the stored expiry are the same
  instant.
- Remove `ONE_WEEK_MS` (no other users).

Boundary: the token is valid while `now <= expire`; the Team page shows
"Expired" once `expires_at <= now`.

## Registration email check (security)

A longer-lived link raised an existing gap: `register.middleware.ts` checked
the token's role and organization but not its email, while the account is
created from the email in the request. The form shows the email read-only, but
a crafted request could use one invite link to register any address. The
middleware now rejects a request whose email (trimmed, case-insensitive) is
not the invited one, with 403 "This invitation was sent to a different email
address."

After the checks pass, the controller receives the token's own email, role and
organization, so the account is created exactly as invited and the invitation
can be marked accepted.

## Only the current link works (security)

Before, the pending check matched only organization and email. After a revoke
and re-invite with another role, or a resend, the earlier link still registered,
with the role it was first sent with. A 30-day lifetime would have kept such
links usable much longer.

Registration now requires the pending invitation for that email to be the one
the link was issued for: its `role_id` must equal the link's role, and its
`expires_at` must equal the link's `expire`. Because each link is signed to
expire exactly at its invitation's `expires_at`:

- a resend writes a new `expires_at`, so earlier links match nothing;
- a revoke and re-invite creates a new row with a new expiry, so the old link
  (and its old role) fails;
- registering marks the invitation accepted, so a link works once.

Rejected links get 403 "This invitation link is no longer valid…". A 60-second
tolerance keeps links sent before this change usable: those were signed a few
seconds before their row was written. The cost is that two resends less than a
minute apart both work until one is used.

This uses only the org-scoped `invitations` table. An alternative using the
global `one_time_tokens` store was dropped: that table has no organization, so
cancelling links "for an email" would have cancelled other organizations'
invitations to the same address.

## Existing invitations

The lifetime is baked into each token when it is signed, so invitations sent
before this change keep their 7-day link. Extending their `expires_at` in the
database would make the Team page show "Pending" for a link that no longer
works, so there is no data migration. Resending an invitation issues a new
30-day link.

## Out of scope

- Configurable lifetime per organization.
- Changing password-reset or API-token lifetimes.
