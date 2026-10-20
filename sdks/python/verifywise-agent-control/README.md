# verifywise-agent-control

Connect a Python agent to VerifyWise Agent Control. Every tool call the agent makes is checked by the VerifyWise AI Gateway before it runs, and its result is recorded after. Guardrail rules and approval rules apply, and each call shows up in AI Gateway → Agent Control → Activity. The agent key's allowed/blocked tool lists apply too when the key has **Also apply tool lists to native tool calls** turned on (it is off by default, because those lists were written for MCP proxy tools).

The package behaves the same way as the Claude Code shell hook (`scripts/vw-tool-hook.sh`). It reads the same environment variables and uses the same defaults.

## Install

The package is installed from the VerifyWise GitHub repository. It is not on PyPI.

```bash
# Core only (plain Python, @governed decorator)
pip install "verifywise-agent-control @ git+https://github.com/verifywise-ai/verifywise.git@sdk-py-v0.1.0#subdirectory=sdks/python/verifywise-agent-control"

# With the LangChain adapter
pip install "verifywise-agent-control[langchain] @ git+https://github.com/verifywise-ai/verifywise.git@sdk-py-v0.1.0#subdirectory=sdks/python/verifywise-agent-control"
```

The extras are `langchain`, `crewai`, `agent-framework` (installs `agent-framework-core`) and `all`.

Requires Python 3.10 or later. The core depends only on `httpx`.

## Configuration

Create an agent key in AI Gateway → Agent Control → Agent keys (the value starts with `sk-mcp-`), then set:

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `VW_GATEWAY_URL` | yes | | AI Gateway base URL, e.g. `http://localhost:8100` |
| `VW_AGENT_KEY` | yes | | Agent key, `sk-mcp-...` |
| `VW_FAIL_MODE` | no | `open` | `open` runs the tool when the gateway can't decide; `closed` refuses it |
| `VW_TIMEOUT` | no | `3` | Seconds per gateway request |
| `VW_APPROVAL_WAIT` | no | `120` | Max seconds to wait for a human approval |
| `VW_APPROVAL_FAIL_MODE` | no | `closed` | On approval timeout or expiry: `closed` refuses, `open` runs |

Every setting can also be passed in code, and code wins over the environment:

```python
from verifywise_agent_control import AgentControlClient

client = AgentControlClient(gateway_url="http://localhost:8100", agent_key="sk-mcp-...", fail_mode="closed")
```

If the gateway URL or key is missing, the SDK logs a warning and applies `VW_FAIL_MODE`, like the shell hook.

## Behaviour

| Gateway answer | What the SDK does |
|---|---|
| `allow` | Runs the tool, then records its output (cut to 9 KB, see below) |
| `allow` in monitor mode | Runs the tool, records its output, and logs one `WARNING` describing what would have happened. The Activity log shows the call as monitored (would have been blocked, or would have needed approval) |
| `deny` | Doesn't run the tool. The model gets `Blocked by VerifyWise policy: <reason>` and the agent continues |
| `approval_required` | Polls every 2 s for up to `VW_APPROVAL_WAIT`. Approved → runs. Denied → refusal. Expired or timed out → `VW_APPROVAL_FAIL_MODE` |
| `rate_limited` | Applies `VW_FAIL_MODE`. A tool that runs has its result recorded on the gateway's `rate_limited` row |
| Unreachable, timeout, HTTP 5xx or other non-200, unreadable reply | Applies `VW_FAIL_MODE` (default: run the tool). No result is recorded afterwards: the gateway has no record of the call to attach it to |
| HTTP 401 or 403 (agent key revoked, expired or invalid) | Always refuses, whatever `VW_FAIL_MODE` says, and logs an `ERROR`. The refusal reads `VerifyWise rejected the agent key (revoked, expired or invalid)` |
| Arguments JSON can't represent exactly | Always refuses, without contacting the gateway, and logs an `ERROR` (see below) |
| An error inside the SDK itself | Always refuses (as if `VW_FAIL_MODE=closed`) and logs an `ERROR` with the traceback. A bug in the SDK is not a gateway outage, so it never opens the gate |

To stop the agent instead of handing the model a refusal, pass `on_deny="raise"`; a refused call then raises `VerifyWiseDenied`.

`VW_FAIL_MODE=open` exists so that a gateway outage doesn't stop your agent. It never covers a rejected key: revoking a key in VerifyWise stops every agent that uses it.

Tool arguments are sent to the gateway exactly as the tool gets them, so the guardrails check what actually runs. JSON-native values (dicts with string keys, lists and tuples, strings, finite numbers, booleans, `None`) go unchanged. Anything JSON can't represent exactly (a non-string key, a value that contains itself, a `datetime`, `Decimal`, `set`, `bytes`, NaN or any other object) is never converted: the call is refused with `arguments could not be sent to VerifyWise for checking`, whatever `VW_FAIL_MODE` says, and an `ERROR` is logged. Pass such values as strings or numbers if the tool should run.

Right before the tool runs, the adapters compare its arguments with what the gateway checked. If they changed in between (another thread, or code that edited them during an approval wait), the call is refused with `arguments changed after VerifyWise checked them`.

Only the approval status path the gateway hands out for that approval (`/v1/mcp/approvals/<id>/status`) is polled, on the configured gateway URL, and redirects are never followed, so the agent key is never sent anywhere else.

The recorded result is `{"output": "..."}` or `{"error": "..."}`. When it is too long, the text is cut so that the whole JSON envelope fits in 9216 bytes (`max_result_bytes` on `Settings`, which can be lowered but not raised), and `"truncated": true` is added. The gateway stores up to 10240 bytes, so it never has to cut the result again.

`approval_poll_interval` (seconds between approval polls, default 2) must be at least 0.5; a smaller value raises `ValueError` when the client is created.

When the tool itself raises, the error text is recorded and the original exception is re-raised unchanged, so your framework handles it as it would without the SDK (CrewAI and Agent Framework turn it into an error message for the model). Otherwise the SDK never raises into your agent. Result recording and logging failures are swallowed.

All log lines use the logger `verifywise_agent_control`. Text from outside the SDK (tool names, arguments, exception messages, and reasons or rule names sent by the gateway) is logged on one line: line breaks and other control characters are escaped (`\n`, `\x1b`), terminal escape sequences are removed and long values are cut, so it can't forge or recolour log lines. An internal error's traceback is logged the same way. The agent key and the `Authorization` header are never logged, and `Settings` leaves the key out of its `repr()`.

## Runs

Tool calls are grouped into runs. The run id is chosen in this order:

1. An explicit `with vw_session("my-run-id"):` block
2. The framework's own id, when there is one: LangGraph `thread_id`, a new id per CrewAI kickoff, or the Agent Framework `AgentSession.session_id`
3. A new id per agent invocation (LangChain), or the client's own id (`@governed`, Agent Framework runs without a session, CrewAI agents used outside a crew)

If your model calls also go through the VerifyWise AI Gateway, send the same id as the `x-vw-agent-run-id` header on them so model calls and tool calls appear in one run:

```python
from verifywise_agent_control import vw_session

with vw_session() as run_id:
    # pass run_id as the x-vw-agent-run-id header on your model client
    agent.invoke(...)
```

## LangChain

Uses the LangChain v1 agent middleware (`create_agent`), so every tool the agent calls is governed, including tools added by other middleware.

```python
from langchain.agents import create_agent
from verifywise_agent_control.langchain import VerifyWiseMiddleware

agent = create_agent(
    model="openai:gpt-4.1",
    tools=[search, send_email],
    middleware=[VerifyWiseMiddleware()],
)

agent.invoke({"messages": [{"role": "user", "content": "Email the weekly report"}]})
```

A refused call becomes a `ToolMessage` with `status="error"` and the refusal text, so the model can explain or try something else. `ainvoke` and `astream` work the same way. Put `VerifyWiseMiddleware` last in the `middleware` list, so it is the innermost tool-call wrapper: a middleware placed after it could change the arguments after they were checked. Pass `client=` / `async_client=` to use explicit settings. Without them, every `VerifyWiseMiddleware` shares the same clients (built from the `VW_*` variables), as `@governed` and the other adapters do.

## CrewAI

Uses CrewAI's tool-call hooks. Call `enable_crewai_governance()` once, before `kickoff()`:

```python
from crewai import Agent, Crew, Task
from verifywise_agent_control.crewai import enable_crewai_governance

governance = enable_crewai_governance()   # or enable_crewai_governance(client=AgentControlClient(...))

crew = Crew(agents=[researcher], tasks=[report])
crew.kickoff()

governance.disable()   # optional: stop checking tool calls
```

The hooks are process-wide: they govern every crew and agent in the process, on every tool-execution path CrewAI has (native function calling, the text ReAct loop, parallel tool calls, `Agent.kickoff`). Calling `enable_crewai_governance()` again replaces the earlier registration. CrewAI runs pre-tool hooks in registration order and lets them edit the tool input, so call `enable_crewai_governance()` after registering any hook of your own that does: a hook registered later could change the input after VerifyWise checked it. If that happens the tool has already run, so the adapter records the call as an error (`arguments changed after VerifyWise checked them...`) and logs an `ERROR`. `kickoff_async()` and `akickoff()` are governed too.

**Limitation: under `akickoff()` the check blocks the event loop.** CrewAI's tool-call hooks are synchronous, so the adapter has to check each call synchronously inside the hook, with a blocking HTTP request. Under `akickoff()` that request, and any wait for a human approval, blocks the event loop: no other coroutine on that loop runs until the gateway answers, or, for a call that needs approval, until the approval is decided or `VW_APPROVAL_WAIT` (default 120 s) runs out. If the crew shares a loop with other work (a web server, other crews), keep `VW_APPROVAL_WAIT` short, or run the crew with `kickoff()` in a worker thread (`await asyncio.to_thread(crew.kickoff)`).

How it behaves, verified against crewai 1.15.28 with a scripted LLM:

- **Refused call.** The pre-tool hook blocks the call, so the tool does not run. CrewAI still runs the post-tool hooks on a blocked call, and the adapter's post-tool hook replaces CrewAI's fixed "Tool execution blocked by hook" text with `Blocked by VerifyWise policy: <reason>`. The model gets that text as the tool result and the agent continues. If you register your own post-tool hook after this one and it returns a string, it can overwrite the refusal text.
- **`on_deny="raise"`.** CrewAI swallows ordinary exceptions raised inside hooks, so the adapter raises `VerifyWiseCrewAIDenied` instead: a `VerifyWiseDenied` that is also CrewAI's `HookAborted`. CrewAI passes it through without retrying the task, and `kickoff()` raises it.
- **Tool errors.** CrewAI catches tool exceptions itself and gives the model an error message. The adapter leaves that alone and records the exception (`<type>: <message>`) on the call in Activity.
- **How the outcome is decided.** The recorded outcome never depends on the text of the tool result: a tool's output can echo a web page, a file or user input, including CrewAI's own "Tool execution blocked by hook" or "Error executing tool" wording. For an allowed call, the pre-tool hook wraps the tool's body (`func` of a `@tool` function or `CrewStructuredTool`, `_run`/`_arun` of a `BaseTool` subclass) and the post-tool hook puts it back. The wrapper records whether the body started and whether it raised, and the call is recorded as:
  - **completed with the raw output** when the body returned. If it returned a CrewAI `ToolFailure`, the tool's own structured report of failure, it is recorded as an error (`ToolFailure: <message>`).
  - **failed** with the exception when the body raised.
  - **not executed** when the body never started. CrewAI does not tell the post-tool hook why, so one message covers every reason: another pre-tool hook blocked the call, the tool's usage limit was reached, the result came from CrewAI's tool cache, or CrewAI rejected the arguments before calling the tool. A cache hit therefore shows as not executed, with no output; the call that filled the cache has it.
- **Limitation: when there is no reliable signal, the result is recorded as it is.** If the hook context carries no tool object, or the same tool object has two calls in flight and its body runs in a thread that carries neither call's context, the adapter cannot tell which call ran. The call is then recorded as completed with CrewAI's raw result, whatever it says. It is never read as a failure or a block.

## Microsoft Agent Framework

Uses the Agent Framework function middleware, which wraps every function the agent's function-calling loop invokes:

```python
from agent_framework import Agent
from verifywise_agent_control.agent_framework import VerifyWiseFunctionMiddleware

agent = Agent(
    client=chat_client,
    tools=[search, send_email],
    middleware=[VerifyWiseFunctionMiddleware()],
)

session = agent.create_session()   # optional: groups the calls into one run
result = await agent.run("Email the weekly report", session=session)
```

How it behaves, verified against agent-framework-core 1.21.0 with a scripted chat client:

- **Refused call.** The middleware sets `context.result` to the refusal text and does not call `call_next`, so the tool does not run. The model gets the refusal as the function result and the agent continues.
- **`on_deny="raise"`.** The loop turns ordinary middleware exceptions into tool-error results, so the adapter raises `VerifyWiseAgentFrameworkDenied`: a `VerifyWiseDenied` that is also the framework's `MiddlewareFailure`. `agent.run()` raises it.
- **Tool errors.** The tool's exception reaches the middleware through `call_next`. The adapter records it and re-raises it unchanged, and the framework turns it into an error result for the model, as it normally does. That includes a `VerifyWiseDenied` raised inside the tool (for example by a `@governed` function the tool calls with `on_deny="raise"`): only the middleware's own refusal stops the run.

The middleware is async, like the framework. Pass an `AsyncAgentControlClient` as `client=` for explicit settings; an `AgentControlClient` is accepted too and its settings reused.

## Plain Python

For custom agents, wrap the functions your agent calls:

```python
from verifywise_agent_control import governed, govern_tool

@governed
def delete_customer(customer_id: str) -> str:
    ...

@governed(name="crm.lookup")
async def lookup(email: str) -> dict:
    ...

safe_tool = govern_tool(existing_function, name="existing_tool")
```

The gateway gets every argument the function runs with, by parameter name, including parameters left at their default (`run_sql("select 1")` on `def run_sql(query, database="prod")` sends `{"query": "select 1", "database": "prod"}`). `@governed` works on methods too: instance methods, class methods and static methods, placed above or below `@classmethod` / `@staticmethod`. The `self` or `cls` argument is not sent, since it is the object the method belongs to, not tool input.

A refused call returns the refusal text instead of running the function. Async functions are supported, and so are objects whose `__call__` is `async def`; pass an `AsyncAgentControlClient` as `client=` for them, or let the SDK build one from the environment. A regular function that returns a coroutine (or other awaitable) instead of a result raises `TypeError`, because the call would otherwise never run; make it `async def`.

One `AsyncAgentControlClient` can be shared across event loops and threads (for example several `asyncio.run()` calls): it keeps one connection pool per running loop, closes a loop's pool when `asyncio.run` shuts that loop down, and `aclose()` closes all of them.

## Tested versions

| Package | Version |
|---|---|
| Python | 3.10, 3.12 |
| httpx | 0.28.1 |
| langchain | 1.4.6 |
| langchain-core | 1.6.10 |
| crewai | 1.15.28 |
| agent-framework-core | 1.21.0 |

All three frameworks install together in one environment (`pip install -e ".[all,dev]"` resolves on Python 3.10 and 3.12). CrewAI itself requires Python 3.10 to 3.13.

## License

MIT. This SDK directory is MIT licensed; the rest of the VerifyWise repository remains under its own license (see the root LICENSE.md).

## Development

```bash
cd sdks/python/verifywise-agent-control
python -m venv .venv
.venv/bin/pip install -e ".[all,dev]"
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/pytest
```

The tests use `respx` for the gateway and scripted fake models for LangChain, CrewAI and Agent Framework, so they need no network access and no LLM.
