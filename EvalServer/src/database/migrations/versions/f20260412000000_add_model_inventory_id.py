"""add-model-inventory-id

Revision ID: f20260412000000
Revises: e20260319200000
Create Date: 2026-04-12

Adds nullable model_inventory_id column to llm_evals_experiments and
llm_evals_bias_audits for optional linking to the model inventory.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f20260412000000'
down_revision: Union[str, None] = 'e20260319200000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add model_inventory_id to experiments and bias audits."""
    op.execute(sa.text('''
        ALTER TABLE verifywise.llm_evals_experiments
        ADD COLUMN IF NOT EXISTS model_inventory_id INTEGER NULL;
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_experiments_model_inventory_id
        ON verifywise.llm_evals_experiments(model_inventory_id);
    '''))

    op.execute(sa.text('''
        ALTER TABLE verifywise.llm_evals_bias_audits
        ADD COLUMN IF NOT EXISTS model_inventory_id INTEGER NULL;
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_bias_audits_model_inventory_id
        ON verifywise.llm_evals_bias_audits(model_inventory_id);
    '''))


def downgrade() -> None:
    """Remove model_inventory_id columns."""
    op.execute(sa.text('''
        DROP INDEX IF EXISTS verifywise.idx_llm_evals_bias_audits_model_inventory_id;
    '''))
    op.execute(sa.text('''
        ALTER TABLE verifywise.llm_evals_bias_audits
        DROP COLUMN IF EXISTS model_inventory_id;
    '''))
    op.execute(sa.text('''
        DROP INDEX IF EXISTS verifywise.idx_llm_evals_experiments_model_inventory_id;
    '''))
    op.execute(sa.text('''
        ALTER TABLE verifywise.llm_evals_experiments
        DROP COLUMN IF EXISTS model_inventory_id;
    '''))
