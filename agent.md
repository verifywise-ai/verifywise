# VerifyWise — Security Patch Test & Validation Guide

**Date:** 2026-08-06  
**Branch:** `mo-382-aug-5-securities-alerts`  
**Purpose:** Validate that the dependency, code, container, and Kubernetes hardening in this branch works correctly and does not break application functionality.

---

## 0. Pre-requisites

Make sure these services are reachable and `.env` files are filled:

| Variable | Needed for | Typical value |
|---|---|---|
| `DATABASE_URL` / Postgres | Servers | `postgresql://...` |
| `REDIS_URL` | Servers | `redis://localhost:6379` |
| `ENCRYPTION_KEY` | Servers encryption utils | 32-char secret |
| `SSO_SECRET` | Servers SSO secret encryption | strong secret |
| `AI_GATEWAY_URL` | Servers `/health` | `http://localhost:8100` |
| `GITHUB_TOKEN` | AI Detection private repos | optional GitHub PAT |
| `GATEWAY`, `INTERNAL_KEY` | AIGateway e2e mock | `http://127.0.0.1:8101` |
| `GEMINI_API_KEY` | AIGateway e2e mock | optional real key |

Start the stack:

```powershell
# Servers (port 3000)
cd C:\Workspace\verifywise\Servers
npm run build
npm run migrate-db
npm start

# Clients (port 5173)
cd C:\Workspace\verifywise\Clients
npm run dev

# AIGateway (port 8100)
cd C:\Workspace\verifywise\AIGateway
.\venv\Scripts\uvicorn src.main:app --host 0.0.0.0 --port 8100

# EvalServer (port 8200) if used
cd C:\Workspace\verifywise\EvalServer
.\venv\Scripts\uvicorn src.main:app --host 0.0.0.0 --port 8200
```

Get a JWT for backend API tests:

```powershell
$body = @{ email = "admin@example.com"; password = "..." } | ConvertTo-Json -Compress
$response = Invoke-RestMethod -Uri http://localhost:3000/api/users/login -Method POST -Body $body -ContentType "application/json"
$token = $response.data.token   # adjust path to your login response shape
$headers = @{ Authorization = "Bearer $token"; "X-Organization-Id" = "1" }
```

---

## 1. Automated build & test gates

Run these first; every command should exit `0`.

### TypeScript / Node

```powershell
cd C:\Workspace\verifywise\Servers
npm run build
npm test
npm audit

cd C:\Workspace\verifywise\Clients
npm run typecheck
npm run build
npm run i18n:audit:strict
npm run format-check
npm audit
```

### Python services

```powershell
cd C:\Workspace\verifywise\AIGateway
.\venv\Scripts\python -m py_compile src/utils/encryption.py src/routers/prompts.py tests/e2e_mock_agentic_system.py
.\venv\Scripts\pytest tests/test_encryption.py

cd C:\Workspace\verifywise\EvalServer
.\venv\Scripts\pytest tests/test_reports_crypto.py

cd C:\Workspace\verifywise\GRSModule
.\venv\Scripts\pytest tests/ui/test_runner.py
```

### K8s manifest rendering

```powershell
cd C:\Workspace\verifywise
kubectl kustomize kubernetes/base
kubectl kustomize kubernetes/dev
kubectl kustomize kubernetes/prod
```

All three should render without errors.

---

## 2. Wave 1 — Dependencies & React Router v8

| Check | How | Expected |
|---|---|---|
| No known audit findings | `npm audit` in `Servers` and `Clients` | `found 0 vulnerabilities` |
| App still navigates | Click through **Projects → Vendors → Policies → Model Inventory** | Pages load, no blank router 404 |
| Deep links work | Open `http://localhost:5173/projects/1` directly | Route resolves correctly (React Router v8) |
| `xlsx` still functions | Upload a `.xlsx` file in File Manager or bulk upload | Parsed successfully |
| `huggingface-hub` capped | `\.\EvalServer\venv\Scripts\pip show huggingface-hub` | Version is ≤ the capped value |

---

## 3. Wave 2 — Injection & path traversal

### ShareLink controller (`Servers/controllers/shareLink.ctrl.ts`)

```powershell
# Valid share link
$body = @{ resource_type = "project"; resource_id = 1; settings = @{} } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri http://localhost:3000/api/shares -Method POST -Headers $headers -Body $body

# Invalid resource_type should return 400
$body = @{ resource_type = "users"; resource_id = 1 } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri http://localhost:3000/api/shares -Method POST -Headers $headers -Body $body
# Expected: 400 Invalid resource type

# Invalid resource_id
$body = @{ resource_type = "project"; resource_id = -1 } | ConvertTo-Json -Compress
# Expected: 400 Invalid resource ID

# List shares for a resource
Invoke-RestMethod -Uri http://localhost:3000/api/shares/project/1 -Headers $headers
```

### i18n audit (`Clients/scripts/i18n-audit.mjs`)

```powershell
cd C:\Workspace\verifywise\Clients

node scripts/i18n-audit.mjs --lang=de      # OK
node scripts/i18n-audit.mjs --lang=fr      # OK
node scripts/i18n-audit.mjs --lang=xx      # Expected: Unsupported language: xx
npm run i18n:audit:strict                  # Expected: exit 0 if no gaps
```

### GRS runner (`GRSModule/ui/backend/services/runner.py`)

If the GRS UI is running, POST a run with bad inputs:

```json
{ "stages": ["badstage"], "dataset_version": "../etc/passwd" }
```

Expected: validation error, process is **not** spawned.

With valid inputs:

```json
{ "stages": ["render"], "dataset_version": "v1.0" }
```

Expected: command array built with `--stage render --dataset-version v1.0`, no shell interpolation.

---

## 4. Wave 3 — Crypto & secrets

### Servers encryption

```powershell
cd C:\Workspace\verifywise\Servers
node -e "
const { encrypt, decrypt } = require('./dist/utils/encryption.utils');
const c = encrypt('hello world');
console.log('cipher:', c);
console.log('plain:', decrypt(c));
"
```

Expected: cipher is `hex:hex:hex`, plaintext round-trips.

### Legacy CBC compatibility

If you have old ciphertext in `iv:ciphertext` format, decrypt it:

```powershell
node -e "const { decrypt } = require('./dist/utils/encryption.utils'); console.log(decrypt('OLD:VALUE'));"
```

Expected: original plaintext, no errors.

### SSO secret encryption

```powershell
node -e "
const { encryptSecret, decryptSecret } = require('./dist/utils/secretEncryption.utils');
const c = encryptSecret('my-sso-secret');
console.log(decryptSecret(c));
"
```

Expected: round-trip works only when `SSO_SECRET` is set.

### AIGateway encryption

```powershell
cd C:\Workspace\verifywise\AIGateway
.\venv\Scripts\pytest tests/test_encryption.py -v
```

Expected: tests pass for GCM encryption and legacy CBC fallback.

### Secret redaction in logs

Trigger an API call that includes a token/key, then inspect the log file (`Servers/logs/` or stdout). Search for the raw key.

```powershell
Select-String -Path Servers/logs/app.log -Pattern "sk-[a-zA-Z0-9]+"
# Expected: no plaintext keys
```

---

## 5. Wave 4 — Kubernetes & containers

### Kustomize rendering

```powershell
cd C:\Workspace\verifywise

# Should all succeed and show manifests
kubectl kustomize kubernetes/base   | Select-String "image:"
kubectl kustomize kubernetes/dev    | Select-String "image:"
kubectl kustomize kubernetes/prod   | Select-String "image:"
```

Verify:

- Image tags end with `:1.7.0`, not `:latest`.
- `namespace: verifywise` is present.
- No credential-like keys (e.g., `api_key`, `password`, `secret`) appear in `kubernetes/base/configmap.yaml` or dev ConfigMap examples.

### Docker healthchecks

Build and run one container as an example:

```powershell
cd C:\Workspace\verifywise
docker build -t vw-servers -f Servers/Dockerfile Servers
docker run -d --name vw-servers -p 3000:3000 --env-file Servers/.env vw-servers

# Wait for start-period, then check
docker inspect --format='{{.State.Health.Status}}' vw-servers
# Expected: healthy
```

Repeat for `Clients/Dockerfile`, `AIGateway/Dockerfile`, `EvalServer/Dockerfile` and their `.dev` variants if you deploy them.

---

## 6. Wave 5 — API & frontend SAST cleanup

### 6.1 Health endpoint rate limiting (`Servers/app.ts`)

```powershell
Invoke-RestMethod -Uri http://localhost:3000/health
```

Expected: `200 OK` JSON with `database`, `redis`, and `ai_gateway` checks.

To test the limiter, temporarily set `NODE_ENV=production` and hammer the endpoint:

```powershell
1..1200 | ForEach-Object { Invoke-RestMethod -Uri http://localhost:3000/health } 2>&1 | Select-String "Too many"
```

Expected: after ~1000 requests in 60 seconds, you see `429 Too Many Requests`.

### 6.2 Global API rate limiter

Webhooks are mounted **before** the global limiter and use their own signature-based controls. All other `/api/*` routes are behind `generalApiLimiter`.

Test on a safe endpoint:

```powershell
1..200 | ForEach-Object { Invoke-RestMethod -Uri http://localhost:3000/api/projects -Headers $headers } 2>&1 | Select-String "Too many"
```

Expected: `429` after the configured threshold, with `RateLimit-*` headers.

### 6.3 Plugin bundle path traversal (`Servers/routes/plugin.route.ts`)

Create a dummy plugin bundle:

```powershell
New-Item -ItemType Directory -Force -Path C:\Workspace\verifywise\Servers\temp\plugins\myplugin\ui\dist
Set-Content -Path C:\Workspace\verifywise\Servers\temp\plugins\myplugin\ui\dist\main.js -Value "console.log('plugin');"
```

Valid request:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/plugins/myplugin/ui/dist/main.js -Headers $headers
# Expected: 200, Content-Type application/javascript; charset=utf-8
```

Invalid attempts must be rejected (400 or 403), not serve files:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/plugins/../fileManager.ctrl.ts/ui/dist/main.js -Headers $headers
Invoke-RestMethod -Uri http://localhost:3000/api/plugins/myplugin/ui/dist/..%2F..%2Fpackage.json -Headers $headers
Invoke-RestMethod -Uri http://localhost:3000/api/plugins/my%2Fplugin/ui/dist/main.js -Headers $headers
```

### 6.4 File preview XSS/MIME hardening (`Servers/controllers/fileManager.ctrl.ts`)

Upload two files via File Manager: `report.pdf` and `evil.html` (the HTML contains `<script>alert(1)</script>`).

PDF preview:

```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/file-manager/<pdf-id>/preview -Headers $headers
```

Expected:

- Status `200`
- `Content-Type: application/pdf`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy` header present

HTML preview:

```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/file-manager/<html-id>/preview -Headers $headers
```

Expected:

- Status `200`
- `Content-Type: application/octet-stream` (HTML is **not** in the allowlist)
- `Content-Disposition: inline; filename="evil.html"`
- The raw `<script>` tag is **not** executed by the browser

### 6.5 AI Detection git clone safety (`Servers/services/aiDetection.service.ts`)

Valid scan:

```powershell
$body = @{ repository_url = "https://github.com/verifywise-ai/verifywise" } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri http://localhost:3000/api/ai-detection/scans -Method POST -Headers $headers -Body $body
```

Expected: scan created, cloning begins.

Invalid / malicious URLs must be rejected **before** `git clone`:

```powershell
$body = @{ repository_url = "https://evil.com/foo/bar" } | ConvertTo-Json -Compress
# Expected: 400 Invalid GitHub URL format

$body = @{ repository_url = "https://github.com/foo/bar;whoami" } | ConvertTo-Json -Compress
# Expected: 400 Owner/repository name contains invalid characters
```

Private repo scan (if `GITHUB_TOKEN` is set):

```powershell
$body = @{ repository_url = "https://github.com/your-org/private-repo" } | ConvertTo-Json -Compress
# Expected: clone succeeds; token never appears in response or client logs
```

### 6.6 RichTextRenderer sanitization (`Clients/src/presentation/components/RichTextRenderer/index.tsx`)

Run the component unit test:

```powershell
cd C:\Workspace\verifywise\Clients
npm run test:ci -- RichTextRenderer
```

Manual UI check: render HTML containing:

```html
<script>alert('xss')</script><p>Safe text</p>
```

Expected:

- `<script>` is stripped.
- Only `<p>Safe text</p>` renders.
- With `sandbox={true}`, content is inside an `<iframe sandbox="allow-same-origin">`.

### 6.7 AIGateway prompt router error handling (`AIGateway/src/routers/prompts.py`)

Trigger the `/prompts/test` stream with an invalid `endpoint_slug`:

```powershell
$body = @{ content = @(@{role="user"; content="hi"}); endpoint_slug = "nonexistent-endpoint" } | ConvertTo-Json -Compress -Depth 5
Invoke-WebRequest -Uri http://localhost:8100/prompts/test -Method POST -Headers @{ "x-internal-key" = "..."; "x-organization-id" = "1" } -Body $body
```

Expected:

- Client sees SSE data: `data: {"error":"Stream failed. Please try again."}`
- Server logs contain the full traceback (check AIGateway console/logs).
- No stack trace is returned to the client.

### 6.8 AIGateway e2e mock URL validation (`AIGateway/tests/e2e_mock_agentic_system.py`)

With an invalid `GATEWAY` scheme:

```powershell
cd C:\Workspace\verifywise\AIGateway
$env:GATEWAY = "ftp://bad-host"
.\venv\Scripts\python tests/e2e_mock_agentic_system.py
```

Expected: fails immediately with `ValueError: Unsupported GATEWAY scheme: ftp`.

With a valid gateway:

```powershell
$env:GATEWAY = "http://127.0.0.1:8101"
$env:INTERNAL_KEY = "vw-local-dev-gateway-key-2026"
.\venv\Scripts\python tests/e2e_mock_agentic_system.py
```

Expected: provisioning checks pass/fail according to your local gateway state, but URL construction never allows arbitrary hosts.

---

## 7. End-to-end user flows

Run these after the security checks to confirm normal functionality is intact.

1. **Login → Dashboard → Projects → Project detail**
   - Routes load without router errors.
   - No console errors about `react-router-dom`.

2. **File Manager**
   - Upload PDF, image, CSV, JSON.
   - Click preview for each; only safe MIME types render inline.
   - Download a file.

3. **AI Detection**
   - Add a GitHub repository.
   - Start a scan.
   - Wait for completion; view findings and security summary.

4. **Share links**
   - Create a share link for a project.
   - Open the public `/api/shares/view/<token>` URL in an incognito window.
   - Data is returned; token is not leaked in logs.

5. **AIGateway prompt testing**
   - If your frontend has a Prompt Lab / Prompt Test screen, run a test.
   - Stream should display LLM chunks; errors should show a friendly message, not a traceback.

---

## 8. Full regression suite (before merging)

```powershell
# Servers
cd C:\Workspace\verifywise\Servers
npm run build
npm test
npm run format-check
node scripts/security/npm-audit-gate.js

# Clients
cd C:\Workspace\verifywise\Clients
npm run typecheck
npm run build
npm run test:ci
npm run i18n:audit:strict
npm run format-check

# Python services
cd C:\Workspace\verifywise\AIGateway
.\venv\Scripts\pytest

cd C:\Workspace\verifywise\EvalServer
.\venv\Scripts\pytest

cd C:\Workspace\verifywise\GRSModule
.\venv\Scripts\pytest tests/ui/

# Kubernetes
cd C:\Workspace\verifywise
kubectl kustomize kubernetes/base
kubectl kustomize kubernetes/dev
kubectl kustomize kubernetes/prod
```

---

## 9. Known follow-ups that are NOT covered yet

- **Container run-as-non-root**: Application pods (backend, frontend, AIGateway, EvalServer) still run as root. Redis and Postgres manifests already use non-root contexts. This requires Dockerfile `USER` changes and is intentionally deferred.
- Some alerts were suppressed as false positives (bcrypt hashes in mock data/docs/SQL, hardcoded JWT secret in tests). Verify those files do not contain real production secrets.
