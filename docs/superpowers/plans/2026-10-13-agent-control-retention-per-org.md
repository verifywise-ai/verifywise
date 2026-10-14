# Agent Control retention per organization: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each organization set its own retention period for Agent Control tool-call logs and decided approvals, with the deployment setting as the default and an operator floor.

**Architecture:** The period is a nullable column on the AI Gateway's per-organization settings row (`ai_gateway_guardrail_settings`), saved through the existing guardrail settings PUT (validation, previous value, Express audit ledger entry). The daily cleanup deletes per organization in one batched statement that joins that row. The Data retention tab's Agent Control row becomes editable.

**Tech Stack:** AI Gateway (FastAPI, SQLAlchemy text SQL, Alembic, pytest with fake DB sessions); Express backend (TypeScript, Jest); React client (MUI, Vitest, Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-13-agent-control-retention-per-org-design.md`

## Global Constraints

- Column: `ai_gateway_guardrail_settings.mcp_audit_retention_days INTEGER NULL`, CHECK `IS NULL OR >= 1`. `NULL` = use the deployment default.
- Deployment default: `MCP_AUDIT_RETENTION_DAYS` (`settings.mcp_audit_retention_days`, default 30). `<= 0` keeps logs indefinitely for organizations without their own period.
- Floor: `MCP_AUDIT_RETENTION_MIN_DAYS` (`settings.mcp_audit_retention_min_days`, default 7). Saves accept an integer from the floor to 3650 (`MAX_RETENTION_DAYS` in `AIGateway/src/crud/purge.py`) or `null`. The cleanup applies the floor to organization-set periods only, never to the deployment default.
- Effective period in SQL: `CASE WHEN s.mcp_audit_retention_days IS NULL THEN :default_days ELSE GREATEST(s.mcp_audit_retention_days, :min_days) END`; rows of organizations with no own period are skipped when `:default_days <= 0`.
- Approvals keep their existing condition: `status != 'pending' OR expires_at < NOW()`.
- Admin only (gateway `require_admin`; tab gated on `organization.admin`, unchanged).
- UI: sentence case, 30px controls, house components (`Field`, `Toggle`, `StandardModal`), every new user-facing string in de, fr and es in `Clients/src/i18n/translations.ts`.
- No `console.log`. Commits through the pre-commit hook (no `--no-verify`).

## Review Focus

1. **Old gateway, new backend (rolling deploy):** the retention config has no `mcp_audit_retention_min_days` → the Agent Control row shows as unavailable instead of offering an edit the gateway would reject. Test in Task 2.
2. **Deployment default `<= 0` with no own period:** the row shows "kept indefinitely (deployment default)" and the cleanup deletes nothing for that organization. Tests in Task 1 (SQL params/condition) and Task 2 (row).
3. **Stored value below a later-raised floor:** the cleanup uses the floor, not the stored value. Test in Task 1.
4. **Reset to default when the default is shorter than the own period:** the save is confirmed as a shortening. Test in Task 3.
5. **Boolean or string days (`true`, `"30"`) in the PUT body:** 400, never stored. Test in Task 1.

---

### Task 1: AI Gateway: column, validation, per-organization cleanup

**Files:**
- Create: `AIGateway/src/database/migrations/versions/a0012_agent_control_retention.py`
- Modify: `AIGateway/src/config.py` (next to `mcp_audit_retention_days`, line 26)
- Modify: `AIGateway/src/crud/guardrails.py` (`_SETTINGS_DEFAULTS` ~line 222, `_NULLABLE_SETTING_KEYS`, `_validate_settings_input`, `_PREVIOUS_RETENTION_KEYS`, `_LOCK_PREVIOUS_RETENTION_SQL`, `_UPDATE_SETTINGS_SQL`)
- Modify: `AIGateway/src/utils/batch_delete.py` (add a per-organization variant)
- Modify: `AIGateway/src/crud/mcp_audit.py:280` and `AIGateway/src/crud/mcp_approvals.py:343`
- Modify: `AIGateway/src/routers/mcp_audit.py` (`/cleanup`, `/cleanup-approvals`)
- Modify: `AIGateway/src/routers/retention.py` (`/config`)
- Create: `AIGateway/tests/test_agent_control_retention.py`
- Modify: `.github/workflows/aigateway-checks.yml` (pytest file list, ~line 89)

**Interfaces:**
- Produces: `GET /internal/retention/config` → `{ "mcp_audit_retention_days": int, "mcp_audit_retention_min_days": int }`.
- Produces: `GET/PUT /internal/guardrails/settings` → `settings.mcp_audit_retention_days: int | None`; PUT accepts `mcp_audit_retention_days: int | None`; the response's `previous_retention` includes `mcp_audit_retention_days`.
- Produces: `batch_delete_expired_per_org(table: str, where_clause: str, default_days: int, min_days: int, batch_size: int = 5000) -> int` in `utils/batch_delete.py`.
- Produces: `delete_expired_audit_logs(default_days: int, min_days: int, batch_size: int = 5000) -> int` and `delete_expired_approval_requests(default_days: int, min_days: int, batch_size: int = 5000) -> int`.

- [ ] **Step 1: Write the failing tests**

Create `AIGateway/tests/test_agent_control_retention.py`, following the fake-DB pattern of `tests/test_retention.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd AIGateway/tests && ../venv/bin/python -m pytest test_agent_control_retention.py -q`
Expected: FAIL (`KeyError: 'mcp_audit_retention_days'`, unexpected keyword `default_days`, missing config key).

- [ ] **Step 3: Add the setting and the migration**

`AIGateway/src/config.py`, directly under `mcp_audit_retention_days: int = 30`:

```python
    # Shortest Agent Control log retention an organization may set
    # (MCP_AUDIT_RETENTION_MIN_DAYS). Never applied to the default above.
    mcp_audit_retention_min_days: int = 7
```

`AIGateway/src/database/migrations/versions/a0012_agent_control_retention.py`:

```python
"""agent control retention per organization

Adds an optional per-organization retention period for Agent Control
tool-call logs and decided approvals. NULL means the deployment default
(MCP_AUDIT_RETENTION_DAYS).

Revision ID: a0012
Revises: a0011
Create Date: 2026-10-13
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0012"
down_revision: Union[str, None] = "a0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute("""
        ALTER TABLE ai_gateway_guardrail_settings
        ADD COLUMN IF NOT EXISTS mcp_audit_retention_days INTEGER NULL
            CHECK (mcp_audit_retention_days IS NULL OR mcp_audit_retention_days >= 1)
    """)


def downgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute(
        "ALTER TABLE ai_gateway_guardrail_settings DROP COLUMN IF EXISTS mcp_audit_retention_days"
    )
```

- [ ] **Step 4: Settings save: column, validation, previous value**

In `AIGateway/src/crud/guardrails.py`:

1. Add `from config import settings` with the module's other imports (check it is not already imported).
2. In `_SETTINGS_DEFAULTS`, after `"auto_purge_enabled": False,` add `"mcp_audit_retention_days": None,` and update the comment above the dict to say the defaults match migrations a0001, a0011 and a0012.
3. Replace `_NULLABLE_SETTING_KEYS` and its comment:

```python
# The two body-logging columns and the Agent Control period are nullable; every
# other setting is NOT NULL. A null Agent Control period means the deployment
# default (MCP_AUDIT_RETENTION_DAYS).
_NULLABLE_SETTING_KEYS = ("log_request_body", "log_response_body", "mcp_audit_retention_days")
```

4. At the end of `_validate_settings_input`, add:

```python
    if data.get("mcp_audit_retention_days") is not None:
        value = data["mcp_audit_retention_days"]
        floor = settings.mcp_audit_retention_min_days
        if (
            isinstance(value, bool)
            or not isinstance(value, int)
            or value < floor
            or value > MAX_RETENTION_DAYS
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "mcp_audit_retention_days must be an integer from "
                    f"{floor} to {MAX_RETENTION_DAYS}, or null for the deployment default"
                ),
            )
```

5. Add `"mcp_audit_retention_days",` to `_PREVIOUS_RETENTION_KEYS`.
6. In `_LOCK_PREVIOUS_RETENTION_SQL`, change the first select line to `SELECT log_retention_days, spend_log_retention_days, auto_purge_enabled, mcp_audit_retention_days,`.
7. In `_UPDATE_SETTINGS_SQL`, after the `auto_purge_enabled = ...` line add:

```
                    mcp_audit_retention_days = CASE WHEN :set_mcp_audit_retention_days THEN :mcp_audit_retention_days ELSE mcp_audit_retention_days END,
```

- [ ] **Step 5: Per-organization cleanup**

Append to `AIGateway/src/utils/batch_delete.py`:

```python
async def batch_delete_expired_per_org(
    table: str,
    where_clause: str,
    default_days: int,
    min_days: int,
    batch_size: int = 5000,
) -> int:
    """Delete rows older than their organization's retention period, in batches.

    The period is the organization's own ``mcp_audit_retention_days`` from
    ai_gateway_guardrail_settings, raised to ``min_days`` if it is shorter,
    or ``default_days`` when the organization has none. With ``default_days``
    of 0 or less, organizations without their own period keep everything.
    ``where_clause`` refers to the table as ``l``; pass "" for no extra condition.

    Returns total number of deleted rows.
    """
    default_days = int(default_days)
    min_days = int(min_days)
    extra = " AND " + where_clause if where_clause else ""
    total_deleted = 0

    async with get_db() as db:
        while True:
            result = await db.execute(
                _text("""
                    DELETE FROM """ + table + """
                    WHERE id IN (
                        SELECT l.id FROM """ + table + """ l
                        LEFT JOIN ai_gateway_guardrail_settings s
                            ON s.organization_id = l.organization_id
                        WHERE (s.mcp_audit_retention_days IS NOT NULL OR :default_days > 0)
                          AND l.created_at < NOW() - INTERVAL '1 day' * (
                              CASE WHEN s.mcp_audit_retention_days IS NULL THEN :default_days
                                   ELSE GREATEST(s.mcp_audit_retention_days, :min_days) END
                          )
                        """ + extra + """
                        LIMIT :batch_size
                    )
                    RETURNING id
                """),
                {
                    "batch_size": batch_size,
                    "default_days": default_days,
                    "min_days": min_days,
                },
            )
            deleted = len(result.fetchall())
            await db.commit()
            total_deleted += deleted
            if deleted < batch_size:
                break

    return total_deleted
```

Replace `delete_expired_audit_logs` in `AIGateway/src/crud/mcp_audit.py`:

```python
async def delete_expired_audit_logs(
    default_days: int, min_days: int, batch_size: int = 5000
) -> int:
    """Delete audit logs older than each organization's retention period, in batches."""
    from utils.batch_delete import batch_delete_expired_per_org

    return await batch_delete_expired_per_org(
        table="ai_gateway_mcp_audit_logs",
        where_clause="",
        default_days=default_days,
        min_days=min_days,
        batch_size=batch_size,
    )
```

Replace `delete_expired_approval_requests` in `AIGateway/src/crud/mcp_approvals.py`:

```python
async def delete_expired_approval_requests(
    default_days: int, min_days: int, batch_size: int = 5000
) -> int:
    """Delete decided or expired approval requests older than each organization's
    retention period, in batches."""
    from utils.batch_delete import batch_delete_expired_per_org

    return await batch_delete_expired_per_org(
        table="ai_gateway_mcp_approval_requests",
        where_clause="(l.status != 'pending' OR l.expires_at < NOW())",
        default_days=default_days,
        min_days=min_days,
        batch_size=batch_size,
    )
```

Run `grep -rn "delete_expired_audit_logs\|delete_expired_approval_requests\|batch_delete_expired(" AIGateway/src AIGateway/tests` and update every caller. In `AIGateway/src/routers/mcp_audit.py` the two cleanup endpoints become:

```python
    deleted = await delete_expired_audit_logs(
        settings.mcp_audit_retention_days, settings.mcp_audit_retention_min_days
    )
```

```python
    deleted = await delete_expired_approval_requests(
        settings.mcp_audit_retention_days, settings.mcp_audit_retention_min_days
    )
```

Keep `batch_delete_expired` if another caller still uses it; delete it only if the grep shows no caller left.

In `AIGateway/src/routers/retention.py`:

```python
@router.get("/config")
async def get_retention_config(request: Request):
    return {
        "mcp_audit_retention_days": settings.mcp_audit_retention_days,
        "mcp_audit_retention_min_days": settings.mcp_audit_retention_min_days,
    }
```

- [ ] **Step 6: Run the tests**

Run: `cd AIGateway/tests && ../venv/bin/python -m pytest test_agent_control_retention.py test_retention.py -q`
Expected: all pass. If `test_retention.py` checks the exact config body or the settings column list, update those assertions to include the new key.

- [ ] **Step 7: Verify the migration and the cleanup SQL against the local database**

Run the migration up, down and up again (dev DB is PostgreSQL 16 on :5432; credentials in `Servers/.env`):

```bash
cd AIGateway/src && ../venv/bin/alembic upgrade head && ../venv/bin/alembic downgrade -1 && ../venv/bin/alembic upgrade head
```

Expected: no errors; `aigateway_alembic_version` is `a0012`.

Then run the cleanup's selection inside a rolled-back transaction with `psql` (same credentials), with three organizations: A with an own period of 10 days, B with none, C with an own period of 3 (below a floor of 7). Insert audit log rows aged 5, 8, 12 and 40 days for each (fill the table's NOT NULL columns from `a0004_create_mcp_gateway_tables.py`), run the `SELECT l.id ...` part of the statement with `default_days = 30, min_days = 7`, and confirm: A selects the 12- and 40-day rows; B selects the 40-day row; C selects the 8-, 12- and 40-day rows. Repeat with `default_days = 0`: B selects nothing. End with `ROLLBACK`.

- [ ] **Step 8: Add the test file to CI and commit**

In `.github/workflows/aigateway-checks.yml`, add `tests/test_agent_control_retention.py \` after `tests/test_retention.py \`.

```bash
git add AIGateway/src AIGateway/tests/test_agent_control_retention.py .github/workflows/aigateway-checks.yml
git commit -m "feat(ai-gateway): per-organization Agent Control log retention"
```

---

### Task 2: Express: ledger entry and the Data retention row

**Files:**
- Modify: `Servers/utils/aiGatewayRetention.constants.ts` (`GATEWAY_DEFAULTS`)
- Modify: `Servers/controllers/aiGatewaySettings.ctrl.ts` (`RETENTION_LABELS`, `formatValue`)
- Modify: `Servers/controllers/dataRetention.ctrl.ts` (`RetentionRow`, the `agent_control_logs` row ~line 156-220)
- Test: `Servers/controllers/__tests__/aiGatewaySettings.ctrl.test.ts`, `Servers/controllers/__tests__/dataRetention.ctrl.test.ts`, `Servers/utils/__tests__/aiGatewayRetention.constants.test.ts` (if it asserts the object)

**Interfaces:**
- Consumes (Task 1): `GET /internal/retention/config` → `{ mcp_audit_retention_days, mcp_audit_retention_min_days }`; `GET /internal/guardrails/settings` → `{ settings: { mcp_audit_retention_days: number | null, ... } | null }`.
- Produces: the `agent_control_logs` row in `GET /api/data-retention`:
  `{ key: "agent_control_logs", period: { unit: "days", value } | null, automaticDeletion: "yes" | "no", lastCleanup: null, source: "app", usesDeploymentDefault: boolean, deploymentDefaultDays: number, minDays: number }`, or `{ ..., unavailable: true }`. `RetentionRow` gains optional `usesDeploymentDefault?: boolean; deploymentDefaultDays?: number; minDays?: number;`.

- [ ] **Step 1: Write the failing tests**

In `dataRetention.ctrl.test.ts`, replace the existing Agent Control expectations (the test near line 150 that expects `source: "deployment"`) and add cases. Use the file's existing `aiGatewayRequest` mock pattern (it switches on `path`):

```ts
  describe("agent_control_logs row", () => {
    const mockGateway = (settings: Record<string, unknown> | null, config: unknown) =>
      m(aiGatewayRequest).mockImplementation(async (_method: string, path: string) =>
        path === "/internal/guardrails/settings" ? { settings } : config,
      );

    it("uses the deployment default when the organization has no period", async () => {
      mockGateway({}, { mcp_audit_retention_days: 30, mcp_audit_retention_min_days: 7 });
      const res = createRes();
      await getDataRetention(createReq(), res);
      expect(row(res, "agent_control_logs")).toMatchObject({
        period: { unit: "days", value: 30 },
        automaticDeletion: "yes",
        source: "app",
        usesDeploymentDefault: true,
        deploymentDefaultDays: 30,
        minDays: 7,
      });
    });

    it("uses the organization's own period", async () => {
      mockGateway(
        { mcp_audit_retention_days: 90 },
        { mcp_audit_retention_days: 30, mcp_audit_retention_min_days: 7 },
      );
      const res = createRes();
      await getDataRetention(createReq(), res);
      expect(row(res, "agent_control_logs")).toMatchObject({
        period: { unit: "days", value: 90 },
        usesDeploymentDefault: false,
      });
    });

    it("shows kept indefinitely when the default is off and no period is set", async () => {
      mockGateway({}, { mcp_audit_retention_days: 0, mcp_audit_retention_min_days: 7 });
      const res = createRes();
      await getDataRetention(createReq(), res);
      expect(row(res, "agent_control_logs")).toMatchObject({
        period: null,
        automaticDeletion: "no",
        usesDeploymentDefault: true,
      });
    });

    it("is unavailable when the gateway does not report the floor (older gateway)", async () => {
      mockGateway({}, { mcp_audit_retention_days: 30 });
      const res = createRes();
      await getDataRetention(createReq(), res);
      expect(row(res, "agent_control_logs").unavailable).toBe(true);
    });
  });
```

Keep the existing "unavailable when settings are null / gateway fails" tests; update only the fields they assert.

In `aiGatewaySettings.ctrl.test.ts`, add to the `describeRetentionChanges` tests:

```ts
  it("describes an Agent Control period change and a reset to the default", () => {
    expect(
      describeRetentionChanges(
        { mcp_audit_retention_days: null },
        { mcp_audit_retention_days: 60 },
        { mcp_audit_retention_days: 60 },
      ),
    ).toEqual(["Agent Control log retention from the deployment default to 60 days"]);
    expect(
      describeRetentionChanges(
        { mcp_audit_retention_days: 60 },
        { mcp_audit_retention_days: null },
        { mcp_audit_retention_days: null },
      ),
    ).toEqual(["Agent Control log retention from 60 days to the deployment default"]);
  });

  it("treats an Agent Control-only save as retention-only", () => {
    expect(isRetentionOnlyUpdate({ mcp_audit_retention_days: 30 })).toBe(true);
  });
```

(Import `isRetentionOnlyUpdate` if the test file does not already.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Servers && npx jest controllers/__tests__/dataRetention.ctrl.test.ts controllers/__tests__/aiGatewaySettings.ctrl.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**

`Servers/utils/aiGatewayRetention.constants.ts`: add the key and say what null means:

```ts
export const GATEWAY_DEFAULTS = {
  log_retention_days: 90,
  spend_log_retention_days: 90,
  auto_purge_enabled: false,
  /** null: the deployment default (MCP_AUDIT_RETENTION_DAYS) applies. */
  mcp_audit_retention_days: null,
} as const;
```

`Servers/controllers/aiGatewaySettings.ctrl.ts`:

```ts
const RETENTION_LABELS: Record<RetentionKey, string> = {
  log_retention_days: "guardrail log retention",
  spend_log_retention_days: "spend log retention",
  auto_purge_enabled: "automatic deletion",
  mcp_audit_retention_days: "Agent Control log retention",
};

function formatValue(key: RetentionKey, value: unknown): string {
  if (key === "auto_purge_enabled") return value ? "on" : "off";
  if (key === "mcp_audit_retention_days" && value === null) return "the deployment default";
  return `${value} days`;
}
```

In `describeRetentionChanges`, `before[key] ?? GATEWAY_DEFAULTS[key]` already yields `null` for an unset period; keep it. Check that the `oldValue === after[key]` comparison skips a null-to-null save.

`Servers/controllers/dataRetention.ctrl.ts`: add to `RetentionRow`:

```ts
  /** Agent Control: the organization has no own period, so the deployment default applies. */
  usesDeploymentDefault?: boolean;
  /** Agent Control: the deployment default in days (0 or less = kept indefinitely). */
  deploymentDefaultDays?: number;
  /** Agent Control: the shortest period an organization may set. */
  minDays?: number;
```

Replace the `agentDays` / `agentUnavailable` block:

```ts
    const deploymentAgentDays =
      typeof retentionConfig?.mcp_audit_retention_days === "number"
        ? retentionConfig.mcp_audit_retention_days
        : null;
    const agentMinDays =
      typeof retentionConfig?.mcp_audit_retention_min_days === "number"
        ? retentionConfig.mcp_audit_retention_min_days
        : null;
    const ownAgentDays =
      typeof gatewaySettings.mcp_audit_retention_days === "number"
        ? gatewaySettings.mcp_audit_retention_days
        : null;
    // An older gateway reports no floor and cannot store a period: show the
    // row as unavailable rather than offer an edit it would reject.
    const agentUnavailable =
      gatewayUnavailable || deploymentAgentDays === null || agentMinDays === null;
    const agentDays = ownAgentDays ?? deploymentAgentDays ?? 0;
```

and the row:

```ts
      agentUnavailable
        ? unavailableRow("agent_control_logs", null)
        : {
            key: "agent_control_logs",
            period: daysPeriod(agentDays),
            automaticDeletion: agentDays > 0 ? "yes" : "no",
            lastCleanup: null,
            source: "app",
            usesDeploymentDefault: ownAgentDays === null,
            deploymentDefaultDays: deploymentAgentDays as number,
            minDays: agentMinDays as number,
          },
```

If `unavailableRow`'s second parameter type does not accept `null`, keep the previous inline unavailable shape instead (`period: null, automaticDeletion: "no", lastCleanup: null, source: "app", unavailable: true`).

- [ ] **Step 4: Run the tests**

Run: `cd Servers && npx jest controllers/__tests__/dataRetention.ctrl.test.ts controllers/__tests__/aiGatewaySettings.ctrl.test.ts utils/__tests__/aiGatewayRetention.constants.test.ts routes/__tests__/dataRetention.route.test.ts`
Expected: PASS. Then `cd Servers && npm run build && npm run format-check`.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/aiGatewayRetention.constants.ts Servers/controllers Servers/utils/__tests__
git commit -m "feat(retention): editable Agent Control row with the deployment default"
```

---

### Task 3: Frontend: edit the Agent Control period

**Files:**
- Modify: `Clients/src/application/repository/dataRetention.repository.ts` (`RetentionRow`, `GatewayRetentionUpdate`)
- Modify: `Clients/src/presentation/pages/SettingsPage/DataRetention/index.tsx` (period cell ~line 133)
- Modify: `Clients/src/presentation/pages/SettingsPage/DataRetention/EditRetentionModal.tsx`
- Modify: `Clients/src/i18n/translations.ts` (de, fr, es)
- Test: `Clients/src/presentation/pages/SettingsPage/DataRetention/__tests__/DataRetention.test.tsx`; create `Clients/src/presentation/pages/SettingsPage/DataRetention/__tests__/EditRetentionModal.agentControl.test.tsx`

**Interfaces:**
- Consumes (Task 2): the row fields `usesDeploymentDefault`, `deploymentDefaultDays`, `minDays`; `PUT /api/ai-gateway/guardrails/settings` with `{ mcp_audit_retention_days: number | null }` via the existing `updateGatewayRetention`.

- [ ] **Step 1: Write the failing tests**

Create `EditRetentionModal.agentControl.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import EditRetentionModal from "../EditRetentionModal";
import type { RetentionRow } from "../../../../../application/repository/dataRetention.repository";

const updateGatewayRetention = vi.fn();
vi.mock("../../../../../application/repository/dataRetention.repository", async (orig) => ({
  ...(await orig<object>()),
  updateGatewayRetention: (...args: unknown[]) => updateGatewayRetention(...args),
}));
vi.mock("../../../../../application/hooks/useDataRetention", () => ({
  useInvalidateDataRetention: () => vi.fn(),
}));

const agentRow = (overrides: Partial<RetentionRow> = {}): RetentionRow => ({
  key: "agent_control_logs",
  period: { unit: "days", value: 30 },
  automaticDeletion: "yes",
  lastCleanup: null,
  source: "app",
  usesDeploymentDefault: true,
  deploymentDefaultDays: 30,
  minDays: 7,
  ...overrides,
});

function open(row: RetentionRow) {
  const onClose = vi.fn();
  renderWithProviders(<EditRetentionModal row={row} rows={[row]} onClose={onClose} />);
  return onClose;
}

describe("EditRetentionModal: Agent Control logs", () => {
  beforeEach(() => updateGatewayRetention.mockReset().mockResolvedValue(undefined));

  it("saves an own period longer than the current one without confirming", async () => {
    open(agentRow());
    fireEvent.click(screen.getByRole("switch", { name: /use the deployment default/i }));
    fireEvent.change(screen.getByLabelText("Keep for (days)"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateGatewayRetention).toHaveBeenCalledWith({ mcp_audit_retention_days: 90 }),
    );
  });

  it("rejects a period below the floor", async () => {
    open(agentRow());
    fireEvent.click(screen.getByRole("switch", { name: /use the deployment default/i }));
    fireEvent.change(screen.getByLabelText("Keep for (days)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a number of at least 7")).toBeInTheDocument();
    expect(updateGatewayRetention).not.toHaveBeenCalled();
  });

  it("confirms before shortening, then saves", async () => {
    open(agentRow());
    fireEvent.click(screen.getByRole("switch", { name: /use the deployment default/i }));
    fireEvent.change(screen.getByLabelText("Keep for (days)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/will be deleted permanently/)).toBeInTheDocument();
    expect(updateGatewayRetention).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete records" }));
    await waitFor(() =>
      expect(updateGatewayRetention).toHaveBeenCalledWith({ mcp_audit_retention_days: 10 }),
    );
  });

  it("confirms a reset to a shorter deployment default", async () => {
    open(agentRow({ period: { unit: "days", value: 90 }, usesDeploymentDefault: false }));
    fireEvent.click(screen.getByRole("switch", { name: /use the deployment default/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/will be deleted permanently/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete records" }));
    await waitFor(() =>
      expect(updateGatewayRetention).toHaveBeenCalledWith({ mcp_audit_retention_days: null }),
    );
  });

  it("closes without saving when nothing changed", async () => {
    const onClose = open(agentRow());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateGatewayRetention).not.toHaveBeenCalled();
  });
});
```

Check the `Toggle` component renders `role="switch"` with its `ariaLabel` as the accessible name (read `Clients/src/presentation/components/Inputs/Toggle`); if not, select it the way existing tests for `Toggle` do.

In `DataRetention.test.tsx`, update the `agent_control_logs` fixture (near line 65) to `source: "app"`, `usesDeploymentDefault: true`, `deploymentDefaultDays: 30`, `minDays: 7`, remove its `deploymentSetting`, and add:

```tsx
  it("shows the Agent Control default and lets an Admin edit it", async () => {
    respond(buildRows());
    const row = await screen.findByTestId("retention-row-agent_control_logs");
    expect(within(row).getByText("30 days (deployment default)")).toBeInTheDocument();
    expect(within(row).getByTestId("retention-edit-agent_control_logs")).toBeInTheDocument();
  });
```

(Use the file's existing `periodLabel` output for 30 days; adjust the expected text if `periodLabel` renders days differently.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Clients && npx vitest run src/presentation/pages/SettingsPage/DataRetention`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

`dataRetention.repository.ts`: add to `RetentionRow` the three optional fields (`usesDeploymentDefault?: boolean; deploymentDefaultDays?: number; minDays?: number;`) and to `GatewayRetentionUpdate` `mcp_audit_retention_days?: number | null;`.

`index.tsx`, the period cell:

```tsx
                    {row.unavailable
                      ? "—"
                      : row.usesDeploymentDefault
                        ? fill(t("{period} (deployment default)"), {
                            period: periodLabel(t, row.period),
                          })
                        : periodLabel(t, row.period)}
```

`EditRetentionModal.tsx`:

1. State, next to `autoDelete`:

```tsx
  const [useDefault, setUseDefault] = useState(row.usesDeploymentDefault === true);
  // Set once an Agent Control change that shortens the period is waiting for the go-ahead.
  const [pendingAgent, setPendingAgent] = useState<{
    update: GatewayRetentionUpdate;
    days: number;
  } | null>(null);
  const isAgentControl = row.key === "agent_control_logs";
```

2. In `handleSubmit`, before the `if (row.key === "mrm_metrics")` branch:

```tsx
      if (isAgentControl) {
        if (pendingAgent !== null) {
          await saveGateway(pendingAgent.update);
          return;
        }
        const minDays = row.minDays ?? MIN_GATEWAY_RETENTION_DAYS;
        const days = useDefault ? null : validateNumber(minDays, MAX_GATEWAY_RETENTION_DAYS);
        if (!useDefault && days === null) return;
        const defaultDays = row.deploymentDefaultDays ?? 0;
        /** Days kept, with "kept indefinitely" (0 or less) as the longest. */
        const kept = (d: number) => (d > 0 ? d : Infinity);
        const currentKept = row.period?.unit === "days" ? row.period.value : Infinity;
        const nextKept = useDefault ? kept(defaultDays) : (days as number);
        const unchanged =
          useDefault === (row.usesDeploymentDefault === true) &&
          (useDefault || days === currentKept);
        if (unchanged) {
          await finish();
          return;
        }
        const update: GatewayRetentionUpdate = { mcp_audit_retention_days: useDefault ? null : days };
        if (nextKept < currentKept) {
          setPendingAgent({ update, days: nextKept });
          return;
        }
        await saveGateway(update);
        return;
      }
```

3. `const confirming = pendingDelete !== null || pendingGateway !== null || pendingAgent !== null;`, and in `saveGateway`'s catch also `setPendingAgent(null);`.

4. In the body, before the `pendingGateway !== null ? (` branch, render the Agent Control confirmation:

```tsx
      {pendingAgent !== null ? (
        <Typography sx={{ fontSize: 13 }}>
          {fill(
            t(
              "Tool-call logs and decided approvals older than {period} will be deleted permanently at the next daily cleanup. Deleted records cannot be restored.",
            ),
            { period: periodLabel(t, { unit: "days", value: pendingAgent.days }) },
          )}
        </Typography>
      ) : pendingGateway !== null ? (
```

(import `periodLabel` from `./retentionLabels`).

5. In the form stack, add the Agent Control fields:

```tsx
          {isAgentControl && (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Toggle
                  checked={useDefault}
                  onChange={(event) => setUseDefault(event.target.checked)}
                  ariaLabel={t("Use the deployment default")}
                />
                <Typography sx={{ fontSize: 13 }}>
                  {fill(t("Use the deployment default ({period})"), {
                    period: periodLabel(
                      t,
                      (row.deploymentDefaultDays ?? 0) > 0
                        ? { unit: "days", value: row.deploymentDefaultDays as number }
                        : null,
                    ),
                  })}
                </Typography>
              </Box>
              {!useDefault && (
                <Field
                  id="retention-days"
                  label={t("Keep for (days)")}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  error={error}
                  sx={FIELD_HEIGHT_SX}
                  helperText={fill(t("From {min} to {max} days."), {
                    min: row.minDays ?? MIN_GATEWAY_RETENTION_DAYS,
                    max: MAX_GATEWAY_RETENTION_DAYS,
                  })}
                />
              )}
            </>
          )}
```

When the toggle is switched off and `value` is empty (row kept indefinitely), the Field starts empty; that is fine.

6. Translations: add each new string to the de, fr and es dictionaries in `Clients/src/i18n/translations.ts`, next to related retention strings:
   - `"{period} (deployment default)"`: de `"{period} (Standard der Bereitstellung)"`, fr `"{period} (valeur par défaut du déploiement)"`, es `"{period} (valor predeterminado de la implementación)"`
   - `"Use the deployment default"`: de `"Standard der Bereitstellung verwenden"`, fr `"Utiliser la valeur par défaut du déploiement"`, es `"Usar el valor predeterminado de la implementación"`
   - `"Use the deployment default ({period})"`: de `"Standard der Bereitstellung verwenden ({period})"`, fr `"Utiliser la valeur par défaut du déploiement ({period})"`, es `"Usar el valor predeterminado de la implementación ({period})"`
   - `"From {min} to {max} days."`: de `"Von {min} bis {max} Tagen."`, fr `"De {min} à {max} jours."`, es `"De {min} a {max} días."`
   - `"Tool-call logs and decided approvals older than {period} will be deleted permanently at the next daily cleanup. Deleted records cannot be restored."`: de `"Tool-Call-Protokolle und entschiedene Genehmigungen, die älter als {period} sind, werden bei der nächsten täglichen Bereinigung dauerhaft gelöscht. Gelöschte Datensätze können nicht wiederhergestellt werden."`, fr `"Les journaux d'appels d'outils et les approbations traitées de plus de {period} seront définitivement supprimés lors du prochain nettoyage quotidien. Les enregistrements supprimés ne peuvent pas être restaurés."`, es `"Los registros de llamadas a herramientas y las aprobaciones resueltas de más de {period} se eliminarán de forma permanente en la próxima limpieza diaria. Los registros eliminados no se pueden restaurar."`

- [ ] **Step 4: Run the tests and gates**

Run: `cd Clients && npx vitest run src/presentation/pages/SettingsPage/DataRetention && npm run typecheck && npm run i18n:audit:strict && npm run lint -- --quiet`
Expected: PASS, 0 i18n gaps, 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add Clients/src
git commit -m "feat(retention): set the Agent Control period from the Data retention tab"
```

---

### Task 4: Docs and full verification

**Files:**
- Modify: `docs/technical/domains/data-retention.md` (table row "Agent Control logs"; "Admin-only rule" paragraph; "AI Gateway" section)
- Modify: `docs/technical/domains/agent-control.md` (retention mention; find it with `grep -n -i retention`)
- Modify: `docs/deployment/CONFIGURATION_REFERENCE.md` (next to `MCP_AUDIT_RETENTION_DAYS`)

- [ ] **Step 1: Update the docs**

- `data-retention.md` table row: `| Agent Control logs | ai_gateway_guardrail_settings.mcp_audit_retention_days per organization (null = deployment default MCP_AUDIT_RETENTION_DAYS; floor MCP_AUDIT_RETENTION_MIN_DAYS) | daily job mcp_audit_cleanup (calls the gateway) |`.
- `data-retention.md` "AI Gateway": a paragraph on migration `a0012`, the nullable column, the floor (organization periods only, never the default), the per-organization cleanup statement, and `GET /internal/retention/config` returning `mcp_audit_retention_min_days`. Note the ledger label "Agent Control log retention" with "the deployment default" for null in the Admin-only rule paragraph's list of retention keys.
- `agent-control.md`: one sentence that each organization can set its own period in Settings → Data retention, defaulting to `MCP_AUDIT_RETENTION_DAYS`.
- `CONFIGURATION_REFERENCE.md`: `MCP_AUDIT_RETENTION_DAYS` is now the default for organizations without their own period; add `MCP_AUDIT_RETENTION_MIN_DAYS` (default 7): the shortest period an organization may set; not applied to the default.

- [ ] **Step 2: Full gates**

Run each and record the result:
- `cd AIGateway/tests && ../venv/bin/python -m pytest test_agent_control_retention.py test_retention.py test_internal_key.py -q`
- `cd Servers && npm run build && npm run format-check && npm run test`
- `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run lint -- --quiet && npx vitest run && npm run build`
- Prettier check on changed Clients files (`npx prettier --check <files>`; the repo-wide `format-check` also scans the untracked `Clients/dist-analyze/`).

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(retention): Agent Control retention per organization"
```
