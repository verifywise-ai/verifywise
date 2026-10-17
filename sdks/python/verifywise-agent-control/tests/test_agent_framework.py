"""Microsoft Agent Framework adapter tests: real agent-framework, a scripted chat client, no network."""

import json

import httpx
import pytest
from conftest import GATEWAY, HOOK, RESULT, body_of

pytest.importorskip("agent_framework")

from agent_framework import (  # noqa: E402
    Agent,
    BaseChatClient,
    ChatMiddlewareLayer,
    ChatResponse,
    Content,
    FunctionInvocationLayer,
    Message,
    MiddlewareFailure,
)

from verifywise_agent_control import VerifyWiseDenied, governed, vw_session  # noqa: E402
from verifywise_agent_control.agent_framework import VerifyWiseFunctionMiddleware  # noqa: E402

RAN = []
APPROVAL_REQUIRED = {
    "decision": "approval_required",
    "approval_id": 5,
    "poll_endpoint": "/v1/mcp/approvals/5/status",
}


def add(a: int, b: int) -> int:
    """Add two numbers."""
    RAN.append(("add", a, b))
    return a + b


def explode(reason: str) -> str:
    """Always fails."""
    raise RuntimeError(reason)


class ScriptedClient(FunctionInvocationLayer, ChatMiddlewareLayer, BaseChatClient):
    """Replays scripted responses (with the framework's function-calling loop) and records inputs."""

    def __init__(self, replies, **kwargs):
        super().__init__(**kwargs)
        self.replies = list(replies)
        self.seen = []

    def _inner_get_response(self, *, messages, stream, options, **kwargs):
        self.seen.append(list(messages))

        async def respond():
            return self.replies.pop(0)

        return respond()


def _agent(middleware, *calls):
    calls = calls or (("add", {"a": 1, "b": 2}),)
    first = Message(
        role="assistant",
        contents=[
            Content.from_function_call(f"call-{i}", name, arguments=args)
            for i, (name, args) in enumerate(calls, 1)
        ],
    )
    final = Message(role="assistant", contents=["final"])
    client = ScriptedClient([ChatResponse(messages=[first]), ChatResponse(messages=[final])])
    return Agent(client=client, tools=[add, explode], middleware=[middleware]), client


def _tool_results(client):
    """The function results the model saw on its last turn."""
    return [c for m in client.seen[-1] if m.role == "tool" for c in m.contents if c.type == "function_result"]


@pytest.fixture(autouse=True)
def reset_ran():
    RAN.clear()


async def test_allow_runs_the_tool_and_reports_the_result(gateway, make_async_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    agent, client = _agent(VerifyWiseFunctionMiddleware(make_async_client()))
    session = agent.create_session()

    out = await agent.run("go", session=session)

    assert RAN == [("add", 1, 2)]
    assert out.text == "final"
    assert _tool_results(client)[0].result == "3"
    assert body_of(hook.calls.last) == {
        "tool_name": "add",
        "arguments": {"a": 1, "b": 2},
        "session_id": session.session_id,
        "tool_use_id": "call-1",
    }
    reported = body_of(result.calls.last)
    assert reported["tool_use_id"] == "call-1"
    assert reported["session_id"] == session.session_id
    assert reported["tool_response"] == {"output": "3"}


async def test_deny_returns_the_refusal_and_the_agent_continues(gateway, make_async_client):
    gateway.post(HOOK).respond(
        200, json={"decision": "deny", "reason": "Tool 'add' is not allowed for this agent key"}
    )
    result = gateway.post(RESULT).respond(200, json={})
    agent, client = _agent(VerifyWiseFunctionMiddleware(make_async_client()))

    out = await agent.run("go")

    assert RAN == []
    assert out.text == "final"
    refusal = _tool_results(client)[0]
    assert refusal.result == "Blocked by VerifyWise policy: Tool 'add' is not allowed for this agent key"
    assert refusal.call_id == "call-1"
    assert result.call_count == 0


async def test_on_deny_raise_stops_the_run(gateway, make_async_client):
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "no"})
    agent, _ = _agent(VerifyWiseFunctionMiddleware(make_async_client(on_deny="raise")))

    with pytest.raises(VerifyWiseDenied) as raised:
        await agent.run("go")
    assert isinstance(raised.value, MiddlewareFailure)
    assert raised.value.tool_name == "add"
    assert RAN == []


async def test_approval_approved_runs_the_tool(gateway, make_async_client):
    gateway.post(HOOK).respond(
        200,
        json=APPROVAL_REQUIRED,
    )
    gateway.get(f"{GATEWAY}/v1/mcp/approvals/5/status").side_effect = [
        httpx.Response(200, json={"status": "pending"}),
        httpx.Response(200, json={"status": "approved"}),
    ]
    gateway.post(RESULT).respond(200, json={})
    agent, client = _agent(VerifyWiseFunctionMiddleware(make_async_client()))

    out = await agent.run("go")

    assert RAN == [("add", 1, 2)]
    assert out.text == "final"
    assert _tool_results(client)[0].result == "3"


async def test_approval_denied_refuses(gateway, make_async_client):
    gateway.post(HOOK).respond(
        200,
        json=APPROVAL_REQUIRED,
    )
    gateway.get(f"{GATEWAY}/v1/mcp/approvals/5/status").respond(
        200, json={"status": "denied", "decision_reason": "too risky"}
    )
    agent, client = _agent(VerifyWiseFunctionMiddleware(make_async_client()))

    out = await agent.run("go")

    assert RAN == []
    assert out.text == "final"
    assert _tool_results(client)[0].result == "Blocked by VerifyWise policy: too risky"


async def test_tool_error_is_reported_and_reraised_to_the_framework(gateway, make_async_client):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    middleware = VerifyWiseFunctionMiddleware(make_async_client())
    agent, client = _agent(middleware, ("explode", {"reason": "kaboom"}))

    # The middleware re-raises the tool's exception unchanged; the framework
    # then turns it into an error result for the model and keeps going.
    out = await agent.run("go")

    assert out.text == "final"
    assert _tool_results(client)[0].exception == "kaboom"
    assert body_of(result.calls.last)["tool_response"] == {"error": "RuntimeError: kaboom"}


async def test_explicit_session_wins(gateway, make_async_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    gateway.post(RESULT).respond(200, json={})
    agent, _ = _agent(VerifyWiseFunctionMiddleware(make_async_client()))

    with vw_session("my-run"):
        await agent.run("go", session=agent.create_session())

    assert body_of(hook.calls.last)["session_id"] == "my-run"


async def test_without_a_session_the_client_run_id_is_used(gateway, make_async_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    gateway.post(RESULT).respond(200, json={})
    vw_client = make_async_client()
    agent, _ = _agent(VerifyWiseFunctionMiddleware(vw_client))

    await agent.run("go")

    assert body_of(hook.calls.last)["session_id"] == vw_client.session_id


async def test_parallel_calls_are_each_checked_and_reported(gateway, make_async_client):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    agent, _ = _agent(
        VerifyWiseFunctionMiddleware(make_async_client()),
        ("add", {"a": 1, "b": 1}),
        ("add", {"a": 2, "b": 2}),
    )

    await agent.run("go")

    assert sorted(body_of(c)["tool_use_id"] for c in hook.calls) == ["call-1", "call-2"]
    reported = {body_of(c)["tool_use_id"]: body_of(c)["tool_response"] for c in result.calls}
    assert reported == {"call-1": {"output": "2"}, "call-2": {"output": "4"}}


def test_a_sync_client_is_turned_into_an_async_one(make_client):
    sync_client = make_client(fail_mode="closed")
    middleware = VerifyWiseFunctionMiddleware(sync_client)
    assert middleware.client.settings == sync_client.settings


async def test_a_denial_raised_inside_a_tool_is_a_normal_tool_error(gateway, make_client, make_async_client):
    """A tool that itself calls a governed function (on_deny="raise") which is
    denied raises VerifyWiseDenied from its body. That is the tool failing, not
    our pre-check refusing it, so the framework turns it into a tool error and
    the run goes on."""

    def decide(request):
        name = json.loads(request.content)["tool_name"]
        if name == "drop_table":
            return httpx.Response(200, json={"decision": "deny", "reason": "destructive"})
        return httpx.Response(200, json={"decision": "allow"})

    gateway.post(HOOK).mock(side_effect=decide)
    result = gateway.post(RESULT).respond(200, json={})

    @governed(client=make_client(on_deny="raise"))
    def drop_table(name: str) -> str:
        raise AssertionError("must not run")

    def maintenance(table: str) -> str:
        """Run maintenance on a table."""
        return drop_table(table)

    first = Message(
        role="assistant",
        contents=[Content.from_function_call("call-1", "maintenance", arguments={"table": "users"})],
    )
    final = Message(role="assistant", contents=["final"])
    client = ScriptedClient([ChatResponse(messages=[first]), ChatResponse(messages=[final])])
    middleware = VerifyWiseFunctionMiddleware(make_async_client(on_deny="raise"))
    agent = Agent(client=client, tools=[maintenance], middleware=[middleware])

    out = await agent.run("go")

    assert out.text == "final"
    assert "destructive" in _tool_results(client)[0].exception
    reported = body_of(result.calls.last)
    assert reported["tool_name"] == "maintenance"
    assert reported["tool_response"]["error"].startswith("VerifyWiseDenied: ")
