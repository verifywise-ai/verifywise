import json

import pytest
import respx

from verifywise_agent_control import AgentControlClient, AsyncAgentControlClient, _core

GATEWAY = "http://gw.test"
KEY = "sk-mcp-test"
HOOK = f"{GATEWAY}/v1/mcp/hook"
RESULT = f"{GATEWAY}/v1/mcp/hook/result"


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in (
        "VW_GATEWAY_URL",
        "VW_AGENT_KEY",
        "VW_FAIL_MODE",
        "VW_TIMEOUT",
        "VW_APPROVAL_WAIT",
        "VW_APPROVAL_FAIL_MODE",
    ):
        monkeypatch.delenv(name, raising=False)
    # The shared env-built clients must not leak between tests.
    monkeypatch.setattr(_core, "_default_sync", None)
    monkeypatch.setattr(_core, "_default_async", None)
    monkeypatch.setattr(_core, "_default_session_id", None)


@pytest.fixture
def gateway():
    with respx.mock(assert_all_called=False) as router:
        yield router


class FakeClock:
    """A monotonic clock that only moves when the client sleeps."""

    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += max(seconds, 0.5)

    async def asleep(self, seconds):
        self.sleep(seconds)


def _wire(client, clock):
    client._clock = clock
    client._sleep = clock.asleep if isinstance(client, AsyncAgentControlClient) else clock.sleep
    return client


@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def make_client(clock):
    def make(**overrides):
        settings = {"gateway_url": GATEWAY, "agent_key": KEY, **overrides}
        return _wire(AgentControlClient(**settings), clock)

    return make


@pytest.fixture
def make_async_client(clock):
    def make(**overrides):
        settings = {"gateway_url": GATEWAY, "agent_key": KEY, **overrides}
        return _wire(AsyncAgentControlClient(**settings), clock)

    return make


def body_of(call):
    return json.loads(call.request.content)
