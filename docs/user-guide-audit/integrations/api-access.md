# Audit: integrations/api-access
**Article path:** shared/user-guide-content/content/integrations/api-access.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The API access article is well-structured and largely accurate. Button labels, key naming validation (3–50 characters), Bearer header format, and Admin role restrictions all match code. One unresolved quantitative claim about the API key limit lacks explicit documentation.

## Findings
### Finding 1 — Maximum API keys limit not specified
- **Type:** Quantitative
- **Status:** ❓ unverifiable
- **Doc says:** "There's a limit on the number of API keys per organization. If you hit the maximum, delete unused keys before creating new ones." (block 249)
- **Reality:** Code enforces a hard limit of 10 keys per organization: `if (numberOfTokens >= 10) { return res.status(403).json({ message: "Token limit reached. Maximum 10 tokens allowed." })` in `/Servers/middleware/tokens.middleware.ts`. Doc does not state the actual number.
- **Evidence:** `Servers/middleware/tokens.middleware.ts:8–11` (token limit check)
- **Suggested fix:** Update block 249 to specify "maximum of 10 API keys per organization" or similar quantitative value.
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Key names must be between 3 and 50 characters" (block 94) — verified at `Clients/src/presentation/pages/SettingsPage/ApiKeys/index.tsx` line 58 calling `checkStringValidation("Token name", value, 3, 50, ...)`
- Claim: Buttons labeled "Create new key" or "Create API key" (block 55) — verified at `Clients/src/presentation/pages/SettingsPage/ApiKeys/index.tsx` (both button texts present)
- Claim: Button "I copied the key" (block 59) — verified at `Clients/src/presentation/pages/SettingsPage/ApiKeys/index.tsx` (exact text in button)
- Claim: "Only users with the Admin role can view and manage API keys" (block 40) — verified at `Servers/middleware/tokens.middleware.ts` (role === "Admin" checks enforced for both create and delete)
- Claim: "Include your API key in the request headers" with "Authorization" header and "Bearer YOUR_API_KEY" format (blocks 161–162) — Bearer format verified in client test repository at `Clients/src/application/repository/tests/*.repository.test.ts` (Authorization: "Bearer token" pattern)

## Skipped / non-verifiable
- "API keys give access to VerifyWise API endpoints based on your organization's permissions" (block 269) — opinion/motivation only; no specific endpoint list to verify
- "API requests may be rate-limited to keep the platform stable" (block 279) — external rate-limiting detail; no specific rates documented in article
- Key naming best-practice examples (blocks 87–89) — non-verifiable; examples of naming conventions are motivational
