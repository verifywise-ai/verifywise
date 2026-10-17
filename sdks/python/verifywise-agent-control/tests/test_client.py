import logging
from datetime import datetime

import httpx
import pytest
from conftest import GATEWAY, HOOK, KEY, RESULT, body_of

from verifywise_agent_control import AgentControlClient, Decision, vw_session

POLL = f"{GATEWAY}/v1/mcp/approvals/42/status"
APPROVAL = {
    "decision": "approval_required",
    "approval_id": 42,
    "poll_endpoint": "/v1/mcp/approvals/42/status",
    "expires_at": "2026-10-15T12:00:00+00:00",
}


# ── Request shape ────────────────────────────────────────────────────────────


def test_allow_sends_the_shell_hook_request(gateway, make_client):
    route = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    client = make_client()

    decision = client.check("search", {"q": "x"}, session_id="run-1", call_id="call-1")

    assert decision.allowed
    assert decision.status == "allow"
    request = route.calls.last.request
    assert request.headers["authorization"] == f"Bearer {KEY}"
    assert request.headers["content-type"] == "application/json"
    assert request.headers["x-vw-agent-run-id"] == "run-1"
    assert body_of(route.calls.last) == {
        "tool_name": "search",
        "arguments": {"q": "x"},
        "session_id": "run-1",
        "tool_use_id": "call-1",
    }


def test_missing_ids_are_filled_in(gateway, make_client):
    route = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    client = make_client()

    client.check("search", {})

    body = body_of(route.calls.last)
    assert body["session_id"] == client.session_id
    assert body["tool_use_id"]
    assert route.calls.last.request.headers["x-vw-agent-run-id"] == client.session_id


def test_session_context_sets_the_run_id(gateway, make_client):
    route = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    client = make_client()

    with vw_session("chosen-run"):
        assert client.session_id == "chosen-run"
        client.check("search", {})

    assert body_of(route.calls.last)["session_id"] == "chosen-run"
    assert client.session_id != "chosen-run"


def test_non_serialisable_arguments_are_refused_not_converted(gateway, make_client):
    route = gateway.post(HOOK).respond(200, json={"decision": "allow"})

    decision = make_client(fail_mode="open").check("schedule", {"when": datetime(2026, 1, 2, 3, 4, 5)})

    assert not decision.allowed
    assert decision.status == "arguments_unsendable"
    assert not route.called


def test_non_dict_arguments_are_wrapped(gateway, make_client):
    route = gateway.post(HOOK).respond(200, json={"decision": "allow"})

    make_client().check("echo", "hello")

    assert body_of(route.calls.last)["arguments"] == {"input": "hello"}


# ── Decisions ────────────────────────────────────────────────────────────────


def test_deny_carries_the_gateway_reason(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "PII detected"})

    decision = make_client().check("send_email", {"to": "a@b.c"})

    assert not decision.allowed
    assert decision.status == "deny"
    assert decision.reason == "PII detected"
    assert decision.refusal_message == "Blocked by VerifyWise policy: PII detected"


def test_deny_without_reason_has_a_default(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "deny"})
    assert make_client().check("x", {}).refusal_message == "Blocked by VerifyWise policy: policy violation"


def test_monitored_allow_runs_and_logs_one_warning(gateway, make_client, caplog):
    gateway.post(HOOK).respond(
        200,
        json={
            "decision": "allow",
            "monitored": {
                "would": "deny",
                "reason": "PII detected",
                "rule": {"id": 3, "name": "No emails"},
                "outcomes": [],
            },
        },
    )
    caplog.set_level(logging.INFO, logger="verifywise_agent_control")

    decision = make_client().check("send_email", {})

    assert decision.allowed
    assert decision.monitored["would"] == "deny"
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    message = warnings[0].getMessage()
    assert "send_email" in message and "would have been denied" in message
    assert "PII detected" in message and "No emails" in message
    assert all(r.name == "verifywise_agent_control" for r in caplog.records)


def test_monitored_approval_is_described(gateway, make_client, caplog):
    gateway.post(HOOK).respond(
        200, json={"decision": "allow", "monitored": {"would": "approval_required", "reason": "risky"}}
    )
    caplog.set_level(logging.WARNING, logger="verifywise_agent_control")

    assert make_client().check("deploy", {}).allowed
    assert "would have required approval" in caplog.records[0].getMessage()


def test_plain_allow_logs_no_warning(gateway, make_client, caplog):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    caplog.set_level(logging.WARNING, logger="verifywise_agent_control")
    make_client().check("x", {})
    assert caplog.records == []


# ── Fail modes ───────────────────────────────────────────────────────────────

FAILURES = {
    "unreachable": lambda route: route.mock(side_effect=httpx.ConnectError("down")),
    "timeout": lambda route: route.mock(side_effect=httpx.ReadTimeout("slow")),
    "http_500": lambda route: route.respond(500, text="boom"),
    # 401/403 are refused whatever the fail mode (see test_review_fixes.py).
    "not_json": lambda route: route.respond(200, text="<html>"),
    "unknown_decision": lambda route: route.respond(200, json={"decision": "maybe"}),
    "not_an_object": lambda route: route.respond(200, json=["allow"]),
    "rate_limited": lambda route: route.respond(200, json={"decision": "rate_limited"}),
    "approval_without_endpoint": lambda route: route.respond(200, json={"decision": "approval_required"}),
}


@pytest.mark.parametrize("failure", FAILURES)
def test_failures_fail_open_by_default(gateway, make_client, failure):
    FAILURES[failure](gateway.post(HOOK))

    decision = make_client().check("x", {})

    assert decision.allowed
    assert decision.fail_mode_applied


@pytest.mark.parametrize("failure", FAILURES)
def test_failures_fail_closed_when_configured(gateway, make_client, failure):
    FAILURES[failure](gateway.post(HOOK))

    decision = make_client(fail_mode="closed").check("x", {})

    assert not decision.allowed
    assert decision.fail_mode_applied
    assert decision.refusal_message.startswith("Blocked by VerifyWise policy: ")


def test_rate_limited_has_its_own_status(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "rate_limited"})
    assert make_client().check("x", {}).status == "rate_limited"


def test_missing_configuration_follows_fail_mode(gateway):
    open_client = AgentControlClient()
    closed_client = AgentControlClient(fail_mode="closed")

    assert open_client.check("x", {}).allowed
    assert not closed_client.check("x", {}).allowed
    assert not gateway.calls


def test_unexpected_internal_error_never_raises(gateway, make_client, monkeypatch):
    client = make_client(fail_mode="closed")
    monkeypatch.setattr(client, "_check", lambda *a, **k: 1 / 0)

    decision = client.check("x", {})

    assert isinstance(decision, Decision) and not decision.allowed


def test_timeout_setting_is_used(gateway, make_client):
    route = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    make_client(timeout=9).check("x", {})
    assert route.calls.last.request.extensions["timeout"]["read"] == 9


# ── Approvals ────────────────────────────────────────────────────────────────


def test_approval_approved_runs(gateway, make_client, clock):
    gateway.post(HOOK).respond(200, json=APPROVAL)
    poll = gateway.get(POLL)
    poll.side_effect = [
        httpx.Response(200, json={"status": "pending"}),
        httpx.Response(200, json={"status": "approved"}),
    ]

    decision = make_client().check("deploy", {})

    assert decision.allowed
    assert decision.status == "approved"
    assert decision.approval_id == "42"
    assert poll.call_count == 2
    assert poll.calls.last.request.headers["authorization"] == f"Bearer {KEY}"
    assert clock.sleeps == [2.0]


def test_approval_denied_is_a_refusal_with_the_reason(gateway, make_client):
    gateway.post(HOOK).respond(200, json=APPROVAL)
    gateway.get(POLL).respond(200, json={"status": "denied", "decision_reason": "not today"})

    decision = make_client().check("deploy", {})

    assert not decision.allowed
    assert decision.status == "approval_denied"
    assert decision.refusal_message == "Blocked by VerifyWise policy: not today"


@pytest.mark.parametrize("mode,allowed", [("closed", False), ("open", True)])
def test_approval_expired_follows_approval_fail_mode(gateway, make_client, mode, allowed):
    gateway.post(HOOK).respond(200, json=APPROVAL)
    poll = gateway.get(POLL).respond(200, json={"status": "expired"})

    decision = make_client(approval_fail_mode=mode).check("deploy", {})

    assert decision.allowed is allowed
    assert decision.status == "approval_expired"
    assert poll.call_count == 1


@pytest.mark.parametrize("mode,allowed", [("closed", False), ("open", True)])
def test_approval_timeout_follows_approval_fail_mode(gateway, make_client, clock, mode, allowed):
    gateway.post(HOOK).respond(200, json=APPROVAL)
    poll = gateway.get(POLL).respond(200, json={"status": "pending"})

    decision = make_client(approval_wait=10, approval_fail_mode=mode).check("deploy", {})

    assert decision.allowed is allowed
    assert decision.status == "approval_timeout"
    assert poll.call_count == 5  # polled at t=0,2,4,6,8
    assert clock.now >= 10


def test_approval_wait_zero_does_not_poll(gateway, make_client):
    gateway.post(HOOK).respond(200, json=APPROVAL)
    poll = gateway.get(POLL).respond(200, json={"status": "approved"})

    decision = make_client(approval_wait=0).check("deploy", {})

    assert not decision.allowed
    assert decision.status == "approval_timeout"
    assert poll.call_count == 0


def test_poll_errors_are_retried(gateway, make_client):
    gateway.post(HOOK).respond(200, json=APPROVAL)
    poll = gateway.get(POLL)
    poll.side_effect = [
        httpx.ConnectError("blip"),
        httpx.Response(502),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"status": "approved"}),
    ]

    assert make_client().check("deploy", {}).allowed
    assert poll.call_count == 4


def test_poll_endpoint_must_be_a_gateway_path(gateway, make_client):
    gateway.post(HOOK).respond(200, json={**APPROVAL, "poll_endpoint": "https://elsewhere.example/steal"})

    decision = make_client(fail_mode="closed").check("deploy", {})

    assert not decision.allowed and decision.fail_mode_applied
    assert len(gateway.calls) == 1


# ── Result reporting ─────────────────────────────────────────────────────────


def test_report_sends_the_result(gateway, make_client):
    route = gateway.post(RESULT).respond(200, json={"status": "updated"})

    make_client().report(session_id="run-1", call_id="call-1", tool_name="search", output={"hits": 2})

    request = route.calls.last.request
    assert request.headers["authorization"] == f"Bearer {KEY}"
    assert request.headers["x-vw-agent-run-id"] == "run-1"
    assert body_of(route.calls.last) == {
        "session_id": "run-1",
        "tool_use_id": "call-1",
        "tool_name": "search",
        "tool_response": {"output": '{"hits": 2}'},
    }


def test_report_sends_error_text(gateway, make_client):
    route = gateway.post(RESULT).respond(200, json={})

    make_client().report(session_id="s", call_id="c", tool_name="t", error=ValueError("bad input"))

    assert body_of(route.calls.last)["tool_response"] == {"error": "ValueError: bad input"}


def test_report_truncates_to_ten_kb(gateway, make_client):
    route = gateway.post(RESULT).respond(200, json={})

    make_client().report(session_id="s", call_id="c", tool_name="t", output="é" * 20000)

    response = body_of(route.calls.last)["tool_response"]
    assert response["truncated"] is True
    assert len(response["output"].encode("utf-8")) <= 10240
    assert response["output"].startswith("é")


@pytest.mark.parametrize(
    "outcome",
    [
        lambda route: route.mock(side_effect=httpx.ConnectError("down")),
        lambda route: route.respond(500),
        lambda route: route.mock(side_effect=RuntimeError("unexpected")),
    ],
)
def test_report_never_raises(gateway, make_client, outcome):
    outcome(gateway.post(RESULT))
    assert make_client().report(session_id="s", call_id="c", tool_name="t", output="x") is None


def test_report_without_configuration_is_a_no_op(gateway):
    AgentControlClient().report(session_id="s", call_id="c", tool_name="t", output="x")
    assert not gateway.calls


def test_report_handles_unprintable_output(gateway, make_client):
    class Nasty:
        def __str__(self):
            raise RuntimeError("no")

        __repr__ = __str__

    route = gateway.post(RESULT).respond(200, json={})
    make_client().report(session_id="s", call_id="c", tool_name="t", output=Nasty())
    assert route.call_count <= 1


def test_client_closes_its_own_http_client():
    with AgentControlClient(gateway_url=GATEWAY, agent_key=KEY) as client:
        http = client._http
    assert http.is_closed


def test_client_leaves_a_supplied_http_client_open():
    http = httpx.Client()
    with AgentControlClient(gateway_url=GATEWAY, agent_key=KEY, http_client=http):
        pass
    assert not http.is_closed
    http.close()
