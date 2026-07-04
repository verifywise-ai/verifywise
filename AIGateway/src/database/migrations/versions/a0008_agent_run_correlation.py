"""agent run correlation: add agent_run_id + agent_run_path to spend + mcp audit

Revision ID: a0008
Revises: a0007
Create Date: 2026-06-17
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0008"
down_revision: Union[str, None] = "a0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET search_path TO verifywise")

    # Correlation key + reserved (unused in v1) path column on both tables
    op.execute("ALTER TABLE ai_gateway_spend_logs     ADD COLUMN IF NOT EXISTS agent_run_id TEXT NULL")
    op.execute("ALTER TABLE ai_gateway_spend_logs     ADD COLUMN IF NOT EXISTS agent_run_path TEXT NULL")
    op.execute("ALTER TABLE ai_gateway_mcp_audit_logs ADD COLUMN IF NOT EXISTS agent_run_id TEXT NULL")
    op.execute("ALTER TABLE ai_gateway_mcp_audit_logs ADD COLUMN IF NOT EXISTS agent_run_path TEXT NULL")

    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_gw_spend_run "
        "ON ai_gateway_spend_logs(organization_id, agent_run_id, created_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_gw_audit_run "
        "ON ai_gateway_mcp_audit_logs(organization_id, agent_run_id, created_at)"
    )

    # Backfill existing hook rows: the run id IS the session id (exact, cheap).
    op.execute(
        "UPDATE ai_gateway_mcp_audit_logs SET agent_run_id = session_id "
        "WHERE agent_run_id IS NULL AND session_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute("DROP INDEX IF EXISTS idx_gw_audit_run")
    op.execute("DROP INDEX IF EXISTS idx_gw_spend_run")
    op.execute("ALTER TABLE ai_gateway_mcp_audit_logs DROP COLUMN IF EXISTS agent_run_path")
    op.execute("ALTER TABLE ai_gateway_mcp_audit_logs DROP COLUMN IF EXISTS agent_run_id")
    op.execute("ALTER TABLE ai_gateway_spend_logs     DROP COLUMN IF EXISTS agent_run_path")
    op.execute("ALTER TABLE ai_gateway_spend_logs     DROP COLUMN IF EXISTS agent_run_id")
