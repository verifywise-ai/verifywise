# Observability (Metrics + Logs via OpenTelemetry)

> **Last Updated:** 2026-06-22

VerifyWise deployments push **metrics** and **logs** to a central
Grafana / Prometheus / Loki stack via OpenTelemetry, so operators get visibility
across every managed server. Each deployment is tagged with a **deployment name**.

## Architecture

```
┌──────────────── VerifyWise deployment ────────────────┐
│  Node backend ─┐                                       │
│  EvalServer  ──┤  OTLP/HTTP (metrics + logs)           │
│  AIGateway   ──┤───────────────────────────────────────┼──▶ OTel Collector (VM)
│  React UI ─▶ POST /api/telemetry ─▶ backend ─┘         │        │
└────────────────────────────────────────────────────────┘        ├─▶ Prometheus ─┐
                                                                   └─▶ Loki ───────┴─▶ Grafana
```

- **Direct export, restart to apply.** Exporters are configured at process
  startup. The destination URL + deployment name are stored in the DB (set via
  the UI) and read once on boot. Changing them requires a service restart.
- **No app-side collector.** Services push OTLP straight to a collector running
  on the monitoring VM (the single URL operators enter). The collector fans out
  to Prometheus (via its OTLP receiver) and Loki.
- **Metrics + logs only** (no distributed tracing).

## Configuration

Two sources, DB takes precedence:

1. **UI (preferred):** SuperAdmin → Settings → Monitoring. Persists to
   `verifywise.monitoring_config` (single row). Fields: `enabled`,
   `otlp_endpoint`, `deployment_name`, `auth_header`.
2. **Env fallback:** `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
   `DEPLOYMENT_NAME`, `OTEL_EXPORTER_OTLP_HEADERS_AUTH` (see `.env.dev` /
   `.env.prod` and `docker-compose.yml`).

Config delivery per service:

| Service | How it reads config |
|---------|--------------------|
| Node backend | `Servers/observability/otel.ts` reads `monitoring_config` directly (env fallback) |
| EvalServer / AIGateway | `src/observability.py` fetches `GET /api/internal/observability-config` (internal key), env fallback |
| React frontend | Posts events to `POST /api/telemetry`; backend re-emits with deployment label |

## What gets emitted

**Metrics** (Prometheus names after OTLP translation):

| Metric | Type | Labels |
|--------|------|--------|
| `http_server_requests_total` | counter | `http_request_method`, `http_route`, `http_response_status_code`, `service_name`, `deployment` |
| `http_server_request_duration_seconds` | histogram | same as above |
| `browser_events_total`, `browser_web_vital` | counter/histogram | frontend telemetry |

Service names: `verifywise-backend`, `verifywise-eval-server`,
`verifywise-ai-gateway`, `verifywise-frontend`.

**Logs** — shipped to Loki with `service_name` + `deployment` labels:

- Per-request access logs from `requestMetricsMiddleware`
  (`Servers/middleware/requestMetrics.middleware.ts`) — every request tracked.
- All existing structured logs (`logStructured` in
  `Servers/utils/logger/fileLogger.ts`) — file logging is unchanged; OTLP
  shipping is additive.
- Python service logs via the OTel `LoggingHandler`.

### Telemetry must never fail a request

`emitOtlpLog` and `recordRequestMetric` run synchronously inside request
handling (controllers via `logStructured`, and the response `finish` hook).
Both catch any SDK error, report it once per call site through the OTel `diag`
logger, and drop that telemetry, so the request itself still succeeds.

Keep every `@opentelemetry/*` package on the same release line. In particular,
the `@opentelemetry/core` entry in `Servers/package.json` `overrides` (a
security floor) must stay on the major that `resources`, `sdk-logs` and
`sdk-metrics` require (currently `^3.1.0`). In November 2026 it was left at
`^2.9.0` under 3.x SDKs. As a result, every login on a monitoring-enabled
deployment returned 500 (`cleanSimpleAttributes is not a function`).
`Servers/observability/__tests__/otel.test.ts` runs the installed packages
together and fails on such a mismatch.

### Request correlation across services

Each request gets an `x-request-id` (honored if the caller sent one, else
generated). The backend:

- stamps it in the access log (`reqId=…`) and returns it as the `x-request-id`
  response header, and
- forwards it on internal calls to the Python services (`Servers/routes/aiGateway.route.ts`,
  `Servers/routes/deepEvalRoutes.route.ts`).

The Python services honor the inbound id, attach it to every log record as a
`request_id` attribute (`_RequestIdLogFilter` in `src/observability.py`), and echo
it back. So a forwarded request (backend → eval server / ai gateway / LLM via the
gateway) can be followed in Loki:

```
{deployment="acme-prod"} |= "reqId=<id>"      # backend access + business logs
{deployment="acme-prod"} | json | request_id="<id>"   # eval server / ai gateway
```

> Deeper sub-hops initiated *by* a Python service (e.g. eval server → ai gateway)
> are not auto-propagated — keep it lightweight. `get_request_id()` is exposed in
> `src/observability.py` if you ever need to forward it onward.

## Standing up the central stack

See [`observability/README.md`](../../../observability/README.md). On the
monitoring VM:

```bash
GRAFANA_ADMIN_PASSWORD='...' docker compose -f docker-compose.observability.yml up -d
```

Then point each deployment at `https://<vm>:4318` via the Monitoring settings
tab and restart its services. Two Grafana dashboards are provisioned
automatically:

- **VerifyWise — Fleet Overview** — at-a-glance health across all deployments
  (deployments reporting, total request rate, fleet error %, p95, a per-deployment
  table, and recent 5xx errors).
- **VerifyWise — Requests by deployment** — drill-down for one deployment/service:
  request rate, error rate, p95 latency, log volume, and recent logs.

## Key files

| Purpose | Path |
|---------|------|
| VM stack | `docker-compose.observability.yml`, `observability/` |
| Backend OTel bootstrap | `Servers/observability/otel.ts` |
| Request metrics + access log | `Servers/middleware/requestMetrics.middleware.ts` |
| Frontend telemetry sink | `Servers/routes/telemetry.route.ts` |
| Config table + utils | migration `*-create-monitoring-config.js`, `Servers/utils/monitoringConfig.utils.ts` |
| SuperAdmin endpoints | `Servers/controllers/superAdmin.ctrl.ts` (`getMonitoring`/`updateMonitoring`) |
| Internal config endpoint | `Servers/routes/internal.route.ts` (`/observability-config`) |
| Python instrumentation | `AIGateway/src/observability.py`, `EvalServer/src/observability.py` |
| Frontend UI | `Clients/src/presentation/pages/SuperAdmin/Settings/Monitoring/` |
| Browser telemetry | `Clients/src/infrastructure/observability/browserTelemetry.ts` |
