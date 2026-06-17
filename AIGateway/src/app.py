import os
import sys
from importlib.metadata import version

import litellm
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from middlewares.tenant import TenantMiddleware
from routers.completions import router as completions_router
from routers.models import router as models_router
from routers.guardrails import router as guardrails_router
from routers.proxy import router as proxy_router
from routers.api_keys import router as api_keys_router
from routers.budget import router as budget_router
from routers.endpoints import router as endpoints_router
from routers.spend import router as spend_router
from routers.guardrails_crud import router as guardrails_crud_router
from routers.virtual_keys import router as virtual_keys_router
from routers.prompts import router as prompts_router
from routers.risk import router as risk_router
from routers.cache import router as cache_router
from routers.mcp_agent_keys import router as mcp_agent_keys_router
from routers.mcp_servers import router as mcp_servers_router
from routers.mcp_approvals import router as mcp_approvals_router
from routers.mcp_audit import router as mcp_audit_router
from routers.mcp_guardrails import router as mcp_guardrails_router
from routers.mcp_tools import router as mcp_tools_router
from routers.mcp_proxy import router as mcp_proxy_router
from routers.mcp_hook import router as mcp_hook_router
from routers.tenant_chat import router as tenant_chat_router

# Disable LiteLLM verbose logging to prevent key leakage
litellm.suppress_debug_info = True

# Fail fast if the internal API key is missing or is a placeholder value
_PLACEHOLDER_VALUES = {"", "changeme", "change-me", "your-secret-key", "secret"}
if settings.ai_gateway_internal_key.lower() in _PLACEHOLDER_VALUES:
    print(
        "FATAL: AI_GATEWAY_INTERNAL_KEY is not set or is a placeholder. "
        "Set a strong random value before starting the gateway.",
        file=sys.stderr,
    )
    sys.exit(1)

app = FastAPI(
    title="VerifyWise AI Gateway",
    version="1.0.0",
    redirect_slashes=False,
)

# CORS: allow Express backend + any employee SDK origin
origins = [
    os.environ.get("BACKEND_URL", "http://localhost:3000"),
    "*",  # Virtual key endpoints are auth-gated, CORS is safe
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tenant middleware — extracts org/user/role from headers for CRUD routes
# Skips /v1/* (virtual key auth) and /health
app.add_middleware(TenantMiddleware)

# Internal routes (Express backend → Gateway, authenticated via x-internal-key)
# Mounted under /internal prefix to avoid conflict with public /v1 routes
app.include_router(completions_router, prefix="/internal", tags=["Internal"])
app.include_router(models_router, prefix="/internal", tags=["Internal"])
app.include_router(guardrails_router, prefix="/internal", tags=["Internal"])

# CRUD routes (Express backend → Gateway, authenticated via internal key + tenant headers)
app.include_router(api_keys_router, prefix="/internal", tags=["CRUD"])
app.include_router(budget_router, prefix="/internal", tags=["CRUD"])
app.include_router(endpoints_router, prefix="/internal", tags=["CRUD"])
app.include_router(spend_router, prefix="/internal", tags=["CRUD"])
app.include_router(guardrails_crud_router, prefix="/internal", tags=["CRUD"])
app.include_router(virtual_keys_router, prefix="/internal", tags=["CRUD"])
app.include_router(prompts_router, prefix="/internal", tags=["CRUD"])
app.include_router(risk_router, prefix="/internal", tags=["CRUD"])
app.include_router(cache_router, prefix="/internal", tags=["CRUD"])

# MCP Gateway CRUD routes (internal)
app.include_router(mcp_agent_keys_router, prefix="/internal", tags=["MCP CRUD"])
app.include_router(mcp_servers_router, prefix="/internal", tags=["MCP CRUD"])
app.include_router(mcp_approvals_router, prefix="/internal", tags=["MCP CRUD"])
app.include_router(mcp_audit_router, prefix="/internal", tags=["MCP CRUD"])
app.include_router(mcp_guardrails_router, prefix="/internal", tags=["MCP CRUD"])
app.include_router(mcp_tools_router, prefix="/internal", tags=["MCP CRUD"])

# Tenant proxy routes (Express proxy → Gateway, JWT-authenticated via headers)
# Chat, streaming, embeddings, providers, model catalog
app.include_router(tenant_chat_router, prefix="/internal", tags=["Tenant Proxy"])

# Public routes (Employee SDK → Gateway, authenticated via virtual key)
# OpenAI-compatible: /v1/chat/completions, /v1/embeddings, /v1/models
app.include_router(proxy_router, tags=["Proxy"])

# MCP Gateway public routes (Agent SDK → Gateway, authenticated via agent key)
# Streamable HTTP: POST /v1/mcp, GET /v1/mcp
app.include_router(mcp_proxy_router, tags=["MCP Proxy"])
app.include_router(mcp_hook_router, tags=["MCP Proxy"])


@app.get("/health")
async def health():
    litellm_version = "unknown"
    try:
        litellm_version = version("litellm")
    except Exception:
        pass
    return {
        "status": "ok",
        "litellm_version": litellm_version,
        "models_in_cost_db": len(litellm.model_cost),
    }
