"""per-agent-key enforcement mode (monitor only)

Adds enforcement_mode to MCP agent keys:

  'enforce'  policies block and pause tool calls (the default, prior behavior)
  'monitor'  every policy is still evaluated, but the call is let through and
             the audit row records what would have happened (result_status
             'would_block' / 'would_need_approval'); rate limits and the circuit
             breaker stay enforced

enforcement_mode_changed_at / enforcement_mode_changed_by record when and by
which VerifyWise user the mode last changed (stamped on create only for a
non-default mode). changed_by references users ON DELETE SET NULL, so deleting
a user who once changed a key's mode clears the reference instead of failing.

Revision ID: a0014
Revises: a0013
Create Date: 2026-10-15
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0014"
down_revision: Union[str, None] = "a0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute(
        "ALTER TABLE ai_gateway_mcp_agent_keys "
        "ADD COLUMN IF NOT EXISTS enforcement_mode VARCHAR(20) NOT NULL DEFAULT 'enforce' "
        "CONSTRAINT ai_gateway_mcp_agent_keys_enforcement_mode_check "
        "CHECK (enforcement_mode IN ('enforce', 'monitor'))"
    )
    op.execute(
        "ALTER TABLE ai_gateway_mcp_agent_keys "
        "ADD COLUMN IF NOT EXISTS enforcement_mode_changed_at TIMESTAMPTZ NULL"
    )
    op.execute(
        "ALTER TABLE ai_gateway_mcp_agent_keys "
        "ADD COLUMN IF NOT EXISTS enforcement_mode_changed_by INTEGER NULL "
        "REFERENCES users(id) ON DELETE SET NULL"
    )


def downgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute(
        "ALTER TABLE ai_gateway_mcp_agent_keys "
        "DROP COLUMN IF EXISTS enforcement_mode_changed_by"
    )
    op.execute(
        "ALTER TABLE ai_gateway_mcp_agent_keys "
        "DROP COLUMN IF EXISTS enforcement_mode_changed_at"
    )
    op.execute(
        "ALTER TABLE ai_gateway_mcp_agent_keys DROP COLUMN IF EXISTS enforcement_mode"
    )
