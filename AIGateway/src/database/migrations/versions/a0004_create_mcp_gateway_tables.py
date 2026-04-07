"""Create MCP Gateway tables

Revision ID: a0004
Revises: a0003
Create Date: 2026-04-03
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a0004"
down_revision: Union[str, None] = "a0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all 6 ai_gateway_mcp_* tables in verifywise schema."""
    op.execute("SET search_path TO verifywise")

    # ---------------------------------------------------------------
    # 1. ai_gateway_mcp_agent_keys
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_mcp_agent_keys (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            key_hash VARCHAR(64) NOT NULL UNIQUE,
            key_prefix VARCHAR(16) NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            allowed_tools TEXT[] DEFAULT '{}',
            blocked_tools TEXT[] DEFAULT '{}',
            allowed_server_ids INTEGER[] DEFAULT '{}',
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
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_mcp_ak_org ON ai_gateway_mcp_agent_keys(organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_mcp_ak_hash ON ai_gateway_mcp_agent_keys(key_hash)")

    # ---------------------------------------------------------------
    # 2. ai_gateway_mcp_servers
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_mcp_servers (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL,
            url TEXT NOT NULL,
            auth_type VARCHAR(20) NOT NULL DEFAULT 'none',
            auth_config JSONB DEFAULT '{}',
            is_active BOOLEAN NOT NULL DEFAULT true,
            health_status VARCHAR(20) DEFAULT 'unknown',
            last_health_check_at TIMESTAMP WITH TIME ZONE,
            description TEXT,
            metadata JSONB DEFAULT '{}',
            created_by INTEGER
                REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE (organization_id, slug)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_mcp_srv_org ON ai_gateway_mcp_servers(organization_id)")

    # ---------------------------------------------------------------
    # 3. ai_gateway_mcp_tools
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_mcp_tools (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            server_id INTEGER NOT NULL
                REFERENCES ai_gateway_mcp_servers(id) ON DELETE CASCADE,
            tool_name VARCHAR(255) NOT NULL,
            description TEXT,
            input_schema JSONB DEFAULT '{}',
            risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
            requires_approval BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE (organization_id, server_id, tool_name)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_mcp_tool_org ON ai_gateway_mcp_tools(organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_mcp_tool_name ON ai_gateway_mcp_tools(organization_id, tool_name)")

    # ---------------------------------------------------------------
    # 4. ai_gateway_mcp_audit_logs
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_mcp_audit_logs (
            id BIGSERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            agent_key_id INTEGER
                REFERENCES ai_gateway_mcp_agent_keys(id) ON DELETE SET NULL,
            server_id INTEGER
                REFERENCES ai_gateway_mcp_servers(id) ON DELETE SET NULL,
            tool_name VARCHAR(255) NOT NULL,
            arguments JSONB,
            result_status VARCHAR(20) NOT NULL,
            result_summary TEXT,
            is_error BOOLEAN NOT NULL DEFAULT false,
            latency_ms INTEGER,
            session_id VARCHAR(128),
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_mcp_audit_org_created ON ai_gateway_mcp_audit_logs(organization_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_mcp_audit_agent ON ai_gateway_mcp_audit_logs(agent_key_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_mcp_audit_tool ON ai_gateway_mcp_audit_logs(tool_name, created_at)")

    # ---------------------------------------------------------------
    # 5. ai_gateway_mcp_approval_requests
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_mcp_approval_requests (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            agent_key_id INTEGER NOT NULL
                REFERENCES ai_gateway_mcp_agent_keys(id),
            tool_id INTEGER NOT NULL
                REFERENCES ai_gateway_mcp_tools(id),
            tool_name VARCHAR(255) NOT NULL,
            arguments JSONB,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            decided_by INTEGER
                REFERENCES users(id),
            decided_at TIMESTAMP WITH TIME ZONE,
            decision_reason TEXT,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_mcp_approval_org ON ai_gateway_mcp_approval_requests(organization_id, status)")

    # ---------------------------------------------------------------
    # 6. ai_gateway_mcp_guardrail_rules
    # ---------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_gateway_mcp_guardrail_rules (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                REFERENCES organizations(id),
            name VARCHAR(255) NOT NULL,
            rule_type VARCHAR(50) NOT NULL,
            config JSONB NOT NULL DEFAULT '{}',
            scope VARCHAR(20) NOT NULL DEFAULT 'tool_input',
            action VARCHAR(20) NOT NULL DEFAULT 'block',
            applies_to_tools TEXT[] DEFAULT '{}',
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by INTEGER
                REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gw_mcp_gr_org ON ai_gateway_mcp_guardrail_rules(organization_id, rule_type)")


def downgrade() -> None:
    """Drop all 6 ai_gateway_mcp_* tables in reverse order."""
    op.execute("SET search_path TO verifywise")

    tables = [
        "ai_gateway_mcp_guardrail_rules",
        "ai_gateway_mcp_approval_requests",
        "ai_gateway_mcp_audit_logs",
        "ai_gateway_mcp_tools",
        "ai_gateway_mcp_servers",
        "ai_gateway_mcp_agent_keys",
    ]
    for table in tables:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
