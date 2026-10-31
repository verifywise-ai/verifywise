"""Self-contained tests: the outcome event /v1/mcp/hook/result records.

A tool_response that is a dict with an "error" key is a failed call for every
client (the Python SDK reports errors as {"error": "..."}), not only for the
Claude Code Write / Edit shapes. No live services.
"""

import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import routers.mcp_hook as hook_router


@pytest.fixture
def result_fakes(monkeypatch):
    mocks = MagicMock()
    mocks.update = AsyncMock(return_value="updated")

    async def extract(_request):
        return {"id": 5, "organization_id": 9}

    async def scan(_org_id, blob, agent_key_id=None):
        return blob

    monkeypatch.setattr(hook_router, "extract_agent_key", extract)
    monkeypatch.setattr(hook_router, "scan_result_blob", scan)
    monkeypatch.setattr(hook_router, "update_tool_result", mocks.update)
    return mocks


async def _report(tool_name, tool_response):
    request = MagicMock()
    request.json = AsyncMock(return_value={
        "session_id": "s", "tool_use_id": "u", "tool_name": tool_name, "tool_response": tool_response,
    })
    response = await hook_router.mcp_hook_result(request)
    return json.loads(response.body)


def _outcome(mocks):
    return mocks.update.await_args.kwargs["outcome_event"]["type"]


@pytest.mark.parametrize("tool_name", ["search_orders", "Bash", "Write", "unknown"])
async def test_an_error_dict_is_failed_for_every_client(result_fakes, tool_name):
    await _report(tool_name, {"error": "ConnectionError: refused"})

    assert _outcome(result_fakes) == "failed"


async def test_an_error_with_truncation_flag_is_failed(result_fakes):
    await _report("search_orders", {"error": "boom", "truncated": True})

    assert _outcome(result_fakes) == "failed"


@pytest.mark.parametrize("response", [{"output": "ok"}, {"error": None, "output": "ok"}, "plain text", None])
async def test_other_responses_are_completed(result_fakes, response):
    await _report("search_orders", response)

    assert _outcome(result_fakes) == "completed"


async def test_existing_claude_code_shapes_are_unchanged(result_fakes):
    await _report("Bash", {"interrupted": True})
    assert _outcome(result_fakes) == "interrupted"

    await _report("Edit", {"success": False})
    assert _outcome(result_fakes) == "failed"
