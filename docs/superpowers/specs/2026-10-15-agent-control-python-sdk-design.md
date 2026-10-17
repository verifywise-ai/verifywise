# Agent Control Python SDK — design

Date: 2026-10-15 · Branch: `feature/agent-control-python-sdk` · Status: approved direction, decisions below are final unless a verification step disproves them.

## Goal

Give Python agents built on LangChain, CrewAI and Microsoft Agent Framework (and plain Python) a ready-made Agent Control connector, so every tool call is checked by the AI Gateway before it runs and its result is recorded after, exactly as Claude Code and Cursor are today.

Success: a developer adds one line to their agent, every tool call shows up in Agent Control → Activity/Runs, guardrail rules and approval rules apply, and a key's allowed/blocked tool lists are enforced.

## Decisions (made)

| Topic | Decision |
|---|---|
| Distribution | Source in this repo at `sdks/python/verifywise-agent-control/`; customers `pip install` from GitHub with `#subdirectory=` and a tag `sdk-py-vX.Y.Z`. No PyPI. |
| Frameworks | LangChain v1 (`create_agent` middleware), CrewAI (tool hooks), Microsoft Agent Framework (function middleware). Not legacy AutoGen. |
| Interception | Agent-level, using each framework's native interception point, so no tool can be missed. A `@governed` decorator / `govern_tool()` wrapper is the fallback for custom agents. |
| On deny | Default: the tool returns `"Blocked by VerifyWise policy: <reason>"` to the model and the agent continues. `on_deny="raise"` raises `VerifyWiseDenied`. |
| Approvals | Wait and poll (`GET /v1/mcp/approvals/{id}/status`, every 2s) up to `VW_APPROVAL_WAIT` (120s). Approved → run; denied/expired → refusal; timeout → `VW_APPROVAL_FAIL_MODE` (default closed = refusal). |
| Failure | Gateway unreachable / non-200 / rate limited → `VW_FAIL_MODE` (default open = run the tool). Same env names and defaults as `scripts/vw-tool-hook.sh`. |
| Monitor mode | Gateway returns `allow` (+ optional `monitored`); SDK runs the tool and logs one `logging.WARNING` line describing what would have happened. Works whether or not the monitor-mode PR is merged (field optional). |
| Gateway change | Native hook (`POST /v1/mcp/hook`) enforces the key's `allowed_tools` / `blocked_tools` using the existing `enforce_tool_acls`. Violation → `{"decision":"deny","reason":"Tool '<name>' is not allowed for this agent key"}`, audit `result_status='blocked'`, `summary` naming the key's tool list, checked FIRST (before guardrails). Applies to every hook client. |

## Architecture

```
verifywise_agent_control/
  __init__.py         public API re-exports, __version__
  config.py           Settings.from_env(); explicit kwargs override env
  decision.py         Decision dataclass, VerifyWiseDenied
  client.py           AgentControlClient (httpx.Client) / AsyncAgentControlClient (httpx.AsyncClient)
                        check(tool_name, arguments, *, session_id, call_id) -> Decision   (handles approval wait + fail modes)
                        report(*, session_id, call_id, tool_name, output=None, error=None) -> None  (never raises)
  session.py          contextvar-based current session id; `vw_session(id=None)` context manager
  governed.py         @governed(client=None, name=None) for sync/async functions; govern_tool(fn)
  _core.py            shared run_governed(...) / arun_governed(...) used by every adapter
  langchain.py        VerifyWiseMiddleware(AgentMiddleware): wrap_tool_call + awrap_tool_call
  crewai.py           enable_crewai_governance(client=None) registers PRE/POST tool-call hooks
  agent_framework.py  VerifyWiseFunctionMiddleware for Microsoft Agent Framework
```

Core depends only on `httpx`. Extras: `langchain`, `crewai`, `agent-framework`, `all`. Python ≥ 3.10.

### Data flow (one tool call)

1. Adapter intercepts the call: tool name, arguments (dict), framework call id if any.
2. `session_id` = explicit `vw_session` value → framework run/thread id when available → a uuid4 created once per agent invocation and kept in the contextvar. `call_id` = framework tool-call id (LangChain `request.tool_call["id"]`) else uuid4.
3. `POST {VW_GATEWAY_URL}/v1/mcp/hook` with `Authorization: Bearer {VW_AGENT_KEY}` (match the header the shell hook sends), header `x-vw-agent-run-id: {session_id}`, body `{tool_name, arguments, session_id, tool_use_id: call_id}`. Arguments that are not JSON-serialisable are stringified with `default=str`.
4. Decision handling per the table above. Approval polling uses the `poll_endpoint` from the response.
5. If allowed: run the tool; then `POST /v1/mcp/hook/result` with `{session_id, tool_use_id, tool_name, tool_response}` (output stringified, truncated client-side to 10 KB; on exception send the error text and re-raise the original exception unchanged).
6. `report()` and logging never raise into the agent. All SDK log lines use logger `verifywise_agent_control`.

`client.session_id` is exposed so customers who route model traffic through the VerifyWise AI Gateway can send the same `x-vw-agent-run-id` header on model calls and get full run correlation.

### Framework specifics (verify against installed versions during implementation)

- **LangChain v1:** `AgentMiddleware.wrap_tool_call(request, handler)`; refusal = return `ToolMessage(content=..., tool_call_id=request.tool_call["id"], status="error")` without calling `handler`. Async via `awrap_tool_call`.
- **CrewAI:** register PRE/POST tool-call hooks (`@before_tool_call` / interception points). VERIFY how a block surfaces: if blocking (return False / `HookAborted`) returns a message to the agent and the task continues, use it with our refusal text. If it ends the task, implement refusal by wrapping the agent's tools at registration instead, and document the behaviour. Pick whichever keeps "agent continues" and record the finding in the PR.
- **Microsoft Agent Framework:** function middleware (`FunctionMiddleware` / `@function_middleware`, `context.function`, `context.arguments`, set `context.result` and skip `next` to refuse). Verify names against the installed package.
- Pin tested framework versions in the extras with sensible lower bounds; record the tested versions in the README.

## Gateway change detail

`AIGateway/src/routers/mcp_hook.py`: import and call `enforce_tool_acls` (from `services/mcp_proxy_service.py`) right after key auth. Ensure the key row passed includes `allowed_tools`/`blocked_tools` (extend the SELECT in `authenticate_agent_key` if needed). Unit tests in the mocked style of `AIGateway/tests/test_agent_policy_scope.py`; add the file to `.github/workflows/aigateway-checks.yml`. Update `docs/technical/domains/agent-control.md` (hook decision order) and the developer guide decision docs.

## Testing

- SDK unit tests (`pytest`, `respx` for httpx): every decision path, approval approve/deny/expire/timeout, fail open/closed, monitored logging, non-serialisable args, result truncation, report never raises, sync + async, decorator on sync and async functions.
- Adapter tests with the real frameworks installed and a fake model/tool (no network, no LLM): allow runs tool, deny returns refusal and agent continues, approval wait, result reported.
- New CI workflow `.github/workflows/python-sdk-checks.yml` (paths filter `sdks/python/**`): install `.[all,dev]`, ruff (if AIGateway uses it; otherwise match AIGateway lint), pytest.
- Gateway unit test for hook ACL enforcement (allowed list, blocked list, no lists = unchanged).
- Optional live smoke test, skipped unless `VW_GATEWAY_URL` and `VW_AGENT_KEY` are set.

## Docs

- `sdks/python/verifywise-agent-control/README.md`: install, env vars, one example per framework, behaviour table, tested versions.
- User guide: new developer article `connect-python-agents` in `shared/user-guide-content/content/developers/`, registered like `connect-your-agent`; update `connect-any-agent` "Agents without a hook" and the decision docs for the hook ACL check. Mirror changed user-guide files to `~/website/verifywise/content/user-guide/` (do not commit the website repo).
- `docs/technical/domains/agent-control.md`: adapters section + remove the shipped items from "Not yet built".
- New user-facing strings, if any in Clients, need de/fr/es.

## Out of scope

PyPI publishing, legacy AutoGen/AG2, LlamaIndex/Semantic Kernel, TypeScript SDK, auto-registering SDK agents in the AI agents register, changing the MCP proxy.

## Amendments after review (2026-10-15)

These supersede the matching lines above.

- **Tool lists on the hook are opt-in** (gateway change, line "Gateway change"): enforced only when the key's `apply_tool_lists_to_hook` is true (migration `a0015`, default false), because lists written for MCP proxy tools would otherwise deny Bash/Edit for keys shared with Claude Code or Cursor. Enforce key → deny; monitor key → `would_block` with source `tool_acl`.
- **Arguments are never converted** (step 3): JSON-native arguments are sent unchanged; anything JSON can't represent exactly is refused (`arguments_unsendable`) whatever the fail mode, and arguments that change between the check and the run are refused (`arguments_changed`).
- **Fail mode covers outages only**: 401/403 (`auth_rejected`) and SDK-internal errors (`sdk_error`) are always refused.
- **Result cap** (step 5): the serialized envelope is cut to 9216 bytes as the gateway measures it, under the gateway's 10240-byte cap. The gateway records `{"error": ...}` as a failed call for every client.
- **Approval polling**: only `/v1/mcp/approvals/<same id>/status`, never following redirects; `approval_poll_interval` must be at least 0.5 s.
