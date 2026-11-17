"""Unit tests for the provider-key permission checks in utils.auth.

Key writes accept the built-in role names as before, plus a caller the
Express proxy marked as holding "llmKeys.admin" (a custom role never
matches a built-in role name).
"""

import os
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from utils.auth import (  # noqa: E402
    LLM_KEYS_ADMIN_HEADER,
    has_llm_keys_admin,
    require_llm_keys_admin,
    require_llm_keys_writer,
)


def _request(role="", header=None):
    headers = {} if header is None else {LLM_KEYS_ADMIN_HEADER: header}
    return SimpleNamespace(state=SimpleNamespace(role=role), headers=headers)


def test_header_must_be_true():
    assert has_llm_keys_admin(_request(header="true"))
    assert has_llm_keys_admin(_request(header="TRUE"))
    assert not has_llm_keys_admin(_request(header="false"))
    assert not has_llm_keys_admin(_request(header="1"))
    assert not has_llm_keys_admin(_request())


@pytest.mark.parametrize("role", ["Admin"])
def test_admin_role_can_manage_keys(role):
    require_llm_keys_admin(_request(role=role))
    require_llm_keys_writer(_request(role=role))


def test_editor_can_create_but_not_delete():
    require_llm_keys_writer(_request(role="Editor"))
    with pytest.raises(HTTPException) as exc:
        require_llm_keys_admin(_request(role="Editor"))
    assert exc.value.status_code == 403


def test_custom_role_with_permission_can_manage_keys():
    request = _request(role="Key managers", header="true")
    require_llm_keys_admin(request)
    require_llm_keys_writer(request)


@pytest.mark.parametrize("role", ["Key managers", "Reviewer", "Auditor", ""])
def test_without_role_or_permission_is_refused(role):
    for check in (require_llm_keys_admin, require_llm_keys_writer):
        with pytest.raises(HTTPException) as exc:
            check(_request(role=role))
        assert exc.value.status_code == 403
