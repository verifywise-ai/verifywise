"""The gateway checks exactly what the tool runs with.

(a) JSON-native arguments are sent unchanged, byte for byte.
(b) Arguments JSON can't represent exactly are refused, never sent in a
    converted form, whatever the fail mode.
(c) Adapters run the tool with the arguments object they checked, and a change
    between the check and the run refuses the call (or, in CrewAI where the
    tool has already run, is recorded as an error).
(d) Gateway-supplied data can't steer requests elsewhere: only the exact
    approval status path for the approval is polled, redirects are not
    followed, and gateway text is logged on one line.
"""

import datetime as dt
import json
import logging
import math
from decimal import Decimal
from types import SimpleNamespace

import httpx
import pytest
from conftest import GATEWAY, HOOK, RESULT, body_of

from verifywise_agent_control import AgentControlClient, governed
from verifywise_agent_control._core import arun_governed, run_governed
from verifywise_agent_control.client import arguments_changed, arguments_json

UNSENDABLE = "arguments could not be sent to VerifyWise for checking"
POLL = f"{GATEWAY}/v1/mcp/approvals/42/status"


def _raw_arguments(call) -> str:
    """The arguments exactly as they appear in the request body."""
    raw = call.request.content.decode()
    start = raw.index('"arguments": ') + len('"arguments": ')
    end = raw.index(', "session_id": ')
    return raw[start:end]


# ── (a) Lossless ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "arguments",
    [
        {"command": "rm -rf /tmp/x", "flags": ["-v"], "n": 3, "ratio": 0.5, "ok": True, "none": None},
        {"zeta": 1, "alpha": {"nested": [1, {"deep": "ünïcødé 😀"}]}, "big": 2**80},
        {"text": 'line1\nline2\t"quoted"\\'},
        {},
    ],
)
def test_json_native_arguments_are_sent_unchanged(gateway, make_client, arguments):
    route = gateway.post(HOOK).respond(200, json={"decision": "allow"})

    make_client().check("t", arguments)

    assert _raw_arguments(route.calls.last) == json.dumps(arguments)
    assert body_of(route.calls.last)["arguments"] == arguments


def test_key_order_is_kept():
    assert list(json.loads(arguments_json({"b": 1, "a": 2}))) == ["b", "a"]


def test_a_tuple_is_sent_as_the_same_items():
    assert arguments_json({"pair": (1, "x")}) == '{"pair": [1, "x"]}'


# ── (b) Refused, never converted ────────────────────────────────────────────


def _circular_dict():
    value = {"a": 1}
    value["self"] = value
    return value


def _circular_list():
    value = [1]
    value.append(value)
    return value


def _deep():
    value: list = []
    node = value
    for _ in range(100):
        child: list = []
        node.append(child)
        node = child
    return value


UNSENDABLE_ARGUMENTS = {
    "tuple_key": {(1, 2): "a"},
    "int_key": {1: "a"},
    "none_key": {None: "a"},
    "circular_dict": _circular_dict(),
    "circular_list": {"items": _circular_list()},
    "datetime": {"when": dt.datetime(2026, 1, 2)},
    "decimal": {"amount": Decimal("1.10")},
    "set": {"tags": {"a", "b"}},
    "bytes": {"blob": b"\x00\x01"},
    "nan": {"x": math.nan},
    "inf": {"x": math.inf},
    "object": {"o": object()},
    "nested_object": {"a": [{"b": object()}]},
    "too_deep": {"d": _deep()},
}


@pytest.mark.parametrize("name", UNSENDABLE_ARGUMENTS)
@pytest.mark.parametrize("mode", ["open", "closed"])
def test_unsendable_arguments_are_refused_whatever_the_fail_mode(gateway, make_client, caplog, name, mode):
    caplog.set_level(logging.ERROR, logger="verifywise_agent_control")
    route = gateway.post(HOOK).respond(200, json={"decision": "allow"})

    decision = make_client(fail_mode=mode).check("t", UNSENDABLE_ARGUMENTS[name])

    assert not decision.allowed
    assert decision.status == "arguments_unsendable"
    assert decision.reason == UNSENDABLE
    assert not decision.fail_mode_applied
    assert not route.called
    assert any(r.levelno == logging.ERROR for r in caplog.records)


async def test_unsendable_arguments_are_refused_on_the_async_client(gateway, make_async_client):
    route = gateway.post(HOOK).respond(200, json={"decision": "allow"})

    decision = await make_async_client(fail_mode="open").check("t", {(1, 2): "x"})

    assert decision.status == "arguments_unsendable" and not decision.allowed
    assert not route.called


def test_a_governed_function_with_unsendable_arguments_does_not_run(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    ran = []

    @governed(client=make_client(fail_mode="open"))
    def schedule(when):
        ran.append(when)

    assert schedule(dt.datetime(2026, 1, 2)) == f"Blocked by VerifyWise policy: {UNSENDABLE}"
    assert ran == []


# ── (c) Same object, unchanged between check and run ────────────────────────


def _mutating_gateway(gateway, mutate):
    """A gateway that allows the call but, while answering, changes the arguments."""

    def answer(request):
        mutate()
        return httpx.Response(200, json={"decision": "allow"})

    gateway.post(HOOK).mock(side_effect=answer)
    return gateway.post(RESULT).respond(200, json={})


def test_arguments_changed_during_the_check_refuse_the_call(gateway, make_client):
    arguments = {"command": "ls"}
    result = _mutating_gateway(gateway, lambda: arguments.update(command="rm -rf /"))
    ran = []

    outcome = run_governed(
        make_client(), tool_name="Bash", arguments=arguments, execute=lambda: ran.append(arguments)
    )

    assert ran == []
    assert outcome.startswith("Blocked by VerifyWise policy: arguments changed after VerifyWise checked them")
    assert "arguments changed" in body_of(result.calls.last)["tool_response"]["error"]


async def test_async_arguments_changed_during_the_check_refuse_the_call(gateway, make_async_client):
    arguments = {"command": "ls"}
    _mutating_gateway(gateway, lambda: arguments.update(command="rm -rf /"))
    ran = []

    async def execute():
        ran.append(arguments)

    outcome = await arun_governed(make_async_client(), tool_name="Bash", arguments=arguments, execute=execute)

    assert ran == [] and outcome.startswith("Blocked by VerifyWise policy: arguments changed")


def test_unchanged_arguments_run(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    gateway.post(RESULT).respond(200, json={})
    arguments = {"command": "ls"}

    assert run_governed(make_client(), tool_name="Bash", arguments=arguments, execute=lambda: "ok") == "ok"


def test_a_fail_open_decision_has_nothing_to_compare(gateway):
    decision = AgentControlClient(fail_mode="open").check("t", {"a": 1})  # not configured

    assert decision.allowed and decision.checked_arguments is None
    assert not arguments_changed(decision, {"a": 2})


def test_langchain_runs_the_request_it_checked(gateway, make_client):
    pytest.importorskip("langchain.agents")
    from verifywise_agent_control.langchain import VerifyWiseMiddleware

    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    gateway.post(RESULT).respond(200, json={})
    arguments = {"q": "weather"}
    request = SimpleNamespace(
        tool_call={"name": "search", "args": arguments, "id": "c1"}, runtime=None, state={}
    )
    seen = []

    def handler(req):
        seen.append(req)
        return "done"

    VerifyWiseMiddleware(client=make_client()).wrap_tool_call(request, handler)

    assert seen[0] is request and seen[0].tool_call["args"] is arguments
    assert body_of(hook.calls.last)["arguments"] == arguments


def test_langchain_refuses_args_replaced_during_the_check(gateway, make_client):
    pytest.importorskip("langchain.agents")
    from verifywise_agent_control.langchain import VerifyWiseMiddleware

    request = SimpleNamespace(
        tool_call={"name": "Bash", "args": {"c": "ls"}, "id": "c1"}, runtime=None, state={}
    )
    _mutating_gateway(gateway, lambda: request.tool_call.update(args={"c": "rm -rf /"}))
    ran = []

    message = VerifyWiseMiddleware(client=make_client()).wrap_tool_call(request, lambda req: ran.append(req))

    assert ran == []
    assert message.status == "error" and "arguments changed" in message.content


def _af_context(arguments):
    return SimpleNamespace(
        function=SimpleNamespace(name="transfer"),
        arguments=arguments,
        metadata={"call_id": "c1"},
        result=None,
        session=None,
    )


async def test_agent_framework_refuses_arguments_changed_during_the_check(gateway, make_async_client):
    pytest.importorskip("agent_framework")
    from verifywise_agent_control.agent_framework import VerifyWiseFunctionMiddleware

    context = _af_context({"amount": 10})
    _mutating_gateway(gateway, lambda: context.arguments.update(amount=10_000))
    ran = []

    async def call_next():
        ran.append(True)

    await VerifyWiseFunctionMiddleware(make_async_client()).process(context, call_next)

    assert ran == []
    assert "arguments changed" in context.result


async def test_agent_framework_refuses_a_model_field_json_cannot_represent(gateway, make_async_client):
    pytest.importorskip("agent_framework")
    from pydantic import BaseModel

    from verifywise_agent_control.agent_framework import VerifyWiseFunctionMiddleware

    class Args(BaseModel):
        when: dt.datetime

    route = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    context = _af_context(Args(when=dt.datetime(2026, 1, 2)))
    ran = []

    async def call_next():
        ran.append(True)

    await VerifyWiseFunctionMiddleware(make_async_client(fail_mode="open")).process(context, call_next)

    assert ran == [] and not route.called
    assert UNSENDABLE in context.result


def test_crewai_records_arguments_changed_after_the_check(gateway, make_client, caplog):
    pytest.importorskip("crewai")
    from verifywise_agent_control.crewai import ARGUMENTS_CHANGED_AFTER_RUN, CrewAIGovernance

    caplog.set_level(logging.ERROR, logger="verifywise_agent_control")
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    governance = CrewAIGovernance(make_client())
    ctx = SimpleNamespace(tool_name="Bash", tool_input={"c": "ls"}, raw_tool_result="ok", tool_result="ok")

    assert governance._before_tool_call(ctx) is None
    ctx.tool_input["c"] = "rm -rf /"  # a later pre-tool hook rewrote the input
    governance._after_tool_call(ctx)

    assert body_of(result.calls.last)["tool_response"] == {"error": ARGUMENTS_CHANGED_AFTER_RUN}
    assert any(r.levelno == logging.ERROR for r in caplog.records)


def test_crewai_unchanged_arguments_record_the_output(gateway, make_client):
    pytest.importorskip("crewai")
    from verifywise_agent_control.crewai import CrewAIGovernance

    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    governance = CrewAIGovernance(make_client())
    ctx = SimpleNamespace(tool_name="Read", tool_input={"p": "a"}, raw_tool_result="text", tool_result="text")

    governance._before_tool_call(ctx)
    ctx.tool_input = dict(ctx.tool_input)  # CrewAI copied the dict: same content is fine
    governance._after_tool_call(ctx)

    assert body_of(result.calls.last)["tool_response"] == {"output": "text"}


# ── (d) Gateway data can't steer requests ───────────────────────────────────

BAD_ENDPOINTS = [
    "/v1/mcp/approvals/43/status",  # another approval
    "//evil.example/v1/mcp/approvals/42/status",
    "/v1/mcp/approvals/42/status?redirect=https://evil.example",
    "/v1/mcp/approvals/42/status#x",
    "/v1/mcp/approvals/../../admin/42/status",
    "/v1/mcp/approvals/42/status/../../../steal",
    "/v1/other/42/status",
    "https://evil.example/v1/mcp/approvals/42/status",
    "/v1/mcp/approvals/42/status\n",
    None,
    42,
]


@pytest.mark.parametrize("endpoint", BAD_ENDPOINTS)
def test_only_the_approval_status_path_for_that_approval_is_polled(gateway, make_client, endpoint):
    gateway.post(HOOK).respond(
        200, json={"decision": "approval_required", "approval_id": 42, "poll_endpoint": endpoint}
    )

    decision = make_client(fail_mode="closed").check("deploy", {})

    assert not decision.allowed and decision.fail_mode_applied
    assert len(gateway.calls) == 1


def test_the_expected_poll_path_is_followed(gateway, make_client):
    gateway.post(HOOK).respond(
        200,
        json={
            "decision": "approval_required",
            "approval_id": 42,
            "poll_endpoint": "/v1/mcp/approvals/42/status",
        },
    )
    poll = gateway.get(POLL).respond(200, json={"status": "approved"})

    assert make_client().check("deploy", {}).allowed
    assert poll.called


def test_a_redirect_from_the_hook_is_not_followed(gateway, make_client):
    gateway.post(HOOK).respond(307, headers={"Location": "https://evil.example/collect"})
    elsewhere = gateway.post("https://evil.example/collect").respond(200, json={"decision": "allow"})

    decision = make_client(fail_mode="closed").check("t", {})

    assert not decision.allowed and decision.fail_mode_applied
    assert not elsewhere.called


def test_a_redirect_from_the_poll_is_not_followed(gateway, make_client):
    gateway.post(HOOK).respond(
        200,
        json={
            "decision": "approval_required",
            "approval_id": 42,
            "poll_endpoint": "/v1/mcp/approvals/42/status",
        },
    )
    gateway.get(POLL).respond(302, headers={"Location": "https://evil.example/collect"})
    elsewhere = gateway.get("https://evil.example/collect").respond(200, json={"status": "approved"})

    decision = make_client(approval_wait=4).check("deploy", {})

    assert not decision.allowed and decision.status == "approval_timeout"
    assert not elsewhere.called


def test_a_supplied_http_client_that_follows_redirects_does_not_here(gateway):
    gateway.post(HOOK).respond(307, headers={"Location": "https://evil.example/collect"})
    elsewhere = gateway.post("https://evil.example/collect").respond(200, json={"decision": "allow"})
    client = AgentControlClient(
        gateway_url=GATEWAY,
        agent_key="sk-mcp-x",
        fail_mode="closed",
        http_client=httpx.Client(follow_redirects=True),
    )

    assert not client.check("t", {}).allowed
    assert not elsewhere.called


def test_gateway_text_is_logged_on_one_line(gateway, make_client, caplog):
    caplog.set_level(logging.INFO, logger="verifywise_agent_control")
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "bad\nFAKE LOG LINE\r"})

    make_client().check("t", {})

    messages = [r.getMessage() for r in caplog.records]
    assert any("FAKE LOG LINE" in m for m in messages)
    assert all("\n" not in m and "\r" not in m for m in messages)
