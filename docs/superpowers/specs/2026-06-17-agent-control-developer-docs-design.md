# Agent Control developer docs — design

> **Date:** 2026-06-17 · **Status:** Design + multi-agent addendum (2026-06-18) · **Area:** user-guide content (in-app + website)
> **Goal:** give a customer's engineer a clear, plain-English set of docs for wiring their own agent to Agent Control. Today only end-user docs (click-the-UI) and internal-engineering docs (file paths, `mcp_hook.py`) exist; the integrator has nothing.

## Addendum (2026-06-18): multi-agent support

**Finding:** the gateway is already agent-agnostic. `POST /v1/mcp/hook` and `POST /v1/mcp` (MCP proxy) never check which coding tool is calling; they only validate the `sk-mcp-*` agent key and adjudicate by org/tool/args. The only Claude-Code-specific pieces are (a) the hook-wiring config (`.claude/settings.json`) and (b) the adapter reading Claude Code's stdin JSON shape. The script logic and the deny-via-exit-2 contract are generic.

**Decision (Option 1):** make the docs agent-agnostic.
- New article **`developers/connect-any-agent`** — the generic integration contract (read the tool call → `POST /v1/mcp/hook` → honor allow/deny) plus the MCP proxy path (any MCP-speaking agent works with zero adapter) plus a "bring your own agent" section for tools without a pre-tool hook (Codex CLI, Aider, Gemini CLI).
- Extend **`developers/connect-your-agent`** (the quickstart) with two worked examples that share the same `scripts/vw-tool-hook.sh`: Claude Code (`.claude/settings.json`, `PreToolUse`/`PostToolUse`) and Cursor (`.cursor/hooks.json`, `{ "version": 1, "hooks": { "preToolUse": [...] } }`).
- **Cursor facts (verified from cursor.com/docs/hooks):** Cursor hooks communicate via JSON on stdio. Cursor honors **exit code 2 = block**, **exit 0 = use JSON output** (empty/invalid JSON on exit 0 = fail-open allow). So the existing `vw-tool-hook.sh` already works for Cursor via exit codes: deny exits 2 (blocks), allow exits 0 (proceeds). Cursor's `preToolUse` input uses `tool_name` + `tool_input` (the script already falls back to `tool_input`). Known nuance to document: because the script blocks via exit 2 rather than returning JSON with `agent_message`, Cursor shows its own generic block message, not our reason.
- **No code change:** `vw-tool-hook.sh` is unchanged; it is already functionally Cursor-compatible. This addendum is docs-only.
- **Collection count:** adding `connect-any-agent` brings the Developer guide to **6 articles** (overview, connect-your-agent, connect-any-agent, agent-control-overview, governing-tool-calls, agent-control-api).
- **Out of scope:** building wrappers for agents without hooks (only documenting the contract so users can), and autonomous-agent POST-invocation integrations.

---

## 1. Audience and scope (decided)

- **Audience:** an external integrator — a customer's developer connecting their agent (Claude Code, a LangChain/CrewAI app, or a custom agent) to the gateway. NOT the end user clicking the UI, and NOT a VerifyWise platform engineer.
- **Scope:** Agent Control (the tool-call governance side) now. The LLM-proxy integration guide is a fast-follow that slots into the same collection later as a real article when it's written. No placeholder/stub is created now.
- **Non-goals:** no new doc site, no SDK code, no changes to the existing end-user articles or the internal `docs/technical/domains/agent-control.md`.

## 2. Home and separation (decided)

A new **top-level user-guide collection** named `developers` (title: "Developer guide"), sibling to the "AI Gateway" collection. This keeps curl/JSON-RPC content out of the end-user reading path while reusing the entire existing doc system: renderer, search, sidebar, and the (i) help deep-link.

This reuses the same content system as the end-user guide:
- Content files live in `shared/user-guide-content/content/developers/`.
- Each article is a `.ts` file exporting an `ArticleContent` (`{ blocks: ContentBlock[] }`), same as every other article.
- Registered in two config files (same pattern as all collections):
  - `shared/user-guide-content/content/index.ts` — import each article's content and add it to `articleContentMap` keyed `developers/<article-id>`.
  - `shared/user-guide-content/userGuideConfig.ts` — add a `Collection` object `{ id: 'developers', title, description, icon, articleCount, articles: [...] }` with one `Article` entry (`id`, `title`, `description`, `keywords`) per article.
- After writing, mirror every changed/new file to the website dir `/Users/gorkemcetin/website/verifywise/content/user-guide/...` (per the documentation workflow). Never commit to the website repo.
- `icon`: use a valid `IconName` (the type the other collections use). `Code` or `Terminal` are the natural fits — confirm the chosen name is a valid `IconName` at build time; fall back to `Plug` (already in use) if not.

## 3. The articles (task-based, decided)

Four articles, ordered the way an integrator reads them. Collection `articleCount` = 4. (The LLM-proxy guide is added later as a real fifth article when written, not stubbed now.)

1. **Overview & how it works** (`developers/agent-control-overview`)
   What Agent Control governs: the agent's *actions* (its tool calls), not just what it says. The two entry paths in plain terms: the **native hook** (the agent runs its own built-in tool like Bash; the gateway says allow/deny before it runs) and the **MCP proxy** (the agent calls a tool *through* the gateway). The core promise: every tool call is checked before it runs. Defines the vocabulary used by the rest of the guide: agent key, hook, tool call, run.

2. **Connect your agent** (`developers/connect-your-agent`)
   The 5-minute quickstart. Steps: mint an agent key (`sk-mcp-*`) in the UI, set the env vars (`VW_GATEWAY_URL`, `VW_AGENT_KEY`), wire the Claude Code `PreToolUse`/`PostToolUse` hook to `scripts/vw-tool-hook.sh`, make a tool call, see it appear in Activity. Copy-paste blocks. Ends with "what to read next" → Governing tool calls.

3. **Governing tool calls** (`developers/governing-tool-calls`)
   The full request/response story, with approval and correlation handled inline (not as separate pages):
   - The four decisions a tool call can get back: `allow`, `deny`, `approval_required`, `rate_limited`. What each means and what the agent should do.
   - **Approval polling, inline:** when a call needs human sign-off, the agent gets `approval_required` with an `approval_id` and `poll_endpoint`; poll `GET /v1/mcp/approvals/{id}/status` until `approved`/`denied`/`expired`. (For the MCP-proxy path this is a JSON-RPC `-32001` error carrying the same data — note both.)
   - **Run correlation, inline:** to make a turn show up as one run, send the same id everywhere. The native hook reuses the agent session id automatically; for model calls send the `x-vw-agent-run-id` header (aliases `x-session-id`, `helicone-session-id`) with the same value. The rule: same id on every call of a turn, including sub-calls. A call with no id is still governed and logged, just not grouped.
   - Errors and fail-modes: the adapter's `VW_FAIL_MODE` (open/closed), approval timeout behavior, what a gateway-unreachable call does.

4. **API reference** (`developers/agent-control-api`)
   One lookup page. For each endpoint: method, path, auth, request fields, response fields, example. Covers:
   - `POST /v1/mcp/hook` — adjudicate a native tool call (request: `tool_name`, `arguments`, `session_id`, `tool_use_id`; response: `decision` + decision-specific fields).
   - `POST /v1/mcp/hook/result` — attach a tool result (request: `tool_name`, `tool_response`, `session_id`, `tool_use_id`).
   - `GET /v1/mcp/approvals/{id}/status` — poll an approval.
   - Auth: agent keys (`sk-mcp-*`) via `Authorization: Bearer`.
   - Headers: `x-vw-agent-run-id` (+ aliases).
   - JSON-RPC error codes for the proxy path (e.g. `-32001` approval required).
   - Field-aware scanning: for file-write tools only the written content is scanned, in plain terms.
   Each entry has a curl example and a short Python example.

Each article ends with an `article-links` block cross-linking the relevant **end-user** AI Gateway article (e.g. the API reference links to the end-user "Activity" article), so the two doc sets point at each other.

## 4. Writing style (decided: plain technical English)

- Short sentences. Common words. Define every term on first use (agent key, hook, MCP, tool call, run).
- A developer who has never seen VerifyWise can follow it. Assumes general REST/JSON/curl familiarity, nothing VerifyWise-specific.
- Code blocks carry the detail; prose stays minimal and explains the *why* (especially the same-id-everywhere rule, which must be explained, not just shown).
- Real API terms are fine but get a one-line definition the first time.
- After the content is written, run a **humanizer pass** over all four articles (same as the end-user articles got): no em dashes, no rule-of-three padding, no copula avoidance, no signposting, no FATAL negation, no Oxford comma, numbers as digits.
- Sentence case in all headings and titles.

## 5. Content-block usage (against the real `contentTypes`)

- `heading` (level 2/3), `paragraph`, `bullet-list`, `ordered-list` for steps, `callout` (`variant: info|tip|warning|success`) for gotchas (e.g. the same-id rule as a `tip`, fail-mode as a `warning`).
- `code` block (`{ type: 'code', code, language }`) for curl / Python / JSON / shell. `language` set per block (`bash`, `python`, `json`).
- `table` for the decisions matrix and the API field lists.
- `article-links` (`{ title, items: [{ collectionId, articleId, title, description }] }`) at the end of each article.

## 6. Accuracy sourcing (so the docs are true, not invented)

Write the technical content from the verified implementation, not from memory:
- Endpoints, request/response shapes, decisions: `AIGateway/src/routers/mcp_hook.py`, `mcp_proxy.py`, `mcp_approvals.py`.
- Adapter env vars + hook wiring: `scripts/vw-tool-hook.sh` and `scripts/vw-tool-hook.README.md`.
- Run correlation + headers: the run-correlation work in this branch (`x-vw-agent-run-id`, aliases, `agent_run_id`).
- JSON-RPC error codes: the proxy/approval routers.
Every claim (a field name, a header, an error code) must match the code. No fabricated fields.

## 7. Build order

1. Write the 4 articles as content files in `content/developers/`.
2. Register them: imports + `articleContentMap` entries in `content/index.ts`; new `developers` collection in `userGuideConfig.ts` (`articleCount: 4`).
3. Humanizer pass over all four.
4. Mirror new/changed files to the website dir.
5. Verify: `cd Clients && npm run typecheck` (articles are imported by the app), confirm the collection renders in the user-guide sidebar, and that an in-app deep-link to a `developers/*` article resolves.

## 8. Risks / open points

- **`IconName` validity:** the collection `icon` must be a valid `IconName`. Confirm `Code`/`Terminal` is in the type before using; fall back to `Plug`.
- **Cross-link target ids:** the `article-links` must reference real `collectionId`/`articleId` pairs (e.g. `ai-gateway`/`mcp-audit`). Verify each link resolves.
- **Accuracy drift:** the API reference must match the code exactly. The implementer reads the routers, doesn't guess.
- **Audience bleed:** keep end-user "click here" tone out of the developer collection, and keep curl/JSON out of the end-user collection. They cross-link but don't merge.
- **No empty pages:** the LLM-proxy guide is deliberately not created until it's written. The collection ships with 4 complete articles, no "coming soon" placeholder.
