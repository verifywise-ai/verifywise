"""per-agent policy scope + decision provenance

Adds:
  1. applies_to_agent_keys on ai_gateway_mcp_guardrail_rules — lets a guardrail /
     require_approval rule be scoped to specific agent keys (empty/NULL = all
     agents, preserving today's org-wide behavior).
  2. matched_rule_id + matched_rule_name on ai_gateway_mcp_audit_logs — records
     which rule produced a block / approval decision, so the Activity log can show
     *why* a tool call was stopped.

Revision ID: a0009
Revises: a0008
Create Date: 2026-07-23
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0009"
down_revision: Union[str, None] = "a0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET search_path TO verifywise")

    # 1. Per-agent scope on guardrail rules. Empty array (the default) means the
    #    rule applies to every agent key — identical to prior behavior.
    op.execute(
        "ALTER TABLE ai_gateway_mcp_guardrail_rules "
        "ADD COLUMN IF NOT EXISTS applies_to_agent_keys INTEGER[] NOT NULL DEFAULT '{}'"
    )

    # 2. Decision provenance on the audit log.
    op.execute(
        "ALTER TABLE ai_gateway_mcp_audit_logs "
        "ADD COLUMN IF NOT EXISTS matched_rule_id INTEGER NULL"
    )
    op.execute(
        "ALTER TABLE ai_gateway_mcp_audit_logs "
        "ADD COLUMN IF NOT EXISTS matched_rule_name TEXT NULL"
    )


def downgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute(
        "ALTER TABLE ai_gateway_mcp_guardrail_rules DROP COLUMN IF EXISTS applies_to_agent_keys"
    )
    op.execute("ALTER TABLE ai_gateway_mcp_audit_logs DROP COLUMN IF EXISTS matched_rule_id")
    op.execute("ALTER TABLE ai_gateway_mcp_audit_logs DROP COLUMN IF EXISTS matched_rule_name")
