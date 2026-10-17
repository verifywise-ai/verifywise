"""Untrusted text never forges or recolours a log line, and the agent key is never logged."""

import logging

import httpx
import pytest
from conftest import GATEWAY, HOOK, KEY, RESULT

from verifywise_agent_control import AgentControlClient, Settings
from verifywise_agent_control._core import run_governed
from verifywise_agent_control._logsafe import log_safe

HOSTILE = "bad\nFAKE LOG LINE: admin approved\r\x1b[31mred\x1b[0m\x1b]0;title\x07 end"


def _records(caplog):
    return [r for r in caplog.records if r.name == "verifywise_agent_control"]


def _assert_one_safe_record(caplog, *, contains="FAKE LOG LINE"):
    records = [r for r in _records(caplog) if contains in r.getMessage()]
    assert len(records) == 1, [r.getMessage() for r in _records(caplog)]
    message = records[0].getMessage()
    assert "\n" not in message and "\r" not in message and " " not in message
    assert "\x1b" not in message and "\x07" not in message
    assert "\\nFAKE LOG LINE" in message
    return message


# ── The helper ──────────────────────────────────────────────────────────────


def test_log_safe_escapes_breaks_and_strips_ansi():
    out = log_safe(HOSTILE)

    assert out == "bad\\nFAKE LOG LINE: admin approved\\rred\\u2028end"


@pytest.mark.parametrize(
    "ch,escaped", [("\t", "\\t"), ("\x00", "\\x00"), ("\x7f", "\\x7f"), ("\x85", "\\x85")]
)
def test_log_safe_escapes_other_control_characters(ch, escaped):
    assert log_safe(f"a{ch}b") == f"a{escaped}b"


def test_log_safe_truncates():
    out = log_safe("x" * 600, limit=500)

    assert out.startswith("x" * 500) and out.endswith("...[100 more characters]")


def test_log_safe_never_raises():
    class Hostile:
        def __str__(self):
            raise RuntimeError("no")

    assert log_safe(Hostile()) == "<unprintable Hostile>"


def test_unicode_text_is_kept():
    assert log_safe("Zürich 😀 東京") == "Zürich 😀 東京"


# ── Every path that logs untrusted text ─────────────────────────────────────


def test_a_deny_reason_is_one_escaped_record(gateway, make_client, caplog):
    caplog.set_level(logging.DEBUG, logger="verifywise_agent_control")
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": HOSTILE})

    make_client().check("t", {})

    message = _assert_one_safe_record(caplog)
    assert "red" in message


def test_monitored_fields_are_one_escaped_record(gateway, make_client, caplog):
    caplog.set_level(logging.DEBUG, logger="verifywise_agent_control")
    gateway.post(HOOK).respond(
        200,
        json={
            "decision": "allow",
            "monitored": {
                "would": "deny\n\x1b[2Jx",
                "reason": HOSTILE,
                "rule": {"id": 1, "name": "r\nFAKE RULE"},
            },
        },
    )

    make_client().check("t", {})

    message = _assert_one_safe_record(caplog)
    assert "\\nFAKE RULE" in message


def test_a_hostile_tool_name_is_one_escaped_record(gateway, make_client, caplog):
    caplog.set_level(logging.DEBUG, logger="verifywise_agent_control")
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "no"})

    make_client().check(HOSTILE, {})

    _assert_one_safe_record(caplog)


def test_an_approval_denial_reason_is_one_escaped_record(gateway, make_client, caplog):
    caplog.set_level(logging.DEBUG, logger="verifywise_agent_control")
    gateway.post(HOOK).respond(
        200,
        json={
            "decision": "approval_required",
            "approval_id": 9,
            "poll_endpoint": "/v1/mcp/approvals/9/status",
        },
    )
    gateway.get(f"{GATEWAY}/v1/mcp/approvals/9/status").respond(
        200, json={"status": "denied", "decision_reason": HOSTILE}
    )

    make_client().check("t", {})

    _assert_one_safe_record(caplog)


def test_an_unexpected_decision_is_one_escaped_record(gateway, make_client, caplog):
    caplog.set_level(logging.DEBUG, logger="verifywise_agent_control")
    gateway.post(HOOK).respond(200, json={"decision": HOSTILE})

    make_client().check("t", {})

    records = [r.getMessage() for r in _records(caplog)]
    assert len(records) == 1
    assert "\n" not in records[0] and "\x1b" not in records[0]


def test_an_internal_error_message_and_traceback_are_one_escaped_record(
    gateway, make_client, monkeypatch, caplog
):
    caplog.set_level(logging.DEBUG, logger="verifywise_agent_control")
    client = make_client()

    def boom(*args, **kwargs):
        raise RuntimeError(HOSTILE)

    monkeypatch.setattr(client, "_hook_body", boom)

    client.check("t", {})

    records = _records(caplog)
    assert len(records) == 1 and records[0].exc_info is None
    message = _assert_one_safe_record(caplog)
    assert "Traceback" in message and "RuntimeError" in message


def test_unsendable_argument_keys_are_one_escaped_record(gateway, make_client, caplog):
    caplog.set_level(logging.DEBUG, logger="verifywise_agent_control")

    make_client().check("t", {"ok": {(HOSTILE,): 1}})

    records = [r.getMessage() for r in _records(caplog)]
    assert len(records) == 1
    assert "\n" not in records[0] and "\x1b" not in records[0]


def test_arguments_changed_logs_a_safe_tool_name(gateway, make_client, caplog):
    caplog.set_level(logging.DEBUG, logger="verifywise_agent_control")
    arguments = {"a": 1}

    def answer(request):
        arguments["a"] = 2
        return httpx.Response(200, json={"decision": "allow"})

    gateway.post(HOOK).mock(side_effect=answer)
    gateway.post(RESULT).respond(200, json={})

    run_governed(make_client(), tool_name=HOSTILE, arguments=arguments, execute=lambda: None)

    _assert_one_safe_record(caplog)


def test_an_invalid_setting_is_logged_safely(caplog):
    caplog.set_level(logging.DEBUG, logger="verifywise_agent_control")

    Settings.from_env(timeout=HOSTILE)

    records = [r.getMessage() for r in _records(caplog)]
    assert len(records) == 1 and "\n" not in records[0] and "\x1b" not in records[0]


# ── The agent key never reaches a log ───────────────────────────────────────


def test_settings_and_client_reprs_hide_the_key():
    settings = Settings.from_env(gateway_url=GATEWAY, agent_key=KEY)

    assert KEY not in repr(settings)
    assert KEY not in repr(AgentControlClient(settings=settings).settings)


@pytest.mark.parametrize(
    "respond",
    [
        lambda route: route.respond(401, json={"detail": "bad key"}),
        lambda route: route.respond(500, text=f"echo Bearer {KEY}"),
        lambda route: route.mock(side_effect=httpx.ConnectError("down")),
        lambda route: route.respond(200, json={"decision": "deny", "reason": "no"}),
        lambda route: route.respond(
            200,
            json={
                "decision": "approval_required",
                "approval_id": 3,
                "poll_endpoint": "/v1/mcp/approvals/3/status",
            },
        ),
    ],
)
def test_the_agent_key_is_never_logged(gateway, make_client, caplog, respond):
    caplog.set_level(logging.DEBUG)  # every logger, httpx and httpcore included
    respond(gateway.post(HOOK))
    gateway.get(f"{GATEWAY}/v1/mcp/approvals/3/status").respond(401)
    gateway.post(RESULT).respond(401)
    client = make_client(approval_wait=2)

    client.check("t", {"a": 1})
    client.report(session_id="s", call_id="c", tool_name="t", output="x")

    for record in caplog.records:
        text = record.getMessage() + (caplog.text or "")
        assert KEY not in text
        assert "Bearer" not in record.getMessage()
