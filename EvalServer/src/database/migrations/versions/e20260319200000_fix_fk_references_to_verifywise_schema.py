"""fix-fk-references-to-verifywise-schema

Revision ID: e20260319200000
Revises: d20260312180000
Create Date: 2026-03-19

Fix foreign key constraints that reference public.organizations and public.users.
After the shared-schema migration, all data lives in the verifywise schema,
so FK references to public.* fail for orgs that only exist in verifywise.*.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e20260319200000'
down_revision: Union[str, None] = 'd20260312180000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, column, old_ref_table, constraint_name)
FK_FIXES = [
    ("llm_evals_organizations", "organization_id", "organizations", "llm_evals_organizations_organization_id_fkey"),
    ("llm_evals_org_members", "user_id", "users", "llm_evals_org_members_user_id_fkey"),
    ("llm_evals_org_members", "organization_id", "organizations", "llm_evals_org_members_organization_id_fkey"),
    ("llm_evals_api_keys", "organization_id", "organizations", "llm_evals_api_keys_organization_id_fkey"),
    ("llm_evals_projects", "organization_id", "organizations", "llm_evals_projects_organization_id_fkey"),
    ("llm_evals_datasets", "organization_id", "organizations", "llm_evals_datasets_organization_id_fkey"),
    ("llm_evals_scorers", "organization_id", "organizations", "llm_evals_scorers_organization_id_fkey"),
    ("llm_evals_models", "organization_id", "organizations", "llm_evals_models_organization_id_fkey"),
    ("llm_evals_experiments", "organization_id", "organizations", "llm_evals_experiments_organization_id_fkey"),
    ("llm_evals_arena_comparisons", "organization_id", "organizations", "llm_evals_arena_comparisons_organization_id_fkey"),
    ("llm_evals_bias_audits", "organization_id", "organizations", "llm_evals_bias_audits_organization_id_fkey"),
    ("llm_evals_logs", "organization_id", "organizations", "llm_evals_logs_organization_id_fkey"),
    ("llm_evals_metrics", "organization_id", "organizations", "llm_evals_metrics_organization_id_fkey"),
    ("llm_evals_bias_audit_results", "organization_id", "organizations", "llm_evals_bias_audit_results_organization_id_fkey"),
]


def upgrade() -> None:
    """Re-point FK constraints from public.* to verifywise.* (unqualified, resolved by search_path)."""
    op.execute(sa.text("SET search_path TO verifywise"))

    for table, column, ref_table, constraint in FK_FIXES:
        # Drop old FK pointing to public.*
        op.execute(sa.text(f"""
            ALTER TABLE {table}
            DROP CONSTRAINT IF EXISTS {constraint}
        """))
        # Add new FK pointing to verifywise.* (unqualified — resolved by search_path)
        op.execute(sa.text(f"""
            ALTER TABLE {table}
            ADD CONSTRAINT {constraint}
            FOREIGN KEY ({column}) REFERENCES {ref_table}(id) ON DELETE CASCADE
        """))

    print("Fixed all FK references from public.* to verifywise.*")


def downgrade() -> None:
    """Revert FK constraints back to public.*."""
    op.execute(sa.text("SET search_path TO verifywise"))

    for table, column, ref_table, constraint in FK_FIXES:
        op.execute(sa.text(f"""
            ALTER TABLE {table}
            DROP CONSTRAINT IF EXISTS {constraint}
        """))
        op.execute(sa.text(f"""
            ALTER TABLE {table}
            ADD CONSTRAINT {constraint}
            FOREIGN KEY ({column}) REFERENCES public.{ref_table}(id) ON DELETE CASCADE
        """))
