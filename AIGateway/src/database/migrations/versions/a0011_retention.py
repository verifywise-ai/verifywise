"""retention: spend log period, opt-in automatic purge, history indexes

Adds the per-organization spend log retention period and an opt-in switch for
the scheduled purge of gateway logs (off by default), plus (organization_id,
changed_at) indexes on both change-history tables for the audit retention job.

Revision ID: a0011
Revises: a0010
Create Date: 2026-10-11
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0011"
down_revision: Union[str, None] = "a0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute("""
        ALTER TABLE ai_gateway_guardrail_settings
        ADD COLUMN IF NOT EXISTS spend_log_retention_days INTEGER NOT NULL DEFAULT 90
            CHECK (spend_log_retention_days >= 1)
    """)
    op.execute("""
        ALTER TABLE ai_gateway_guardrail_settings
        ADD COLUMN IF NOT EXISTS auto_purge_enabled BOOLEAN NOT NULL DEFAULT false
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_gw_ep_history_org_changed "
        "ON ai_gateway_endpoint_change_history(organization_id, changed_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_gw_gr_history_org_changed "
        "ON ai_gateway_guardrail_change_history(organization_id, changed_at)"
    )


def downgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute("DROP INDEX IF EXISTS idx_gw_gr_history_org_changed")
    op.execute("DROP INDEX IF EXISTS idx_gw_ep_history_org_changed")
    op.execute(
        "ALTER TABLE ai_gateway_guardrail_settings DROP COLUMN IF EXISTS auto_purge_enabled"
    )
    op.execute(
        "ALTER TABLE ai_gateway_guardrail_settings DROP COLUMN IF EXISTS spend_log_retention_days"
    )
