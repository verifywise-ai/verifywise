"""Self-contained tests: /v1/mcp/hook and /v1/mcp/hook/result reject malformed
request bodies with a 400 instead of failing later (a 500, or a non-string
tool name reaching the policy checks and the audit log).

No live services: key auth, policy checks, rate limiting, the result store and
the audit log are replaced with fakes on the hook router module.
"""

import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import routers.mcp_hook as hook_router
from services.mcp_guardrail_service import ScanResult

KEY = {"id": 5, "organization_id": 9, "name": "bot", "enforcement_mode": "enforce"}


@pytest.fixture
def fakes(monkeypatch):
    mocks = MagicMock()
    mocks.audit = AsyncMock()
    mocks.scan = AsyncMock(return_value=ScanResult())
    mocks.update = AsyncMock(return_value="ok")

    async def extract(_request):
        return KEY

    async def scan_blob(_org_id, blob, agent_key_id=None):
        return blob

    monkeypatch.setattr(hook_router, "extract_agent_key", extract)
    monkeypatch.setattr(hook_router, "log_tool_call", mocks.audit)
    monkeypatch.setattr(hook_router, "scan_tool_input", mocks.scan)
    monkeypatch.setattr(hook_router, "check_require_approval", AsyncMock(return_value=None))
    monkeypatch.setattr(hook_router, "enforce_mcp_rate_limits", AsyncMock())
    monkeypatch.setattr(hook_router, "scan_result_blob", scan_blob)
    monkeypatch.setattr(hook_router, "update_tool_result", mocks.update)
    return mocks


def _request(body):
    request = MagicMock()
    request.json = AsyncMock(return_value=body)
    return request


VALID_HOOK = {"tool_name": "Bash", "arguments": {"command": "ls"}, "session_id": "s", "tool_use_id": "u"}


@pytest.mark.parametrize(
    "change",
    [
        {"tool_name": None},
        {"tool_name": ""},
        {"tool_name": 42},
        {"tool_name": ["Bash"]},
        {"tool_name": {"name": "Bash"}},
        {"arguments": "ls"},
        {"arguments": ["ls"]},
        {"session_id": 7},
        {"session_id": {"id": "s"}},
        {"tool_use_id": 7},
        {"tool_use_id": ["u"]},
    ],
)
async def test_hook_rejects_malformed_fields_with_400(fakes, change):
    with pytest.raises(HTTPException) as exc:
        await hook_router.mcp_hook(_request({**VALID_HOOK, **change}))

    assert exc.value.status_code == 400
    fakes.scan.assert_not_awaited()
    fakes.audit.assert_not_awaited()


async def test_hook_rejects_a_body_that_is_not_an_object(fakes):
    with pytest.raises(HTTPException) as exc:
        await hook_router.mcp_hook(_request(["Bash"]))

    assert exc.value.status_code == 400


@pytest.mark.parametrize("change", [{}, {"session_id": None, "tool_use_id": None}, {"arguments": None}])
async def test_hook_accepts_valid_and_omitted_optional_fields(fakes, change):
    response = await hook_router.mcp_hook(_request({**VALID_HOOK, **change}))

    assert response.status_code == 200
    fakes.audit.assert_awaited_once()


VALID_RESULT = {"session_id": "s", "tool_use_id": "u", "tool_name": "Bash", "tool_response": {"output": "ok"}}


@pytest.mark.parametrize(
    "change",
    [
        {"tool_name": 42},
        {"tool_name": ""},
        {"tool_name": ["Bash"]},
        {"session_id": 7},
        {"session_id": ""},
        {"tool_use_id": 7},
        {"tool_use_id": None},
    ],
)
async def test_result_rejects_malformed_fields_with_400(fakes, change):
    with pytest.raises(HTTPException) as exc:
        await hook_router.mcp_hook_result(_request({**VALID_RESULT, **change}))

    assert exc.value.status_code == 400
    fakes.update.assert_not_awaited()


async def test_result_rejects_a_body_that_is_not_an_object(fakes):
    with pytest.raises(HTTPException) as exc:
        await hook_router.mcp_hook_result(_request("result"))

    assert exc.value.status_code == 400


async def test_result_without_a_tool_name_is_still_recorded(fakes):
    body = {k: v for k, v in VALID_RESULT.items() if k != "tool_name"}

    response = await hook_router.mcp_hook_result(_request(body))

    assert response.status_code == 200
    fakes.update.assert_awaited_once()
