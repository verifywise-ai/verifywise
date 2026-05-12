"""add-endpoint-url-to-models

Revision ID: g20260506000000
Revises: f20260412000000
Create Date: 2026-05-06

Adds endpoint_url column to llm_evals_models so custom endpoints can be stored.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g20260506000000'
down_revision: Union[str, None] = 'f20260412000000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text('''
        ALTER TABLE verifywise.llm_evals_models
        ADD COLUMN IF NOT EXISTS endpoint_url TEXT NULL;
    '''))


def downgrade() -> None:
    op.execute(sa.text('''
        ALTER TABLE verifywise.llm_evals_models
        DROP COLUMN IF EXISTS endpoint_url;
    '''))
