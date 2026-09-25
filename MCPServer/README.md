# VerifyWise MCP server

Super-admin organization and user administration over the [Model Context
Protocol](https://modelcontextprotocol.io), so an MCP-capable model can provision
VerifyWise organizations and users on any of your deployments.

## Requirements

An API token from each deployment you want to administer.

The token's user must be **an Admin of an organization _and_ an elected super
admin**. Both halves are enforced by the backend:

- Only a user whose role is exactly `Admin` can mint an API token at all
  (`Servers/middleware/tokens.middleware.ts`).
- The super-admin routes these tools call are gated on `super_admins`
  membership, re-resolved live on every request
  (`Servers/middleware/auth.middleware.ts`).

So the **seeded super admin cannot create a token for this** — that account has
no role and no organization (`role_id` and `organization_id` are both NULL), so
token creation rejects it, and even if it didn't, the token would be stored with
a NULL `organization_id` and never match the lookup on use.

### Getting a token

1. Sign in as the super admin and go to **Settings → Super Admins**. Elect an
   existing **Admin** user of any organization. That gives them super-admin
   capability on top of their normal org role, which is what satisfies both
   halves above.
2. Sign in as **that Admin** user and go to **Settings → API keys → create**.
   The raw token is shown once and never again.
3. Put it in the profile file below.

Two things to know about the resulting token:

- It is stored against that user's organization, so **deleting that
  organization cascade-deletes the token**.
- Removing the user from `super_admins` disables every token they issued,
  immediately and without any token being revoked. They keep working for
  ordinary org-scoped routes and start returning 403 on super-admin ones.

## Install

```bash
npm install
npm run build
```

## Configure

Deployments live in `~/.verifywise/mcp.json`, never in the MCP client config —
so tokens are not duplicated per client and are never passed through the model:

```json
{
  "profiles": {
    "acme": { "url": "https://acme.verifywise.ai", "token": "<api token>" },
    "staging": { "url": "http://localhost:3000", "token": "<api token>" }
  }
}
```

```bash
chmod 600 ~/.verifywise/mcp.json
```

Every tool requires a `profile` naming the deployment to act on. There is no
default and no fallback: a name that is not defined fails, listing the profiles
that are. Nothing is ever inferred, because picking wrong means writing to
another customer's deployment. The file is read on every call, so adding a
deployment needs no client restart.

Point the server somewhere else with `--config <path>`.

## Register with an MCP client

One entry covers every deployment:

```json
{
  "mcpServers": {
    "verifywise": {
      "command": "node",
      "args": ["/absolute/path/to/verifywise/MCPServer/dist/index.js"]
    }
  }
}
```

## Tools

| Tool                             | Does                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `create_organization_with_admin` | Create an organization and its first Admin user with a generated password, in one transaction |
| `create_user`                    | Create a user in an existing organization with a generated password                           |
| `invite_user`                    | Invite a user to an existing organization by email; they set their own password               |
| `list_organizations`             | Every organization, with user counts                                                          |
| `list_users`                     | Every user, or one organization's                                                             |
| `update_user`                    | Change a user's name, email or role                                                           |
| `delete_user`                    | Delete a user                                                                                 |
| `update_organization`            | Rename an organization or change its logo                                                     |
| `delete_organization`            | Delete an organization and all its users                                                      |

Roles are given by name (`"Admin"`, `"Editor"`, …) and resolved against
`GET /api/roles` per call. No role id is hardcoded here, because the backend
resolves role names from the `roles` table at runtime.

### Generated passwords

`create_organization_with_admin` and `create_user` generate a 20-character
password with `crypto.randomInt`, always satisfying the backend policy
(`Servers/domain.layer/validations/password.valid.ts`: ≥8 characters with a
lowercase letter, an uppercase letter and a digit).

**The password is returned in the tool result and stored nowhere.** It cannot be
retrieved afterwards, and it lands in the conversation transcript of whatever
client called the tool. Use `invite_user` where that is not acceptable — no
password exists on that path.

### Deleting an organization

`delete_organization` removes every user in the organization and then the
organization itself, cascading through its data. It requires
`confirmOrganizationName` to match the organization's current name, checked
against the live record before anything is deleted; a mismatched or unknown id
is refused without a delete being issued.

## Development

```bash
npm run build         # compile to dist/
npm test              # vitest
npm run format-check  # prettier
```

Adding a tool is one object in `src/tools/organizations.ts` or
`src/tools/users.ts` — `src/client.ts` already handles auth, the response
envelope and error messages, and `src/index.ts` registers whatever those modules
export.
