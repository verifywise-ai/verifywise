import pytest

from verifywise_agent_control import Settings


def test_defaults_match_the_shell_hook():
    s = Settings.from_env()
    assert s.gateway_url is None
    assert s.agent_key is None
    assert s.fail_mode == "open"
    assert s.timeout == 3.0
    assert s.approval_wait == 120.0
    assert s.approval_fail_mode == "closed"
    assert s.approval_poll_interval == 2.0
    assert s.on_deny == "refuse"
    assert s.max_result_bytes == 9216
    assert not s.configured


def test_reads_every_env_var(monkeypatch):
    monkeypatch.setenv("VW_GATEWAY_URL", "http://localhost:8100/")
    monkeypatch.setenv("VW_AGENT_KEY", "sk-mcp-abc")
    monkeypatch.setenv("VW_FAIL_MODE", "closed")
    monkeypatch.setenv("VW_TIMEOUT", "7.5")
    monkeypatch.setenv("VW_APPROVAL_WAIT", "30")
    monkeypatch.setenv("VW_APPROVAL_FAIL_MODE", "open")

    s = Settings.from_env()

    assert s.gateway_url == "http://localhost:8100"
    assert s.agent_key == "sk-mcp-abc"
    assert s.fail_mode == "closed"
    assert s.timeout == 7.5
    assert s.approval_wait == 30.0
    assert s.approval_fail_mode == "open"
    assert s.configured


def test_explicit_values_override_env(monkeypatch):
    monkeypatch.setenv("VW_GATEWAY_URL", "http://env")
    monkeypatch.setenv("VW_FAIL_MODE", "closed")

    s = Settings.from_env(gateway_url="http://explicit", fail_mode="open")

    assert s.gateway_url == "http://explicit"
    assert s.fail_mode == "open"


def test_none_overrides_fall_back_to_env(monkeypatch):
    monkeypatch.setenv("VW_AGENT_KEY", "sk-mcp-env")
    assert Settings.from_env(agent_key=None).agent_key == "sk-mcp-env"


def test_fail_modes_follow_shell_semantics(monkeypatch):
    # Like the shell hook: only "closed" closes VW_FAIL_MODE, only "open" opens
    # VW_APPROVAL_FAIL_MODE; anything else keeps the safe default.
    monkeypatch.setenv("VW_FAIL_MODE", "bogus")
    monkeypatch.setenv("VW_APPROVAL_FAIL_MODE", "bogus")
    s = Settings.from_env()
    assert s.fail_mode == "open"
    assert s.approval_fail_mode == "closed"


@pytest.mark.parametrize("value", ["abc", "-1", "0", "nan", "inf"])
def test_bad_timeout_falls_back_to_default(monkeypatch, value):
    monkeypatch.setenv("VW_TIMEOUT", value)
    assert Settings.from_env().timeout == 3.0


@pytest.mark.parametrize("value", ["abc", "-5"])
def test_bad_approval_wait_falls_back_to_default(monkeypatch, value):
    monkeypatch.setenv("VW_APPROVAL_WAIT", value)
    assert Settings.from_env().approval_wait == 120.0


def test_zero_approval_wait_is_allowed(monkeypatch):
    monkeypatch.setenv("VW_APPROVAL_WAIT", "0")
    assert Settings.from_env().approval_wait == 0.0


def test_blank_values_count_as_unset(monkeypatch):
    monkeypatch.setenv("VW_GATEWAY_URL", "  ")
    monkeypatch.setenv("VW_AGENT_KEY", "")
    s = Settings.from_env()
    assert s.gateway_url is None and s.agent_key is None


def test_invalid_on_deny_is_rejected_at_construction():
    with pytest.raises(ValueError, match="on_deny"):
        Settings.from_env(on_deny="explode")


def test_replace_keeps_normalising():
    s = Settings.from_env(gateway_url="http://a/").replace(fail_mode="CLOSED", timeout=None)
    assert s.gateway_url == "http://a"
    assert s.fail_mode == "closed"
    assert s.timeout == 3.0
