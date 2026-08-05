"""OpenTelemetry bootstrap for the FastAPI service.

Pushes metrics + logs to the central observability stack (an OTel Collector on a
separate VM). Configuration is fetched ONCE at startup from the Express backend's
internal endpoint (`GET /api/internal/observability-config`), with env-var
fallback. Changes take effect after a restart ("direct export, restart to
apply").

Everything is a no-op when monitoring is disabled or unconfigured, so the
service always starts cleanly.

The request-metrics middleware deliberately emits the SAME instrument names as
the Node backend (`http.server.requests`, `http.server.request.duration`) so a
single Grafana dashboard works across every service and deployment.
"""

import contextvars
import logging
import os
import time
import uuid
from typing import Optional

logger = logging.getLogger("uvicorn")

_enabled = False
_deployment_name = os.environ.get("DEPLOYMENT_NAME", "unknown")
_request_counter = None
_request_duration = None

# Holds the current request's correlation id so logs emitted while handling a
# request can be tagged with it (and threaded across services).
_request_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_id", default=None
)


def get_request_id() -> Optional[str]:
    """Current request id, if inside a request. Useful for outbound propagation."""
    return _request_id_ctx.get()


class _RequestIdLogFilter(logging.Filter):
    """Inject the current request id onto every log record as `request_id`."""

    def filter(self, record: logging.LogRecord) -> bool:
        rid = _request_id_ctx.get()
        if rid:
            record.request_id = rid
        return True


def _fetch_config() -> dict:
    """Resolve config from the backend internal endpoint, falling back to env."""
    env_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    fallback = {
        "enabled": os.environ.get("OTEL_ENABLED") == "true" and bool(env_endpoint),
        "otlp_endpoint": env_endpoint,
        "deployment_name": os.environ.get("DEPLOYMENT_NAME", "unknown"),
        "auth_header": os.environ.get("OTEL_EXPORTER_OTLP_HEADERS_AUTH"),
    }

    backend_url = os.environ.get("BACKEND_URL")
    internal_key = os.environ.get("AI_GATEWAY_INTERNAL_KEY")
    if not backend_url or not internal_key:
        return fallback

    try:
        import httpx

        resp = httpx.get(
            f"{backend_url.rstrip('/')}/api/internal/observability-config",
            headers={"x-internal-key": internal_key},
            timeout=2.0,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("enabled") and data.get("otlp_endpoint"):
            return {
                "enabled": True,
                "otlp_endpoint": data["otlp_endpoint"],
                "deployment_name": data.get("deployment_name") or fallback["deployment_name"],
                "auth_header": data.get("auth_header"),
            }
        return {**fallback, "enabled": fallback["enabled"]}
    except Exception as exc:  # noqa: BLE001 - never block startup on telemetry config
        logger.warning("Observability config fetch failed, using env fallback: %s", exc)
        return fallback


def _parse_auth_header(auth_header: Optional[str]) -> Optional[dict]:
    if not auth_header:
        return None
    if ":" in auth_header:
        name, _, value = auth_header.partition(":")
        name, value = name.strip(), value.strip()
        return {name: value} if name and value else None
    return {"Authorization": auth_header.strip()}


def setup_observability(app, service_name: str) -> bool:
    """Initialize exporters + request middleware. Returns whether enabled."""
    global _enabled, _deployment_name, _request_counter, _request_duration

    config = _fetch_config()
    _deployment_name = config["deployment_name"]

    if not config["enabled"] or not config["otlp_endpoint"]:
        logger.info("[otel] observability disabled for %s", service_name)
        return False

    try:
        from opentelemetry import metrics
        from opentelemetry._logs import set_logger_provider
        from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
        from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
        from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource
    except ImportError as exc:
        logger.warning("[otel] OpenTelemetry packages missing (%s); telemetry off", exc)
        return False

    base = config["otlp_endpoint"].rstrip("/")
    headers = _parse_auth_header(config["auth_header"])

    resource = Resource.create(
        {
            "service.name": service_name,
            "deployment.name": _deployment_name,
            # Unique per worker process so multi-worker (uvicorn --workers N)
            # metric series don't collide in Prometheus.
            "service.instance.id": str(uuid.uuid4()),
        }
    )

    # Metrics
    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint=f"{base}/v1/metrics", headers=headers),
        export_interval_millis=15000,
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)
    meter = metrics.get_meter(service_name)
    _request_counter = meter.create_counter(
        "http.server.requests", description="Total HTTP requests handled"
    )
    _request_duration = meter.create_histogram(
        "http.server.request.duration", description="HTTP request duration", unit="s"
    )

    # Logs → ship through the central stack with deployment label.
    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(OTLPLogExporter(endpoint=f"{base}/v1/logs", headers=headers))
    )
    set_logger_provider(logger_provider)
    otlp_handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
    otlp_handler.addFilter(_RequestIdLogFilter())
    logging.getLogger().addHandler(otlp_handler)

    _register_request_middleware(app, service_name)
    _enabled = True
    logger.info(
        "[otel] observability enabled for %s — exporting to %s as deployment=%s",
        service_name,
        base,
        _deployment_name,
    )
    return True


def _register_request_middleware(app, service_name: str) -> None:
    @app.middleware("http")
    async def _track_requests(request, call_next):  # noqa: ANN001
        # Honor an inbound request id (forwarded from the backend) so logs thread
        # across services; otherwise mint one.
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        token = _request_id_ctx.set(rid)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            _request_id_ctx.reset(token)
        duration = time.perf_counter() - start
        response.headers["x-request-id"] = rid

        route = request.scope.get("route")
        route_label = getattr(route, "path", None) or "unmatched"
        attrs = {
            "http_request_method": request.method,
            "http_route": route_label,
            "http_response_status_code": response.status_code,
            "service_name": service_name,
            "deployment": _deployment_name,
        }
        if _request_counter is not None:
            _request_counter.add(1, attrs)
        if _request_duration is not None:
            _request_duration.record(duration, attrs)

        # One access log per request (parity with the Node backend). request_id is
        # passed explicitly since the contextvar was already reset above.
        logging.getLogger(service_name).info(
            "access %s %s %s %dms reqId=%s deployment=%s",
            request.method,
            route_label,
            response.status_code,
            int(duration * 1000),
            rid,
            _deployment_name,
            extra={"request_id": rid},
        )
        return response
