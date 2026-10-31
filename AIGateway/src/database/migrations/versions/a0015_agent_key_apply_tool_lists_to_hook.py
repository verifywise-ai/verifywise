"""per-agent-key opt-in for tool lists on native tool calls

Adds apply_tool_lists_to_hook to MCP agent keys. An agent key's
allowed_tools / blocked_tools lists were written for MCP proxy tools. Applying
them to native tool calls (POST /v1/mcp/hook: the shell hook and the Python
SDK) would deny Bash, Edit and other built-in tools for any key shared with a
coding agent, so the hook checks the lists only when this flag is true.

  false  the lists apply to the MCP proxy only (the default, prior behavior)
  true   the lists also apply to native tool calls: an enforce key is denied,
         a monitor key gets a would_block outcome with source 'tool_acl'

Revision ID: a0015
Revises: a0014
Create Date: 2026-10-15
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0015"
down_revision: Union[str, None] = "a0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute(
        "ALTER TABLE ai_gateway_mcp_agent_keys "
        "ADD COLUMN IF NOT EXISTS apply_tool_lists_to_hook BOOLEAN NOT NULL DEFAULT FALSE"
    )


def downgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute(
        "ALTER TABLE ai_gateway_mcp_agent_keys DROP COLUMN IF EXISTS apply_tool_lists_to_hook"
    )
