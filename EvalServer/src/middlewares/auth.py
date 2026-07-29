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
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse

INTERNAL_KEY_ENV = "EVAL_SERVER_INTERNAL_KEY"
PLACEHOLDER_VALUES = {"", "changeme", "change-me", "your-internal-key", "placeholder"}

# Paths that must stay reachable without the key (liveness checks).
EXEMPT_PATHS = {"/", "/health"}


def get_internal_key() -> str:
    return os.environ.get(INTERNAL_KEY_ENV, "")


def is_configured() -> bool:
    return get_internal_key() not in PLACEHOLDER_VALUES


def verify_internal_key(request: Request) -> Optional[JSONResponse]:
    """Return a denial response when the request is not from the backend.

    Returns ``None`` when the request is allowed to proceed.
    """
    if request.url.path in EXEMPT_PATHS:
        return None

    if not is_configured():
        return JSONResponse(status_code=503, content={"detail": "Internal key not configured"})

    provided = request.headers.get("x-internal-key", "")
    if not hmac.compare_digest(provided, get_internal_key()):
        return JSONResponse(status_code=401, content={"detail": "Invalid internal key"})

    return None
