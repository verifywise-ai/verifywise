# Audit: ai-governance/agent-discovery
**Article path:** shared/user-guide-content/content/ai-governance/agent-discovery.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article accurately documents agent discovery capabilities and status workflows. Two minor discrepancies were found: button label does not match ("Refresh" vs. "Sync now"), and the manual registration form collects fewer fields than documented.

## Findings

### Finding 1 — Refresh button label mismatch
- **Type:** UI affordance
- **Status:** ⚠️ partial
- **Doc says:** "Click **Refresh** to trigger a sync with your connected source systems." (block 53)
- **Reality:** Frontend button is labeled "Sync now", not "Refresh"
- **Evidence:** `/Clients/src/presentation/pages/AgentDiscovery/index.tsx:428` shows `{isSyncing ? "Syncing..." : "Sync now"}`
- **Suggested fix:** Update block 53 to read "Click **Sync now** to trigger a sync" or verify if button label should be "Refresh".
- **Confidence:** high

### Finding 2 — Manual agent form collects fewer fields than documented
- **Type:** Feature capability
- **Status:** ⚠️ partial
- **Doc says:** "Enter the agent's name, type and permissions." (block 68)
- **Reality:** The manual registration form collects Display name, Type, Owner, and Notes. There is no explicit permissions field in the form; permissions are not user-editable at registration time.
- **Evidence:** `/Clients/src/presentation/components/Modals/AgentDiscovery/ManualAgentModal.tsx:47-52` shows form fields: `display_name`, `primitive_type`, `owner_id`, `notes`
- **Suggested fix:** Update block 68 to "Enter the agent's name, type, owner, and notes." or clarify that permissions cannot be set during manual registration.
- **Confidence:** high

## Verified claims (sampled)

- Claim: "New agents appear with a status of 'Unreviewed'" (block 55) — verified at `/Clients/src/presentation/pages/AgentDiscovery/index.tsx:45-52` (initial state initialized with agent data)

- Claim: Status table shows "Unreviewed", "Confirmed", "Rejected" (blocks 89-91) — verified at `/Servers/advisor/tools/agentDiscoveryTools.ts` enum: `["unreviewed", "confirmed", "rejected"]` (correct values, lowercase in API)

- Claim: "Manually added agents are marked as such so you can distinguish them from auto-discovered ones." (block 69) — verified at `/Clients/src/domain/interfaces/i.agentDiscovery.ts:17` field `is_manual: boolean` and `/Clients/src/presentation/pages/AgentDiscovery/index.tsx:321-329` logic using `is_manual` to route to edit modal

- Claim: Review status tells your team "whether the agent has been vetted" (block 80) — verified via status definitions and table schema at `/Clients/src/presentation/pages/AgentDiscovery/index.tsx:170-175`

- Claim: "The table supports filtering by name, source system, agent type, review status and staleness" (block 106) — verified at `/Clients/src/presentation/pages/AgentDiscovery/index.tsx:159-199` with all filter columns implemented

## Skipped / non-verifiable

- "Stale agents are those that haven't been active recently, which may indicate they should be decommissioned." (block 106) — reason: business logic definition (opinion/motivation only); system behavior confirmed but staleness threshold not user-facing
