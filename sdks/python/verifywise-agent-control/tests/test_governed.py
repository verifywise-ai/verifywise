import pytest
from conftest import HOOK, RESULT, body_of

from verifywise_agent_control import (
    AgentControlClient,
    AsyncAgentControlClient,
    VerifyWiseDenied,
    govern_tool,
    governed,
    vw_session,
)


def _allow(gateway):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    return hook, result


def test_sync_function_runs_and_reports(gateway, make_client):
    hook, result = _allow(gateway)
    calls = []

    @governed(client=make_client())
    def lookup(city, units="metric"):
        calls.append(city)
        return f"sunny in {city}"

    with vw_session("run-9"):
        assert lookup("Oslo", units="si") == "sunny in Oslo"

    assert calls == ["Oslo"]
    sent = body_of(hook.calls.last)
    assert sent["tool_name"] == "lookup"
    assert sent["arguments"] == {"city": "Oslo", "units": "si"}
    assert sent["session_id"] == "run-9"
    reported = body_of(result.calls.last)
    assert reported["tool_use_id"] == sent["tool_use_id"]
    assert reported["session_id"] == "run-9"
    assert reported["tool_response"] == {"output": "sunny in Oslo"}


def test_deny_returns_the_refusal_without_running(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "not allowed"})
    result = gateway.post(RESULT).respond(200, json={})
    ran = []

    @governed(client=make_client())
    def delete_all():
        ran.append(True)

    assert delete_all() == "Blocked by VerifyWise policy: not allowed"
    assert ran == []
    assert result.call_count == 0


def test_on_deny_raise(gateway, make_client):
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "nope"})

    @governed(client=make_client(on_deny="raise"))
    def delete_all():
        raise AssertionError("must not run")

    with pytest.raises(VerifyWiseDenied) as exc:
        delete_all()
    assert exc.value.tool_name == "delete_all"
    assert exc.value.decision.reason == "nope"
    assert str(exc.value) == "Blocked by VerifyWise policy: nope"


def test_tool_exception_is_reported_and_reraised_unchanged(gateway, make_client):
    _, result = _allow(gateway)
    error = KeyError("missing")

    @governed(client=make_client())
    def flaky():
        raise error

    with pytest.raises(KeyError) as exc:
        flaky()
    assert exc.value is error
    assert body_of(result.calls.last)["tool_response"] == {"error": "KeyError: 'missing'"}


def test_name_override_and_variadic_arguments(gateway, make_client):
    hook, _ = _allow(gateway)

    @governed(client=make_client(), name="custom.tool")
    def fn(a, *rest, **extra):
        return a

    fn(1, 2, 3, flag=True)

    sent = body_of(hook.calls.last)
    assert sent["tool_name"] == "custom.tool"
    assert sent["arguments"] == {"a": 1, "rest": [2, 3], "flag": True}


def test_bad_call_arguments_still_reach_the_function(gateway, make_client):
    _allow(gateway)

    @governed(client=make_client())
    def fn(a):
        return a

    with pytest.raises(TypeError):
        fn(1, 2)


def test_bare_decorator_uses_env_settings(gateway, monkeypatch):
    monkeypatch.setenv("VW_GATEWAY_URL", "http://gw.test")
    monkeypatch.setenv("VW_AGENT_KEY", "sk-mcp-test")
    hook, _ = _allow(gateway)

    @governed
    def ping():
        return "pong"

    assert ping() == "pong"
    assert hook.call_count == 1


def test_decorator_keeps_metadata(make_client):
    @governed(client=make_client())
    def documented(x):
        """Docs."""

    assert documented.__name__ == "documented"
    assert documented.__doc__ == "Docs."


def test_govern_tool_wraps_an_existing_function(gateway, make_client):
    hook, _ = _allow(gateway)

    def area(w, h):
        return w * h

    governed_area = govern_tool(area, client=make_client(), name="area_tool")

    assert governed_area(2, 3) == 6
    assert body_of(hook.calls.last)["tool_name"] == "area_tool"


async def test_async_function(gateway, make_async_client):
    hook, result = _allow(gateway)

    @governed(client=make_async_client())
    async def fetch(url):
        return {"status": 200, "url": url}

    assert await fetch("https://example.com") == {"status": 200, "url": "https://example.com"}
    assert body_of(hook.calls.last)["arguments"] == {"url": "https://example.com"}
    assert body_of(result.calls.last)["tool_response"] == {
        "output": '{"status": 200, "url": "https://example.com"}'
    }


async def test_async_deny(gateway, make_async_client):
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "r"})

    @governed(client=make_async_client())
    async def fetch():
        raise AssertionError("must not run")

    assert await fetch() == "Blocked by VerifyWise policy: r"


async def test_async_exception_is_reraised(gateway, make_async_client):
    _, result = _allow(gateway)

    @governed(client=make_async_client())
    async def fetch():
        raise ConnectionError("upstream down")

    with pytest.raises(ConnectionError, match="upstream down"):
        await fetch()
    assert body_of(result.calls.last)["tool_response"] == {"error": "ConnectionError: upstream down"}


def test_mismatched_client_type_is_rejected_at_decoration():
    with pytest.raises(TypeError):

        @governed(client=AsyncAgentControlClient(gateway_url="http://x", agent_key="sk-mcp-x"))
        def sync_fn():
            pass

    with pytest.raises(TypeError):

        @governed(client=AgentControlClient(gateway_url="http://x", agent_key="sk-mcp-x"))
        async def async_fn():
            pass
