import logging
import os
import sys
from contextlib import asynccontextmanager
from importlib.metadata import version

import litellm
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from middlewares.invalid_unicode import InvalidUnicodeMiddleware
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
from routers.retention import router as retention_router
from routers.mcp_agent_keys import router as mcp_agent_keys_router
from routers.mcp_servers import router as mcp_servers_router
from routers.mcp_approvals import router as mcp_approvals_router
from routers.mcp_audit import router as mcp_audit_router
from routers.mcp_runs import router as mcp_runs_router
from routers.mcp_guardrails import router as mcp_guardrails_router
from routers.mcp_tools import router as mcp_tools_router
from routers.mcp_proxy import router as mcp_proxy_router
from routers.mcp_hook import router as mcp_hook_router
from routers.tenant_chat import router as tenant_chat_router
from middlewares.auth import include_internal_router
from services.guardrail_service import preload_pii_engine, shutdown_scan_executor

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

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.guardrails_preload_pii:
        # Fire and forget: serving starts at once, and the model loads on the
        # guardrail scan thread, where PII scans wait for it anyway.
        try:
            preload_pii_engine()
        except Exception as e:
            logger.error(f"Could not start PII engine preload: {e}")
    yield
    shutdown_scan_executor()


app = FastAPI(
    title="VerifyWise AI Gateway",
    version="1.0.0",
    redirect_slashes=False,
    lifespan=lifespan,
)

# Reject request bodies carrying a lone UTF-16 surrogate or invalid UTF-8 with a
# 400 before any route runs; otherwise they fail as 500s when echoed, stored
# or logged. Added first so it sits inside CORS (its 400s carry CORS headers).
app.add_middleware(InvalidUnicodeMiddleware)

# CORS: allow the Express backend plus any explicitly configured origins.
# Never use "*": key-authenticated endpoints must not be callable from
# arbitrary websites via browser JS (a leaked virtual key would be usable
# cross-origin). Extra SDK origins can be opted in via env var.
origins = [os.environ.get("BACKEND_URL", "http://localhost:3000")]
_extra_origins = os.environ.get("AI_GATEWAY_EXTRA_CORS_ORIGINS", "")
origins.extend(o.strip() for o in _extra_origins.split(",") if o.strip())
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tenant middleware — extracts org/user/role from headers for CRUD routes
# Skips /v1/* (virtual key auth) and /health
app.add_middleware(TenantMiddleware)

# Observability — push OTLP metrics/logs to the central stack (no-op if disabled)
from observability import setup_observability  # noqa: E402

setup_observability(app, "verifywise-ai-gateway")

# Internal routes (Express backend → Gateway). include_internal_router mounts
# each under /internal with the x-internal-key check as a router dependency.
# Mounted under /internal prefix to avoid conflict with public /v1 routes
include_internal_router(app, completions_router, tags=["Internal"])
include_internal_router(app, models_router, tags=["Internal"])

# CRUD routes (Express backend → Gateway, authenticated via internal key + tenant headers)
include_internal_router(app, api_keys_router, tags=["CRUD"])
include_internal_router(app, budget_router, tags=["CRUD"])
include_internal_router(app, endpoints_router, tags=["CRUD"])
include_internal_router(app, spend_router, tags=["CRUD"])
include_internal_router(app, guardrails_router, tags=["CRUD"])
include_internal_router(app, guardrails_crud_router, tags=["CRUD"])
include_internal_router(app, virtual_keys_router, tags=["CRUD"])
include_internal_router(app, prompts_router, tags=["CRUD"])
include_internal_router(app, risk_router, tags=["CRUD"])
include_internal_router(app, cache_router, tags=["CRUD"])
include_internal_router(app, retention_router, tags=["CRUD"])

# MCP Gateway CRUD routes (internal)
include_internal_router(app, mcp_agent_keys_router, tags=["MCP CRUD"])
include_internal_router(app, mcp_servers_router, tags=["MCP CRUD"])
include_internal_router(app, mcp_approvals_router, tags=["MCP CRUD"])
include_internal_router(app, mcp_audit_router, tags=["MCP CRUD"])
include_internal_router(app, mcp_runs_router, tags=["MCP CRUD"])
include_internal_router(app, mcp_guardrails_router, tags=["MCP CRUD"])
include_internal_router(app, mcp_tools_router, tags=["MCP CRUD"])

# Tenant proxy routes (Express proxy → Gateway, JWT-authenticated via headers)
# Chat, streaming, embeddings, providers, model catalog
include_internal_router(app, tenant_chat_router, tags=["Tenant Proxy"])

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
