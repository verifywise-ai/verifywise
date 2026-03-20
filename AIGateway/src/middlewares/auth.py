"""Shared authentication middleware for FastAPI routers."""

from fastapi import Request, HTTPException

from config import settings


def verify_internal_key(request: Request):
    """Verify the request comes from the Express backend."""
    auth = request.headers.get("x-internal-key", "")
    if settings.ai_gateway_internal_key and auth != settings.ai_gateway_internal_key:
        raise HTTPException(status_code=401, detail="Invalid internal key")
