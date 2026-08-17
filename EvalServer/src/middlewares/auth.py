"""Shared internal-key authentication for the Eval Server.

The Eval Server is an internal service: the only legitimate caller is the
Express backend proxy, which injects tenant context headers
(x-organization-id / x-user-id / x-role) after authenticating the user's JWT.
Because those headers are trivially spoofable, every request must also prove
it came from the backend by presenting a shared secret in ``x-internal-key``.

This module fails CLOSED: if the key is not configured, all non-exempt
requests are rejected and the service refuses to operate unauthenticated.

Note: ``BaseHTTPMiddleware.dispatch`` cannot rely on raised ``HTTPException``
being converted into a response (Starlette re-raises it through the
middleware stack), so the verifier returns a denial ``JSONResponse`` instead.
"""

import hmac
import os
from typing import Optional, Tuple

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

INTERNAL_KEY_ENV = "EVAL_SERVER_INTERNAL_KEY"
PLACEHOLDER_VALUES = {"", "changeme", "change-me", "your-internal-key", "placeholder"}

# Paths that must stay reachable without the key (liveness checks).
EXEMPT_PATHS = {"/", "/health"}


def get_internal_key() -> str:
    return os.environ.get(INTERNAL_KEY_ENV, "")


def is_configured() -> bool:
    return get_internal_key() not in PLACEHOLDER_VALUES


def _deny(request: Request) -> Optional[Tuple[int, str]]:
    """Return ``(status_code, detail)`` when the request must be rejected.

    Returns ``None`` when the request is allowed to proceed.
    """
    if request.url.path in EXEMPT_PATHS:
        return None

    if not is_configured():
        return 503, "Internal key not configured"

    provided = request.headers.get("x-internal-key", "")
    if not hmac.compare_digest(provided, get_internal_key()):
        return 401, "Invalid internal key"

    return None


def verify_internal_key(request: Request) -> Optional[JSONResponse]:
    """Return a denial response when the request is not from the backend.

    Returns ``None`` when the request is allowed to proceed.
    """
    denial = _deny(request)
    if denial is None:
        return None
    status_code, detail = denial
    return JSONResponse(status_code=status_code, content={"detail": detail})


def verify_internal_key_dependency(request: Request) -> None:
    """FastAPI dependency form of :func:`verify_internal_key`.

    Applied at the router level (``include_router(..., dependencies=[...])``)
    so every route rejects unauthenticated requests even if the middleware
    stack is bypassed. Raises instead of returning a response — inside the
    routing layer ``HTTPException`` is converted by FastAPI as usual.
    """
    denial = _deny(request)
    if denial is not None:
        status_code, detail = denial
        raise HTTPException(status_code=status_code, detail=detail)
