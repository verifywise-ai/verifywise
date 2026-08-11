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
| `../docker-compose.observability.yml` | The stack: otel-ingress (nginx), otel-collector, prometheus, loki, grafana |
| `nginx/nginx.conf` | Nginx ingress terminating :4318; delegates auth to `auth.js` (njs) |
| `nginx/auth.js` | RS256 JWT verification for push tokens (public key only — cannot mint) |
| `otel-collector-config.yaml` | OTLP receivers → Prometheus (metrics) + Loki (logs) |
| `prometheus.yml` | Prometheus with OTLP receiver enabled |
| `loki-config.yaml` | Single-binary Loki, 30-day retention |
| `grafana/provisioning/` | Auto-provisioned datasources + dashboard provider |
| `grafana/dashboards/` | Starter dashboards: "Fleet Overview" + "Requests by deployment" |

## Authentication model (asymmetric)

Deployments authenticate to this stack with an **RS256 JWT** sent as
`Authorization: Bearer <token>`. Signing is **asymmetric on purpose** — the
internet-facing monitoring VM never holds a key that can forge tokens:

- **Private key** — signs tokens. Lives on the **VerifyWise backend** (`./Servers`,
  via `OBSERVABILITY_PRIVATE_KEY`). The backend mints a token when a super admin
  clicks **Generate token** in the UI. Never copy it to this monitoring VM.
- **Public key** (`observability-public.pem`) — verifies tokens. Mounted on this
  VM's `otel-ingress`. Safe to distribute; it cannot mint tokens.

So if this VM is ever compromised, an attacker gets only a verify-only public
key. The `sub` claim carries the deployment name (set by the super admin in the
UI); the ingress checks the signature and `exp`.

### One-time setup — generate the keypair

Run these once with `openssl`:

```bash
# private key (signer) — goes on the VerifyWise backend as OBSERVABILITY_PRIVATE_KEY:
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out observability-private.pem

# public key (verifier) — this is what goes on the monitoring VM:
openssl rsa -in observability-private.pem -pubout -out observability-public.pem
```

On the **backend** (`Servers/.env`), provide the private key as either an inline
PEM (newlines escaped as `\n`) or a file path:

```env
# inline (one line, \n-escaped):
OBSERVABILITY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
# …or point at a mounted file instead:
# OBSERVABILITY_PRIVATE_KEY_PATH=/run/secrets/observability-private.pem
```

Rotating the keypair invalidates every issued token — swap the public key on the
VM and have each deployment regenerate its token from the UI.

## Deploy on the VM

```bash
# from the repo root on the monitoring VM
# Place the PUBLIC key where the ingress expects it:
#   observability/keys/observability-public.pem
export GRAFANA_ADMIN_PASSWORD='choose-a-strong-password'
docker compose -f docker-compose.observability.yml up -d
```

`observability/keys/observability-public.pem` must exist — the ingress mounts it
to verify push tokens. If it's missing, nginx returns 500 for every ingest.
Only the public key belongs here; the private key stays on the VerifyWise backend.

Ports exposed:

| Port | Service | Who connects |
|------|---------|--------------|
| `4318` | OTLP HTTP (via nginx) | **VerifyWise deployments** (this is the URL you enter in the UI) |
| `3001` | Grafana | Operators |
| `9090` | Prometheus | (optional, debugging) |
| `3100` | Loki | (optional, debugging) |

The OTel collector itself no longer binds a host port — it is only reachable
through `otel-ingress` inside the compose network.

## Point a deployment at this stack

Make sure that deployment's backend has `OBSERVABILITY_PRIVATE_KEY` set (see the
keypair setup above). Then, in the VerifyWise app, log in as **super admin** →
**Settings → Monitoring**:

1. **Enabled**: on
2. **Observability URL**: `https://<this-vm-host>:4318`
3. **Deployment name**: a unique label for this deployment, e.g. `acme-prod`
   (becomes the OTLP label and the token's `sub`)
4. **Save**.
5. Click **Generate token** — the backend signs an RS256 token with its private
   key and stores it. The UI never shows the raw token.
6. **Restart** the deployment's services so they pick up the new config
   (`monitoring_config` is read at startup).

The token is verified here with the public key. If it's malformed, signed by the
wrong key, or expired, nginx rejects the push with 401.

## Production hardening

- Terminate TLS in front of `otel-ingress:4318` (Cloudflare, load balancer, or
  add a TLS-terminating reverse proxy in the compose) — bearer-token-over-HTTP is
  credential leakage.
- Restrict `4318` to your deployment networks via firewall/security groups.
- Set a strong `GRAFANA_ADMIN_PASSWORD`; do not expose Prometheus/Loki publicly.
- Size `PROMETHEUS_RETENTION` and Loki retention to your disk budget.
- Guard `OBSERVABILITY_PRIVATE_KEY` like any other backend secret. To revoke
  everything at once, rotate the keypair, swap the public key on the VM, and have
  each deployment click **Generate token** again.
