# Deploying VerifyWise on Kubernetes

This folder contains the Kubernetes manifests for VerifyWise. Two paths to get
it running: **local** (minikube, for testing) and **cloud** (EKS, for real use).

Prefer the `docker-compose.yml` at the repo root if you're not already invested
in Kubernetes.

---

## Prerequisites

Install these locally, once:

```bash
# kubectl — talk to any Kubernetes cluster
brew install kubectl              # macOS
# or: https://kubernetes.io/docs/tasks/tools/

# helm — install cluster add-ons (ingress, cert-manager)
brew install helm
```

Verify:

```bash
kubectl version --client
helm version
```

---

## Path A: Local cluster (minikube)

For laptops. Everything on one machine, no cloud costs.

### 1. Install and start minikube

```bash
brew install minikube
minikube start --cpus=4 --memory=6g
minikube addons enable ingress     # gives you ingress-nginx, no Helm needed
```

Skip cert-manager on local — you don't need HTTPS.

### 2. Jump to "Install VerifyWise" below.

To reach the app, use `minikube tunnel` (keeps running in a terminal) and then
hit `http://<minikube-ip>/` — get the IP with `minikube ip`.

---

## Path B: Cloud cluster (AWS EKS)

For real deployments. Costs money — check the AWS EKS pricing page before running.

### 1. Install eksctl and AWS CLI

```bash
brew install eksctl awscli
aws configure                     # your AWS access key + region
```

### 2. Create a cluster

```bash
eksctl create cluster \
  --name verifywise \
  --region us-east-1 \
  --nodes 2 \
  --node-type t3.large \
  --managed
```

Takes 15–20 minutes. When done, `kubectl` is already pointed at the cluster.

**Picking `--nodes` and `--node-type`:** the app's pods request ~2.3 vCPU and
~2.4 GiB RAM total. Add ~500m CPU / 500Mi RAM for kube-system overhead.

- **1 × `t3.large`** (2 vCPU / 8 GiB) — fits, but one node failure = full outage.
- **2 × `t3.large`** — recommended starting point. Survives one node down.
- **3+ nodes** — add when traffic grows or you want multi-AZ. Not required by the
  app itself.

### 3. Install ingress-nginx

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

Get the public IP (used for DNS):

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller
# Look at EXTERNAL-IP — that's what your DNS points at
```

### 4. Install cert-manager (only if you want HTTPS)

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true
```

Create a Let's Encrypt issuer (replace the email):

```bash
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: you@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

### 5. Point your DNS at the ingress IP

Add an A record: `your-domain.com` → `<EXTERNAL-IP from step 3>`.

### 6. Enable HTTPS in `ingress.yaml`

Follow the comments at the top of `kubernetes/ingress.yaml` — uncomment three
blocks and replace `verifywise.example.com` with your domain.

### 7. Jump to "Install VerifyWise" below.

---

## Install VerifyWise

Same on local and cloud once the cluster is ready. Two paths:

- **Helm (recommended)** — one command, secrets auto-generated, easy upgrades.
- **Raw manifests** — `kubectl apply -f kubernetes/`, hand-edit secrets.

### Path 1: Helm (recommended)

Add the VerifyWise chart repo once:

```bash
helm repo add verifywise https://verifywise-ai.github.io/verifywise
helm repo update
```

Install:

```bash
# Local (minikube)
helm install verifywise verifywise/verifywise \
  --namespace verifywise --create-namespace \
  --set frontendUrl=http://localhost

# Cloud with HTTPS
helm install verifywise verifywise/verifywise \
  --namespace verifywise --create-namespace \
  --set frontendUrl=https://your-domain.com \
  --set ingress.host=your-domain.com \
  --set ingress.tls.enabled=true
```

All secrets (superadmin password, DB password, JWT, encryption keys, service
keys) are auto-generated on first install and preserved across upgrades.
Retrieve the auto-generated superadmin password:

```bash
kubectl get secret -n verifywise verifywise-secrets \
  -o jsonpath='{.data.SUPERADMIN_PASSWORD}' | base64 -d ; echo
```

To upgrade to the latest release later:

```bash
helm repo update
helm upgrade verifywise verifywise/verifywise -n verifywise --reuse-values
```

Full chart docs (values, `existingSecret` mode, install from a local checkout):
see `kubernetes/helm/verifywise/README.md`.

### Path 2: Raw manifests

1. **Create your secrets file:**

   ```bash
   cp kubernetes/secrets-example.yaml kubernetes/secrets.yaml
   ```

   Edit `kubernetes/secrets.yaml` — replace every placeholder base64 value with
   a real one. `secrets.yaml` is gitignored, so it won't be committed.

2. **Review the ConfigMap:** open `kubernetes/configmap.yaml` and set email
   provider, Slack IDs, etc. Defaults are fine to start.

3. **Apply:**

   ```bash
   kubectl apply -f kubernetes/namespace.yaml
   kubectl apply -f kubernetes/
   ```

   The namespace has to exist first — that's the only ordering constraint.

### Wait for pods (both paths)

```bash
kubectl get pods -n verifywise -w
```

All pods should reach `Running`. First boot takes a few minutes (image pulls +
database migrations).

### Access (both paths)

- **Local (minikube):** `minikube tunnel` in a separate terminal, then open
  `http://localhost/` in the browser.
- **Cloud, HTTP only:** open `http://<EXTERNAL-IP>/`.
- **Cloud with HTTPS:** open `https://your-domain.com/`.

---

## Uninstall

Helm:

```bash
helm uninstall verifywise -n verifywise
kubectl delete pvc -n verifywise --all         # optional, deletes data
kubectl delete namespace verifywise
```

Raw manifests:

```bash
kubectl delete -f kubernetes/
kubectl delete namespace verifywise
```

For EKS: `eksctl delete cluster --name verifywise --region us-east-1`.

---

## Troubleshooting

**Pods stuck in `Pending`:** not enough CPU/RAM on the cluster. Scale nodes up
or use bigger instance types.

**Pods stuck in `ImagePullBackOff`:** the image tag doesn't exist. Check
`kubectl describe pod <name>` and verify the image tag in the deployment YAML.

**Backend crash-looping:** almost always missing secrets. Check
`kubectl logs -n verifywise deploy/backend` — look for "missing environment
variable" errors. Verify `kubectl get secret -n verifywise verifywise-secrets`
has all the expected keys.

**HTTPS not working:** cert-manager issues take a few minutes. Check
`kubectl get certificate -n verifywise` — `READY: True` means Let's Encrypt
issued the cert. If it's `False`, `kubectl describe certificate ...` shows why.

---

## What this repo doesn't manage

- The cluster itself (nodes, VPC, IAM) — that's your infra.
- ingress-nginx and cert-manager installs — you install these once per cluster.
- DNS — your registrar or Route53/Cloud DNS.
- Backups — set up postgres backups separately (managed RDS is the easy path).
