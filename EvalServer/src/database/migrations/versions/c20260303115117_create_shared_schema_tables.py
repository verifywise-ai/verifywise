"""create-shared-schema-tables

Revision ID: c20260303115117
Revises: None
Create Date: 2026-03-03

Creates all llm_evals_* tables in the verifywise schema with organization_id column
for shared-schema multi-tenancy. This migration runs BEFORE the data migration.

Alembic runs each migration inside a transaction by default (transactional DDL).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c20260303115117'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create shared-schema tables in verifywise schema."""
    print("Creating verifywise schema if not exists...")
    op.execute(sa.text('CREATE SCHEMA IF NOT EXISTS verifywise;'))

    print("Creating shared-schema tables in verifywise schema...")

    # ============================================================
    # 1. ORGANIZATIONS TABLE (org_id is VARCHAR for eval-specific orgs)
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_organizations (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (organization_id, name)
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_organizations_org_id
        ON verifywise.llm_evals_organizations(organization_id);
    '''))

    # ============================================================
    # 2. ORG MEMBERS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_org_members (
            org_id VARCHAR(255) NOT NULL REFERENCES verifywise.llm_evals_organizations(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
            role VARCHAR(50) DEFAULT 'member',
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (org_id, user_id)
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_org_members_user_id
        ON verifywise.llm_evals_org_members(user_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_org_members_org_id
        ON verifywise.llm_evals_org_members(organization_id);
    '''))

    # ============================================================
    # 3. API KEYS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_api_keys (
            id SERIAL PRIMARY KEY,
            provider VARCHAR(50) NOT NULL,
            api_key_encrypted TEXT NOT NULL,
            is_default BOOLEAN DEFAULT false,
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(255)
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_api_keys_org_id
        ON verifywise.llm_evals_api_keys(organization_id);
    '''))

    # ============================================================
    # 4. PROJECTS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_projects (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            use_case VARCHAR(50) DEFAULT 'chatbot',
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(255)
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_projects_org_id
        ON verifywise.llm_evals_projects(organization_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_projects_created_at
        ON verifywise.llm_evals_projects(created_at DESC);
    '''))

    # ============================================================
    # 5. DATASETS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_datasets (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            path TEXT NOT NULL,
            size BIGINT NOT NULL DEFAULT 0,
            prompt_count INTEGER DEFAULT 0,
            dataset_type VARCHAR(50) DEFAULT 'chatbot',
            turn_type VARCHAR(50) DEFAULT 'single-turn',
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(255)
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_datasets_org_id
        ON verifywise.llm_evals_datasets(organization_id);
    '''))

    # ============================================================
    # 6. SCORERS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_scorers (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            type VARCHAR(255) NOT NULL,
            metric_key VARCHAR(255) NOT NULL,
            config JSONB DEFAULT '{}',
            enabled BOOLEAN DEFAULT true,
            default_threshold DOUBLE PRECISION,
            weight DOUBLE PRECISION,
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(255)
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_scorers_org_id
        ON verifywise.llm_evals_scorers(organization_id);
    '''))

    # ============================================================
    # 7. MODELS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_models (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            provider VARCHAR(100),
            model_id VARCHAR(255),
            config JSONB DEFAULT '{}',
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(255)
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_models_org_id
        ON verifywise.llm_evals_models(organization_id);
    '''))

    # ============================================================
    # 8. EXPERIMENTS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_experiments (
            id VARCHAR(255) PRIMARY KEY,
            project_id VARCHAR(255) NOT NULL REFERENCES verifywise.llm_evals_projects(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            config JSONB NOT NULL,
            baseline_experiment_id VARCHAR(255) REFERENCES verifywise.llm_evals_experiments(id) ON DELETE SET NULL,
            status VARCHAR(50) DEFAULT 'pending',
            results JSONB,
            error_message TEXT,
            started_at TIMESTAMP WITH TIME ZONE,
            completed_at TIMESTAMP WITH TIME ZONE,
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(255)
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_experiments_project_id
        ON verifywise.llm_evals_experiments(project_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_experiments_org_id
        ON verifywise.llm_evals_experiments(organization_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_experiments_status
        ON verifywise.llm_evals_experiments(status);
    '''))

    # ============================================================
    # 9. ARENA COMPARISONS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_arena_comparisons (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            contestants JSONB NOT NULL DEFAULT '[]',
            contestant_names JSONB NOT NULL DEFAULT '[]',
            metric_config JSONB NOT NULL DEFAULT '{}',
            judge_model VARCHAR(255) DEFAULT 'gpt-4o',
            status VARCHAR(50) DEFAULT 'pending',
            progress TEXT,
            winner VARCHAR(255),
            win_counts JSONB DEFAULT '{}',
            detailed_results JSONB DEFAULT '[]',
            error_message TEXT,
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP WITH TIME ZONE,
            created_by VARCHAR(255)
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_arena_comparisons_org_id
        ON verifywise.llm_evals_arena_comparisons(organization_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_arena_comparisons_status
        ON verifywise.llm_evals_arena_comparisons(status);
    '''))

    # ============================================================
    # 10. BIAS AUDITS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_bias_audits (
            id VARCHAR(255) PRIMARY KEY,
            project_id VARCHAR(255),
            preset_id VARCHAR(100) NOT NULL,
            preset_name VARCHAR(255) NOT NULL,
            mode VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            config JSONB NOT NULL,
            results JSONB,
            error TEXT,
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP WITH TIME ZONE,
            created_by VARCHAR(255)
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_bias_audits_org_id
        ON verifywise.llm_evals_bias_audits(organization_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_bias_audits_status
        ON verifywise.llm_evals_bias_audits(status);
    '''))

    # ============================================================
    # 11. LOGS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id VARCHAR(255) NOT NULL REFERENCES verifywise.llm_evals_projects(id) ON DELETE CASCADE,
            experiment_id VARCHAR(255) REFERENCES verifywise.llm_evals_experiments(id) ON DELETE CASCADE,
            trace_id UUID,
            parent_trace_id UUID,
            span_name VARCHAR(255),
            input_text TEXT,
            output_text TEXT,
            model_name VARCHAR(255),
            metadata JSONB DEFAULT '{}',
            latency_ms INTEGER,
            token_count INTEGER,
            cost NUMERIC(10, 6),
            status VARCHAR(50),
            error_message TEXT,
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(255)
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_logs_project_id
        ON verifywise.llm_evals_logs(project_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_logs_experiment_id
        ON verifywise.llm_evals_logs(experiment_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_logs_org_id
        ON verifywise.llm_evals_logs(organization_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_logs_timestamp
        ON verifywise.llm_evals_logs(timestamp DESC);
    '''))

    # ============================================================
    # 12. METRICS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_metrics (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id VARCHAR(255) NOT NULL REFERENCES verifywise.llm_evals_projects(id) ON DELETE CASCADE,
            experiment_id VARCHAR(255) REFERENCES verifywise.llm_evals_experiments(id) ON DELETE CASCADE,
            metric_name VARCHAR(255) NOT NULL,
            metric_type VARCHAR(255) NOT NULL,
            value DOUBLE PRECISION NOT NULL,
            dimensions JSONB,
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_metrics_project_id
        ON verifywise.llm_evals_metrics(project_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_metrics_experiment_id
        ON verifywise.llm_evals_metrics(experiment_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_metrics_org_id
        ON verifywise.llm_evals_metrics(organization_id);
    '''))

    # ============================================================
    # 13. BIAS AUDIT RESULTS TABLE
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.llm_evals_bias_audit_results (
            id SERIAL PRIMARY KEY,
            audit_id VARCHAR(255) NOT NULL REFERENCES verifywise.llm_evals_bias_audits(id) ON DELETE CASCADE,
            category_type VARCHAR(100) NOT NULL,
            category_name VARCHAR(255) NOT NULL,
            applicant_count INTEGER NOT NULL,
            selected_count INTEGER NOT NULL,
            selection_rate DOUBLE PRECISION NOT NULL,
            impact_ratio DOUBLE PRECISION,
            excluded BOOLEAN DEFAULT FALSE,
            flagged BOOLEAN DEFAULT FALSE,
            organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_bias_audit_results_audit_id
        ON verifywise.llm_evals_bias_audit_results(audit_id);
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_bias_audit_results_org_id
        ON verifywise.llm_evals_bias_audit_results(organization_id);
    '''))

    # ============================================================
    # 14. MIGRATION STATUS TABLE (for tracking data migration)
    # ============================================================
    op.execute(sa.text('''
        CREATE TABLE verifywise.evalserver_migration_status (
            migration_key VARCHAR(255) PRIMARY KEY,
            status VARCHAR(50) NOT NULL,
            organizations_migrated INTEGER DEFAULT 0,
            organizations_total INTEGER DEFAULT 0,
            current_organization_id INTEGER,
            current_table VARCHAR(255),
            error_message TEXT,
            validation_report JSONB,
            started_at TIMESTAMP WITH TIME ZONE,
            completed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    '''))

    print("✓ Created all shared-schema tables in verifywise schema")


def downgrade() -> None:
    """Drop shared-schema tables from verifywise schema."""
    print("Dropping shared-schema tables from verifywise schema...")

    # Drop in reverse dependency order
    tables = [
        "evalserver_migration_status",
        "llm_evals_bias_audit_results",
        "llm_evals_metrics",
        "llm_evals_logs",
        "llm_evals_bias_audits",
        "llm_evals_arena_comparisons",
        "llm_evals_experiments",
        "llm_evals_models",
        "llm_evals_scorers",
        "llm_evals_datasets",
        "llm_evals_projects",
        "llm_evals_api_keys",
        "llm_evals_org_members",
        "llm_evals_organizations",
    ]

    for table in tables:
        op.execute(sa.text(f'DROP TABLE IF EXISTS verifywise."{table}" CASCADE;'))

    print("✓ Dropped all shared-schema tables from verifywise schema")
