# Alertmanager

Alertmanager receives fired alerts from **Prometheus** (via
`--alertmanager.url=http://alertmanager:9093`, see
`observability/prometheus/RULES.md`) and from the **Loki ruler**
(`alertmanager_url` in `observability/loki-config.yaml`), then groups,
inhibits, and routes them to the SRE webhook / email.

## Compose service to add

The root `docker-compose.observability.yml` is owned by the CI/compose
workflow — add the following snippet there (it has been reviewed to fit the
existing service/network shape; no custom image is needed, the stock
`prom/alertmanager` loads this config straight from a volume mount):

```yaml
  alertmanager:
    image: prom/alertmanager:v0.27.0
    command:
      - "--config.file=/etc/alertmanager/alertmanager.yml"
      - "--storage.path=/alertmanager"
    environment:
      # Compose expands these on the host before the container starts; the
      # config file itself ships literal safe defaults because amtool
      # check-config validates it raw (no compose expansion in CI).
      - ALERTMANAGER_SMTP_FROM=${ALERTMANAGER_SMTP_FROM:-alertmanager@verifywise.local}
      - ALERTMANAGER_SMTP_SMARTHOST=${ALERTMANAGER_SMTP_SMARTHOST:-localhost:25}
      - ALERTMANAGER_SMTP_USERNAME=${ALERTMANAGER_SMTP_USERNAME:-}
      - ALERTMANAGER_SMTP_PASSWORD=${ALERTMANAGER_SMTP_PASSWORD:-}
      - ALERTMANAGER_EMAIL_TO=${ALERTMANAGER_EMAIL_TO:-sre@verifywise.local}
      - ALERTMANAGER_WEBHOOK_URL=${ALERTMANAGER_WEBHOOK_URL:-http://localhost:5001/alerts}
    volumes:
      - ./observability/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - alertmanager_data:/alertmanager
    expose:
      - "9093"     # API + UI; reachable as http://alertmanager:9093 on the compose network
    ports:
      - "9093:9093"
    restart: unless-stopped
```

…and add `alertmanager_data:` to the `volumes:` section at the bottom of the
compose file.

> Why no Dockerfile here? The stock image mounts the config as a read-only
> volume, so no custom build is required. Keep it that way.

## Environment variables

The shipped `alertmanager.yml` contains **literal safe defaults** (loopback
SMTP, loopback webhook) so it passes `amtool check-config` as-is. To wire real
destinations, either:

1. **Recommended** — keep the compose service above: compose expands the
   `ALERTMANAGER_*` host env (with `:-` fallbacks) into container env, and you
   mount your own interpolated copy or override the config path, **or**
2. Replace the placeholder values in `alertmanager.yml` directly (or keep env
   injection by using plain `$VAR` references in your private overlay — never
   `${VAR:-default}` in the committed file, since amtool validates it raw).

Set them in the environment / `.env` of the monitoring VM.

| Variable | Purpose | Default (placeholder) |
|----------|---------|-----------------------|
| `ALERTMANAGER_WEBHOOK_URL` | Endpoint `sre-webhook` POSTs alerts to (Slack-compatible proxy, PagerDuty Events API v2, or an internal forwarder). | `http://localhost:5001/alerts` |
| `ALERTMANAGER_SMTP_FROM` | Sender address for email notifications. | `alertmanager@verifywise.local` |
| `ALERTMANAGER_SMTP_SMARTHOST` | `host:port` of the SMTP relay. | `localhost:25` |
| `ALERTMANAGER_SMTP_USERNAME` | SMTP auth username (empty = no auth). | *(empty)* |
| `ALERTMANAGER_SMTP_PASSWORD` | SMTP auth password. | *(empty)* |
| `ALERTMANAGER_EMAIL_TO` | Recipient for the `sre-email` receiver (critical alerts). | `sre@verifywise.local` |

Until `ALERTMANAGER_WEBHOOK_URL` points at a real endpoint, alerts are still
accepted and visible in the Alertmanager UI (`http://<monitoring-vm>:9093`)
but go nowhere — a reasonable first-boot state.

## Routing model

- Root route → `sre-webhook`, grouped by `alertname, deployment, severity`
  (30s wait, 5m group interval, 12h repeat).
- `team=sre` → `sre-webhook`; `severity=critical` → additionally `sre-email`
  (`continue: true` so both fire).
- Inhibit example: `VwDeploymentSilent` on a deployment suppresses
  `severity=warning` alerts for the same deployment.

Every rule in `observability/prometheus/alerts.yml` sets `team: sre`, so this
tree has a single leaf today; new teams only add receivers + route entries.

## Validation

```bash
amtool check-config observability/alertmanager/alertmanager.yml
```
(CI validation is owned by the CI pod.)
