# Observability Stack

Self-hosted Prometheus + Grafana + Loki stack for VerifyWise. Designed for the full-Docker run mode — every service (backend, worker, eval_server, ai_gateway, postgres, redis, and the observability components) runs as a container on a shared compose network.

## How scraping works

All app services run in Docker, so Prometheus reaches them by their compose service name on the shared default network: `backend:3000`, `worker:9464`, `eval_server:8000`, `ai_gateway:8100`. The internal ports are what the apps actually listen on inside the container — no host port publishing is required for the scrape path.

## How env wiring works

`Observability/docker-compose.observability.yml` includes app-service overrides at the bottom of the file. When merged into the compose stack it extends the existing `backend` / `worker` / `eval_server` / `ai_gateway` services with `LOKI_URL=http://loki:3100` and `SERVICE_NAME=<service>`. The worker stanza also adds `WORKER_METRICS_PORT=9464` and exposes 9464 on the compose network so Prometheus can scrape it.

Without this file in the merge, `LOKI_URL` is unset and the loggers gracefully skip Loki shipping (`Servers/utils/logger/fileLogger.ts:15` — `LOKI_ENABLED = !!LOKI_URL && ...`). So observability is fully opt-in: drop the `-f Observability/...` flag and the app stack runs unchanged.

The `worker` service in `docker-compose.override.yml` is wired to build from `./Servers/Dockerfile.dev` so the locally-added `/metrics` endpoint is present in the binary. No manual editing required.

## Run

```bash
docker compose -p verifywise --env-file ./.env.dev \
  -f docker-compose.yml \
  -f docker-compose.override.yml \
  -f Observability/docker-compose.observability.yml \
  up -d --build
```

`--env-file ./.env.dev` is what makes `postgres_exporter` get `DB_USER` / `DB_PASSWORD` / `DB_PORT` / `DB_NAME`. Without it postgres_exporter will fail to connect.

## URLs

| URL | Service | Default credentials |
|---|---|---|
| http://localhost:3001 | Grafana | `admin` / `admin` (override via `GRAFANA_ADMIN_PASSWORD`) |
| http://localhost:9090 | Prometheus | — |
| http://localhost:3100 | Loki | — |

The "Backend Overview" dashboard auto-loads. Datasources auto-provision.

## What gets scraped

| Target | What |
|---|---|
| `backend:3000/metrics` | Backend |
| `worker:9464/metrics` | Worker |
| `eval_server:8000/metrics` | EvalServer |
| `ai_gateway:8100/metrics` | AI Gateway |
| `postgres_exporter:9187` | Postgres metrics |
| `redis_exporter:9121` | Redis metrics |
| `node_exporter:9100` | Host CPU/memory/disk (Linux only — see below) |
| `cadvisor:8080` | Per-container metrics (Linux only — see below) |

If you aren't running a particular app service, its target shows DOWN on the Prometheus targets page — harmless. Comment the job in `prometheus.yml` to silence it.

## Logs in Loki

Each app pushes structured JSON logs:
- Node: `winston-loki` transport in `Servers/utils/logger/fileLogger.ts`
- Python: `python-logging-loki` via `EvalServer/src/observability.py` and `AIGateway/src/observability.py`

Labels are low-cardinality (`service`, `env`, `level`). Tenant/request fields (`org_id`, `request_id`, `user_id`) are in the JSON body. Example queries:

```logql
{service="backend"} | json | level="error"
{service="backend"} | json | org_id="42"
{service=~"backend|ai_gateway"} | json | kind="http_outbound"
{service="backend"} | json | request_id="abc-..."
```

## Frontend RUM

Browser errors and Web Vitals POST to `/api/rum/errors` and `/api/rum/vitals`. The backend ships errors to Loki and exposes vitals as Prometheus histograms.

## Enabling node_exporter + cadvisor on Linux

These are disabled by default because Docker Desktop on macOS doesn't support the shared mount propagation they require. On a Linux host (or production deployment) add to `docker-compose.observability.yml`:

```yaml
  node_exporter:
    image: prom/node-exporter:v1.8.2
    restart: unless-stopped
    command:
      - --path.rootfs=/host
    volumes:
      - /:/host:ro,rslave
    pid: host
    expose:
      - "9100"

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.49.1
    restart: unless-stopped
    privileged: true
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    expose:
      - "8080"
```

And uncomment the corresponding scrape jobs at the bottom of `prometheus/prometheus.yml`.

## Production notes

- Loki uses filesystem storage with 7-day retention. For production, swap to S3/GCS.
- Prometheus retention is 15 days; for long-term storage front it with Thanos or Mimir.
- Grafana on `3001:3000` to avoid the backend's `3000`.
