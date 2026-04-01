"""Add model/provider access control columns to virtual keys.

Revision ID: a0003
Revises: a0002
Create Date: 2026-03-28
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a0003"
down_revision: Union[str, None] = "a0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add allowed/blocked models and providers columns to ai_gateway_virtual_keys."""
    op.execute("SET search_path TO verifywise")

    op.execute("""
        ALTER TABLE ai_gateway_virtual_keys
        ADD COLUMN IF NOT EXISTS allowed_models TEXT[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS blocked_models TEXT[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS allowed_providers TEXT[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS blocked_providers TEXT[] DEFAULT '{}'
    """)


def downgrade() -> None:
    """Remove model/provider access control columns."""
    op.execute("SET search_path TO verifywise")

    op.execute("""
        ALTER TABLE ai_gateway_virtual_keys
        DROP COLUMN IF EXISTS allowed_models,
        DROP COLUMN IF EXISTS blocked_models,
        DROP COLUMN IF EXISTS allowed_providers,
        DROP COLUMN IF EXISTS blocked_providers
    """)
