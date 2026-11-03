# Uptime Kuma (synthetic / canary monitoring)

Issue **#4681-b (stack part)**: the observability stack gets an
[Uptime Kuma](https://github.com/louislam/uptime-kuma) instance for synthetic
checks against every managed VerifyWise deployment. This is the natural
producer for the `verifywise_frontend_canary_success` metric consumed by
`VwFrontendCanaryFailing` in `observability/prometheus/alerts.yml` (see the
`# TODO(metric-wiring):` note there — Kuma's Prometheus export or a small
shim should expose the canary gauge).

## Compose service to add

The root `docker-compose.observability.yml` is owned by the CI/compose
workflow — add this snippet there:

```yaml
  uptime-kuma:
    image: louislam/uptime-kuma:1
    volumes:
      - uptime_kuma_data:/app/data
    ports:
      # Front with the same TLS reverse proxy as Grafana (3001); 3001 is
      # Kuma's default container port.
      - "3002:3001"
    restart: unless-stopped
```

…and add `uptime_kuma_data:` to the compose `volumes:` section.

First boot: open `http://<monitoring-vm>:3002`, create the admin account,
then configure the monitors below (Settings → Backup for export/import).

## Checks to configure

| # | Monitor | Type | URL | Interval | Retries | Resend after down | Expected |
|---|---------|------|-----|----------|---------|-------------------|----------|
| 1 | Backend health | HTTP(s) | `https://<deployment>/health` | 60s | 2 | 0 | Status 200, keyword `ok` |
| 2 | Backend readiness | HTTP(s) | `https://<deployment>/health/ready` | 60s | 2 | 0 | Status 200 |
| 3 | Frontend | HTTP(s) | `https://<deployment>/` | 30s | 2 | 0 | Status 200 |
| 4 | Frontend canary (login page) | HTTP(s) - keyword | `https://<deployment>/login` | 60s | 1 | 0 | Keyword `VerifyWise` present |
| 5 | AI Gateway health | HTTP(s) | `https://<ai-gateway>/health` | 60s | 2 | 0 | Status 200 |

Notes:
- `/health` (and `/health/live`, `/health/ready`) exist on the Express
  backend (`Servers/app.ts:258-267`); `/health` exists on the AI Gateway
  (`AIGateway/src/app.py:147`). Adjust the public hostnames per deployment.
- The **canary** monitor (#4) is the one that should feed
  `verifywise_frontend_canary_success` (1 = up, 0 = down) with labels
  `deployment` and `url` — either via Kuma's Prometheus export
  (Settings → Prometheus, scrape
  `http://uptime-kuma:3001/metrics?token=<token>`) mapped to that gauge name,
  or via a tiny OTLP-pushing shim.
- Notifications: point Kuma's webhook/notification channels at the same
  `${ALERTMANAGER_WEBHOOK_URL}`-style bridge used by Alertmanager, or add
  Kuma as a GlitchTip-adjacent notification target.

## Monitors config export example

Kuma does not have a first-class per-monitor YAML/JSON import that covers
every field, but **Settings → Backup → Export** produces a JSON backup whose
`monitor` array looks like the following — useful as a reviewable,
version-controlled template to paste/import during setup:

```json
{
  "version": "1.23.0",
  "monitor": [
    {
      "id": 1,
      "name": "Backend /health",
      "type": "http",
      "url": "https://app.example.com/health",
      "interval": 60,
      "retryInterval": 60,
      "maxretries": 2,
      "resendInterval": 0,
      "accepted_statuscodes": ["200"],
      "expiryNotification": true
    },
    {
      "id": 2,
      "name": "Frontend",
      "type": "http",
      "url": "https://app.example.com/",
      "interval": 30,
      "retryInterval": 30,
      "maxretries": 2,
      "resendInterval": 0,
      "accepted_statuscodes": ["200"],
      "expiryNotification": true
    },
    {
      "id": 3,
      "name": "AI Gateway /health",
      "type": "http",
      "url": "https://ai-gateway.example.com/health",
      "interval": 60,
      "retryInterval": 60,
      "maxretries": 2,
      "resendInterval": 0,
      "accepted_statuscodes": ["200"],
      "expiryNotification": true
    },
    {
      "id": 4,
      "name": "Frontend canary (login page)",
      "type": "keyword",
      "url": "https://app.example.com/login",
      "keyword": "VerifyWise",
      "interval": 60,
      "retryInterval": 60,
      "maxretries": 1,
      "resendInterval": 0,
      "accepted_statuscodes": ["200"],
      "expiryNotification": true
    }
  ]
}
```

After import, adjust hosts per managed deployment and enable the Prometheus
export token.
