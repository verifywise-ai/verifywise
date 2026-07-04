"""Add arguments_hash to MCP approval requests for argument-scoped approvals.

Approvals are scoped to the exact arguments of a tool call. The hash lets the
gateway match an approval (or pending request) to a specific call rather than
to the tool name alone, so approving one call no longer authorizes every future
call of the same tool.

Revision ID: a0005
Revises: a0004
Create Date: 2026-06-15
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a0005"
down_revision: Union[str, None] = "a0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add arguments_hash column + index to ai_gateway_mcp_approval_requests."""
    op.execute("SET search_path TO verifywise")

    op.execute("""
        ALTER TABLE ai_gateway_mcp_approval_requests
        ADD COLUMN IF NOT EXISTS arguments_hash VARCHAR(64)
    """)

    # Speeds up the per-call approval lookups (org + agent_key + tool + arguments).
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gw_mcp_approval_lookup
        ON ai_gateway_mcp_approval_requests(
            organization_id, agent_key_id, tool_name, arguments_hash, status
        )
    """)


def downgrade() -> None:
    """Remove arguments_hash column + index."""
    op.execute("SET search_path TO verifywise")

    op.execute("DROP INDEX IF EXISTS idx_gw_mcp_approval_lookup")
    op.execute("""
        ALTER TABLE ai_gateway_mcp_approval_requests
        DROP COLUMN IF EXISTS arguments_hash
    """)
