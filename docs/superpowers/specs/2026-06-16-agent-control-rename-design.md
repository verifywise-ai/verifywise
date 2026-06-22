# Rename "MCP Gateway" → "Agent Control" (UI re-framing)

> **Status:** Design approved 2026-06-16
> **Type:** Frontend display-string rename + docs. No backend, no routes, no schema.
> **Branch:** (to be created) `feat/agent-control-rename`

## Goal

Re-frame the AI Gateway's "MCP Gateway" UI section as **Agent Control** so the UI
expresses what it actually does — govern and observe **what AI agents do** (tool calls,
both MCP-proxied and native) — rather than naming itself after a protocol (MCP) and a
mechanism (gateway). This corrects an existing misnomer: half of the section (the
Phase 1/2 native-hook work) governs non-MCP tools like Bash, yet it is filed under "MCP."

## Why this is honest (technical basis)

Verified in code. The section governs **two** agent entry paths that share **one**
governance layer (same `sk-mcp-*` identity, same guardrail scan, same approval flow,
same audit log, same rate limiter):

| Path | Endpoint | MCP? |
|---|---|---|
| MCP proxy — forwards JSON-RPC to a registered MCP server | `POST /v1/mcp` | Yes |
| Native hook — adjudicates the agent's own built-in tool (Bash/Edit/Write), never forwards | `POST /v1/mcp/hook` | **No** |

"Agent Control" names that shared control plane. MCP is one of two doors into it.

**The product distinction the rename encodes:**
- **AI Gateway** governs *model calls* (completions, spend, budgets) — what the AI **says**. The LLM-completions proxy (`/v1/chat/completions`, `sk-vw-*` virtual keys) stays here, untouched.
- **Agent Control** (inside AI Gateway) governs *agent actions* (tool calls, MCP + native) — what the AI **does**.

## Label map (locked)

| Current | New | Decision |
|---|---|---|
| **MCP Gateway** (sidebar group) | **Agent Control** | Names the job, not the protocol |
| **Audit Log** | **Activity** | It is a live observability dashboard (stats, latency charts, per-agent stream), not a passive log |
| Agent Keys | **Agent Keys** *(unchanged)* | Screen mints/revokes credentials; "Agents" would over-claim an agent registry (status/last-seen/history) that does not exist |
| Guardrails | **Guardrails** *(unchanged)* | Industry-standard term; matches the existing LLM "Guardrails" screen — renaming only this one would create two words for one concept |
| Approvals | **Approvals** *(unchanged)* | Already accurate |
| Servers | **MCP Servers** | Genuinely an MCP-protocol concept — keep "MCP" |
| Tools | **MCP Tools** | Genuinely an MCP-protocol concept — keep "MCP" |

Sidebar stays a **flat list** under "Agent Control" (no structural change); Servers/Tools
carry "MCP" in their label.

## Scope

**In scope (display strings + docs):**
1. Sidebar group name + the two changed item labels + the two MCP-prefixed labels.
2. Page headers + descriptions for all six pages — rewritten **agent-accurate**: say "agent"/"agent actions" where it means agent behaviour, keep "MCP" only where it means the protocol (Servers, Tools).
3. Breadcrumb labels (`routeMapping.ts`).
4. i18n: **all four languages** (en/de/fr/es) for every changed string.
5. User-guide content: section title + in-prose breadcrumb references, copied to the website repo per the docs workflow.

**Explicitly out of scope (unchanged):**
- Route paths `/ai-gateway/mcp/*` and all API endpoints — no broken links/bookmarks, no backend change.
- Component/directory names (`MCPAuditLog/`, `MCPGuardrails/`, etc.) and all variable/type names — internal only; users never see them.
- The far-left dark-sidebar module label ("AI Gateway") — promoting Agent Control to a top-level module is a separate, larger product decision.
- An Agent Control overview/landing page — noted as a future gap, not built here.
- The LLM-completions proxy and the LLM Guardrails screen — different traffic (model calls).

## Files to change (display strings)

| File | What |
|---|---|
| `Clients/src/presentation/pages/AIGateway/AIGatewaySidebar.tsx` | group `"MCP Gateway"`→`"Agent Control"` (L98); `"Audit Log"`→`"Activity"` (L122); `"Servers"`→`"MCP Servers"` (L110); `"Tools"`→`"MCP Tools"` (L116) |
| `Clients/src/presentation/components/breadcrumbs/routeMapping.ts` | `/ai-gateway/mcp` label `"MCP Gateway"`→`"Agent Control"` (L154); `/ai-gateway/mcp/audit` `"Audit log"`→`"Activity"` (L158); servers/tools labels gain "MCP" (L156/157) |
| `.../AIGateway/MCPAuditLog/index.tsx` | title `"MCP Audit Log"`→`"Activity"`; description → agent-accurate (e.g. "Every action your AI agents take, with outcome and latency.") (L129) |
| `.../AIGateway/MCPServers/index.tsx` | title stays `"MCP Servers"`; description unchanged (already MCP-accurate) (L205) |
| `.../AIGateway/MCPToolCatalog/index.tsx` | title `"MCP Tool Catalog"`→`"MCP Tools"`; description unchanged (L258) |
| `.../AIGateway/MCPApprovals/index.tsx` | title `"MCP Approvals"`→`"Approvals"`; description → "Approve or deny agent actions before they run." (L127) |
| `.../AIGateway/MCPGuardrails/index.tsx` | title `"MCP Guardrails"`→`"Guardrails"`; description → "Scan agent tool calls for PII, prohibited content, or prompt injection; block, mask, or require approval." (L308); empty-state copy (L329) |
| `.../AIGateway/MCPAgentKeys/index.tsx` | title stays `"Agent keys"`; description may keep MCP-server reference where accurate (L477) |
| `Clients/src/i18n/translations.ts` | all of the above strings in en/de/fr/es (group name L3894; menu labels L1903-1907; descriptions/empty-states L2463-3032 and their de/fr/es mirrors) |
| `shared/user-guide-content/userGuideConfig.ts` + `content/ai-gateway/mcp-*.ts` | `"MCP Gateway overview"` section title; in-prose "AI Gateway > MCP Gateway > …" breadcrumb references → "Agent Control"; copy changed files to the website repo |

## Page copy direction (agent-accurate)

Rewrite descriptions so the noun matches the meaning:
- **Activity** (was MCP Audit Log): "Every action your AI agents take — MCP tools and native tools like Bash — with outcome, latency, and which agent."
- **Approvals**: "Review and decide on agent actions that require human approval before they run."
- **Guardrails**: "Scan agent tool calls for PII, prohibited content, or prompt injection — block, mask, or require approval."
- **MCP Servers / MCP Tools**: keep MCP-protocol language (these are genuinely MCP).
- **Agent Keys**: identity/auth language; may reference MCP servers where the key scopes MCP tool access.

## i18n note (known risk)

de/fr/es strings for the renamed labels and rewritten descriptions will be updated in
this pass. **Caveat:** these translations are produced without a native reviewer, so the
non-English copy is best-effort and should be flagged for a later native-speaker pass.
English (en) is authoritative.

## Branch / merge ordering (important)

This spec is branched off `develop`, which does **not** yet contain the Phase 1/2
agentic work (`feat/mcp-bash-hook`, `feat/mcp-hook-approval` — both unmerged). Two
consequences:

1. **`MCPGuardrails/index.tsx` overlaps.** Phase 2 added the `require_approval` rule
   type to that file; this rename touches its title/description/empty-state. Whichever
   merges second must reconcile both. **Recommended order:** merge the Phase 1/2 branches
   first, then rebase this rename branch on top so the Guardrails page already has the
   `require_approval` UI when the rename copy lands. If this rename merges first, the
   Phase 2 branch's edits to the same file will need a manual merge.
2. **Description accuracy depends on Phase 1/2.** The agent-accurate copy (e.g. "MCP tools
   **and native tools like Bash**") describes the native-hook capability that only exists
   once Phase 1/2 ship. If this rename ships to `develop` before them, soften those
   descriptions to not promise native-tool gating that isn't live yet, or hold the rename
   until Phase 1/2 merge. Simplest: **gate this rename's merge on Phase 1/2 being merged.**

## Testing

- `cd Clients && npx tsc --noEmit` clean (string-only changes shouldn't affect types, but a stray key typo in `translations.ts` can).
- Browser smoke: sidebar shows "Agent Control" with items Agent Keys / MCP Servers / MCP Tools / Activity / Approvals / Guardrails; breadcrumb on `/ai-gateway/mcp/audit` reads "AI gateway > Agent Control > Activity"; each page header matches its new label.
- Switch UI language to de/fr/es and confirm the renamed labels render (no missing-key fallbacks).
- `cd Clients && npm run build` succeeds.

## Out-of-scope follow-ups (noted, not built)

- Agent Control overview/landing (counts: active agents, pending approvals, blocked-today, recent activity).
- Surfacing the native-tool differentiator in on-screen copy beyond descriptions.
- Aligning internal component/dir names with the new vocabulary (cosmetic refactor).
- Native-speaker i18n review.
- Promoting Agent Control to a top-level dark-sidebar module.
