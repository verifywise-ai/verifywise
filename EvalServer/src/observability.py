"""Observability bootstrap for FastAPI services.

Exposes:
  - /metrics  (Prometheus exposition)
  - Loki log shipping via the root logger (when LOKI_URL is set)
  - Structured HTTP access log middleware (one JSON line per request)
  - SQLAlchemy slow-query logger
  - httpx outbound-call logger (catches direct httpx + libraries like litellm)

Tenant info (org_id, user_id, request_id) is propagated via contextvars so
every log line — access, query, outbound, application — carries the request
context without callers having to pass it explicitly.
"""

from __future__ import annotations

import contextvars
import json
import logging
import os
import time
import uuid
from typing import Any, Optional

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware

# ---------------------------------------------------------------------------
# Request context (request_id, org_id, user_id)
# ---------------------------------------------------------------------------

request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_id", default=None
)
org_id_var: contextvars.ContextVar[Optional[int]] = contextvars.ContextVar(
    "org_id", default=None
)
user_id_var: contextvars.ContextVar[Optional[int]] = contextvars.ContextVar(
    "user_id", default=None
)


def _service_name(default: str) -> str:
    return os.environ.get("SERVICE_NAME", default)


def _env() -> str:
    return os.environ.get("ENV") or os.environ.get("NODE_ENV") or "development"


# ---------------------------------------------------------------------------
# Logging: JSON formatter that picks up request context from contextvars
# ---------------------------------------------------------------------------


class _ContextFilter(logging.Filter):
    """Injects request_id / org_id / user_id / service / env into every record."""

    def __init__(self, service: str, env: str) -> None:
        super().__init__()
        self.service = service
        self.env = env

    def filter(self, record: logging.LogRecord) -> bool:
        record.service = self.service
        record.env = self.env
        record.request_id = request_id_var.get()
        record.org_id = org_id_var.get()
        record.user_id = user_id_var.get()
        return True


class _JsonFormatter(logging.Formatter):
    """JSON formatter that emits a stable schema across all log types."""

    def format(self, record: logging.LogRecord) -> str:
        base: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
            "service": getattr(record, "service", None),
            "env": getattr(record, "env", None),
            "request_id": getattr(record, "request_id", None),
            "org_id": getattr(record, "org_id", None),
            "user_id": getattr(record, "user_id", None),
        }
        for k, v in record.__dict__.items():
            if k in base or k.startswith("_"):
                continue
            if k in {
                "args", "msg", "levelname", "levelno", "pathname", "filename",
                "module", "exc_info", "exc_text", "stack_info", "lineno",
                "funcName", "created", "msecs", "relativeCreated", "thread",
                "threadName", "processName", "process", "name", "asctime",
                "taskName",
            }:
                continue
            try:
                json.dumps(v)
                base[k] = v
            except (TypeError, ValueError):
                base[k] = str(v)
        if record.exc_info:
            base["exception"] = self.formatException(record.exc_info)
        return json.dumps(base, default=str)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def install_observability(app: FastAPI, *, service: str, engine: Any = None) -> None:
    """Mount /metrics, configure JSON logging + Loki, and wire access/query/outbound logs.

    Pass `engine` to enable SQLAlchemy slow-query logging.
    Safe to call once during app startup.
    """
    service_name = _service_name(service)
    env = _env()

    _install_logging(service=service_name, env=env)
    _install_metrics(app, service=service_name)
    app.add_middleware(_AccessLogMiddleware)
    if engine is not None:
        _install_sqlalchemy_slow_query(engine)
    _install_httpx_logging()


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _install_logging(*, service: str, env: str) -> None:
    root = logging.getLogger()
    formatter = _JsonFormatter()
    ctx_filter = _ContextFilter(service=service, env=env)

    # Stdout — keep so container log drivers still see something.
    stdout_handler = logging.StreamHandler()
    stdout_handler.setFormatter(formatter)
    stdout_handler.addFilter(ctx_filter)
    root.addHandler(stdout_handler)

    # Loki — only if explicitly configured.
    loki_url = os.environ.get("LOKI_URL")
    if loki_url and os.environ.get("LOKI_ENABLED", "").lower() != "false":
        try:
            import logging_loki

            loki_handler = logging_loki.LokiHandler(
                url=f"{loki_url.rstrip('/')}/loki/api/v1/push",
                tags={"service": service, "env": env},
                version="1",
            )
            loki_handler.setLevel(logging.INFO)
            loki_handler.setFormatter(formatter)
            loki_handler.addFilter(ctx_filter)
            root.addHandler(loki_handler)
        except ImportError:
            logging.getLogger(__name__).warning(
                "python-logging-loki not installed; skipping Loki log shipping"
            )

    if root.level == logging.NOTSET or root.level > logging.INFO:
        root.setLevel(logging.INFO)


def _install_metrics(app: FastAPI, *, service: str) -> None:
    try:
        from prometheus_fastapi_instrumentator import Instrumentator
    except ImportError:
        logging.getLogger(__name__).warning(
            "prometheus-fastapi-instrumentator not installed; skipping /metrics"
        )
        return

    Instrumentator(
        should_group_status_codes=False,
        excluded_handlers=["/metrics", "/health"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


_ACCESS_LOG = logging.getLogger("verifywise.access")
_ACCESS_SKIP = {"/metrics", "/health"}
_ACCESS_SKIP_PREFIXES = ("/api/rum/",)


class _AccessLogMiddleware(BaseHTTPMiddleware):
    """Logs one structured line per HTTP request; sets request/org/user contextvars."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        skip = path in _ACCESS_SKIP or any(path.startswith(p) for p in _ACCESS_SKIP_PREFIXES)

        incoming = request.headers.get("x-request-id")
        request_id = incoming if incoming and 0 < len(incoming) <= 128 else uuid.uuid4().hex
        token_req = request_id_var.set(request_id)

        org_header = request.headers.get("x-organization-id")
        token_org = None
        if org_header:
            try:
                token_org = org_id_var.set(int(org_header))
            except ValueError:
                token_org = None
        user_header = request.headers.get("x-user-id")
        token_user = None
        if user_header:
            try:
                token_user = user_id_var.set(int(user_header))
            except ValueError:
                token_user = None

        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-Id"] = request_id
            return response
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            if not skip:
                level = (
                    logging.ERROR
                    if status_code >= 500
                    else logging.WARNING
                    if status_code >= 400
                    else logging.INFO
                )
                _ACCESS_LOG.log(
                    level,
                    "%s %s %s",
                    request.method,
                    path,
                    status_code,
                    extra={
                        "kind": "http_access",
                        "method": request.method,
                        "path": path,
                        "status": status_code,
                        "duration_ms": round(duration_ms, 2),
                        "user_agent": request.headers.get("user-agent"),
                        "client_ip": request.client.host if request.client else None,
                    },
                )
            request_id_var.reset(token_req)
            if token_org is not None:
                org_id_var.reset(token_org)
            if token_user is not None:
                user_id_var.reset(token_user)


_DB_LOG = logging.getLogger("verifywise.db")
_HTTP_LOG = logging.getLogger("verifywise.http")


def _install_sqlalchemy_slow_query(engine: Any) -> None:
    """Hook into the engine to log queries above DB_SLOW_QUERY_MS (default 100)."""
    if os.environ.get("DB_LOG_QUERIES", "").lower() == "false":
        return

    try:
        slow_ms = float(os.environ.get("DB_SLOW_QUERY_MS", "100"))
    except ValueError:
        slow_ms = 100.0

    try:
        from sqlalchemy import event

        sync_engine = engine.sync_engine if hasattr(engine, "sync_engine") else engine
    except Exception:
        return

    @event.listens_for(sync_engine, "before_cursor_execute")
    def _before(conn, cursor, statement, parameters, context, executemany):  # noqa: D401
        context._vw_start = time.perf_counter()

    @event.listens_for(sync_engine, "after_cursor_execute")
    def _after(conn, cursor, statement, parameters, context, executemany):  # noqa: D401
        start = getattr(context, "_vw_start", None)
        if start is None:
            return
        duration_ms = (time.perf_counter() - start) * 1000
        if slow_ms > 0 and duration_ms < slow_ms:
            return
        preview = statement if len(statement) <= 500 else statement[:500] + "…"
        _DB_LOG.warning(
            "slow query %.2fms",
            duration_ms,
            extra={
                "kind": "db_query",
                "duration_ms": round(duration_ms, 2),
                "sql": preview,
            },
        )


def _install_httpx_logging() -> None:
    """Wrap httpx Client.send and AsyncClient.send to log every outbound call.

    Filters out Loki push traffic to avoid amplification loops.
    """
    try:
        import httpx
    except ImportError:
        return

    loki_url = os.environ.get("LOKI_URL")

    def _should_skip(url: str) -> bool:
        if loki_url and url.startswith(loki_url):
            return True
        return "/loki/api/v1/push" in url

    def _log(method: str, url: str, status: Optional[int], duration_ms: float, err: Optional[str]) -> None:
        if _should_skip(url):
            return
        try:
            host = httpx.URL(url).host or "unknown"
        except Exception:
            host = "unknown"
        if err or (status is not None and status >= 500):
            level = logging.ERROR
        elif status is not None and status >= 400:
            level = logging.WARNING
        else:
            level = logging.INFO
        _HTTP_LOG.log(
            level,
            "%s %s %s",
            method,
            host,
            status if status is not None else "ERR",
            extra={
                "kind": "http_outbound",
                "method": method,
                "url": url,
                "host": host,
                "status": status,
                "duration_ms": round(duration_ms, 2),
                "error": err,
            },
        )

    if getattr(httpx.Client.send, "_vw_wrapped", False):
        return

    _original_sync = httpx.Client.send
    _original_async = httpx.AsyncClient.send

    def _stamp_request_id(request) -> None:  # type: ignore[no-untyped-def]
        """Forward the current request_id to downstream services so traces stitch."""
        request_id = request_id_var.get()
        if request_id and "x-request-id" not in request.headers:
            request.headers["X-Request-Id"] = request_id

    def _sync_send(self, request, **kwargs):  # type: ignore[no-untyped-def]
        _stamp_request_id(request)
        start = time.perf_counter()
        try:
            response = _original_sync(self, request, **kwargs)
            _log(request.method, str(request.url), response.status_code,
                 (time.perf_counter() - start) * 1000, None)
            return response
        except Exception as exc:
            _log(request.method, str(request.url), None,
                 (time.perf_counter() - start) * 1000, str(exc))
            raise

    async def _async_send(self, request, **kwargs):  # type: ignore[no-untyped-def]
        _stamp_request_id(request)
        start = time.perf_counter()
        try:
            response = await _original_async(self, request, **kwargs)
            _log(request.method, str(request.url), response.status_code,
                 (time.perf_counter() - start) * 1000, None)
            return response
        except Exception as exc:
            _log(request.method, str(request.url), None,
                 (time.perf_counter() - start) * 1000, str(exc))
            raise

    _sync_send._vw_wrapped = True  # type: ignore[attr-defined]
    _async_send._vw_wrapped = True  # type: ignore[attr-defined]
    httpx.Client.send = _sync_send  # type: ignore[assignment]
    httpx.AsyncClient.send = _async_send  # type: ignore[assignment]
