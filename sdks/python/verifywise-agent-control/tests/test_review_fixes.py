"""Behaviour fixed after code review: result size, key rejection, argument
serialisation, internal errors, async callables and shared default clients."""

import gc
import json
import logging
import math
import warnings

import httpx
import pytest
from conftest import GATEWAY, HOOK, KEY, RESULT, body_of

from verifywise_agent_control import (
    AgentControlClient,
    AsyncAgentControlClient,
    Settings,
    _core,
    govern_tool,
    governed,
)
from verifywise_agent_control.client import GATEWAY_RESULT_CAP_BYTES, MAX_RESULT_BYTES

POLL = f"{GATEWAY}/v1/mcp/approvals/42/status"
APPROVAL = {
    "decision": "approval_required",
    "approval_id": 42,
    "poll_endpoint": "/v1/mcp/approvals/42/status",
}
KEY_REJECTED = "VerifyWise rejected the agent key (revoked, expired or invalid)"


def _gateway_measure(tool_response) -> int:
    """How the gateway sizes a result: len(json.dumps(tool_response)) in UTF-8."""
    return len(json.dumps(tool_response).encode("utf-8"))


# ── Result size: the gateway never has to cut it again ──────────────────────


def test_the_sdk_cap_leaves_a_margin_under_the_gateway_cap():
    assert GATEWAY_RESULT_CAP_BYTES == 10240
    assert MAX_RESULT_BYTES <= GATEWAY_RESULT_CAP_BYTES - 512


@pytest.mark.parametrize(
    "text",
    [
        "é" * 20000,  # 2 UTF-8 bytes, 6 escaped bytes each
        "\n" * 30000,  # 1 byte, 2 escaped bytes each
        "😀" * 6000,  # astral: 4 UTF-8 bytes, 12 escaped bytes each
        'a"b\\c\t' * 5000,
        "x" * 50000,
    ],
)
@pytest.mark.parametrize("kind", ["output", "error"])
def test_report_caps_the_serialized_envelope(gateway, make_client, text, kind):
    route = gateway.post(RESULT).respond(200, json={})

    make_client().report(session_id="s", call_id="c", tool_name="t", **{kind: text})

    sent = body_of(route.calls.last)["tool_response"]
    assert sent["truncated"] is True
    size = _gateway_measure(sent)
    assert size <= MAX_RESULT_BYTES < GATEWAY_RESULT_CAP_BYTES
    # Not cut more than needed: one more character would not fit.
    assert size > MAX_RESULT_BYTES - 16
    assert text.startswith(sent[kind])


def test_small_output_is_sent_whole(gateway, make_client):
    route = gateway.post(RESULT).respond(200, json={})

    make_client().report(session_id="s", call_id="c", tool_name="t", output="é\n" * 10)

    assert body_of(route.calls.last)["tool_response"] == {"output": "é\n" * 10}


def test_a_smaller_configured_cap_is_respected(gateway):
    route = gateway.post(RESULT).respond(200, json={})
    settings = Settings.from_env(gateway_url=GATEWAY, agent_key=KEY, max_result_bytes=1000)

    client = AgentControlClient(settings=settings)
    client.report(session_id="s", call_id="c", tool_name="t", output="é" * 5000)

    assert _gateway_measure(body_of(route.calls.last)["tool_response"]) <= 1000


def test_a_cap_above_the_gateway_limit_is_lowered(caplog):
    caplog.set_level(logging.WARNING, logger="verifywise_agent_control")

    assert Settings.from_env(max_result_bytes=50000).max_result_bytes == MAX_RESULT_BYTES
    assert any("max_result_bytes" in r.getMessage() for r in caplog.records)


# ── A rejected agent key never fails open ───────────────────────────────────


@pytest.mark.parametrize("status_code", [401, 403])
@pytest.mark.parametrize("mode", ["open", "closed"])
def test_a_rejected_key_refuses_whatever_the_fail_mode(gateway, make_client, caplog, status_code, mode):
    caplog.set_level(logging.ERROR, logger="verifywise_agent_control")
    gateway.post(HOOK).respond(status_code, json={"detail": "Agent key has been revoked"})

    decision = make_client(fail_mode=mode).check("x", {})

    assert not decision.allowed
    assert decision.status == "auth_rejected"
    assert decision.reason == KEY_REJECTED
    assert not decision.fail_mode_applied
    assert any(r.levelno == logging.ERROR and "agent key" in r.getMessage() for r in caplog.records)


@pytest.mark.parametrize("status_code", [401, 403])
async def test_a_rejected_key_refuses_on_the_async_client(gateway, make_async_client, status_code):
    gateway.post(HOOK).respond(status_code)

    decision = await make_async_client(fail_mode="open").check("x", {})

    assert not decision.allowed and decision.status == "auth_rejected"


@pytest.mark.parametrize("status_code", [401, 403])
def test_a_key_rejected_while_waiting_for_approval_refuses(gateway, make_client, status_code):
    gateway.post(HOOK).respond(200, json=APPROVAL)
    gateway.get(POLL).respond(status_code)

    decision = make_client(approval_fail_mode="open").check("deploy", {})

    assert not decision.allowed
    assert decision.status == "auth_rejected"
    assert decision.approval_id == "42"


@pytest.mark.parametrize("failure", ["500", "502", "timeout", "unreachable"])
def test_other_failures_still_follow_the_fail_mode(gateway, make_client, failure):
    route = gateway.post(HOOK)
    if failure == "timeout":
        route.mock(side_effect=httpx.ReadTimeout("slow"))
    elif failure == "unreachable":
        route.mock(side_effect=httpx.ConnectError("down"))
    else:
        route.respond(int(failure))

    assert make_client(fail_mode="open").check("x", {}).allowed
    assert not make_client(fail_mode="closed").check("x", {}).allowed


def test_report_logs_a_rejected_key_as_an_error(gateway, make_client, caplog):
    caplog.set_level(logging.WARNING, logger="verifywise_agent_control")
    gateway.post(RESULT).respond(401)

    make_client().report(session_id="s", call_id="c", tool_name="t", output="x")

    assert any(r.levelno == logging.ERROR for r in caplog.records)


# ── An SDK bug is not a gateway outage ──────────────────────────────────────


@pytest.mark.parametrize("mode", ["open", "closed"])
def test_an_internal_error_refuses_even_when_failing_open(gateway, make_client, monkeypatch, caplog, mode):
    caplog.set_level(logging.ERROR, logger="verifywise_agent_control")
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    client = make_client(fail_mode=mode)
    monkeypatch.setattr(client, "_hook_body", lambda *a, **k: 1 / 0)

    decision = client.check("x", {})

    assert not decision.allowed
    assert decision.status == "sdk_error"
    assert decision.reason.startswith("VerifyWise SDK internal error")
    assert "ZeroDivisionError" in decision.reason
    assert any(r.levelno == logging.ERROR for r in caplog.records)


async def test_an_internal_error_refuses_on_the_async_client(gateway, make_async_client, monkeypatch):
    client = make_async_client(fail_mode="open")
    monkeypatch.setattr(client, "_hook_body", lambda *a, **k: 1 / 0)

    decision = await client.check("x", {})

    assert not decision.allowed and decision.status == "sdk_error"


def test_a_missing_configuration_still_follows_the_fail_mode(gateway):
    assert AgentControlClient(fail_mode="open").check("x", {}).allowed


def test_an_invalid_gateway_url_follows_the_fail_mode(gateway):
    client = AgentControlClient(gateway_url="http://gw\x00.test", agent_key="sk-mcp-x", fail_mode="open")

    decision = client.check("x", {})

    assert decision.allowed and decision.status == "gateway_error"


# ── Approval poll interval ──────────────────────────────────────────────────


@pytest.mark.parametrize("value", [0, 0.1, -1, math.nan, math.inf])
def test_poll_interval_must_be_at_least_half_a_second(value):
    with pytest.raises(ValueError, match="approval_poll_interval"):
        Settings.from_env(approval_poll_interval=value)


def test_poll_interval_of_half_a_second_is_accepted():
    assert Settings.from_env(approval_poll_interval=0.5).approval_poll_interval == 0.5


def test_client_rejects_a_zero_poll_interval():
    with pytest.raises(ValueError, match="approval_poll_interval"):
        AgentControlClient(approval_poll_interval=0)


# ── Async callables ─────────────────────────────────────────────────────────


class AsyncCallable:
    async def __call__(self, city):
        return f"sunny in {city}"


async def test_an_object_with_an_async_call_is_governed_as_async(gateway, make_async_client):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})

    lookup = govern_tool(AsyncCallable(), client=make_async_client(), name="lookup")

    assert await lookup("Oslo") == "sunny in Oslo"
    assert body_of(result.calls.last)["tool_response"] == {"output": "sunny in Oslo"}


def test_an_async_callable_object_needs_an_async_client(make_client):
    with pytest.raises(TypeError, match="AsyncAgentControlClient"):
        govern_tool(AsyncCallable(), client=make_client(), name="lookup")


def test_a_sync_function_returning_a_coroutine_raises_a_clear_error(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})

    async def later():
        return "never"

    @governed(client=make_client())
    def sneaky():
        return later()

    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        with pytest.raises(TypeError, match="awaitable"):
            sneaky()
        gc.collect()

    reported = body_of(result.calls.last)["tool_response"]
    assert "error" in reported and "TypeError" in reported["error"]


# ── Shared default clients ──────────────────────────────────────────────────


def test_langchain_middlewares_share_the_default_clients():
    pytest.importorskip("langchain.agents")
    from verifywise_agent_control.langchain import VerifyWiseMiddleware

    first, second = VerifyWiseMiddleware(), VerifyWiseMiddleware()

    assert first.client is second.client is _core.default_client()
    assert first.async_client is second.async_client is _core.default_async_client()


def test_langchain_middlewares_given_one_client_share_its_async_twin(make_client):
    pytest.importorskip("langchain.agents")
    from verifywise_agent_control.langchain import VerifyWiseMiddleware

    client = make_client()
    first, second = VerifyWiseMiddleware(client=client), VerifyWiseMiddleware(client=client)

    assert first.client is second.client is client
    assert first.async_client is second.async_client
    assert first.async_client.settings == client.settings


def test_langchain_middleware_given_an_async_client_shares_its_sync_twin(make_async_client):
    pytest.importorskip("langchain.agents")
    from verifywise_agent_control.langchain import VerifyWiseMiddleware

    async_client = make_async_client()
    first = VerifyWiseMiddleware(async_client=async_client)
    second = VerifyWiseMiddleware(async_client=async_client)

    assert first.async_client is async_client
    assert first.client is second.client
    assert first.client.settings == async_client.settings


def test_agent_framework_middlewares_share_the_default_client():
    pytest.importorskip("agent_framework")
    from verifywise_agent_control.agent_framework import VerifyWiseFunctionMiddleware

    first, second = VerifyWiseFunctionMiddleware(), VerifyWiseFunctionMiddleware()

    assert first.client is second.client is _core.default_async_client()


def test_agent_framework_middlewares_given_one_sync_client_share_its_async_twin(make_client):
    pytest.importorskip("agent_framework")
    from verifywise_agent_control.agent_framework import VerifyWiseFunctionMiddleware

    client = make_client()
    first, second = VerifyWiseFunctionMiddleware(client), VerifyWiseFunctionMiddleware(client)

    assert isinstance(first.client, AsyncAgentControlClient)
    assert first.client is second.client
