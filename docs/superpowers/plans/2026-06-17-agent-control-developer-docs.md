# Agent Control developer docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Developer guide" collection to the in-app user guide with 4 plain-English articles that show a customer's engineer how to connect their agent to Agent Control.

**Architecture:** Reuse the existing user-guide content system. Each article is a `.ts` file exporting an `ArticleContent` (`{ blocks: ContentBlock[] }`). A new top-level `developers` collection is declared in `userGuideConfig.ts`; each article's content is imported and registered in `content/index.ts` under keys `developers/<id>`. After writing, mirror the new/changed files to the website directory. No app code changes, no new components.

**Tech Stack:** TypeScript content files (`shared/user-guide-content/`), the existing user-guide renderer (React), block types from `contentTypes.ts` (`heading`, `paragraph`, `bullet-list`, `ordered-list`, `callout`, `code`, `table`, `article-links`).

**Source spec:** `docs/superpowers/specs/2026-06-17-agent-control-developer-docs-design.md`

---

## Conventions (read before starting)

- **Worktree:** all paths are under `/Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation`. Branch `feat/agent-run-correlation`.
- **Article file shape:** copy the structure of an existing article, e.g. `shared/user-guide-content/content/ai-gateway/mcp-runs.ts`. First line: `import type { ArticleContent } from '../../contentTypes';` then `export const <name>Content: ArticleContent = { blocks: [ ... ] };`.
- **Block types (verified in `contentTypes.ts`):**
  - heading: `{ type: 'heading', id: 'slug', level: 2, text: '...' }`
  - paragraph: `{ type: 'paragraph', text: '...' }`
  - bullet-list: `{ type: 'bullet-list', items: [ { text: '...' } | { bold: 'X', text: '...' } ] }`
  - ordered-list: `{ type: 'ordered-list', items: [ { text: '...' } ] }`
  - callout: `{ type: 'callout', variant: 'info'|'tip'|'warning'|'success', title: '...', text: '...' }`
  - code: `{ type: 'code', code: '...', language: 'bash'|'python'|'json' }`
  - table: `{ type: 'table', columns: [ { key, label, width } ], rows: [ { <key>: value } ] }`
  - article-links: `{ type: 'article-links', title: 'Related articles', items: [ { collectionId, articleId, title, description } ] }`
- **Writing style (spec §4):** plain technical English. Short sentences. Common words. Define each term on first use (agent key, hook, tool call, run). Code blocks carry the detail. No em dashes, no Oxford comma, numbers as digits, sentence case headings. Assume general REST/JSON/curl knowledge, nothing VerifyWise-specific.
- **Accuracy (spec §6):** every endpoint, field, header and error code must match the code. Verified facts to use (do NOT invent others):
  - Native hook: `POST /v1/mcp/hook`. Request body: `tool_name` (str), `arguments` (object), `session_id` (str), `tool_use_id` (str). Response: `{ "decision": "allow" }` | `{ "decision": "deny", "reason", "detections" }` | `{ "decision": "approval_required", "approval_id", "poll_endpoint", "expires_at" }` | `{ "decision": "rate_limited", "reason" }`.
  - Result capture: `POST /v1/mcp/hook/result`. Request body: `tool_name`, `tool_response` (object), `session_id`, `tool_use_id`. Response: `{ "status": "..." }`.
  - Approval poll: `GET /v1/mcp/approvals/{id}/status`. Returns a status of `pending` | `approved` | `denied` | `expired`.
  - Auth: agent key `sk-mcp-*` via header `Authorization: Bearer sk-mcp-...`.
  - Run-correlation header: `x-vw-agent-run-id` (aliases accepted: `x-session-id`, `helicone-session-id`). The native hook reuses its `session_id` as the run id automatically.
  - MCP proxy approval path returns a JSON-RPC error `code: -32001` with the same `approval_id`/`poll_endpoint`/`expires_at` in `error.data`.
  - Adapter env vars (`scripts/vw-tool-hook.sh`): `VW_GATEWAY_URL` (required), `VW_AGENT_KEY` (required, `sk-mcp-*`), `VW_FAIL_MODE` (open|closed, default open), `VW_TIMEOUT` (default 3), `VW_APPROVAL_WAIT` (default 120), `VW_APPROVAL_FAIL_MODE` (open|closed, default closed).
  - Claude Code hook wiring: `PreToolUse` matcher `Bash|Edit|Write|MultiEdit|NotebookEdit`, `PostToolUse` matcher `Bash|Edit|Write`, both running `scripts/vw-tool-hook.sh`.
- **Icon:** the `developers` collection `icon` MUST be a valid `IconName`. Verified valid values are: Rocket, Shield, AlertTriangle, Brain, Settings, Plug, FileText, GraduationCap, BarChart3, FlaskConical, ScanSearch, EyeOff, Router. `Code`/`Terminal` are NOT valid. **Use `'Plug'`.**
- **Cross-links:** end-user AI Gateway articles exist with these ids in collection `ai-gateway`: `mcp-overview`, `mcp-audit`, `mcp-approvals`, `mcp-guardrails`, `mcp-agent-keys`, `mcp-servers`, `mcp-tools`, `mcp-runs`. Use these exact ids in `article-links`.
- **Verify after each content task:** `cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation/Clients && npm run typecheck 2>&1 | tail -5` (the content is imported by the app; a malformed block or bad type fails here).
- **Website mirror (final task):** copy new/changed files to `/Users/gorkemcetin/website/verifywise/content/user-guide/...` preserving relative paths. Never commit to the website repo.

---

## File Structure

**Create (content):**
- `shared/user-guide-content/content/developers/agent-control-overview.ts` — exports `agentControlOverviewContent`
- `shared/user-guide-content/content/developers/connect-your-agent.ts` — exports `connectYourAgentContent`
- `shared/user-guide-content/content/developers/governing-tool-calls.ts` — exports `governingToolCallsContent`
- `shared/user-guide-content/content/developers/agent-control-api.ts` — exports `agentControlApiContent`

**Modify (registration):**
- `shared/user-guide-content/content/index.ts` — 4 imports + 4 `articleContentMap` entries (keys `developers/<id>`)
- `shared/user-guide-content/userGuideConfig.ts` — new `developers` `Collection` appended to the `collections` array (before the closing `];` at line ~723)

**Mirror (final):** the same files under `/Users/gorkemcetin/website/verifywise/content/user-guide/`.

---

## Task 1: Article — Overview & how it works

**Files:**
- Create: `shared/user-guide-content/content/developers/agent-control-overview.ts`

- [ ] **Step 1: Write the article**

```ts
import type { ArticleContent } from '../../contentTypes';

export const agentControlOverviewContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'What Agent Control does' },
    { type: 'paragraph', text: 'Agent Control governs what your agent does, not just what it says. Every time an agent runs a tool (a shell command, a file write, an API call through a tool server), the gateway checks that call before it runs and decides whether to allow it, block it, ask a human, or rate-limit it.' },
    { type: 'paragraph', text: 'This guide is for developers connecting their own agent to the gateway. If you just want to use the screens, see the end-user AI Gateway articles instead.' },
    { type: 'heading', id: 'terms', level: 2, text: 'Terms used in this guide' },
    { type: 'bullet-list', items: [
      { bold: 'Agent key', text: 'A secret token (starts with sk-mcp-) that identifies your agent to the gateway. You create it in the UI and send it on every request.' },
      { bold: 'Tool call', text: 'A single action the agent takes, like running a Bash command or writing a file.' },
      { bold: 'Hook', text: 'A small script your agent runs before each tool call to ask the gateway for a decision.' },
      { bold: 'Run', text: 'One agent turn, grouping the model calls (the conversation) and the tool calls (the actions) that belong together.' },
    ]},
    { type: 'heading', id: 'two-paths', level: 2, text: 'Two ways to connect' },
    { type: 'paragraph', text: 'There are two entry paths. Most coding agents use the first.' },
    { type: 'bullet-list', items: [
      { bold: 'Native hook', text: 'Your agent runs its own built-in tools (like Bash). Before each call, a hook asks the gateway POST /v1/mcp/hook for a decision. The gateway never runs the tool itself; it only says yes or no.' },
      { bold: 'MCP proxy', text: 'Your agent calls a tool through the gateway at POST /v1/mcp using JSON-RPC. The gateway checks the call and forwards it to the registered tool server.' },
    ]},
    { type: 'callout', variant: 'info', title: 'Where decisions are recorded', text: 'Every checked call is written to the Activity log, so you can see what each agent did, the decision it got and how long it took.' },
    { type: 'article-links', title: 'Next steps', items: [
      { collectionId: 'developers', articleId: 'connect-your-agent', title: 'Connect your agent', description: 'Get a tool call governed in about 5 minutes.' },
      { collectionId: 'ai-gateway', articleId: 'mcp-overview', title: 'Agent Control overview', description: 'The end-user view of the same feature.' },
    ]},
  ],
};
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation/Clients && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "agent-control-overview" || echo "no errors in this file"`
Expected: `no errors in this file` (the file is not yet imported, so this only checks its own syntax/types; full registration is Task 5).

- [ ] **Step 3: Commit**

```bash
cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation
git add shared/user-guide-content/content/developers/agent-control-overview.ts
git commit -m "docs(dev): Agent Control overview article"
```

---

## Task 2: Article — Connect your agent (quickstart)

**Files:**
- Create: `shared/user-guide-content/content/developers/connect-your-agent.ts`

- [ ] **Step 1: Write the article**

```ts
import type { ArticleContent } from '../../contentTypes';

export const connectYourAgentContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Connect your agent' },
    { type: 'paragraph', text: 'This gets one tool call governed in about 5 minutes, using a Claude Code agent and the bundled hook script. The same ideas apply to other agents; see the API reference for the raw calls.' },
    { type: 'heading', id: 'step-1', level: 2, text: '1. Create an agent key' },
    { type: 'paragraph', text: 'In the UI, go to AI Gateway > Agent Control > Agent keys and create a key. Copy the value (it starts with sk-mcp-). You only see it once.' },
    { type: 'heading', id: 'step-2', level: 2, text: '2. Set the environment variables' },
    { type: 'code', language: 'bash', code: 'export VW_GATEWAY_URL=http://localhost:8100   # your gateway URL\nexport VW_AGENT_KEY=sk-mcp-...                 # the key you just copied' },
    { type: 'heading', id: 'step-3', level: 2, text: '3. Wire the hook' },
    { type: 'paragraph', text: 'Point Claude Code at the bundled hook script in your .claude/settings.json. The PreToolUse hook asks for a decision before each tool runs; the PostToolUse hook reports the result afterward.' },
    { type: 'code', language: 'json', code: '{\n  "hooks": {\n    "PreToolUse": [\n      { "matcher": "Bash|Edit|Write|MultiEdit|NotebookEdit",\n        "hooks": [{ "type": "command", "command": "scripts/vw-tool-hook.sh" }] }\n    ],\n    "PostToolUse": [\n      { "matcher": "Bash|Edit|Write",\n        "hooks": [{ "type": "command", "command": "scripts/vw-tool-hook.sh" }] }\n    ]\n  }\n}' },
    { type: 'paragraph', text: 'The script needs curl and jq on the PATH.' },
    { type: 'heading', id: 'step-4', level: 2, text: '4. Make a tool call' },
    { type: 'paragraph', text: 'Run any Bash command in your agent. The hook calls the gateway, the gateway returns a decision, and the call runs only if it is allowed.' },
    { type: 'heading', id: 'step-5', level: 2, text: '5. See it in Activity' },
    { type: 'paragraph', text: 'Open AI Gateway > Agent Control > Activity. The call appears with its decision, latency and the agent key that made it.' },
    { type: 'callout', variant: 'tip', title: 'Fail-open by default', text: 'If the gateway is unreachable, the hook lets the call run so your workflow is never blocked by an outage. Set VW_FAIL_MODE=closed to block instead.' },
    { type: 'article-links', title: 'Next steps', items: [
      { collectionId: 'developers', articleId: 'governing-tool-calls', title: 'Governing tool calls', description: 'What the gateway sends back and how to handle each case.' },
      { collectionId: 'ai-gateway', articleId: 'mcp-agent-keys', title: 'Agent keys', description: 'Managing the keys that identify your agents.' },
    ]},
  ],
};
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation/Clients && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "connect-your-agent" || echo "no errors in this file"`
Expected: `no errors in this file`

- [ ] **Step 3: Commit**

```bash
cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation
git add shared/user-guide-content/content/developers/connect-your-agent.ts
git commit -m "docs(dev): connect your agent quickstart article"
```

---

## Task 3: Article — Governing tool calls

**Files:**
- Create: `shared/user-guide-content/content/developers/governing-tool-calls.ts`

- [ ] **Step 1: Write the article**

```ts
import type { ArticleContent } from '../../contentTypes';

export const governingToolCallsContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Governing tool calls' },
    { type: 'paragraph', text: 'When your agent asks the gateway about a tool call, it gets back one of four decisions. This page explains each one, how to group calls into a run and how failures are handled.' },
    { type: 'heading', id: 'decisions', level: 2, text: 'The four decisions' },
    { type: 'table', columns: [
      { key: 'decision', label: 'Decision', width: '25%' },
      { key: 'meaning', label: 'What it means and what to do', width: '75%' },
    ], rows: [
      { decision: 'allow', meaning: 'The call passed all checks. Run the tool.' },
      { decision: 'deny', meaning: 'A guardrail blocked the call. Do not run the tool. The response includes a reason.' },
      { decision: 'approval_required', meaning: 'A human must approve first. The response includes an approval id and a poll endpoint. Wait for approval, then retry.' },
      { decision: 'rate_limited', meaning: 'The agent key went over its per-minute limit. Back off and retry later.' },
    ]},
    { type: 'heading', id: 'approval', level: 2, text: 'Handling approval' },
    { type: 'paragraph', text: 'When the decision is approval_required, the gateway has created a request for a human to approve or deny. Poll the status endpoint until you get a final answer.' },
    { type: 'code', language: 'json', code: '{\n  "decision": "approval_required",\n  "approval_id": 42,\n  "poll_endpoint": "/v1/mcp/approvals/42/status",\n  "expires_at": "2026-04-20T15:30:00+00:00"\n}' },
    { type: 'ordered-list', items: [
      { text: 'Call GET /v1/mcp/approvals/{approval_id}/status with your agent key.' },
      { text: 'When the status is approved, run the tool.' },
      { text: 'When the status is denied, do not run it.' },
      { text: 'When the status is expired, the window passed with no decision; treat it as a block.' },
    ]},
    { type: 'paragraph', text: 'On the MCP proxy path the same information comes back as a JSON-RPC error with code -32001, carrying the approval id, poll endpoint and expiry in error.data.' },
    { type: 'heading', id: 'runs', level: 2, text: 'Grouping calls into a run' },
    { type: 'paragraph', text: 'A run groups one turn of work: the model calls and the tool calls that belong together. They are tied by a shared run id.' },
    { type: 'bullet-list', items: [
      { bold: 'Tool calls', text: 'The native hook reuses the agent session id it already sends, so tool calls are grouped automatically.' },
      { bold: 'Model calls', text: 'Send the same id on your model requests using the header x-vw-agent-run-id. The aliases x-session-id and helicone-session-id are also accepted.' },
    ]},
    { type: 'callout', variant: 'tip', title: 'Use the same id on every call', text: 'A turn only groups correctly when the agent sends the same run id on every call, including sub-calls. A call with no id is still checked and logged; it just will not appear inside a run.' },
    { type: 'heading', id: 'failures', level: 2, text: 'Failures and fail-modes' },
    { type: 'bullet-list', items: [
      { bold: 'Gateway unreachable', text: 'With VW_FAIL_MODE=open (the default) the call runs anyway, so an outage never blocks your agent. Set it to closed to block instead.' },
      { bold: 'Approval timed out', text: 'Controlled by VW_APPROVAL_FAIL_MODE (default closed, which blocks). Set it to open to allow on timeout.' },
      { bold: 'Rate limited', text: 'Follows VW_FAIL_MODE. The call is an infra outcome, not a policy block.' },
    ]},
    { type: 'article-links', title: 'Related articles', items: [
      { collectionId: 'developers', articleId: 'agent-control-api', title: 'API reference', description: 'Every endpoint, header and error code in one place.' },
      { collectionId: 'ai-gateway', articleId: 'mcp-approvals', title: 'Approvals', description: 'The human side of approving or denying a call.' },
    ]},
  ],
};
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation/Clients && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "governing-tool-calls" || echo "no errors in this file"`
Expected: `no errors in this file`

- [ ] **Step 3: Commit**

```bash
cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation
git add shared/user-guide-content/content/developers/governing-tool-calls.ts
git commit -m "docs(dev): governing tool calls article"
```

---

## Task 4: Article — API reference

**Files:**
- Create: `shared/user-guide-content/content/developers/agent-control-api.ts`

- [ ] **Step 1: Write the article**

```ts
import type { ArticleContent } from '../../contentTypes';

export const agentControlApiContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'API reference' },
    { type: 'paragraph', text: 'The endpoints your agent uses to get tool calls governed. All calls authenticate with an agent key.' },
    { type: 'heading', id: 'auth', level: 2, text: 'Authentication' },
    { type: 'paragraph', text: 'Send your agent key (it starts with sk-mcp-) as a bearer token on every request.' },
    { type: 'code', language: 'bash', code: 'Authorization: Bearer sk-mcp-...' },
    { type: 'heading', id: 'headers', level: 2, text: 'Headers' },
    { type: 'table', columns: [
      { key: 'header', label: 'Header', width: '35%' },
      { key: 'purpose', label: 'Purpose', width: '65%' },
    ], rows: [
      { header: 'Authorization', purpose: 'Bearer sk-mcp-... agent key. Required.' },
      { header: 'x-vw-agent-run-id', purpose: 'Groups model calls into the same run. Aliases: x-session-id, helicone-session-id.' },
    ]},
    { type: 'heading', id: 'hook', level: 2, text: 'POST /v1/mcp/hook' },
    { type: 'paragraph', text: 'Ask for a decision on a native tool call. The gateway never runs the tool; it only returns a decision.' },
    { type: 'paragraph', text: 'Request body:' },
    { type: 'table', columns: [
      { key: 'field', label: 'Field', width: '30%' },
      { key: 'desc', label: 'Description', width: '70%' },
    ], rows: [
      { field: 'tool_name', desc: 'Name of the tool, e.g. "Bash".' },
      { field: 'arguments', desc: 'Object with the tool arguments, e.g. { "command": "ls" }.' },
      { field: 'session_id', desc: 'The run id for this turn. Used to group the call into a run.' },
      { field: 'tool_use_id', desc: 'A unique id for this specific call.' },
    ]},
    { type: 'code', language: 'bash', code: 'curl -X POST "$VW_GATEWAY_URL/v1/mcp/hook" \\\n  -H "Authorization: Bearer $VW_AGENT_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"tool_name":"Bash","arguments":{"command":"ls"},"session_id":"run-123","tool_use_id":"call-1"}\'' },
    { type: 'paragraph', text: 'Responses, one per decision:' },
    { type: 'code', language: 'json', code: '{ "decision": "allow" }\n\n{ "decision": "deny", "reason": "policy violation", "detections": [] }\n\n{ "decision": "approval_required", "approval_id": 42,\n  "poll_endpoint": "/v1/mcp/approvals/42/status",\n  "expires_at": "2026-04-20T15:30:00+00:00" }\n\n{ "decision": "rate_limited", "reason": "rate limit exceeded" }' },
    { type: 'heading', id: 'result', level: 2, text: 'POST /v1/mcp/hook/result' },
    { type: 'paragraph', text: 'Report the result of a tool that has already run, so the run shows what happened. Best-effort; it never blocks.' },
    { type: 'table', columns: [
      { key: 'field', label: 'Field', width: '30%' },
      { key: 'desc', label: 'Description', width: '70%' },
    ], rows: [
      { field: 'tool_name', desc: 'Name of the tool that ran.' },
      { field: 'tool_response', desc: 'Object with the tool result.' },
      { field: 'session_id', desc: 'Same run id used on the hook call.' },
      { field: 'tool_use_id', desc: 'Same call id used on the hook call.' },
    ]},
    { type: 'code', language: 'python', code: 'import httpx, os\nhttpx.post(\n    f"{os.environ[\'VW_GATEWAY_URL\']}/v1/mcp/hook/result",\n    headers={"Authorization": f"Bearer {os.environ[\'VW_AGENT_KEY\']}"},\n    json={\n        "tool_name": "Bash",\n        "tool_response": {"stdout": "file1\\nfile2"},\n        "session_id": "run-123",\n        "tool_use_id": "call-1",\n    },\n)' },
    { type: 'heading', id: 'approval-status', level: 2, text: 'GET /v1/mcp/approvals/{id}/status' },
    { type: 'paragraph', text: 'Check whether a pending approval has been decided. Returns a status of pending, approved, denied or expired.' },
    { type: 'code', language: 'bash', code: 'curl "$VW_GATEWAY_URL/v1/mcp/approvals/42/status" \\\n  -H "Authorization: Bearer $VW_AGENT_KEY"' },
    { type: 'heading', id: 'errors', level: 2, text: 'JSON-RPC error codes' },
    { type: 'paragraph', text: 'On the MCP proxy path (POST /v1/mcp), an approval requirement comes back as a JSON-RPC error.' },
    { type: 'table', columns: [
      { key: 'code', label: 'Code', width: '20%' },
      { key: 'meaning', label: 'Meaning', width: '80%' },
    ], rows: [
      { code: '-32001', meaning: 'Tool requires approval. error.data has approval_id, poll_endpoint and expires_at.' },
    ]},
    { type: 'heading', id: 'scanning', level: 2, text: 'What gets scanned' },
    { type: 'paragraph', text: 'For file-write tools, the gateway scans the content being written, not the file path or the text being removed. For other tools it scans the full arguments. This means writing sensitive data can be blocked, while deleting it is allowed.' },
    { type: 'article-links', title: 'Related articles', items: [
      { collectionId: 'developers', articleId: 'governing-tool-calls', title: 'Governing tool calls', description: 'How to handle each decision in practice.' },
      { collectionId: 'ai-gateway', articleId: 'mcp-audit', title: 'Activity', description: 'Where governed calls are recorded.' },
    ]},
  ],
};
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation/Clients && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "agent-control-api" || echo "no errors in this file"`
Expected: `no errors in this file`

- [ ] **Step 3: Commit**

```bash
cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation
git add shared/user-guide-content/content/developers/agent-control-api.ts
git commit -m "docs(dev): Agent Control API reference article"
```

---

## Task 5: Register the collection and articles

**Files:**
- Modify: `shared/user-guide-content/content/index.ts`
- Modify: `shared/user-guide-content/userGuideConfig.ts`

- [ ] **Step 1: Add the 4 imports in `content/index.ts`**

After the line `import { mcpToolsContent } from './ai-gateway/mcp-tools';` (and any other ai-gateway imports), add:

```ts
import { agentControlOverviewContent } from './developers/agent-control-overview';
import { connectYourAgentContent } from './developers/connect-your-agent';
import { governingToolCallsContent } from './developers/governing-tool-calls';
import { agentControlApiContent } from './developers/agent-control-api';
```

- [ ] **Step 2: Add the 4 map entries in `content/index.ts`**

Inside `articleContentMap`, after the last `'ai-gateway/...'` entry (`'ai-gateway/mcp-tools': mcpToolsContent,`) and before the closing `};`, add:

```ts
  // Developers
  'developers/agent-control-overview': agentControlOverviewContent,
  'developers/connect-your-agent': connectYourAgentContent,
  'developers/governing-tool-calls': governingToolCallsContent,
  'developers/agent-control-api': agentControlApiContent,
```

- [ ] **Step 3: Add the `developers` collection in `userGuideConfig.ts`**

In the `collections` array, append a new collection as the last element (immediately before the closing `];` of the `collections` array). Use `icon: 'Plug'` (a verified valid `IconName`; `Code`/`Terminal` are not valid).

```ts
  {
    id: 'developers',
    title: 'Developer guide',
    description: 'Connect your own agent to Agent Control: quickstart, how decisions work and the API reference.',
    icon: 'Plug',
    articleCount: 4,
    articles: [
      {
        id: 'agent-control-overview',
        title: 'Overview and how it works',
        description: 'What Agent Control governs and the two ways to connect an agent.',
        keywords: ['developer', 'agent control', 'overview', 'integration', 'hook', 'mcp', 'tool call', 'agent key'],
      },
      {
        id: 'connect-your-agent',
        title: 'Connect your agent',
        description: 'Get a tool call governed in about 5 minutes with the bundled hook.',
        keywords: ['developer', 'quickstart', 'connect', 'hook', 'setup', 'agent key', 'claude code', 'integration'],
      },
      {
        id: 'governing-tool-calls',
        title: 'Governing tool calls',
        description: 'The four decisions, approval polling, run correlation and fail-modes.',
        keywords: ['developer', 'decision', 'allow', 'deny', 'approval', 'rate limit', 'run correlation', 'x-vw-agent-run-id', 'fail mode'],
      },
      {
        id: 'agent-control-api',
        title: 'API reference',
        description: 'Endpoints, headers, auth and error codes for the tool-call hook.',
        keywords: ['developer', 'api', 'reference', 'endpoint', 'hook', 'curl', 'json-rpc', 'authentication', 'agent key'],
      },
    ],
  },
```

- [ ] **Step 4: Typecheck the whole client**

Run: `cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation/Clients && npm run typecheck 2>&1 | tail -5`
Expected: no errors (tsc -b completes clean). If `IconName` rejects the icon, the icon value is wrong; use `'Plug'`.

- [ ] **Step 5: Commit**

```bash
cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation
git add shared/user-guide-content/content/index.ts shared/user-guide-content/userGuideConfig.ts
git commit -m "docs(dev): register developers collection (4 articles)"
```

---

## Task 6: Humanizer pass

**Files:**
- Modify (prose only): the 4 files in `shared/user-guide-content/content/developers/`

- [ ] **Step 1: Apply the humanizer rules to all 4 articles**

Edit only the prose inside `text:` / `bold:` fields, callout `title:`/`text:`, and `article-links` `description:`. Do NOT change block `type`, `id`, `level`, `code` block contents, table `columns`/`rows` keys, endpoint strings, headers or field names.

Apply: remove any em dashes (replace with comma/period/colon/parentheses); no rule-of-three padding; no staccato parallelism (3+ identical short sentences); prefer is/are/has over "serves as/boasts"; no signposting ("let's look at", "at a glance"); no filler ("it's important to note", "in order to"); NO negation pattern ("this isn't X, it's Y"); no AI vocab (delve, leverage, robust, seamless, crucial, landscape); no Oxford comma; numbers as digits; sentence case headings.

- [ ] **Step 2: Verify no em dashes and no negation patterns**

Run: `cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation && grep -l "—" shared/user-guide-content/content/developers/*.ts && echo "EM DASH FOUND" || echo "no em dashes"; grep -niE "isn't .*it's|not just|not only.*but" shared/user-guide-content/content/developers/*.ts || echo "no negation patterns"`
Expected: `no em dashes` and `no negation patterns`.

- [ ] **Step 3: Typecheck (prose edits must not break the blocks)**

Run: `cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation/Clients && npm run typecheck 2>&1 | tail -3`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation
git add shared/user-guide-content/content/developers/*.ts
git commit -m "docs(dev): humanizer pass on developer articles"
```

---

## Task 7: Mirror to website + final verification

**Files:**
- Mirror: the new content files + the 2 config files to the website dir.

- [ ] **Step 1: Mirror new/changed files to the website**

```bash
SRC=/Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation/shared/user-guide-content
WEB=/Users/gorkemcetin/website/verifywise/content/user-guide
mkdir -p "$WEB/content/developers"
cp "$SRC/content/developers/"*.ts "$WEB/content/developers/"
cp "$SRC/content/index.ts" "$WEB/content/index.ts"
cp "$SRC/userGuideConfig.ts" "$WEB/userGuideConfig.ts"
echo "mirrored"
```

Expected: `mirrored`. Do NOT commit in the website repo.

- [ ] **Step 2: Full client gates**

Run: `cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation/Clients && npm run typecheck && npm run format-check 2>&1 | tail -3`
Expected: typecheck clean; format-check passes (run `npm run format` on the developer files if it flags them, then re-check and amend the commit).

- [ ] **Step 3: i18n audit (new user-facing strings: collection title/description, article titles)**

Run: `cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation/Clients && npm run i18n:audit:strict 2>&1 | tail -8`
Expected: 0 gaps. If it reports gaps for the new collection/article titles, add de/fr/es entries to `Clients/src/i18n/translations.ts` (keyed by the English source string, same as existing entries), re-run until 0 gaps, and commit them.

- [ ] **Step 4: Commit any i18n additions**

```bash
cd /Users/gorkemcetin/.claude-worktrees/verifywise/agent-run-correlation
git add Clients/src/i18n/translations.ts 2>/dev/null || true
git commit -m "i18n(dev): translate developer guide titles" 2>&1 | tail -1 || echo "no i18n changes needed"
```

---

## Manual verification (after all tasks)

- Open the in-app user guide on the running branch frontend (http://localhost:5173). Confirm a "Developer guide" collection appears with 4 articles, each renders (headings, code blocks, tables), and the cross-links to the AI Gateway articles resolve.
