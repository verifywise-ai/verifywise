"""user references ON DELETE SET NULL

Twelve AI Gateway columns referenced users(id) with no ON DELETE action, so
deleting a VerifyWise user who had ever created an agent key, MCP server,
guardrail, endpoint, virtual key or API key, decided an approval, or appears
in spend / guardrail logs or change history failed with a foreign key
violation. The backend's user deletion only clears references in core tables.

Each of these constraints is recreated with ON DELETE SET NULL, matching the
prompt tables (a0001) and enforcement_mode_changed_by (a0014). The rows stay;
only the link to the deleted user is cleared, which the UI already shows as
an unknown user (every read joins users with LEFT JOIN).

The original constraints were declared inline, so their names were generated
by PostgreSQL. The migration finds each one by table, column and referenced
table instead of assuming a name, and skips tables that do not exist.

Large log tables (spend_logs, guardrail_logs) make a plain ADD FOREIGN KEY
slow while it locks users. Each constraint is therefore added NOT VALID and
then validated, every statement committing on its own, so users stays
writable during the scans.

Revision ID: a0016
Revises: a0015
Create Date: 2026-10-15
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0016"
down_revision: Union[str, None] = "a0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

USER_REFERENCES: tuple[tuple[str, str], ...] = (
    ("ai_gateway_api_keys", "created_by"),
    ("ai_gateway_endpoints", "created_by"),
    ("ai_gateway_virtual_keys", "created_by"),
    ("ai_gateway_spend_logs", "user_id"),
    ("ai_gateway_guardrails", "created_by"),
    ("ai_gateway_guardrail_logs", "user_id"),
    ("ai_gateway_endpoint_change_history", "changed_by_user_id"),
    ("ai_gateway_guardrail_change_history", "changed_by_user_id"),
    ("ai_gateway_mcp_agent_keys", "created_by"),
    ("ai_gateway_mcp_servers", "created_by"),
    ("ai_gateway_mcp_approval_requests", "decided_by"),
    ("ai_gateway_mcp_guardrail_rules", "created_by"),
)


def _recreate_fk(table: str, column: str, on_delete: str) -> str:
    """SQL that drops the FK from table.column to users and adds it back,
    NOT VALID, with the given ON DELETE clause ('' for the PostgreSQL default,
    NO ACTION). NOT VALID skips the table scan, so the locks this takes on the
    table and on users last only as long as the catalog change."""
    return f"""
DO $$
DECLARE
    fk_name text;
BEGIN
    IF to_regclass('verifywise.{table}') IS NULL THEN
        RETURN;
    END IF;
    FOR fk_name IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.contype = 'f'
           AND c.conrelid = 'verifywise.{table}'::regclass
           AND c.confrelid = 'verifywise.users'::regclass
           AND a.attname = '{column}'
    LOOP
        EXECUTE format('ALTER TABLE verifywise.{table} DROP CONSTRAINT %I', fk_name);
    END LOOP;
    ALTER TABLE verifywise.{table}
        ADD CONSTRAINT {table}_{column}_fkey
        FOREIGN KEY ({column}) REFERENCES verifywise.users(id) {on_delete} NOT VALID;
END $$;
"""


def _validate_fk(table: str, column: str) -> str:
    """SQL that validates the recreated FK. VALIDATE scans the table but takes
    only SHARE UPDATE EXCLUSIVE on it (and ROW SHARE on users), so reads and
    writes continue while it runs."""
    return f"""
DO $$
BEGIN
    IF to_regclass('verifywise.{table}') IS NOT NULL THEN
        ALTER TABLE verifywise.{table} VALIDATE CONSTRAINT {table}_{column}_fkey;
    END IF;
END $$;
"""


def _apply(on_delete: str) -> None:
    # Each statement commits on its own, so no lock is held across tables or
    # for the length of a scan (Alembic otherwise runs the whole upgrade in
    # one transaction and keeps every lock until the end).
    with op.get_context().autocommit_block():
        for table, column in USER_REFERENCES:
            op.execute(_recreate_fk(table, column, on_delete))
            op.execute(_validate_fk(table, column))


def upgrade() -> None:
    _apply("ON DELETE SET NULL")


def downgrade() -> None:
    _apply("")
