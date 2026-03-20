"""create-reports-table

Revision ID: d20260312180000
Revises: c20260303115117
Create Date: 2026-03-12

Stores generated evaluation reports (PDF/CSV) so they can be retrieved
without re-generation.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd20260312180000'
down_revision: Union[str, None] = 'c20260303115117'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text('''
        CREATE TABLE IF NOT EXISTS llm_evals_reports (
            id VARCHAR(255) PRIMARY KEY,
            title VARCHAR(512) NOT NULL,
            format VARCHAR(10) NOT NULL DEFAULT 'pdf',
            file_data BYTEA NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            experiment_ids JSONB NOT NULL DEFAULT '[]',
            sections JSONB NOT NULL DEFAULT '[]',
            project_id VARCHAR(255),
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            created_by VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_reports_org_id
        ON llm_evals_reports(organization_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_reports_project_id
        ON llm_evals_reports(project_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_reports_created_at
        ON llm_evals_reports(created_at DESC);
    '''))


def downgrade() -> None:
    op.execute(sa.text('DROP TABLE IF EXISTS llm_evals_reports CASCADE;'))
