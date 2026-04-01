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


settings = Settings()
