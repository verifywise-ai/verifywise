# VerifyWise Helm chart

Installs VerifyWise (backend, worker, frontend, ai-gateway, eval-server,
postgres, redis) with an ingress.

For cluster setup (minikube or EKS) and ingress-nginx / cert-manager install,
see `../../README.md`. This file only covers the app install.

---

## Install

All secrets (superadmin password, DB password, JWT, encryption keys, internal
service keys) are auto-generated on first install and preserved across
upgrades via `lookup`. Override any of them by passing `--set` explicitly.

There are two install sources:

- **From the VerifyWise Helm repo (recommended for users):** one-time repo
  add, then install/upgrade with no `--version` flag — always gets the
  latest published release.
- **From a local checkout (recommended for developers/customizers):** clone
  the repo and install from `./kubernetes/helm/verifywise`.

### One-time: add the repo

```bash
helm repo add verifywise https://verifywise-ai.github.io/verifywise
helm repo update
```

### Local (minikube) — from the repo

```bash
helm install verifywise verifywise/verifywise \
  --namespace verifywise \
  --create-namespace \
  --set frontendUrl=http://localhost
```

### Local (minikube) — from checkout

```bash
helm install verifywise ./kubernetes/helm/verifywise \
  --namespace verifywise \
  --create-namespace \
  --set frontendUrl=http://localhost
```

Either way, wait for pods, then `minikube tunnel` in a separate terminal and
open `http://localhost/`.

### Upgrading to the latest release

```bash
helm repo update
helm upgrade verifywise verifywise/verifywise -n verifywise --reuse-values
```

`helm repo update` refreshes the local index. The subsequent `helm upgrade`
picks the newest version automatically. To pin an older version, add
`--version 2.5.0`.

### List available versions

```bash
helm search repo verifywise --versions
```

Get the auto-generated superadmin password:

```bash
kubectl get secret -n verifywise verifywise-secrets \
  -o jsonpath='{.data.SUPERADMIN_PASSWORD}' | base64 -d ; echo
```

The `helm install` NOTES output also prints this command.

### Cloud (EKS/GKE/AKS) with HTTPS

Secrets auto-generate as with local. Only set the values you care about
(usually just superadmin email + ingress config):

```bash
helm install verifywise ./kubernetes/helm/verifywise \
  --namespace verifywise --create-namespace \
  --set frontendUrl=https://app.example.com \
  --set ingress.host=app.example.com \
  --set ingress.tls.enabled=true \
  --set secrets.superadmin.email=admin@example.com
```

To keep everything in a file instead:

```yaml
# my-values.yaml (do NOT commit — add to .gitignore)
frontendUrl: https://app.example.com
ingress:
  host: app.example.com
  tls:
    enabled: true
    clusterIssuer: letsencrypt-prod
secrets:
  superadmin:
    email: admin@example.com
```

```bash
helm install verifywise ./kubernetes/helm/verifywise \
  --namespace verifywise --create-namespace \
  -f my-values.yaml
```

### Using an external secrets manager (Vault, external-secrets, sealed-secrets)

Create the Secret named `my-verifywise-secrets` in the target namespace out of
band (must contain all the keys listed in `templates/secret.yaml`), then:

```bash
helm install verifywise ./kubernetes/helm/verifywise \
  --namespace verifywise --create-namespace \
  --set secrets.create=false \
  --set secrets.existingSecret=my-verifywise-secrets \
  --set frontendUrl=https://app.example.com
```

---

## Upgrade

```bash
helm upgrade verifywise ./kubernetes/helm/verifywise \
  --namespace verifywise \
  --reuse-values \
  --set images.tag=2.6.0
```

`--reuse-values` keeps everything you set at install time. Override just what
changed.

## Rollback

```bash
helm history verifywise -n verifywise
helm rollback verifywise <REVISION> -n verifywise
```

## Uninstall

```bash
helm uninstall verifywise -n verifywise
kubectl delete pvc -n verifywise --all   # deletes postgres + eval-server data
kubectl delete namespace verifywise
```

Helm does NOT delete PVCs on uninstall (data preservation by default).

---

## Values reference

See `values.yaml` — every value has a comment explaining what it does.

Highlights:

| Key | What | Default |
|---|---|---|
| `frontendUrl` | URL browser hits (invite emails use this) | `http://localhost` |
| `images.tag` | Applies to backend/frontend/aiGateway/evalServer | `latest` |
| `images.pullPolicy` | Set to `Never` when using local minikube-built images | `IfNotPresent` |
| `ingress.host` | Domain (leave empty for catch-all) | `""` |
| `ingress.tls.enabled` | Terminate TLS via cert-manager | `false` |
| `persistence.postgres.size` | Postgres PVC size | `10Gi` |
| `persistence.postgres.storageClass` | Empty = cluster default | `""` |
| `secrets.create` | Chart creates the Secret | `true` |
| `secrets.existingSecret` | Reference a pre-existing Secret instead | `""` |

Things NOT exposed (fork if you need to change): probes, resource
requests/limits, security contexts, service types, replica strategy.

---

## Validate before installing

```bash
# Render templates without applying
helm template verifywise ./kubernetes/helm/verifywise > /tmp/rendered.yaml
kubectl apply --dry-run=server -f /tmp/rendered.yaml

# Or lint the chart
helm lint ./kubernetes/helm/verifywise
```
