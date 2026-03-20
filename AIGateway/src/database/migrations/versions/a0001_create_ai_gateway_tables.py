"""Create all AI Gateway tables (consolidated)

Revision ID: a0001
Revises:
Create Date: 2026-03-17

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all 16 ai_gateway_* tables in verifywise schema."""
    op.execute("SET search_path TO verifywise")

    # ---------------------------------------------------------------
    # 1. ai_gateway_api_keys
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_api_keys (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            key_name VARCHAR(255) NOT NULL,
            provider VARCHAR(100) NOT NULL,
            encrypted_key TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by INTEGER
                REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # ---------------------------------------------------------------
    # 2. ai_gateway_endpoints (prompt_id added later — circular dep)
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_endpoints (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            display_name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL,
            provider VARCHAR(100) NOT NULL,
            model VARCHAR(255) NOT NULL,
            api_key_id INTEGER
                REFERENCES ai_gateway_api_keys(id) ON DELETE SET NULL,
            max_tokens INTEGER,
            temperature DECIMAL(3,2),
            system_prompt TEXT,
            rate_limit_rpm INTEGER,
            is_active BOOLEAN NOT NULL DEFAULT true,
            fallback_endpoint_id INTEGER
                REFERENCES ai_gateway_endpoints(id) ON DELETE SET NULL,
            allowed_role_ids INTEGER[] DEFAULT '{1,2,3,4}',
            prompt_label VARCHAR(64) DEFAULT 'production',
            created_by INTEGER
                REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE (organization_id, slug)
        )
    """)

    # ---------------------------------------------------------------
    # 3. ai_gateway_virtual_keys
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_virtual_keys (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            key_hash VARCHAR(64) NOT NULL UNIQUE,
            key_prefix VARCHAR(16) NOT NULL,
            name VARCHAR(255) NOT NULL,
            allowed_endpoint_ids INTEGER[] DEFAULT '{}',
            max_budget_usd DECIMAL(12,4),
            current_spend_usd DECIMAL(12,8) NOT NULL DEFAULT 0,
            budget_reset_at TIMESTAMP WITH TIME ZONE
                DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),
            rate_limit_rpm INTEGER,
            metadata JSONB DEFAULT '{}',
            expires_at TIMESTAMP WITH TIME ZONE,
            is_active BOOLEAN NOT NULL DEFAULT true,
            revoked_at TIMESTAMP WITH TIME ZONE,
            created_by INTEGER
                REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_vkey_org ON ai_gateway_virtual_keys(organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_vkey_hash ON ai_gateway_virtual_keys(key_hash)")

    # ---------------------------------------------------------------
    # 4. ai_gateway_spend_logs
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_spend_logs (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            endpoint_id INTEGER
                REFERENCES ai_gateway_endpoints(id) ON DELETE SET NULL,
            user_id INTEGER
                REFERENCES users(id),
            model VARCHAR(255) NOT NULL,
            provider VARCHAR(100) NOT NULL,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            cost_usd DECIMAL(12,8) NOT NULL DEFAULT 0,
            latency_ms INTEGER,
            status_code INTEGER NOT NULL DEFAULT 200,
            metadata JSONB DEFAULT '{}',
            request_messages JSONB,
            response_text TEXT,
            error_message TEXT,
            virtual_key_id INTEGER
                REFERENCES ai_gateway_virtual_keys(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_spend_org_created ON ai_gateway_spend_logs(organization_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_spend_endpoint ON ai_gateway_spend_logs(endpoint_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_spend_user ON ai_gateway_spend_logs(user_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_spend_metadata ON ai_gateway_spend_logs USING GIN (metadata)")

    # ---------------------------------------------------------------
    # 5. ai_gateway_budgets
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_budgets (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            monthly_limit_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
            current_spend_usd DECIMAL(12,8) NOT NULL DEFAULT 0,
            alert_threshold_pct INTEGER DEFAULT 80,
            is_hard_limit BOOLEAN NOT NULL DEFAULT false,
            alert_email_enabled BOOLEAN DEFAULT true,
            alert_slack_enabled BOOLEAN DEFAULT false,
            period_start TIMESTAMP WITH TIME ZONE DEFAULT DATE_TRUNC('month', NOW()),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE (organization_id)
        )
    """)

    # ---------------------------------------------------------------
    # 6. ai_gateway_guardrails
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_guardrails (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            guardrail_type VARCHAR(50) NOT NULL,
            name VARCHAR(255) NOT NULL,
            config JSONB NOT NULL DEFAULT '{}',
            scope VARCHAR(20) NOT NULL DEFAULT 'input',
            action VARCHAR(20) NOT NULL DEFAULT 'block',
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by INTEGER
                REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_guardrail_org ON ai_gateway_guardrails(organization_id, guardrail_type)")

    # ---------------------------------------------------------------
    # 7. ai_gateway_guardrail_logs
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_guardrail_logs (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            guardrail_id INTEGER
                REFERENCES ai_gateway_guardrails(id) ON DELETE SET NULL,
            endpoint_id INTEGER
                REFERENCES ai_gateway_endpoints(id) ON DELETE SET NULL,
            user_id INTEGER
                REFERENCES users(id),
            guardrail_type VARCHAR(50) NOT NULL,
            action_taken VARCHAR(20) NOT NULL,
            matched_text TEXT,
            entity_type VARCHAR(100),
            execution_time_ms INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_guardrail_log_org ON ai_gateway_guardrail_logs(organization_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_guardrail_log_type ON ai_gateway_guardrail_logs(guardrail_type, created_at)")

    # ---------------------------------------------------------------
    # 8. ai_gateway_guardrail_settings
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_guardrail_settings (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            pii_on_error VARCHAR(20) NOT NULL DEFAULT 'block',
            content_filter_on_error VARCHAR(20) NOT NULL DEFAULT 'allow',
            pii_replacement_format VARCHAR(50) NOT NULL DEFAULT '<ENTITY_TYPE>',
            content_filter_replacement VARCHAR(50) NOT NULL DEFAULT '[REDACTED]',
            log_retention_days INTEGER NOT NULL DEFAULT 90,
            log_request_body BOOLEAN DEFAULT false,
            log_response_body BOOLEAN DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE (organization_id)
        )
    """)

    # ---------------------------------------------------------------
    # 9. ai_gateway_endpoint_change_history
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_endpoint_change_history (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            endpoint_id INTEGER
                REFERENCES ai_gateway_endpoints(id) ON DELETE SET NULL,
            action VARCHAR(20) NOT NULL,
            field_name VARCHAR(100),
            old_value TEXT,
            new_value TEXT,
            changed_by_user_id INTEGER
                REFERENCES users(id),
            changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_ep_history_org ON ai_gateway_endpoint_change_history(organization_id, endpoint_id)")

    # ---------------------------------------------------------------
    # 10. ai_gateway_guardrail_change_history
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_guardrail_change_history (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            guardrail_id INTEGER
                REFERENCES ai_gateway_guardrails(id) ON DELETE SET NULL,
            action VARCHAR(20) NOT NULL,
            field_name VARCHAR(100),
            old_value TEXT,
            new_value TEXT,
            changed_by_user_id INTEGER
                REFERENCES users(id),
            changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_gr_history_org ON ai_gateway_guardrail_change_history(organization_id, guardrail_id)")

    # ---------------------------------------------------------------
    # 11. ai_gateway_prompts
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_prompts (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id) ON DELETE CASCADE,
            slug VARCHAR(128) NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            created_by INTEGER
                REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ai_gateway_prompts_org_slug UNIQUE (organization_id, slug)
        )
    """)

    # ---------------------------------------------------------------
    # 12. ai_gateway_prompt_versions
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_prompt_versions (
            id SERIAL PRIMARY KEY,
            prompt_id INTEGER NOT NULL
                REFERENCES ai_gateway_prompts(id) ON DELETE CASCADE,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            content JSONB NOT NULL,
            variables JSONB,
            model VARCHAR(255),
            config JSONB,
            status VARCHAR(16) NOT NULL DEFAULT 'draft',
            commit_message TEXT,
            published_at TIMESTAMP WITH TIME ZONE,
            published_by INTEGER
                REFERENCES users(id) ON DELETE SET NULL,
            created_by INTEGER
                REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ai_gateway_prompt_versions_prompt_version UNIQUE (prompt_id, version)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_ai_gateway_prompt_versions_prompt_status ON ai_gateway_prompt_versions(prompt_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_ai_gateway_prompt_versions_org ON ai_gateway_prompt_versions(organization_id)")

    # ---------------------------------------------------------------
    # 13. ai_gateway_prompt_labels
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_prompt_labels (
            id SERIAL PRIMARY KEY,
            prompt_id INTEGER NOT NULL
                REFERENCES ai_gateway_prompts(id) ON DELETE CASCADE,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id) ON DELETE CASCADE,
            label_name VARCHAR(64) NOT NULL,
            version_id INTEGER NOT NULL
                REFERENCES ai_gateway_prompt_versions(id) ON DELETE CASCADE,
            assigned_by INTEGER
                REFERENCES users(id) ON DELETE SET NULL,
            assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            CONSTRAINT uq_ai_gateway_prompt_labels_prompt_label UNIQUE (prompt_id, label_name)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_ai_gateway_prompt_labels_org ON ai_gateway_prompt_labels(organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_ai_gateway_prompt_labels_prompt ON ai_gateway_prompt_labels(prompt_id)")

    # ---------------------------------------------------------------
    # 14. ai_gateway_prompt_test_datasets
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_prompt_test_datasets (
            id SERIAL PRIMARY KEY,
            prompt_id INTEGER NOT NULL
                REFERENCES ai_gateway_prompts(id) ON DELETE CASCADE,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            test_cases JSONB DEFAULT '[]',
            created_by INTEGER
                REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_ai_gateway_prompt_test_datasets_org ON ai_gateway_prompt_test_datasets(organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_ai_gateway_prompt_test_datasets_prompt ON ai_gateway_prompt_test_datasets(prompt_id)")

    # ---------------------------------------------------------------
    # 15. ai_gateway_risk_settings
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_risk_settings (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id) ON DELETE CASCADE,
            condition_id VARCHAR(64) NOT NULL,
            is_enabled BOOLEAN DEFAULT true,
            threshold JSONB DEFAULT '{}',
            severity_override VARCHAR(16),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE (organization_id, condition_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_risk_settings_org ON ai_gateway_risk_settings(organization_id)")

    # ---------------------------------------------------------------
    # 16. ai_gateway_risk_suggestions
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_risk_suggestions (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id) ON DELETE CASCADE,
            condition_id VARCHAR(64) NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            severity VARCHAR(16) NOT NULL,
            evidence JSONB DEFAULT '{}',
            compliance_tags TEXT[] DEFAULT '{}',
            suggested_mitigation TEXT,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            accepted_risk_id INTEGER,
            dismiss_reason TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            reviewed_at TIMESTAMP WITH TIME ZONE,
            reviewed_by INTEGER
                REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_risk_suggestions_org ON ai_gateway_risk_suggestions(organization_id, status)")

    # ---------------------------------------------------------------
    # 17. Add prompt_id to endpoints (circular dep with prompts)
    # ---------------------------------------------------------------
    op.execute("""
        ALTER TABLE ai_gateway_endpoints
        ADD COLUMN IF NOT EXISTS prompt_id INTEGER
            REFERENCES ai_gateway_prompts(id) ON DELETE SET NULL
    """)


def downgrade() -> None:
    """Drop all 16 ai_gateway_* tables in reverse order."""
    op.execute("SET search_path TO verifywise")

    op.execute("ALTER TABLE ai_gateway_endpoints DROP COLUMN IF EXISTS prompt_id")

    tables = [
        "ai_gateway_risk_suggestions",
        "ai_gateway_risk_settings",
        "ai_gateway_prompt_test_datasets",
        "ai_gateway_prompt_labels",
        "ai_gateway_prompt_versions",
        "ai_gateway_prompts",
        "ai_gateway_guardrail_change_history",
        "ai_gateway_endpoint_change_history",
        "ai_gateway_guardrail_settings",
        "ai_gateway_guardrail_logs",
        "ai_gateway_guardrails",
        "ai_gateway_budgets",
        "ai_gateway_spend_logs",
        "ai_gateway_virtual_keys",
        "ai_gateway_endpoints",
        "ai_gateway_api_keys",
    ]
    for table in tables:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
