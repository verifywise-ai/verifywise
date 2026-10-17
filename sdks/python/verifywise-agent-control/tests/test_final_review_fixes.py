"""Behaviour fixed after the final code review: shared run ids for twin and
default clients, defaulted and method arguments in ``@governed``, no result
report after a gateway outage, and accurate result-report log lines."""

import logging

import httpx
import pytest
from conftest import HOOK, RESULT, body_of

from verifywise_agent_control import _core, govern_tool, governed

# ── Twin and default clients share one run id ───────────────────────────────


def test_an_async_twin_keeps_the_sync_clients_session_id(make_client):
    client = make_client(session_id="run-1")

    assert _core.async_client_for(client).session_id == "run-1"


def test_a_sync_twin_keeps_the_async_clients_session_id(make_async_client):
    client = make_async_client(session_id="run-2")

    assert _core.sync_client_for(client).session_id == "run-2"


def test_a_twin_keeps_a_generated_session_id(make_client):
    client = make_client()

    assert _core.async_client_for(client).session_id == client.session_id


def test_the_default_clients_share_one_session_id():
    assert _core.default_client().session_id == _core.default_async_client().session_id


# ── @governed sends what runs ───────────────────────────────────────────────


def _allow(gateway):
    hook = gateway.post(HOOK).respond(200, json={"decision": "allow"})
    result = gateway.post(RESULT).respond(200, json={})
    return hook, result


def test_defaulted_parameters_are_sent(gateway, make_client):
    hook, _ = _allow(gateway)

    @governed(client=make_client())
    def run_sql(query, database="prod"):
        return f"{database}: {query}"

    assert run_sql("select 1") == "prod: select 1"
    assert body_of(hook.calls.last)["arguments"] == {"query": "select 1", "database": "prod"}


def test_a_defaulted_keyword_only_parameter_is_sent(gateway, make_client):
    hook, _ = _allow(gateway)

    @governed(client=make_client())
    def run_sql(query, *, database="prod", dry_run=False):
        return query

    run_sql("select 1", dry_run=True)
    assert body_of(hook.calls.last)["arguments"] == {"query": "select 1", "database": "prod", "dry_run": True}


def _repository(client, seen):
    class Repository:
        prefix = "repo"

        def __init__(self, name):
            self.name = name

        @governed(client=client)
        def find(self, key, limit=10):
            seen.append(("find", self.name, key, limit))
            return f"{self.name}:{key}"

        @classmethod
        @governed(client=client)
        def build(cls, name):
            seen.append(("build", cls.prefix, name))
            return cls(name)

        @governed(client=client)
        @classmethod
        def build_outer(cls, name):
            seen.append(("build_outer", cls.prefix, name))
            return cls(name)

        @staticmethod
        @governed(client=client)
        def ping(host):
            seen.append(("ping", host))
            return "pong"

        @governed(client=client)
        @staticmethod
        def ping_outer(host):
            seen.append(("ping_outer", host))
            return "pong"

    return Repository


def test_an_instance_method_does_not_send_self(gateway, make_client):
    hook, _ = _allow(gateway)
    seen = []
    repo = _repository(make_client(), seen)("orders")

    assert repo.find("k1") == "orders:k1"

    sent = body_of(hook.calls.last)
    assert sent["tool_name"] == "find"
    assert sent["arguments"] == {"key": "k1", "limit": 10}
    assert seen == [("find", "orders", "k1", 10)]


def test_an_instance_method_called_through_the_class_does_not_send_self(gateway, make_client):
    hook, _ = _allow(gateway)
    seen = []
    repository = _repository(make_client(), seen)

    assert repository.find(repository("orders"), "k2", limit=3) == "orders:k2"
    assert body_of(hook.calls.last)["arguments"] == {"key": "k2", "limit": 3}


def test_a_subclass_instance_does_not_send_self(gateway, make_client):
    hook, _ = _allow(gateway)
    repository = _repository(make_client(), [])

    class Special(repository):
        pass

    assert Special("x").find("k3") == "x:k3"
    assert body_of(hook.calls.last)["arguments"] == {"key": "k3", "limit": 10}


@pytest.mark.parametrize("method", ["build", "build_outer"])
def test_a_classmethod_does_not_send_cls(gateway, make_client, method):
    hook, _ = _allow(gateway)
    seen = []
    repository = _repository(make_client(), seen)

    built = getattr(repository, method)("orders")

    assert isinstance(built, repository)
    assert body_of(hook.calls.last)["arguments"] == {"name": "orders"}
    assert body_of(hook.calls.last)["tool_name"] == method
    assert seen == [(method, "repo", "orders")]


@pytest.mark.parametrize("method", ["ping", "ping_outer"])
def test_a_staticmethod_sends_all_its_arguments(gateway, make_client, method):
    hook, _ = _allow(gateway)
    seen = []
    repository = _repository(make_client(), seen)

    assert getattr(repository, method)("db1") == "pong"
    assert getattr(repository("r"), method)("db2") == "pong"

    sent = [body_of(call)["arguments"] for call in hook.calls]
    assert sent == [{"host": "db1"}, {"host": "db2"}]


def test_govern_tool_on_a_bound_method_does_not_send_self(gateway, make_client):
    hook, _ = _allow(gateway)

    class Shell:
        def run(self, command):
            return f"ran {command}"

    governed_run = govern_tool(Shell().run, client=make_client())

    assert governed_run("ls") == "ran ls"
    assert body_of(hook.calls.last)["arguments"] == {"command": "ls"}


def test_a_plain_function_with_a_self_parameter_keeps_it(gateway, make_client):
    hook, _ = _allow(gateway)

    @governed(client=make_client())
    def echo(self, text):
        return text

    echo("me", "hi")
    assert body_of(hook.calls.last)["arguments"] == {"self": "me", "text": "hi"}


async def test_an_async_method_does_not_send_self(gateway, make_async_client):
    hook, _ = _allow(gateway)
    client = make_async_client()

    class Store:
        @governed(client=client)
        async def get(self, key, default=None):
            return key

    assert await Store().get("k") == "k"
    assert body_of(hook.calls.last)["arguments"] == {"key": "k", "default": None}


# ── No result report after a gateway outage ─────────────────────────────────

OUTAGES = {
    "unreachable": lambda route: route.mock(side_effect=httpx.ConnectError("down")),
    "http_500": lambda route: route.respond(500, text="boom"),
    "not_json": lambda route: route.respond(200, text="<html>"),
}


@pytest.mark.parametrize("outage", OUTAGES)
def test_an_outage_that_fails_open_makes_exactly_one_request(gateway, make_client, outage):
    OUTAGES[outage](gateway.post(HOOK))
    gateway.post(RESULT).respond(200, json={})

    @governed(client=make_client(fail_mode="open"))
    def lookup(city):
        return city

    assert lookup("Oslo") == "Oslo"
    assert len(gateway.calls) == 1


@pytest.mark.parametrize("outage", OUTAGES)
async def test_an_async_outage_that_fails_open_makes_exactly_one_request(gateway, make_async_client, outage):
    OUTAGES[outage](gateway.post(HOOK))
    gateway.post(RESULT).respond(200, json={})

    @governed(client=make_async_client(fail_mode="open"))
    async def lookup(city):
        return city

    assert await lookup("Oslo") == "Oslo"
    assert len(gateway.calls) == 1


def test_an_outage_tool_error_is_not_reported_either(gateway, make_client):
    gateway.post(HOOK).respond(503)
    result = gateway.post(RESULT).respond(200, json={})

    @governed(client=make_client(fail_mode="open"))
    def flaky():
        raise KeyError("x")

    with pytest.raises(KeyError):
        flaky()
    assert result.call_count == 0


def test_a_rate_limited_call_is_still_reported(gateway, make_client):
    # The gateway writes a rate_limited audit row, so the result has a home.
    gateway.post(HOOK).respond(200, json={"decision": "rate_limited"})
    result = gateway.post(RESULT).respond(200, json={})

    @governed(client=make_client(fail_mode="open"))
    def lookup(city):
        return city

    assert lookup("Oslo") == "Oslo"
    assert result.call_count == 1
    assert body_of(result.calls.last)["tool_response"] == {"output": "Oslo"}


# ── Result-report log lines say what the gateway said ───────────────────────


def _report_logs(gateway, make_client, caplog, status, json_body):
    caplog.set_level(logging.WARNING, logger="verifywise_agent_control")
    gateway.post(RESULT).respond(status, json=json_body)
    make_client().report(session_id="s", call_id="c", tool_name="t", output="x")
    return [r for r in caplog.records if r.name == "verifywise_agent_control"]


def test_a_401_on_report_says_the_key_was_rejected(gateway, make_client, caplog):
    records = _report_logs(gateway, make_client, caplog, 401, {"detail": "Agent key has been revoked"})

    assert len(records) == 1
    assert records[0].levelno == logging.ERROR
    assert "rejected the agent key" in records[0].getMessage()
    assert "Agent key has been revoked" in records[0].getMessage()


def test_a_403_for_another_keys_result_is_not_called_a_rejected_key(gateway, make_client, caplog):
    records = _report_logs(
        gateway, make_client, caplog, 403, {"detail": "result does not belong to this agent key"}
    )

    assert len(records) == 1
    message = records[0].getMessage()
    assert "rejected the agent key" not in message
    assert "recorded under a different agent key" in message


def test_another_403_is_logged_with_the_gateway_detail(gateway, make_client, caplog):
    records = _report_logs(gateway, make_client, caplog, 403, {"detail": "forbidden\nINJECTED"})

    assert len(records) == 1
    message = records[0].getMessage()
    assert "rejected the agent key" not in message
    assert "forbidden\\nINJECTED" in message
    assert "\n" not in message


def test_a_403_without_a_json_body_is_still_logged(gateway, make_client, caplog):
    caplog.set_level(logging.WARNING, logger="verifywise_agent_control")
    gateway.post(RESULT).respond(403, text="<html>nope</html>")

    make_client().report(session_id="s", call_id="c", tool_name="t", output="x")

    messages = [r.getMessage() for r in caplog.records if r.name == "verifywise_agent_control"]
    assert len(messages) == 1
    assert "HTTP 403" in messages[0]
    assert "rejected the agent key" not in messages[0]
