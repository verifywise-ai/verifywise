"""create-llm-evals-org-settings

Revision ID: i20261111233000
Revises: h20261111220035
Create Date: 2026-11-11

Per-organization LLM Evals settings. One row per organization, created the
first time an Admin saves a setting.

``arena_enabled`` is nullable on purpose: NULL means "never set", and the
effective value is then derived from whether the organization already has
Arena comparisons (see controllers/org_settings.py). That keeps Arena on for
organizations that used it before the setting existed, including ones whose
comparisons arrive later through the legacy-schema data migration, without a
one-time backfill.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'i20261111233000'
down_revision: Union[str, None] = 'h20261111220035'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text('''
        CREATE TABLE IF NOT EXISTS llm_evals_org_settings (
            organization_id INTEGER PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
            arena_enabled BOOLEAN,
            updated_by VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    '''))


def downgrade() -> None:
    op.execute(sa.text('DROP TABLE IF EXISTS llm_evals_org_settings CASCADE;'))
