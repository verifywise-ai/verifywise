"""CrewAI adapter tests: real crewai, a scripted fake LLM, no network."""

import json
import os

import httpx
import pytest
from conftest import GATEWAY, HOOK, RESULT, body_of

os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")
os.environ.setdefault("OTEL_SDK_DISABLED", "true")

pytest.importorskip("crewai")

from crewai import Agent, Crew, Task  # noqa: E402
from crewai.hooks import get_after_tool_call_hooks, get_before_tool_call_hooks  # noqa: E402
from crewai.llms.base_llm import BaseLLM  # noqa: E402
from crewai.tools import BaseTool, tool  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from verifywise_agent_control import VerifyWiseDenied, vw_session  # noqa: E402
from verifywise_agent_control.crewai import NOT_EXECUTED, enable_crewai_governance  # noqa: E402

RAN = []
APPROVAL_REQUIRED = {
    "decision": "approval_required",
    "approval_id": 5,
    "poll_endpoint": "/v1/mcp/approvals/5/status",
}


@tool("add")
def add(a: int, b: int) -> int:
    """Add two numbers."""
    RAN.append(("add", a, b))
    return a + b


@tool("explode")
def explode(reason: str) -> str:
    """Always fails."""
    raise RuntimeError(reason)


@tool("echo")
def echo(text: str) -> str:
    """Return the text unchanged (a tool whose output an attacker controls)."""
    RAN.append(("echo", text))
    return text


class ShoutInput(BaseModel):
    text: str


class Shout(BaseTool):
    """A BaseTool subclass: its body is ``_run``, not a ``func`` field."""

    name: str = "shout"
    description: str = "Upper-case the text, or fail when asked to."
    args_schema: type[BaseModel] = ShoutInput

    def _run(self, text: str) -> str:
        RAN.append(("shout", text))
        if text == "fail":
            raise ValueError("shout failed")
        return text.upper()


shout = Shout()

# The texts CrewAI itself puts in a tool result when it blocks or catches a
# failure. A tool that really ran can return them too.
BLOCKED_TEXT = "Tool execution blocked by hook. Tool: x"
ERROR_PREFIXES = [
    "Error executing tool: ",
    "I encountered an error while trying to use the tool. This was the error: ",
]


class ScriptedLLM(BaseLLM):
    """Replays scripted replies and records what the agent sent it."""

    def __init__(self, replies, native=True):
        super().__init__(model="scripted")
        object.__setattr__(self, "_replies", list(replies))
        object.__setattr__(self, "_native", native)
        object.__setattr__(self, "seen", [])

    def supports_function_calling(self):
        return self._native

    def call(self, messages, tools=None, callbacks=None, available_functions=None, **kwargs):
        self.seen.append(messages)
        return self._replies.pop(0)

    async def acall(self, messages, tools=None, callbacks=None, available_functions=None, **kwargs):
        return self.call(messages, tools, callbacks, available_functions, **kwargs)


def _native_call(name, args, call_id):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


def _crew(*calls, native=True):
    calls = calls or (("add", {"a": 1, "b": 2}),)
    if native:
        first = [_native_call(name, args, f"call-{i}") for i, (name, args) in enumerate(calls, 1)]
        replies = [first, "final"]
    else:
        ((name, args),) = calls
        replies = [
            f"Thought: use a tool\nAction: {name}\nAction Input: {json.dumps(args)}",
            "Thought: done\nFinal Answer: final",
        ]
    llm = ScriptedLLM(replies, native=native)
    agent = Agent(
        role="clerk", goal="g", backstory="b", llm=llm, tools=[add, explode, echo, shout], max_iter=3
    )
    task = Task(description="do it", expected_output="a number", agent=agent)
    return Crew(agents=[agent], tasks=[task]), llm


def _last_tool_text(llm):
    """What the model was told the tool returned, on its last turn."""
    last = llm.seen[-1]
    for message in reversed(last):
        if message.get("role") == "tool":
            return message["content"]
    return next(m["content"] for m in reversed(last) if m.get("role") == "assistant")


@pytest.fixture(autouse=True)
def reset():
    RAN.clear()
    yield
    from verifywise_agent_control import crewai as adapter

    adapter.disable_crewai_governance()


@pytest.mark.parametrize("native", [True, False], ids=["native-tools", "react"])
def test_allow_runs_the_tool_and_reports_the_result(gateway, make_client, native):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    enable_crewai_governance(make_client())
    crew, _ = _crew(native=native)

    out = crew.kickoff()

    assert RAN == [("add", 1, 2)]
    assert out.raw == "final"
    sent = body_of(hook.calls.last)
    assert sent["tool_name"] == "add"
    assert sent["arguments"] == {"a": 1, "b": 2}
    reported = body_of(result.calls.last)
    assert reported["tool_use_id"] == sent["tool_use_id"]
    assert reported["session_id"] == sent["session_id"]
    assert reported["tool_name"] == "add"
    assert reported["tool_response"] == {"output": "3"}


@pytest.mark.parametrize("native", [True, False], ids=["native-tools", "react"])
def test_deny_returns_the_refusal_and_the_agent_continues(gateway, make_client, native):
    gateway.post(HOOK).respond(
        200, json={"decision": "deny", "reason": "Tool 'add' is not allowed for this agent key"}
    )
    result = gateway.post(RESULT).respond(200, json={})
    enable_crewai_governance(make_client())
    crew, llm = _crew(native=native)

    out = crew.kickoff()

    assert RAN == []
    assert out.raw == "final"
    refusal = "Blocked by VerifyWise policy: Tool 'add' is not allowed for this agent key"
    assert refusal in _last_tool_text(llm)
    assert result.call_count == 0


def test_on_deny_raise_stops_the_crew(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "no"})
    enable_crewai_governance(make_client(on_deny="raise"))
    crew, _ = _crew()

    with pytest.raises(VerifyWiseDenied) as raised:
        crew.kickoff()
    assert raised.value.tool_name == "add"
    assert RAN == []


def test_approval_approved_runs_the_tool(gateway, make_client):
    gateway.post(HOOK).respond(
        200,
        json=APPROVAL_REQUIRED,
    )
    gateway.get(f"{GATEWAY}/v1/mcp/approvals/5/status").side_effect = [
        httpx.Response(200, json={"status": "pending"}),
        httpx.Response(200, json={"status": "approved"}),
    ]
    result = gateway.post(RESULT).respond(200, json={})
    enable_crewai_governance(make_client())
    crew, _ = _crew()

    assert crew.kickoff().raw == "final"
    assert RAN == [("add", 1, 2)]
    assert body_of(result.calls.last)["tool_response"] == {"output": "3"}


def test_approval_denied_refuses(gateway, make_client):
    gateway.post(HOOK).respond(
        200,
        json=APPROVAL_REQUIRED,
    )
    gateway.get(f"{GATEWAY}/v1/mcp/approvals/5/status").respond(
        200, json={"status": "denied", "decision_reason": "too risky"}
    )
    enable_crewai_governance(make_client())
    crew, llm = _crew()

    assert crew.kickoff().raw == "final"
    assert RAN == []
    assert "Blocked by VerifyWise policy: too risky" in _last_tool_text(llm)


@pytest.mark.parametrize("native", [True, False], ids=["native-tools", "react"])
def test_tool_error_is_reported_and_left_to_crewai(gateway, make_client, native):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    enable_crewai_governance(make_client())
    crew, llm = _crew(("explode", {"reason": "kaboom"}), native=native)

    # CrewAI itself catches tool exceptions and hands the error text to the
    # model; the adapter must not change that, only record the error.
    assert crew.kickoff().raw == "final"
    assert "kaboom" in _last_tool_text(llm)
    reported = body_of(result.calls.last)["tool_response"]
    assert set(reported) == {"error"}
    assert "kaboom" in reported["error"]


def test_parallel_tool_calls_are_each_reported_once(gateway, make_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    enable_crewai_governance(make_client())
    crew, _ = _crew(("add", {"a": 1, "b": 1}), ("add", {"a": 2, "b": 2}))

    crew.kickoff()

    checked = {body_of(c)["tool_use_id"]: body_of(c)["arguments"] for c in hook.calls}
    reported = {body_of(c)["tool_use_id"]: body_of(c)["tool_response"] for c in result.calls}
    assert len(checked) == 2
    assert set(reported) == set(checked)
    for call_id, args in checked.items():
        assert reported[call_id] == {"output": str(args["a"] + args["b"])}


def test_one_generated_session_per_kickoff(gateway, make_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    gateway.post(RESULT).respond(200, json={})
    client = make_client()
    enable_crewai_governance(client)

    _crew(("add", {"a": 1, "b": 1}), ("add", {"a": 2, "b": 2}))[0].kickoff()
    first = {body_of(c)["session_id"] for c in hook.calls}
    _crew()[0].kickoff()
    second = {body_of(c)["session_id"] for c in list(hook.calls)[2:]}

    assert len(first) == 1 and len(second) == 1
    assert first != second
    assert client.session_id not in first | second


def test_explicit_session_wins(gateway, make_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    gateway.post(RESULT).respond(200, json={})
    enable_crewai_governance(make_client())

    with vw_session("my-run"):
        _crew()[0].kickoff()

    assert body_of(hook.calls.last)["session_id"] == "my-run"


async def test_async_kickoff_allow_and_deny(gateway, make_client):
    hook = gateway.post(HOOK)
    hook.side_effect = [
        httpx.Response(200, json={"decision": "allow"}),
        httpx.Response(200, json={"decision": "deny", "reason": "blocked"}),
    ]
    result = gateway.post(RESULT).respond(200, json={})
    enable_crewai_governance(make_client())

    allowed = await _crew()[0].akickoff()
    crew, llm = _crew()
    denied = await crew.akickoff()

    assert allowed.raw == "final" and denied.raw == "final"
    assert RAN == [("add", 1, 2)]
    assert result.call_count == 1
    assert "Blocked by VerifyWise policy: blocked" in _last_tool_text(llm)


def test_enable_is_idempotent_and_disable_removes_the_hooks(make_client):
    before = (len(get_before_tool_call_hooks()), len(get_after_tool_call_hooks()))
    enable_crewai_governance(make_client())
    governance = enable_crewai_governance(make_client())
    assert len(get_before_tool_call_hooks()) == before[0] + 1
    assert len(get_after_tool_call_hooks()) == before[1] + 1

    governance.disable()
    assert (len(get_before_tool_call_hooks()), len(get_after_tool_call_hooks())) == before


def test_disabled_governance_does_not_check(gateway, make_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "no"})
    enable_crewai_governance(make_client()).disable()

    assert _crew()[0].kickoff().raw == "final"
    assert RAN == [("add", 1, 2)]
    assert hook.call_count == 0


@pytest.mark.parametrize("native", [True, False], ids=["native-tools", "react"])
def test_a_call_blocked_by_another_hook_is_reported_as_not_run(gateway, make_client, native):
    from crewai.hooks import InterceptionPoint, register_hook, unregister_hook

    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    enable_crewai_governance(make_client())

    def other_hook(ctx):
        return False  # another hook, registered after ours, blocks the call

    register_hook(InterceptionPoint.PRE_TOOL_CALL, other_hook)
    try:
        crew, _ = _crew(native=native)
        assert crew.kickoff().raw == "final"
    finally:
        unregister_hook(InterceptionPoint.PRE_TOOL_CALL, other_hook)

    assert RAN == []
    assert result.call_count == 1
    assert body_of(result.calls.last)["tool_response"] == {"error": NOT_EXECUTED}


def test_an_outage_that_fails_open_is_not_reported(gateway, make_client):
    hook = gateway.post(HOOK).mock(side_effect=httpx.ConnectError("down"))
    result = gateway.post(RESULT).respond(200, json={})
    enable_crewai_governance(make_client(fail_mode="open"))
    crew, _ = _crew()

    assert crew.kickoff().raw == "final"
    assert RAN == [("add", 1, 2)]
    assert hook.call_count == 1
    assert result.call_count == 0


# ── Outcomes come from execution state, never from the tool's output text ──
#
# A tool's output is attacker-influenced (it can echo a web page, a file or
# user input), so text that looks like CrewAI's own "blocked" or "error"
# messages must not change what the audit log records.

BOTH_PATHS = pytest.mark.parametrize("native", [True, False], ids=["native-tools", "react"])


def _allow_all(gateway):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    return gateway.post(RESULT).respond(200, json={})


@BOTH_PATHS
def test_a_tool_that_returns_the_blocked_text_is_recorded_as_completed(gateway, make_client, native):
    result = _allow_all(gateway)
    enable_crewai_governance(make_client())

    _crew(("echo", {"text": BLOCKED_TEXT}), native=native)[0].kickoff()

    assert RAN == [("echo", BLOCKED_TEXT)]
    assert body_of(result.calls.last)["tool_response"] == {"output": BLOCKED_TEXT}


@BOTH_PATHS
@pytest.mark.parametrize("prefix", ERROR_PREFIXES, ids=["native-error-prefix", "react-error-prefix"])
def test_a_tool_that_returns_error_looking_text_is_recorded_as_completed(
    gateway, make_client, native, prefix
):
    result = _allow_all(gateway)
    enable_crewai_governance(make_client())
    text = prefix + "everything is fine"

    _crew(("echo", {"text": text}), native=native)[0].kickoff()

    assert RAN == [("echo", text)]
    assert body_of(result.calls.last)["tool_response"] == {"output": text}


@BOTH_PATHS
def test_a_tool_that_really_raises_is_recorded_as_failed(gateway, make_client, native):
    result = _allow_all(gateway)
    enable_crewai_governance(make_client())

    _crew(("explode", {"reason": "kaboom"}), native=native)[0].kickoff()

    assert body_of(result.calls.last)["tool_response"] == {"error": "RuntimeError: kaboom"}


@BOTH_PATHS
def test_a_base_tool_subclass_is_tracked_through_its_run_method(gateway, make_client, native):
    result = _allow_all(gateway)
    enable_crewai_governance(make_client())

    _crew(("shout", {"text": BLOCKED_TEXT}), native=native)[0].kickoff()
    ok = body_of(result.calls.last)["tool_response"]
    _crew(("shout", {"text": "fail"}), native=native)[0].kickoff()
    failed = body_of(result.calls.last)["tool_response"]

    assert ok == {"output": BLOCKED_TEXT.upper()}
    assert failed == {"error": "ValueError: shout failed"}


@BOTH_PATHS
def test_a_blocked_call_whose_tool_would_echo_text_is_still_not_executed(gateway, make_client, native):
    from crewai.hooks import InterceptionPoint, register_hook, unregister_hook

    result = _allow_all(gateway)
    enable_crewai_governance(make_client())

    def other_hook(ctx):
        return False

    register_hook(InterceptionPoint.PRE_TOOL_CALL, other_hook)
    try:
        _crew(("echo", {"text": "plain output"}), native=native)[0].kickoff()
    finally:
        unregister_hook(InterceptionPoint.PRE_TOOL_CALL, other_hook)

    assert RAN == []
    assert body_of(result.calls.last)["tool_response"] == {"error": NOT_EXECUTED}


def test_parallel_calls_each_get_their_own_outcome(gateway, make_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    enable_crewai_governance(make_client())
    calls = (
        ("echo", {"text": BLOCKED_TEXT}),
        ("explode", {"reason": "boom"}),
        ("echo", {"text": ERROR_PREFIXES[0] + "fine"}),
        ("add", {"a": 2, "b": 3}),
    )

    _crew(*calls)[0].kickoff()

    checked = {body_of(c)["tool_use_id"]: body_of(c) for c in hook.calls}
    reported = {body_of(c)["tool_use_id"]: body_of(c)["tool_response"] for c in result.calls}
    assert set(reported) == set(checked) and len(checked) == 4
    expected = {
        ("echo", BLOCKED_TEXT): {"output": BLOCKED_TEXT},
        ("explode", "boom"): {"error": "RuntimeError: boom"},
        ("echo", ERROR_PREFIXES[0] + "fine"): {"output": ERROR_PREFIXES[0] + "fine"},
        ("add", None): {"output": "5"},
    }
    for call_id, sent in checked.items():
        args = sent["arguments"]
        key = (sent["tool_name"], args.get("text", args.get("reason")))
        assert reported[call_id] == expected[key]


@pytest.mark.parametrize("native", [True, False], ids=["native-tools", "react"])
async def test_async_kickoff_records_outcomes_from_execution_state(gateway, make_client, native):
    result = _allow_all(gateway)
    enable_crewai_governance(make_client())

    await _crew(("echo", {"text": BLOCKED_TEXT}), native=native)[0].akickoff()
    echoed = body_of(result.calls.last)["tool_response"]
    await _crew(("explode", {"reason": "kaboom"}), native=native)[0].akickoff()
    exploded = body_of(result.calls.last)["tool_response"]

    assert echoed == {"output": BLOCKED_TEXT}
    assert exploded == {"error": "RuntimeError: kaboom"}


def test_the_tool_is_restored_after_each_call(gateway, make_client):
    _allow_all(gateway)
    before = (echo.func, vars(shout).get("_run"))
    enable_crewai_governance(make_client())

    _crew(("echo", {"text": "a"}), ("shout", {"text": "b"}))[0].kickoff()

    assert (echo.func, vars(shout).get("_run")) == before
    assert before[1] is None  # no instance attribute left behind


def test_disable_restores_tools_armed_by_an_unfinished_call(gateway, make_client):
    from types import SimpleNamespace

    from crewai.tools.structured_tool import CrewStructuredTool

    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    governance = enable_crewai_governance(make_client())
    structured = echo.to_structured_tool()
    original_func = structured.func
    ctx = SimpleNamespace(tool_name="echo", tool_input={"text": "x"}, tool=structured)

    governance._before_tool_call(ctx)  # no post hook follows
    assert isinstance(structured, CrewStructuredTool)
    assert structured.func is not original_func
    governance.disable()

    assert structured.func is original_func


def test_without_a_reliable_signal_the_result_is_reported_as_is(gateway, make_client):
    import threading
    from types import SimpleNamespace

    result = _allow_all(gateway)
    governance = enable_crewai_governance(make_client())
    structured = echo.to_structured_tool()
    first = SimpleNamespace(tool_name="echo", tool_input={"text": "1"}, tool=structured)
    second = SimpleNamespace(tool_name="echo", tool_input={"text": "2"}, tool=structured)
    governance._before_tool_call(first)
    governance._before_tool_call(second)

    # Two armed calls of one tool, and the body runs in a thread that carries
    # neither call's context: there is no way to tell which call it belongs to.
    worker = threading.Thread(target=lambda: structured.func(text="echoed"))
    worker.start()
    worker.join()

    for ctx in (second, first):
        ctx.raw_tool_result = ctx.tool_result = BLOCKED_TEXT
        governance._after_tool_call(ctx)
    reported = [body_of(c)["tool_response"] for c in result.calls]
    assert reported == [{"output": BLOCKED_TEXT}, {"output": BLOCKED_TEXT}]


def test_a_tool_failure_the_tool_returned_is_recorded_as_an_error(gateway, make_client):
    from crewai.tools.tool_failure import ToolFailure

    result = _allow_all(gateway)
    enable_crewai_governance(make_client())

    @tool("lookup")
    def lookup(key: str) -> str:
        """Look a key up."""
        return ToolFailure(message="no such key", code="not_found")

    llm = ScriptedLLM([[_native_call("lookup", {"key": "k"}, "call-1")], "final"])
    agent = Agent(role="clerk", goal="g", backstory="b", llm=llm, tools=[lookup], max_iter=3)
    Crew(agents=[agent], tasks=[Task(description="d", expected_output="e", agent=agent)]).kickoff()

    assert body_of(result.calls.last)["tool_response"] == {
        "error": "ToolFailure: no such key (code: not_found)"
    }


def test_a_call_over_the_usage_limit_is_not_executed(gateway, make_client):
    result = _allow_all(gateway)
    enable_crewai_governance(make_client())

    @tool("once", max_usage_count=1)
    def once(text: str) -> str:
        """Usable once."""
        RAN.append(("once", text))
        return text

    llm = ScriptedLLM(
        [
            [_native_call("once", {"text": "a"}, "call-1")],
            [_native_call("once", {"text": "b"}, "call-2")],
            "final",
        ]
    )
    agent = Agent(role="clerk", goal="g", backstory="b", llm=llm, tools=[once], max_iter=4)
    Crew(agents=[agent], tasks=[Task(description="d", expected_output="e", agent=agent)]).kickoff()

    assert RAN == [("once", "a")]
    assert [body_of(c)["tool_response"] for c in result.calls] == [{"output": "a"}, {"error": NOT_EXECUTED}]
