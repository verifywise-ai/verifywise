"""LangChain v1 adapter tests: real langchain, a scripted fake chat model, no network."""

import httpx
import pytest
from conftest import GATEWAY, HOOK, RESULT, body_of

pytest.importorskip("langchain.agents")

from langchain.agents import create_agent  # noqa: E402
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel  # noqa: E402
from langchain_core.messages import AIMessage, ToolMessage  # noqa: E402
from langchain_core.tools import tool  # noqa: E402

from verifywise_agent_control import VerifyWiseDenied, vw_session  # noqa: E402
from verifywise_agent_control.langchain import VerifyWiseMiddleware  # noqa: E402

RAN = []


@tool
def add(a: int, b: int) -> int:
    """Add two numbers."""
    RAN.append(("add", a, b))
    return a + b


@tool
def explode(reason: str) -> str:
    """Always fails."""
    raise RuntimeError(reason)


class ScriptedModel(GenericFakeChatModel):
    """Replays scripted AI messages; tool binding is a no-op."""

    def bind_tools(self, tools, **kwargs):
        return self


def _agent(client=None, async_client=None, *tool_calls):
    calls = list(tool_calls) or [{"name": "add", "args": {"a": 1, "b": 2}, "id": "call-1"}]
    model = ScriptedModel(
        messages=iter([AIMessage(content="", tool_calls=calls), AIMessage(content="final")])
    )
    middleware = VerifyWiseMiddleware(client=client, async_client=async_client)
    return create_agent(model, tools=[add, explode], middleware=[middleware])


def _ask(agent, config=None):
    return agent.invoke({"messages": [{"role": "user", "content": "go"}]}, config)


async def _aask(agent, config=None):
    return await agent.ainvoke({"messages": [{"role": "user", "content": "go"}]}, config)


@pytest.fixture(autouse=True)
def reset_ran():
    RAN.clear()


def _tool_messages(out):
    return [m for m in out["messages"] if isinstance(m, ToolMessage)]


def test_allow_runs_the_tool_and_reports_the_result(gateway, make_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})

    out = _ask(_agent(make_client()), {"configurable": {"thread_id": "thread-7"}})

    assert RAN == [("add", 1, 2)]
    assert _tool_messages(out)[0].content == "3"
    assert out["messages"][-1].content == "final"
    sent = body_of(hook.calls.last)
    assert sent == {
        "tool_name": "add",
        "arguments": {"a": 1, "b": 2},
        "session_id": "thread-7",
        "tool_use_id": "call-1",
    }
    reported = body_of(result.calls.last)
    assert reported["tool_use_id"] == "call-1"
    assert reported["session_id"] == "thread-7"
    assert reported["tool_name"] == "add"
    assert reported["tool_response"] == {"output": "3"}


def test_deny_returns_a_refusal_and_the_agent_continues(gateway, make_client):
    gateway.post(HOOK).respond(
        200, json={"decision": "deny", "reason": "Tool 'add' is not allowed for this agent key"}
    )
    result = gateway.post(RESULT).respond(200, json={})

    out = _ask(_agent(make_client()))

    assert RAN == []
    refusal = _tool_messages(out)[0]
    assert refusal.status == "error"
    assert refusal.tool_call_id == "call-1"
    assert refusal.content == "Blocked by VerifyWise policy: Tool 'add' is not allowed for this agent key"
    assert out["messages"][-1].content == "final"
    assert result.call_count == 0


def test_on_deny_raise_stops_the_agent(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "no"})

    with pytest.raises(VerifyWiseDenied):
        _ask(_agent(make_client(on_deny="raise")))
    assert RAN == []


def test_approval_approved_runs_the_tool(gateway, make_client):
    gateway.post(HOOK).respond(
        200,
        json={
            "decision": "approval_required",
            "approval_id": 5,
            "poll_endpoint": "/v1/mcp/approvals/5/status",
        },
    )
    gateway.get(f"{GATEWAY}/v1/mcp/approvals/5/status").side_effect = [
        httpx.Response(200, json={"status": "pending"}),
        httpx.Response(200, json={"status": "approved"}),
    ]
    gateway.post(RESULT).respond(200, json={})

    out = _ask(_agent(make_client()))

    assert RAN == [("add", 1, 2)]
    assert _tool_messages(out)[0].content == "3"


def test_approval_denied_refuses(gateway, make_client):
    gateway.post(HOOK).respond(
        200,
        json={
            "decision": "approval_required",
            "approval_id": 5,
            "poll_endpoint": "/v1/mcp/approvals/5/status",
        },
    )
    gateway.get(f"{GATEWAY}/v1/mcp/approvals/5/status").respond(
        200, json={"status": "denied", "decision_reason": "too risky"}
    )

    out = _ask(_agent(make_client()))

    assert RAN == []
    assert _tool_messages(out)[0].content == "Blocked by VerifyWise policy: too risky"
    assert out["messages"][-1].content == "final"


def test_tool_error_is_reported_and_reraised(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})

    agent = _agent(make_client(), None, {"name": "explode", "args": {"reason": "kaboom"}, "id": "call-x"})
    with pytest.raises(RuntimeError, match="kaboom"):
        _ask(agent)
    assert body_of(result.calls.last)["tool_response"] == {"error": "RuntimeError: kaboom"}


def test_one_generated_session_per_invocation(gateway, make_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    gateway.post(RESULT).respond(200, json={})
    client = make_client()
    two_calls = (
        {"name": "add", "args": {"a": 1, "b": 1}, "id": "c1"},
        {"name": "add", "args": {"a": 2, "b": 2}, "id": "c2"},
    )

    _ask(_agent(client, None, *two_calls))
    first = {body_of(c)["session_id"] for c in hook.calls}
    _ask(_agent(client, None, *two_calls))
    second = {body_of(c)["session_id"] for c in list(hook.calls)[2:]}

    assert len(first) == 1 and len(second) == 1
    assert first != second
    assert client.session_id not in first | second


def test_explicit_session_wins(gateway, make_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    gateway.post(RESULT).respond(200, json={})

    with vw_session("my-run"):
        _ask(_agent(make_client()), {"configurable": {"thread_id": "thread-7"}})

    assert body_of(hook.calls.last)["session_id"] == "my-run"


def test_session_state_is_not_in_the_agent_output(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    gateway.post(RESULT).respond(200, json={})
    out = _ask(_agent(make_client()))
    assert not any(k.startswith("vw_") for k in out)


async def test_async_allow_and_report(gateway, make_async_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})

    out = await _aask(_agent(None, make_async_client()), {"configurable": {"thread_id": "t-async"}})

    assert RAN == [("add", 1, 2)]
    assert out["messages"][-1].content == "final"
    assert body_of(hook.calls.last)["session_id"] == "t-async"
    assert body_of(result.calls.last)["tool_response"] == {"output": "3"}


async def test_async_deny(gateway, make_async_client):
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "blocked"})

    out = await _aask(_agent(None, make_async_client()))

    assert RAN == []
    refusal = _tool_messages(out)[0]
    assert refusal.status == "error"
    assert refusal.content == "Blocked by VerifyWise policy: blocked"
    assert out["messages"][-1].content == "final"


async def test_async_approval_wait(gateway, make_async_client):
    gateway.post(HOOK).respond(
        200,
        json={
            "decision": "approval_required",
            "approval_id": 8,
            "poll_endpoint": "/v1/mcp/approvals/8/status",
        },
    )
    gateway.get(f"{GATEWAY}/v1/mcp/approvals/8/status").side_effect = [
        httpx.Response(200, json={"status": "pending"}),
        httpx.Response(200, json={"status": "approved"}),
    ]
    gateway.post(RESULT).respond(200, json={})

    out = await _aask(_agent(None, make_async_client()))

    assert RAN == [("add", 1, 2)]
    assert out["messages"][-1].content == "final"


def test_async_client_is_derived_from_the_sync_one(make_client):
    middleware = VerifyWiseMiddleware(client=make_client(fail_mode="closed"))
    assert middleware.async_client.settings == middleware.client.settings
