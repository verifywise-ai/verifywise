# Audit: ai-gateway/mcp-servers
**Article path:** shared/user-guide-content/content/ai-gateway/mcp-servers.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The article accurately describes most MCP server management features, with verified UI labels, authentication options, and form validation logic. One field incorrectly marked as required in the form table: "Authentication" allows "None" as a valid option (no token/key required), making it optional in practice despite the table showing "Required: Yes". All slug-related claims are accurate.

## Findings
### Finding 1 — Authentication field incorrectly marked as required
- **Type:** Quantitative
- **Status:** ⚠️ partial
- **Doc says:** "Authentication", required: 'Yes'" (block index ~98, in form table)
- **Reality:** The code allows auth_type="none" without requiring a bearer token or API key. The "None" option is the default and fully supported. The field is optional in practice.
- **Evidence:** `Clients/src/presentation/pages/AIGateway/MCPServers/index.tsx:46-50` defines AUTH_TYPE_ITEMS including { _id: "none", name: "None" }. Lines 145-152 show submit logic only includes auth_config if auth_type is "bearer" or "api_key"; when auth_type="none", no auth_config is sent.
- **Suggested fix:** Change table row from `{ field: 'Authentication', required: 'Yes', ...}` to `{ field: 'Authentication', required: 'No', ... }` and update description to clarify that "None" is a valid option.
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Each row displays: Server name ... Health status ... Tool count ... URL ... Auth type ... Slug ... Created by" (block ~45) — verified at `MCPServers/index.tsx:243-281` where each server renders name, health chip, tool count, URL, auth_type, slug, and created_by_name.
- Claim: "Click **Add server** in the top-right corner" (block ~65) — verified at `MCPServers/index.tsx:212-216` where CustomizableButton with text="Add server" and CirclePlus icon exists.
- Claim: "Auth type shows 'no auth', 'bearer', or 'api_key'" (block ~45) — verified at `MCPServers/index.tsx:276` displays auth_type with fallback to "no auth" when auth_type="none".
- Claim: "Slug ... Auto-generated from the name ... Can't be changed after creation" (block ~98) — verified at `MCPServers/index.tsx:94-99` where slug auto-generates on create (editingId === null), and line 156 shows slug only sent in POST, not PATCH.
- Claim: "Bearer token field required when auth_type is bearer; API key field required when auth_type is api_key" (implicit, blocks ~140-150) — verified at `MCPServers/index.tsx:380-406` where Bearer token and API key fields both have isRequired=true.

## Skipped / non-verifiable
- "This helps you manage which servers agents can access" (block ~10) — opinion/motivation only; skipped per spec.
- "The gateway proxies agent requests to these servers with auth and logging" (block ~26) — architectural claim about backend behavior; outside scope of user guide UI verification.
