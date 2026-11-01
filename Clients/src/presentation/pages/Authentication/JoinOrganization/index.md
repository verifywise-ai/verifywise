# Join Organization Page

The page an invitation links to when the invited address already has a VerifyWise account (`/join?token=...`). Instead of creating an account, the user confirms their existing one with its password, joins the inviting organization with the invited role, and is logged in to that organization.

## Features

- The invited email, read-only, taken from the invitation link
- Password field for the existing account, with a link to reset it
- Expired-link message when the invitation is past its expiry

## Functionality

- Posts the email, password, role and organization to `POST /users/invitations/accept`, with the invite token as the bearer token
- On success starts the session for the joined organization and opens the landing page
- Shows the server's message when the password is wrong, the link was revoked or replaced, the user is already a member, or the account is a super admin
