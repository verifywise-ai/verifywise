"""Shared authentication for the internal API.

Every router mounted under /internal is included with include_internal_router,
which attaches verify_internal_key as a router-level dependency, so a route
cannot forget the check. The key is checked before the body is validated
against the route's schema, so an unauthenticated request learns nothing
about it. FastAPI still reads and JSON-decodes the body first: a body that is
not JSON at all gets a 422 json_invalid even without the key.
"""

import hmac
import logging
import time

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request

from config import settings

logger = logging.getLogger(__name__)

# Machine codes in the error detail, so the caller can tell these refusals
# from a 503 or 401 sent by a proxy or load balancer.
INTERNAL_KEY_NOT_CONFIGURED = "internal_key_not_configured"
INTERNAL_KEY_REJECTED = "internal_key_rejected"

# A rejected key is logged at most once per route in this window. The limiter
# is keyed on the matched route template (never the raw path, query or
# headers), so callers cannot create new keys, and it is capped as well.
REJECTED_KEY_LOG_INTERVAL_SECONDS = 60.0
REJECTED_KEY_LOG_MAX_ROUTES = 256
_UNMATCHED_ROUTE = "<unmatched>"
# route template -> [time it was last logged, rejections not logged since]
_rejected_log_state: dict[str, list] = {}
# A single flag: the missing-key error is logged once per process.
_missing_key_logged = False


def keys_match(provided: str, expected: str) -> bool:
    """Constant-time comparison of two keys as UTF-8 bytes.

    hmac.compare_digest raises TypeError for a str with non-ASCII characters,
    which would surface as a 500; such a header can never match an ASCII key,
    so as bytes it is simply a mismatch."""
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


def _log_missing_key_once(request: Request) -> None:
    global _missing_key_logged
    if _missing_key_logged:
        return
    _missing_key_logged = True
    logger.error(
        "Refusing internal requests (first: %s %s): AI_GATEWAY_INTERNAL_KEY is not "
        "configured. Every internal route answers 503 until it is set.",
        request.method,
        request.url.path,
    )


def _route_template(request: Request) -> str:
    """The matched route's path template (e.g. /internal/keys/{key_id})."""
    route = request.scope.get("route") if hasattr(request, "scope") else None
    template = getattr(route, "path", None)
    return template if isinstance(template, str) and template else _UNMATCHED_ROUTE


def _log_rejected_key(request: Request) -> None:
    """Warn about a rejected key, at most once a minute per route template;
    the next warning counts the rejections suppressed in between. Only the
    method and the template are logged, never the key, the header value or
    the raw path."""
    route = _route_template(request)
    now = time.monotonic()
    state = _rejected_log_state.get(route)
    if state is not None and now - state[0] < REJECTED_KEY_LOG_INTERVAL_SECONDS:
        state[1] += 1
        return
    suppressed = state[1] if state is not None else 0
    if state is None and len(_rejected_log_state) >= REJECTED_KEY_LOG_MAX_ROUTES:
        # Hard cap: drop the oldest entry (dicts keep insertion order).
        _rejected_log_state.pop(next(iter(_rejected_log_state)))
    _rejected_log_state.pop(route, None)
    _rejected_log_state[route] = [now, 0]
    if suppressed:
        logger.warning(
            "Rejected internal request %s %s (%d more since last log): invalid internal key",
            request.method,
            route,
            suppressed,
        )
    else:
        logger.warning(
            "Rejected internal request %s %s: invalid internal key", request.method, route
        )


async def verify_internal_key(request: Request) -> None:
    """Verify the request comes from the Express backend. Fails closed:

    - no internal key configured (empty or whitespace, trimmed by settings):
      503 with code internal_key_not_configured, and the request is not
      served. Defence in depth: the gateway already refuses to start without
      a key (app.py). Logged once per process.
    - a missing, wrong or non-ASCII x-internal-key header: 401 with code
      internal_key_rejected. Logged as a rate-limited warning.

    Errors carry {"detail": {"message": ..., "code": ...}}. Used as a
    router-level dependency through include_internal_router. Async because
    it never blocks: it runs on the event loop instead of taking a threadpool
    slot per request, and the log state above is only touched from the loop."""
    expected = settings.ai_gateway_internal_key
    if not expected:
        _log_missing_key_once(request)
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Internal key not configured",
                "code": INTERNAL_KEY_NOT_CONFIGURED,
            },
        )
    auth = request.headers.get("x-internal-key", "")
    if not keys_match(auth, expected):
        _log_rejected_key(request)
        raise HTTPException(
            status_code=401,
            detail={"message": "Invalid internal key", "code": INTERNAL_KEY_REJECTED},
        )


def include_internal_router(
    app: FastAPI, router: APIRouter, prefix: str = "", **kwargs
) -> None:
    """Mount a router under /internal (plus an optional extra `prefix`) with
    the internal key check on every route it has.

    include_router copies the router's routes when it is called, so all routes
    must be defined before the router is mounted."""
    dependencies = [Depends(verify_internal_key), *(kwargs.pop("dependencies", None) or [])]
    app.include_router(
        router, prefix=f"/internal{prefix}", dependencies=dependencies, **kwargs
    )
