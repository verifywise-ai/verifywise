from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings
import dotenv

from crud.purge import MAX_RETENTION_DAYS

# Load .env from AIGateway root (parent of src/)
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    dotenv.load_dotenv(env_path)


class Settings(BaseSettings):
    ai_gateway_port: int = 8100
    ai_gateway_internal_key: str = ""
    redis_url: str = "redis://localhost:6379/0"
    log_level: str = "INFO"
    encryption_key: str = ""
    express_backend_url: str = "http://localhost:3000"

    # MCP Gateway
    mcp_tool_cache_ttl_seconds: int = 300
    mcp_session_ttl_seconds: int = 3600
    mcp_circuit_breaker_threshold: int = 5
    mcp_circuit_breaker_timeout_seconds: int = 30
    mcp_approval_expiry_seconds: int = 900
    mcp_audit_retention_days: int = 30
    # Shortest Agent Control log retention an organization may set
    # (MCP_AUDIT_RETENTION_MIN_DAYS). Never applied to the default above.
    mcp_audit_retention_min_days: int = 7

    # Load the PII engine (Presidio + spaCy model) in the background at startup
    # so the first PII scan does not wait for it (GUARDRAILS_PRELOAD_PII).
    guardrails_preload_pii: bool = True

    @field_validator("ai_gateway_internal_key", mode="before")
    @classmethod
    def _trim_internal_key(cls, value):
        """Trim the shared key, as the Express backend does, so an .env line
        with a trailing space or newline gives the same key on both sides and
        a whitespace-only key counts as not set."""
        return value.strip() if isinstance(value, str) else value

    @field_validator("mcp_audit_retention_min_days", mode="after")
    @classmethod
    def _clamp_min_days(cls, value: int) -> int:
        """Keep the floor within the periods an organization can set
        (1 to MAX_RETENTION_DAYS), so a misconfigured floor neither allows
        a period of 0 nor rejects every period."""
        return min(max(value, 1), MAX_RETENTION_DAYS)


settings = Settings()
