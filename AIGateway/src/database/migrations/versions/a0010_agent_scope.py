"""explicit agent scope on MCP guardrail rules

a0009 scoped a rule to agents with applies_to_agent_keys alone, where an empty
list meant "every agent". Any path that emptied the list widened the rule to the
whole organization. This adds agent_scope:

  'all'      the rule applies to every agent (the default, prior behavior)
  'selected' the rule applies only to the keys in applies_to_agent_keys; with
             none left it applies to no agent

Rules that already list agent keys become 'selected', which is what their
non-empty list meant under a0009.

Revision ID: a0010
Revises: a0009
Create Date: 2026-10-09
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0010"
down_revision: Union[str, None] = "a0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute(
        "ALTER TABLE ai_gateway_mcp_guardrail_rules "
        "ADD COLUMN IF NOT EXISTS agent_scope TEXT NOT NULL DEFAULT 'all' "
        "CONSTRAINT ai_gateway_mcp_guardrail_rules_agent_scope_check "
        "CHECK (agent_scope IN ('all', 'selected'))"
    )
    op.execute(
        "UPDATE ai_gateway_mcp_guardrail_rules SET agent_scope = 'selected' "
        "WHERE cardinality(applies_to_agent_keys) > 0"
    )


def downgrade() -> None:
    op.execute("SET search_path TO verifywise")
    # Back under a0009 an empty list means every agent, so a 'selected' rule
    # with no keys left would widen. Switch those off first.
    op.execute(
        "UPDATE ai_gateway_mcp_guardrail_rules SET is_active = false "
        "WHERE agent_scope = 'selected' AND cardinality(applies_to_agent_keys) = 0"
    )
    op.execute("ALTER TABLE ai_gateway_mcp_guardrail_rules DROP COLUMN IF EXISTS agent_scope")
