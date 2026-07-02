# VerifyWise Observability Stack

Centralized **metrics + logs** for every managed VerifyWise deployment, using
OpenTelemetry → Prometheus + Loki, visualized in Grafana.

This stack runs on a **dedicated monitoring VM**, separate from any application
deployment. Each VerifyWise deployment pushes OTLP telemetry to this VM's OTel
Collector, tagged with a **deployment name** so you can tell deployments apart.

```
VerifyWise deployment A ─┐
VerifyWise deployment B ─┼─(OTLP/HTTP :4318)─▶ otel-collector ─┬─▶ Prometheus ─▶ Grafana
VerifyWise deployment C ─┘                                     └─▶ Loki       ─▶ Grafana
```

## What's here

| File | Purpose |
|------|---------|
| `../docker-compose.observability.yml` | The stack: otel-collector, prometheus, loki, grafana |
| `otel-collector-config.yaml` | OTLP receivers → Prometheus (metrics) + Loki (logs) |
| `prometheus.yml` | Prometheus with OTLP receiver enabled |
| `loki-config.yaml` | Single-binary Loki, 30-day retention |
| `grafana/provisioning/` | Auto-provisioned datasources + dashboard provider |
| `grafana/dashboards/` | Starter dashboards: "Fleet Overview" + "Requests by deployment" |

## Deploy on the VM

```bash
# from the repo root on the monitoring VM
GRAFANA_ADMIN_PASSWORD='choose-a-strong-password' \
  docker compose -f docker-compose.observability.yml up -d
```

Ports exposed:

| Port | Service | Who connects |
|------|---------|--------------|
| `4318` | OTLP HTTP | **VerifyWise deployments** (this is the URL you enter in the UI) |
| `4317` | OTLP gRPC | (optional) gRPC exporters |
| `3001` | Grafana | Operators |
| `9090` | Prometheus | (optional, debugging) |
| `3100` | Loki | (optional, debugging) |

## Point a deployment at this stack

In the VerifyWise app, log in as **super admin** → **Settings → Monitoring**:

- **Enabled**: on
- **Observability URL**: `https://<this-vm-host>:4318` (the collector OTLP HTTP endpoint)
- **Deployment name**: a unique label for this deployment, e.g. `acme-prod`
- **Auth header** (optional): if you put the collector behind an auth proxy,
  e.g. `Authorization: Bearer <token>`

Then **restart** the deployment's services so they pick up the config
(`OTEL_*` are read at startup — see `docs/technical/infrastructure/observability.md`).

## Production hardening

- Terminate TLS in front of the collector (reverse proxy) and require auth — the
  OTLP endpoint is otherwise unauthenticated.
- Restrict `4317/4318` to your deployment networks via firewall/security groups.
- Set a strong `GRAFANA_ADMIN_PASSWORD`; do not expose Prometheus/Loki publicly.
- Size `PROMETHEUS_RETENTION` and Loki retention to your disk budget.
