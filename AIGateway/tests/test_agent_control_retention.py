"""Per-organization Agent Control retention: settings validation, previous
value on save, and the per-organization cleanup statement.

No live services: database access is replaced with fakes.
"""

import os
import sys
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import crud.guardrails as guardrails_crud
import routers.retention as retention_router
import utils.batch_delete as batch_delete
from config import settings
from crud.mcp_approvals import delete_expired_approval_requests
from crud.mcp_audit import delete_expired_audit_logs
from crud.purge import MAX_RETENTION_DAYS


def _fake_delete_db(batches):
    """get_db replacement whose DELETE returns the given row counts in turn."""
    executed = []
    counts = list(batches)

    db = MagicMock()

    async def execute(stmt, params=None):
        executed.append((str(stmt), params))
        result = MagicMock()
        result.fetchall.return_value = [(i,) for i in range(counts.pop(0) if counts else 0)]
        return result

    db.execute = execute
    db.commit = AsyncMock()

    @asynccontextmanager
    async def get_db():
        yield db

    return get_db, executed


class TestSettingsValidation:
    def test_accepts_null_to_use_the_default(self):
        guardrails_crud._validate_settings_input({"mcp_audit_retention_days": None})

    def test_accepts_the_floor_and_the_maximum(self):
        floor = settings.mcp_audit_retention_min_days
        guardrails_crud._validate_settings_input({"mcp_audit_retention_days": floor})
        guardrails_crud._validate_settings_input({"mcp_audit_retention_days": MAX_RETENTION_DAYS})

    @pytest.mark.parametrize(
        "value",
        [True, "30", 1.5, 0, -1, MAX_RETENTION_DAYS + 1],
    )
    def test_rejects_values_outside_the_range(self, value):
        with pytest.raises(HTTPException) as exc:
            guardrails_crud._validate_settings_input({"mcp_audit_retention_days": value})
        assert exc.value.status_code == 400

    def test_rejects_a_value_below_the_floor(self, monkeypatch):
        monkeypatch.setattr(settings, "mcp_audit_retention_min_days", 14)
        with pytest.raises(HTTPException) as exc:
            guardrails_crud._validate_settings_input({"mcp_audit_retention_days": 13})
        assert "14" in exc.value.detail


class TestSettingsColumns:
    def test_is_a_nullable_setting_defaulting_to_none(self):
        assert guardrails_crud._SETTINGS_DEFAULTS["mcp_audit_retention_days"] is None
        assert "mcp_audit_retention_days" in guardrails_crud._NULLABLE_SETTING_KEYS

    def test_save_returns_the_previous_value(self):
        assert "mcp_audit_retention_days" in guardrails_crud._PREVIOUS_RETENTION_KEYS
        assert "mcp_audit_retention_days" in str(guardrails_crud._LOCK_PREVIOUS_RETENTION_SQL)

    def test_update_statement_sets_the_column_only_when_sent(self):
        sql = str(guardrails_crud._UPDATE_SETTINGS_SQL)
        assert (
            "mcp_audit_retention_days = CASE WHEN :set_mcp_audit_retention_days "
            "THEN :mcp_audit_retention_days ELSE mcp_audit_retention_days END"
        ) in sql


class TestPerOrgCleanup:
    async def test_passes_default_and_floor_and_joins_settings(self, monkeypatch):
        get_db, executed = _fake_delete_db([0])
        monkeypatch.setattr(batch_delete, "get_db", get_db)
        deleted = await delete_expired_audit_logs(default_days=30, min_days=7)
        assert deleted == 0
        sql, params = executed[0]
        assert params["default_days"] == 30
        assert params["min_days"] == 7
        assert "LEFT JOIN ai_gateway_guardrail_settings s" in sql
        assert "s.organization_id = l.organization_id" in sql
        assert "GREATEST(s.mcp_audit_retention_days, :min_days)" in sql
        # Organizations without their own period are skipped when the default is off.
        assert "(s.mcp_audit_retention_days IS NOT NULL OR :default_days > 0)" in sql

    async def test_repeats_while_batches_are_full(self, monkeypatch):
        get_db, executed = _fake_delete_db([2, 2, 1])
        monkeypatch.setattr(batch_delete, "get_db", get_db)
        deleted = await delete_expired_audit_logs(default_days=30, min_days=7, batch_size=2)
        assert deleted == 5
        assert len(executed) == 3

    @pytest.mark.parametrize("default_days", [0, -5])
    @pytest.mark.parametrize(
        "delete", [delete_expired_audit_logs, delete_expired_approval_requests]
    )
    async def test_default_off_keeps_logs_of_orgs_without_a_period(
        self, monkeypatch, default_days, delete
    ):
        # Before per-organization retention, a default of 0 or less meant
        # "older than now or later", so every log was deleted each night.
        # Now the default passes through unclamped and the guard skips every
        # organization that has no period of its own.
        get_db, executed = _fake_delete_db([0])
        monkeypatch.setattr(batch_delete, "get_db", get_db)
        await delete(default_days=default_days, min_days=7)
        sql, params = executed[0]
        assert params["default_days"] == default_days
        assert "(s.mcp_audit_retention_days IS NOT NULL OR :default_days > 0)" in sql

    async def test_approvals_keep_pending_requests(self, monkeypatch):
        get_db, executed = _fake_delete_db([0])
        monkeypatch.setattr(batch_delete, "get_db", get_db)
        await delete_expired_approval_requests(default_days=30, min_days=7)
        sql, _ = executed[0]
        assert "ai_gateway_mcp_approval_requests" in sql
        assert "(l.status != 'pending' OR l.expires_at < NOW())" in sql


class TestRetentionConfig:
    async def test_reports_the_default_and_the_floor(self, monkeypatch):
        monkeypatch.setattr(settings, "mcp_audit_retention_days", 45)
        monkeypatch.setattr(settings, "mcp_audit_retention_min_days", 10)
        body = await retention_router.get_retention_config(MagicMock())
        assert body == {"mcp_audit_retention_days": 45, "mcp_audit_retention_min_days": 10}


class TestMinDaysSetting:
    @pytest.mark.parametrize(
        "raw, expected",
        [("0", 1), ("-5", 1), ("5000", MAX_RETENTION_DAYS), ("7", 7)],
    )
    def test_floor_is_clamped_to_one_through_the_maximum(self, monkeypatch, raw, expected):
        from config import Settings

        monkeypatch.setenv("MCP_AUDIT_RETENTION_MIN_DAYS", raw)
        assert Settings().mcp_audit_retention_min_days == expected
