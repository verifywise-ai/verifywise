from pathlib import Path
from pydantic_settings import BaseSettings
import dotenv

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


settings = Settings()
