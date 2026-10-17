import asyncio
import threading

import httpx
import pytest
from conftest import GATEWAY, HOOK, KEY, RESULT, body_of

from verifywise_agent_control import AsyncAgentControlClient

POLL = f"{GATEWAY}/v1/mcp/approvals/7/status"
APPROVAL = {"decision": "approval_required", "approval_id": 7, "poll_endpoint": "/v1/mcp/approvals/7/status"}


async def test_allow(gateway, make_async_client):
    route = gateway.post(HOOK).respond(200, json={"decision": "allow"})

    decision = await make_async_client().check("search", {"q": 1}, session_id="r", call_id="c")

    assert decision.allowed
    assert route.calls.last.request.headers["authorization"] == f"Bearer {KEY}"
    assert body_of(route.calls.last) == {
        "tool_name": "search",
        "arguments": {"q": 1},
        "session_id": "r",
        "tool_use_id": "c",
    }


async def test_deny(gateway, make_async_client):
    gateway.post(HOOK).respond(200, json={"decision": "deny", "reason": "nope"})
    decision = await make_async_client().check("x", {})
    assert not decision.allowed and decision.reason == "nope"


@pytest.mark.parametrize("mode,allowed", [("open", True), ("closed", False)])
async def test_unreachable_follows_fail_mode(gateway, make_async_client, mode, allowed):
    gateway.post(HOOK).mock(side_effect=httpx.ConnectError("down"))
    assert (await make_async_client(fail_mode=mode).check("x", {})).allowed is allowed


async def test_approval_approved(gateway, make_async_client, clock):
    gateway.post(HOOK).respond(200, json=APPROVAL)
    gateway.get(POLL).side_effect = [
        httpx.Response(200, json={"status": "pending"}),
        httpx.Response(200, json={"status": "approved"}),
    ]

    decision = await make_async_client().check("deploy", {})

    assert decision.allowed and decision.status == "approved"
    assert clock.sleeps == [2.0]


async def test_approval_denied(gateway, make_async_client):
    gateway.post(HOOK).respond(200, json=APPROVAL)
    gateway.get(POLL).respond(200, json={"status": "denied"})
    decision = await make_async_client().check("deploy", {})
    assert not decision.allowed and decision.status == "approval_denied"


async def test_approval_timeout(gateway, make_async_client):
    gateway.post(HOOK).respond(200, json=APPROVAL)
    gateway.get(POLL).respond(200, json={"status": "pending"})

    decision = await make_async_client(approval_wait=4).check("deploy", {})

    assert not decision.allowed and decision.status == "approval_timeout"


async def test_report(gateway, make_async_client):
    route = gateway.post(RESULT).respond(200, json={})
    await make_async_client().report(session_id="s", call_id="c", tool_name="t", output="done")
    assert body_of(route.calls.last)["tool_response"] == {"output": "done"}


async def test_report_never_raises(gateway, make_async_client):
    gateway.post(RESULT).mock(side_effect=httpx.ConnectError("down"))
    assert await make_async_client().report(session_id="s", call_id="c", tool_name="t", output="x") is None


def test_works_across_event_loops(gateway):
    """A client reused by several asyncio.run() calls must not keep a dead loop's pool."""
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    client = AsyncAgentControlClient(gateway_url=GATEWAY, agent_key=KEY)

    assert asyncio.run(client.check("x", {})).allowed
    assert asyncio.run(client.check("x", {})).allowed


async def test_async_context_manager_closes(gateway):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    async with AsyncAgentControlClient(gateway_url=GATEWAY, agent_key=KEY) as client:
        await client.check("x", {})
        http = client._current_pool()
    assert http.is_closed


def test_a_finished_asyncio_run_closes_its_pool(gateway):
    """The pool made for a loop is closed when asyncio.run() shuts that loop down."""
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    client = AsyncAgentControlClient(gateway_url=GATEWAY, agent_key=KEY)

    async def run():
        assert (await client.check("x", {})).allowed
        return client._current_pool()

    first = asyncio.run(run())
    second = asyncio.run(run())

    assert first is not second
    assert first.is_closed and second.is_closed


def test_two_threads_with_their_own_loops_share_one_client(gateway):
    """Each running loop gets its own pool; none is used from another loop."""
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    client = AsyncAgentControlClient(gateway_url=GATEWAY, agent_key=KEY)
    barrier = threading.Barrier(2)
    pools, errors = {}, []

    def worker(name):
        async def run():
            barrier.wait(timeout=5)  # both loops alive at the same time
            for _ in range(3):
                assert (await client.check("x", {})).allowed
            pools[name] = client._current_pool()
            barrier.wait(timeout=5)

        try:
            asyncio.run(run())
        except Exception as exc:  # noqa: BLE001 - surfaced by the assertion below
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(n,)) for n in ("a", "b")]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert errors == []
    assert pools["a"] is not pools["b"]
    assert pools["a"].is_closed and pools["b"].is_closed


def test_aclose_closes_the_pools_of_every_live_loop(gateway):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    client = AsyncAgentControlClient(gateway_url=GATEWAY, agent_key=KEY)
    other_loop = asyncio.new_event_loop()
    thread = threading.Thread(target=other_loop.run_forever, daemon=True)
    thread.start()
    try:

        async def use():
            assert (await client.check("x", {})).allowed
            return client._current_pool()

        other_pool = asyncio.run_coroutine_threadsafe(use(), other_loop).result(timeout=5)

        async def main():
            own_pool = await use()
            await client.aclose()
            return own_pool

        own_pool = asyncio.run(main())

        assert own_pool.is_closed
        assert other_pool.is_closed
    finally:
        other_loop.call_soon_threadsafe(other_loop.stop)
        thread.join(timeout=5)
        other_loop.close()


def test_a_supplied_http_client_is_used_as_is(gateway):
    gateway.post(HOOK).respond(200, json={"decision": "allow"})
    http = httpx.AsyncClient()
    client = AsyncAgentControlClient(gateway_url=GATEWAY, agent_key=KEY, http_client=http)

    async def main():
        await client.check("x", {})
        assert client._current_pool() is http
        await client.aclose()

    asyncio.run(main())
    assert not http.is_closed
