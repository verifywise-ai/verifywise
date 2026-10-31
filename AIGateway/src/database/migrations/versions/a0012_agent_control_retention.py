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
