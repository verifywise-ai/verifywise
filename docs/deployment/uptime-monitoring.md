# Uptime Monitoring (Uptime Kuma)

**Issue:** #4681-b (docs part)
**Date:** 2026-10-20
**Status of referenced stack doc:** ✅ `observability/uptime-kuma/README.md`
exists on disk (verified with `Test-Path` 2026-10-20) and already carries the
compose snippet, monitor table, and Kuma backup-export example — **this
document is the operational companion**: what to configure, why, and who owns
it. Where this doc and the stack README overlap, the stack README wins for
implementation detail.

## 1. Deployment

Uptime Kuma runs as part of the observability compose stack. Deployment
mechanics (image, volume, port `3002:3001`) live in
[`observability/uptime-kuma/README.md`](../../observability/uptime-kuma/README.md) ✅ —
including the note that the `uptime-kuma:` service snippet must be added to
the CI-owned `docker-compose.observability.yml`.

- First boot: create the admin account on `http://<monitoring-vm>:3002`,
  then configure the monitors below (Settings → Backup for export/import).
- Data persistence: the `uptime_kuma_data` named volume; include it in backup
  strategy alongside Grafana/Loki volumes (see
  `docs/deployment/DISASTER_RECOVERY_GUIDE.md` ✅).

## 2. Checks to configure

Health endpoints cited here were verified in
`Servers/app.ts` (lines 254–267: `/health`, `/health/live`, `/health/ready`)
and `AIGateway/src/app.py` (`/health`), per the stack README.

| Monitor | URL | Interval | Retries | Resend when down | Expected |
|---------|-----|----------|---------|------------------|----------|
| Backend health | `https://<deployment>/health` | 60 s | 2 | 0 | 200, body `ok` |
| Backend readiness | `https://<deployment>/health/ready` | 60 s | 2 | 0 | 200 |
| Frontend | `https://<deployment>/` | 30 s | 2 | 0 | 200 |
| Frontend canary (login) | `https://<deployment>/login` | 60 s | 1 | 0 | keyword `VerifyWise` present |
| AI Gateway health | `https://<ai-gateway>/health` | 60 s | 2 | 0 | 200 |

Rationale:
- **Frontend at 30 s** — user-facing surface; fastest detection wins.
- **Backend at 60 s with 2 retries** — `/health` includes the AI Gateway
  dependency, so transient gateway blips must not page anyone; retries absorb
  that. Use `/health/ready` (PostgreSQL + Redis only) when you want backend
  data-store signal without gateway noise.
- **Canary keyword check** — asserts the login page actually renders branded
  content (catches blank-200 deployments); this is the monitor intended to
  feed the `verifywise_frontend_canary_success` metric consumed by
  `VwFrontendCanaryFailing` in `observability/prometheus/alerts.yml`
  (see the `# TODO(metric-wiring)` note in the stack README).

## 3. Notification wiring (alerting channel)

Route Kuma alerts to the same channel Alertmanager uses, so on-call sees one
stream regardless of source:

1. In Kuma: **Settings → Notifications → Add → Webhook**, pointing at the
   Alertmanager webhook bridge (`${ALERTMANAGER_WEBHOOK_URL}`-style endpoint).
   🟡 The Alertmanager config itself (`observability/prometheus/alertmanager.yml`)
   is planned-this-cycle — it was not on disk at writing time; use the same
   webhook URL variable the stack doc references and re-verify the path once
   it lands.
2. Set the notification on every monitor above (per-monitor notification list,
   not just the default).
3. Keep Kuma's **Prometheus export** enabled (Settings → Prometheus) so the
   canary gauge can be scraped/mapped per the stack README — Kuma is the
   synthetic producer; Alertmanager remains the alert router. Do not create a
   second, parallel paging path from Kuma's built-in email/Slack channels.

## 4. Ownership & runbook

| Item | Owner | Notes |
|------|-------|-------|
| Kuma service & upgrades | Platform/ops (whoever owns `docker-compose.observability.yml`) | Image pinned to `louislam/uptime-kuma:1` |
| Monitor config changes | On-call rotation | Export backup JSON after every change; keep the export in version control for review |
| Alert routing | Same owner as Alertmanager | Single webhook path, section 3 |
| `/health` endpoint contracts | Backend team | `Servers/app.ts`; changes must keep the JSON shape Kuma asserts on |

**Runbook — "Kuma says deployment is down":**
1. Check whether `/health/live` also fails (process down) vs only `/health`
   (dependency down — check AI Gateway, then Postgres/Redis via `/health/ready`).
2. Frontend down but backend up → check the frontend container/reverse proxy.
3. Canary keyword failing with 200 → frontend renders but branding/content
   broken; check the last frontend deploy.
4. Silence in Kuma only after the incident is tracked in the incident channel;
   Kuma auto-resolves when the probe recovers (resend interval 0).
