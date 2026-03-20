"""Add response cache table and endpoint/org cache settings columns.

Revision ID: a0002
Revises: a0001
Create Date: 2026-03-19
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a0002"
down_revision: Union[str, None] = "a0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add ai_gateway_cache table + cache columns on endpoints + guardrail_settings."""
    op.execute("SET search_path TO verifywise")

    # 1. Cache table
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_cache (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id) ON DELETE CASCADE,
            endpoint_id INTEGER NOT NULL
                REFERENCES ai_gateway_endpoints(id) ON DELETE CASCADE,
            prompt_hash VARCHAR(64) NOT NULL,
            model VARCHAR(255) NOT NULL,
            prompt_preview TEXT,
            response_body TEXT NOT NULL,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            cost_usd DECIMAL(12,8) NOT NULL DEFAULT 0,
            hit_count INTEGER NOT NULL DEFAULT 0,
            ttl_seconds INTEGER NOT NULL DEFAULT 14400,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            last_hit_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT uq_gw_cache_org_endpoint_hash
                UNIQUE (organization_id, endpoint_id, prompt_hash)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gw_cache_expires
        ON ai_gateway_cache(expires_at)
    """)

    # 2. Add cache columns to endpoints table
    op.execute("""
        ALTER TABLE ai_gateway_endpoints
        ADD COLUMN IF NOT EXISTS cache_enabled BOOLEAN NOT NULL DEFAULT false
    """)
    op.execute("""
        ALTER TABLE ai_gateway_endpoints
        ADD COLUMN IF NOT EXISTS cache_ttl_seconds INTEGER NOT NULL DEFAULT 14400
    """)

    # 3. Add global cache settings to guardrail_settings table
    op.execute("""
        ALTER TABLE ai_gateway_guardrail_settings
        ADD COLUMN IF NOT EXISTS cache_global_enabled BOOLEAN NOT NULL DEFAULT true
    """)
    op.execute("""
        ALTER TABLE ai_gateway_guardrail_settings
        ADD COLUMN IF NOT EXISTS cache_default_ttl_seconds INTEGER NOT NULL DEFAULT 14400
    """)
    op.execute("""
        ALTER TABLE ai_gateway_guardrail_settings
        ADD COLUMN IF NOT EXISTS cache_max_entries_per_org INTEGER NOT NULL DEFAULT 50000
    """)


def downgrade() -> None:
    """Remove cache table and cache columns."""
    op.execute("SET search_path TO verifywise")

    op.execute("ALTER TABLE ai_gateway_guardrail_settings DROP COLUMN IF EXISTS cache_max_entries_per_org")
    op.execute("ALTER TABLE ai_gateway_guardrail_settings DROP COLUMN IF EXISTS cache_default_ttl_seconds")
    op.execute("ALTER TABLE ai_gateway_guardrail_settings DROP COLUMN IF EXISTS cache_global_enabled")
    op.execute("ALTER TABLE ai_gateway_endpoints DROP COLUMN IF EXISTS cache_ttl_seconds")
    op.execute("ALTER TABLE ai_gateway_endpoints DROP COLUMN IF EXISTS cache_enabled")
    op.execute("DROP TABLE IF EXISTS ai_gateway_cache CASCADE")
