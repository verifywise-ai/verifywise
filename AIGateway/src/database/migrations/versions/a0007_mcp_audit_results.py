"""Add tool result + events columns to mcp audit logs

Revision ID: a0007
Revises: a0006
Create Date: 2026-06-16
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0007"
down_revision: Union[str, None] = "a0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute("""
        ALTER TABLE ai_gateway_mcp_audit_logs
            ADD COLUMN IF NOT EXISTS tool_use_id      VARCHAR(128),
            ADD COLUMN IF NOT EXISTS result_response  JSONB,
            ADD COLUMN IF NOT EXISTS result_truncated BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS events           JSONB DEFAULT '[]'
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gw_mcp_audit_invocation
            ON ai_gateway_mcp_audit_logs(organization_id, session_id, tool_use_id)
    """)


def downgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute("DROP INDEX IF EXISTS idx_gw_mcp_audit_invocation")
    op.execute("""
        ALTER TABLE ai_gateway_mcp_audit_logs
            DROP COLUMN IF EXISTS tool_use_id,
            DROP COLUMN IF EXISTS result_response,
            DROP COLUMN IF EXISTS result_truncated,
            DROP COLUMN IF EXISTS events
    """)
