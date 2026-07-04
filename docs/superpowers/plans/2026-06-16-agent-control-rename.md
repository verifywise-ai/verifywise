# Agent Control Rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-label the "MCP Gateway" UI section as "Agent Control" (and "Audit Log" → "Activity", "Servers"/"Tools" → "MCP Servers"/"MCP Tools") across sidebar, page headers, breadcrumbs, and the de/fr/es DOM-translation keys — display strings only.

**Architecture:** Components render raw English strings in JSX (no `t()` for these labels). A runtime DOM translator (`Clients/src/i18n/domTranslator.ts`) swaps visible text using the English string as the lookup key against `translations[lang]`; `en` uses `{}` (no swap). So a rename = change the raw English string in the component/route-map AND update the matching de/fr/es key+value in `translations.ts`, or non-English UIs fall back to the new English. No backend, no routes, no schema.

**Tech Stack:** React/TypeScript, Vite; `translations.ts` (de/fr/es maps keyed by English string).

**Spec:** `docs/superpowers/specs/2026-06-16-agent-control-rename-design.md`
**Branch:** `feat/agent-control-rename` (already created, off `develop`)

---

## Label map (the single source of truth for every task)

| Old English string | New English string |
|---|---|
| `MCP Gateway` (sidebar group + breadcrumb) | `Agent Control` |
| `Audit Log` (sidebar) / `Audit log` (breadcrumb) / `MCP Audit Log` (page title) | `Activity` |
| `Servers` (sidebar) | `MCP Servers` |
| `Tools` (sidebar) / `Tool catalog` (breadcrumb) / `MCP Tool Catalog` (page title) | `MCP Tools` |
| `MCP Approvals` (page title) | `Approvals` |
| `MCP Guardrails` (page title) | `Guardrails` |
| `Agent Keys` / `Approvals` / `MCP Servers` (page title, already MCP) | *(unchanged)* |

**Branch caveat (from spec):** this branch is off `develop`, which lacks Phase 1/2. Page descriptions must NOT promise native-tool (Bash) gating that isn't live on this branch. Write agent-accurate-but-honest copy: say "agent tool calls" (true for MCP today), not "native tools like Bash". The fuller native-tool copy can be added when Phase 1/2 merge.

---

## File Structure

- **Modify** `Clients/src/presentation/pages/AIGateway/AIGatewaySidebar.tsx` — 4 sidebar labels.
- **Modify** `Clients/src/presentation/components/breadcrumbs/routeMapping.ts` — 4 breadcrumb labels.
- **Modify** 4 page components — titles + agent-accurate descriptions: `MCPAuditLog`, `MCPToolCatalog`, `MCPApprovals`, `MCPGuardrails` (under `Clients/src/presentation/pages/AIGateway/`).
- **Modify** `Clients/src/i18n/translations.ts` — de/fr/es key+value updates for every changed string.
- **Modify** user-guide content `shared/user-guide-content/` — section title + breadcrumb prose; copy to website repo.

---

## Task 1: Sidebar labels

**Files:**
- Modify: `Clients/src/presentation/pages/AIGateway/AIGatewaySidebar.tsx:98,110,116,122`

- [ ] **Step 1: Apply the four label edits**

In `AIGatewaySidebar.tsx`:
- L98 `name: "MCP Gateway",` → `name: "Agent Control",`
- L110 `label: "Servers",` → `label: "MCP Servers",`
- L116 `label: "Tools",` → `label: "MCP Tools",`
- L122 `label: "Audit Log",` → `label: "Activity",`

Leave L104 (`"Agent Keys"`), L128 (`"Approvals"`), L134 (`"Guardrails"`) unchanged. Leave all `value:` and `id:` fields unchanged (routes don't move).

- [ ] **Step 2: Verify no other label drifted**

```bash
grep -n 'name:\|label:' /Users/gorkemcetin/verifywise/Clients/src/presentation/pages/AIGateway/AIGatewaySidebar.tsx | sed -n '1,12p'
```
Expected: group `Agent Control`; items `Agent Keys`, `MCP Servers`, `MCP Tools`, `Activity`, `Approvals`, `Guardrails`.

- [ ] **Step 3: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add Clients/src/presentation/pages/AIGateway/AIGatewaySidebar.tsx && git commit -m "feat(ai-gateway): rename sidebar — Agent Control, Activity, MCP Servers/Tools"
```

---

## Task 2: Breadcrumb labels

**Files:**
- Modify: `Clients/src/presentation/components/breadcrumbs/routeMapping.ts:154,156,157,158`

- [ ] **Step 1: Apply the breadcrumb edits**

In `routeMapping.ts`, the `// MCP Gateway` block:
- L154 `"/ai-gateway/mcp": "MCP Gateway",` → `"/ai-gateway/mcp": "Agent Control",`
- L156 `"/ai-gateway/mcp/servers": "Servers",` → `"/ai-gateway/mcp/servers": "MCP Servers",`
- L157 `"/ai-gateway/mcp/tools": "Tool catalog",` → `"/ai-gateway/mcp/tools": "MCP Tools",`
- L158 `"/ai-gateway/mcp/audit": "Audit log",` → `"/ai-gateway/mcp/audit": "Activity",`

Leave agent-keys/approvals/guardrails breadcrumb labels unchanged. Optionally update the `// MCP Gateway` comment on L153 to `// Agent Control` (cosmetic).

- [ ] **Step 2: Verify**

```bash
sed -n '153,160p' /Users/gorkemcetin/verifywise/Clients/src/presentation/components/breadcrumbs/routeMapping.ts
```
Expected: `/ai-gateway/mcp` → `Agent Control`; servers → `MCP Servers`; tools → `MCP Tools`; audit → `Activity`.

- [ ] **Step 3: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add Clients/src/presentation/components/breadcrumbs/routeMapping.ts && git commit -m "feat(ai-gateway): rename breadcrumbs to match Agent Control labels"
```

---

## Task 3: Page headers + agent-accurate descriptions

**Files:**
- Modify: `Clients/src/presentation/pages/AIGateway/MCPAuditLog/index.tsx:129-130`
- Modify: `Clients/src/presentation/pages/AIGateway/MCPToolCatalog/index.tsx:258-259`
- Modify: `Clients/src/presentation/pages/AIGateway/MCPApprovals/index.tsx:127-128`
- Modify: `Clients/src/presentation/pages/AIGateway/MCPGuardrails/index.tsx:298-299,319,357,468`

- [ ] **Step 1: MCPAuditLog title + description**

L129-130:
```
      title="MCP Audit Log"
      description="Review tool invocation history and audit trail."
```
→
```
      title="Activity"
      description="Every tool call your AI agents make, with outcome, latency, and which agent."
```

- [ ] **Step 2: MCPToolCatalog title (keep MCP) + description**

L258-259:
```
      title="MCP Tool Catalog"
      description="View and manage all discovered MCP tools across your servers."
```
→
```
      title="MCP Tools"
      description="View and manage all discovered MCP tools across your servers."
```
(Title shortened to match the sidebar; description already MCP-accurate, unchanged.)

- [ ] **Step 3: MCPApprovals title + description**

L127-128:
```
      title="MCP Approvals"
      description="Review and manage tool invocation approval requests."
```
→
```
      title="Approvals"
      description="Review and decide on agent tool calls that require human approval before they run."
```

- [ ] **Step 4: MCPGuardrails title + description + MCP-mention copy**

L298-299:
```
      title="MCP Guardrails"
      description="Configure guardrail rules for MCP tool invocations."
```
→
```
      title="Guardrails"
      description="Scan agent tool calls for PII, prohibited content, or prompt injection — block or mask matches."
```

Also soften the three remaining MCP-specific phrasings (keep meaning, drop the redundant "MCP" where it reads as agent-governance copy; keep "MCP tools" where it specifically means MCP-server tools):
- L319 empty state: `"No MCP guardrail rules configured yet. Add rules to scan tool inputs for PII, prohibited content, or prompt injection attempts."` → `"No guardrail rules configured yet. Add rules to scan agent tool calls for PII, prohibited content, or prompt injection attempts."`
- L357 modal subtitle: `"Configure a new guardrail rule for MCP tool invocations."` → `"Configure a new guardrail rule for agent tool calls."`
- L468 revoke/disable copy: `"...MCP tool invocations will no longer be checked..."` → `"...agent tool calls will no longer be checked..."`

(Leave L325/L330 tip-box copy that legitimately references "MCP tools" as the MCP-server concept — those are accurate.)

- [ ] **Step 5: Verify titles changed and no stray double-rename**

```bash
cd /Users/gorkemcetin/verifywise/Clients/src/presentation/pages/AIGateway
grep -n 'title=' MCPAuditLog/index.tsx MCPToolCatalog/index.tsx MCPApprovals/index.tsx MCPGuardrails/index.tsx | grep -i "title="
```
Expected titles: `Activity`, `MCP Tools`, `Approvals`, `Guardrails`.

- [ ] **Step 6: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add Clients/src/presentation/pages/AIGateway/MCPAuditLog/index.tsx Clients/src/presentation/pages/AIGateway/MCPToolCatalog/index.tsx Clients/src/presentation/pages/AIGateway/MCPApprovals/index.tsx Clients/src/presentation/pages/AIGateway/MCPGuardrails/index.tsx && git commit -m "feat(ai-gateway): rename page headers + agent-accurate descriptions"
```

---

## Task 4: i18n — update de/fr/es keys + values

The DOM translator keys on the **English string**. Every English label we changed must get a new key in de/fr/es with a translated value, or non-English UIs render the new English. `en` is `{}` — no change. Old keys for strings that no longer appear in the DOM become dead; remove them to keep the file honest.

**Files:**
- Modify: `Clients/src/i18n/translations.ts` (de block ~L1903-1907,3894; fr ~L9160,10490-10494; es ~L18346-18350,19322)

- [ ] **Step 1: German (de) — replace the menu-label + group keys**

Replace these de entries:
```
    "MCP Approvals": "MCP-Genehmigungen",
    "MCP Audit Log": "MCP-Prüfprotokoll",
    "MCP Guardrails": "MCP-Guardrails",
    "MCP Servers": "MCP-Server",
    "MCP Tool Catalog": "MCP-Tool-Katalog",
```
with (new English keys → German values):
```
    "Approvals": "Genehmigungen",
    "Activity": "Aktivität",
    "Guardrails": "Guardrails",
    "MCP Servers": "MCP-Server",
    "MCP Tools": "MCP-Tools",
```
And the group key (~L3894):
```
    "MCP Gateway": "MCP-Gateway",
```
→
```
    "Agent Control": "Agentensteuerung",
```

- [ ] **Step 2: French (fr) — same key changes**

Replace (~L10490-10494):
```
    "MCP Approvals": "Approbations MCP",
    "MCP Audit Log": "Journal d'audit MCP",
    "MCP Guardrails": "Garde-fous MCP",
    "MCP Servers": "Serveurs MCP",
    "MCP Tool Catalog": "Catalogue d'outils MCP",
```
with:
```
    "Approvals": "Approbations",
    "Activity": "Activité",
    "Guardrails": "Garde-fous",
    "MCP Servers": "Serveurs MCP",
    "MCP Tools": "Outils MCP",
```
And the group key (~L9160):
```
    "MCP Gateway": "Passerelle MCP",
```
→
```
    "Agent Control": "Contrôle des agents",
```

- [ ] **Step 3: Spanish (es) — same key changes**

Replace (~L18346-18350):
```
    "MCP Approvals": "Aprobaciones de MCP",
    "MCP Audit Log": "Registro de auditoría de MCP",
    "MCP Guardrails": "Barreras de protección de MCP",
    "MCP Servers": "Servidores MCP",
    "MCP Tool Catalog": "Catálogo de herramientas MCP",
```
with:
```
    "Approvals": "Aprobaciones",
    "Activity": "Actividad",
    "Guardrails": "Barreras de protección",
    "MCP Servers": "Servidores MCP",
    "MCP Tools": "Herramientas MCP",
```
And the group key (~L19322):
```
    "MCP Gateway": "MCP Gateway",
```
→
```
    "Agent Control": "Control de agentes",
```

- [ ] **Step 4: Sweep for any remaining changed English strings still keyed by old text**

The renamed page descriptions and empty-state copy from Task 3 may also have de/fr/es keys. Search and update any that exist:
```bash
grep -n '"Review tool invocation history and audit trail."\|"Configure guardrail rules for MCP tool invocations."\|"Review and manage tool invocation approval requests."\|"No MCP guardrail rules configured yet' /Users/gorkemcetin/verifywise/Clients/src/i18n/translations.ts
```
For each hit, update the **key** to the new English string from Task 3 and translate the value. If a description has no translation entry (grep returns nothing for it), it has no de/fr/es override — that's fine, it renders English in all languages today and will continue to; no action needed.

- [ ] **Step 5: Verify the file still parses (typecheck)**

```bash
cd /Users/gorkemcetin/verifywise/Clients && npx tsc --noEmit 2>&1 | tail -20
```
Expected: no new errors referencing `translations.ts` (a trailing-comma or duplicate-key mistake shows here). Pre-existing unrelated errors elsewhere are acceptable — confirm none point at `i18n/translations.ts`.

- [ ] **Step 6: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add Clients/src/i18n/translations.ts && git commit -m "i18n(ai-gateway): update de/fr/es keys for Agent Control rename

Non-English copy is machine-translated without a native reviewer; flag
for a later native-speaker pass. English (en) is authoritative."
```

> **Translation-quality caveat (carry into PR description):** de/fr/es values above are best-effort, not native-reviewed.

---

## Task 5: User-guide content

**Files:**
- Modify: `shared/user-guide-content/userGuideConfig.ts` (section title + article labels ~L630-667)
- Modify: `shared/user-guide-content/content/ai-gateway/mcp-*.ts` (in-prose breadcrumb references)

- [ ] **Step 1: Find the user-guide strings**

```bash
cd /Users/gorkemcetin/verifywise
grep -rn "MCP Gateway\|Audit log\|MCP Audit\|> MCP Gateway >\|MCP Gateway >" shared/user-guide-content/ | head -40
```

- [ ] **Step 2: Update the section title + breadcrumb prose**

In `shared/user-guide-content/userGuideConfig.ts`: rename the collection/section title `"MCP Gateway overview"` → `"Agent Control overview"`. Update any article labels that say "MCP audit log" → "Activity" to match (leave "MCP servers"/"MCP tool catalog" article labels as MCP — those pages keep MCP). In the `content/ai-gateway/mcp-*.ts` files, replace in-prose breadcrumb references like `**AI Gateway > MCP Gateway > Approvals**` → `**AI Gateway > Agent Control > Approvals**`, and `> MCP Gateway > Audit log` → `> Agent Control > Activity`. Do NOT rename the content file names themselves (mcp-*.ts) or their import paths.

- [ ] **Step 3: Copy changed files to the website repo (per docs workflow)**

The user-guide source of truth is `shared/user-guide-content/`; the website consumes a copy. Per the project docs workflow, copy each changed file to `/Users/gorkemcetin/website/verifywise/content/user-guide/` mirroring its path. List what you changed and copy those exact files. Do NOT commit in the website repo (the user handles that).

```bash
# Example (adjust to the actual changed files):
# cp shared/user-guide-content/userGuideConfig.ts /Users/gorkemcetin/website/verifywise/content/user-guide/userGuideConfig.ts
```

- [ ] **Step 4: Commit (monorepo only)**

```bash
cd /Users/gorkemcetin/verifywise && git add shared/user-guide-content/ && git commit -m "docs(ai-gateway): update user guide for Agent Control rename"
```

---

## Task 6: Final verification (build + browser smoke)

- [ ] **Step 1: Build**

```bash
cd /Users/gorkemcetin/verifywise/Clients && npm run build 2>&1 | tail -15
```
Expected: build succeeds.

- [ ] **Step 2: Browser smoke (English)**

With the frontend running (5173) and logged in, navigate to `/ai-gateway/mcp/audit`. Confirm:
- Sidebar group reads **Agent Control**; items: Agent Keys, MCP Servers, MCP Tools, **Activity**, Approvals, Guardrails.
- Breadcrumb reads **AI gateway > Agent Control > Activity**.
- Page header reads **Activity**.
- Visit `/ai-gateway/mcp/tools` (header **MCP Tools**), `/ai-gateway/mcp/approvals` (**Approvals**), `/ai-gateway/mcp/guardrails` (**Guardrails**).

- [ ] **Step 3: Browser smoke (non-English)**

Switch UI language to German (and spot-check French/Spanish). Confirm the renamed sidebar labels render translated (e.g. **Agentensteuerung**, **Aktivität**) — not the raw English — proving the de/fr/es key updates took effect via the DOM translator.

- [ ] **Step 4 (no commit — verification only).** If anything renders raw English in a non-English UI, the corresponding `translations.ts` key wasn't updated to the new English string — fix in Task 4 and re-verify.

---

## Self-review notes

- **Spec coverage:** sidebar labels → Task 1; breadcrumbs → Task 2; page headers + agent-accurate descriptions → Task 3; full de/fr/es i18n → Task 4; user-guide + website copy → Task 5; build + browser (incl. non-English) → Task 6. All spec sections covered.
- **i18n mechanism (verified):** components render raw English; `domTranslator.ts` swaps DOM text using English string as key; `en` = `{}`. So renames require updating the de/fr/es **keys** (not just values), which Task 4 does. This is the crux the spec's "translate all 4 languages" decision addresses.
- **Honesty on branch:** descriptions say "agent tool calls" (true for MCP today), not "native tools like Bash" (only true once Phase 1/2 merge) — per the spec's branch caveat. Fuller native-tool copy is a follow-up after Phase 1/2.
- **No placeholders:** every string edit shows exact before/after. Line numbers are approximate (file may have shifted); each task includes a grep to locate the current string if a line moved.
- **Untouched:** routes, API endpoints, component/dir names, `value:`/`id:` fields, `MCP Servers` page title (already MCP), `Agent Keys`/`Approvals`/`Guardrails` sidebar labels.
