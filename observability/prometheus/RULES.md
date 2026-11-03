# Alert rules wiring

`alerts.yml` lives next to `prometheus.yml` in the parent of this directory, which loads it
via:

```yaml
rule_files:
  - "alerts.yml"   # relative to the prometheus.yml directory
```

## Required compose wiring

The root `docker-compose.observability.yml` is owned by the CI/compose
workflow. To activate the rules, the `prometheus` service there needs one extra
volume (the config file itself is already mounted):

```yaml
  prometheus:
    volumes:
      - ./observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      # NEW: alert rules (referenced by rule_files in prometheus.yml)
      - ./observability/alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus_data:/prometheus
```

No Prometheus command-line changes are needed — `rule_files` is picked up from
the config and Prometheus reloads it on `SIGHUP` / `--web.enable-lifecycle`.

## Alert delivery

Prometheus sends fired alerts to **Alertmanager**. On the same compose
network the Alertmanager service is reachable as `http://alertmanager:9093`;
add this to the Prometheus command in the compose file:

```yaml
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=${PROMETHEUS_RETENTION:-30d}"
      - "--web.enable-otlp-receiver"
      # NEW: deliver alerts to the Alertmanager service
      - "--alertmanager.url=http://alertmanager:9093"
```

Loki's ruler uses the same Alertmanager (`alertmanager_url` in
`../loki-config.yaml` already points at `http://alertmanager:9093`).

## Rules with not-yet-existing metrics

Four rules reference metrics the application does **not** emit yet. Each is
marked `# TODO(metric-wiring):` in `alerts.yml` with the exact expected
instrument name and labels:

| Rule | Expected metric | Owner |
|------|-----------------|-------|
| `VwBullMQQueueDepthHigh` | `verifywise_queue_jobs{queue,state,deployment}` gauge | backend (Servers/jobs/worker.ts — `Worker.getJobCounts()`) |
| `VwDBPoolNearExhaustion` | `verifywise_db_pool_connections{state,deployment}` + `verifywise_db_pool_max{deployment}` gauges | backend (Servers/database/db.ts Sequelize pool) |
| `VwBackupTooOld` | `verifywise_backup_last_success_timestamp_seconds{deployment}` gauge | backup job/exporter (textfile collector or tiny `/metrics` sidecar) |
| `VwFrontendCanaryFailing` | `verifywise_frontend_canary_success{deployment,url}` gauge | uptime-kuma Prometheus export or a canary prober |

Until those instruments exist, the corresponding rules evaluate to "no data"
and simply never fire — this is safe.

## Validation

Locally: `promtool check rules observability/alerts.yml`.
In CI (owned by the CI pod): same command plus `promtool check config
observability/prometheus.yml`.
