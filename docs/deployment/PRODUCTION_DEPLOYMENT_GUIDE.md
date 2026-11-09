# Production Deployment Guide

This guide covers deploying VerifyWise in a production environment using Docker Compose.

---

## Prerequisites

### System requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Storage | 20 GB | 50 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Software requirements

- Docker Engine 24.0+
- Docker Compose v2.20+
- Git (for cloning repository)

### Network requirements

- Public IP or domain name
- Ports 80 and 443 accessible
- Outbound HTTPS access (for container pulls)

---

## Deployment steps

### 1. Prepare the server

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version
```

### 2. Clone the repository

```bash
# Clone VerifyWise
git clone https://github.com/bluewave-labs/verifywise.git
cd verifywise

# Checkout specific version (recommended for production)
git checkout v1.0.0  # Replace with desired version
```

### 3. Configure environment

```bash
# Copy production environment template
cp .env.prod .env

# Edit configuration
nano .env
```

**Required configuration changes:**

```bash
# Generate and set unique secrets
JWT_SECRET=$(openssl rand -hex 64)
REFRESH_TOKEN_SECRET=$(openssl rand -hex 64)
ENCRYPTION_KEY=$(openssl rand -base64 32)

# Set strong database password
DB_PASSWORD=<your-secure-password>

# Configure URLs for your domain
FRONTEND_URL=https://your-domain.com
BACKEND_URL=https://your-domain.com/api

# Set email configuration
EMAIL_PROVIDER=<your-provider>
EMAIL_ID=noreply@your-domain.com
```

See [Configuration Reference](./CONFIGURATION_REFERENCE.md) for all options.

### 4. Deploy services

```bash
# Pull latest images
docker compose pull

# Start services in detached mode
docker compose up -d

# Verify all services are running
docker compose ps
```

**Expected output:**

```
NAME                    STATUS              PORTS
verifywise-backend-1    Up (healthy)        0.0.0.0:3000->3000/tcp
verifywise-frontend-1   Up                  0.0.0.0:8080->80/tcp
verifywise-postgresdb-1 Up (healthy)        5432/tcp
verifywise-redis-1      Up (healthy)        6379/tcp
verifywise-worker-1     Up
verifywise-eval_server-1 Up                 8000/tcp
```

### 5. Configure reverse proxy

Set up nginx as a reverse proxy for TLS termination:

```bash
# Install nginx
sudo apt install nginx -y

# Install certbot for SSL certificates
sudo apt install certbot python3-certbot-nginx -y
```

**Create nginx configuration:**

```bash
sudo nano /etc/nginx/sites-available/verifywise
```

```nginx
# "Connection: upgrade" only for WebSocket requests (the vw_ prefix avoids a
# clash with a $connection_upgrade map another site may define)
map $http_upgrade $vw_connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL certificates (managed by certbot)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    # Frontend
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location ^~ /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 120s;

        # WebSocket support (if needed)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $vw_connection_upgrade;

        # JSON errors, not nginx's HTML pages
        error_page 502 503 = @api_unavailable;
        error_page 504 = @api_timeout;
    }

    # AI Gateway API for virtual keys (OpenAI-compatible, base URL https://<host>/v1)
    location ^~ /v1/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_connect_timeout 5s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Stream responses as they arrive and allow slow model calls
        proxy_buffering off;
        proxy_read_timeout 300s;
        client_max_body_size 10m;

        # JSON errors, not nginx's HTML pages
        error_page 413 = @v1_too_large;
        error_page 502 503 = @v1_unavailable;
        error_page 504 = @v1_timeout;
    }

    # A 504 with no connect time means the backend never accepted the
    # connection: report it as unavailable, not as a slow request
    location @api_unavailable {
        default_type application/json;
        return 503 '{"message":"VerifyWise is unavailable, please retry shortly"}';
    }

    location @api_timeout {
        default_type application/json;
        if ($upstream_connect_time ~ "^-(, -)*$") {
            return 503 '{"message":"VerifyWise is unavailable, please retry shortly"}';
        }
        return 504 '{"message":"VerifyWise did not respond in time"}';
    }

    location @v1_too_large {
        default_type application/json;
        return 413 '{"detail":"Request body is larger than 10 MB"}';
    }

    location @v1_unavailable {
        default_type application/json;
        return 503 '{"detail":"VerifyWise is unavailable, please retry shortly"}';
    }

    location @v1_timeout {
        default_type application/json;
        if ($upstream_connect_time ~ "^-(, -)*$") {
            return 503 '{"detail":"VerifyWise is unavailable, please retry shortly"}';
        }
        return 504 '{"detail":"The AI Gateway request timed out"}';
    }
}
```

If your proxy sends `/api` or `/v1` to the frontend instead (for example a single
`location /`), the frontend container forwards them to the backend at
`VW_BACKEND_URL`. The image default is `http://backend:3000`, and
`docker-compose.yml` sets it from `BACKEND_PORT`. Set it on the frontend service
if your backend has another name or port. Give scheme, host and port only, with
no path: the container refuses to start otherwise.

The frontend takes the client address from your proxy's `X-Forwarded-For` when
the request comes from an address in `VW_TRUSTED_PROXIES` (space-separated
addresses or CIDRs). The image leaves it empty, and `docker-compose.yml` sets it
to private networks because the frontend port is only bound to `127.0.0.1`. If
you publish the frontend port yourself, set it to your proxy's address only.
Without it, every client behind your proxy shares the proxy's address for the
backend's rate limits.

If you edit the proxy config by hand, check these, because each one breaks
something without an obvious error:

- **No Referer or browser-only checks on `/api` or `/v1`.** MCP clients
  (`/api/mcp`), webhooks (`/api/webhooks`), shadow AI ingestion
  (`/api/v1/shadow-ai`) and SDKs send no browser `Referer`, and a header the
  client sets is no access control.
- **`/api` and `/v1` both send `X-Forwarded-For`, `X-Real-IP` and
  `X-Forwarded-Proto`.** The backend trusts one proxy hop and rate-limits login
  and password reset by client IP. Without these headers every user shares
  one limit, and audit records show the proxy's address.
- **`/v1` sets `proxy_http_version 1.1`**, or streamed model responses are
  buffered.
- **The TLS server sends `Strict-Transport-Security`.** The frontend container
  leaves HSTS to this proxy.
- **`/api` and `/v1` return JSON errors, not an HTML error page.** API
  clients (SDKs, MCP clients, webhook senders) parse JSON. A server-level
  `error_page ... /upgrade.html` applies to them too unless the location sets
  its own, as in the sample above and the Ansible template
  (`ansible/templates/verifywise-nginx.conf.j2`).

**Enable and test:**

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/verifywise /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Reload nginx
sudo systemctl reload nginx
```

### 6. Verify deployment

```bash
# Check backend is responding (any authenticated endpoint)
curl -I https://your-domain.com/api/users

# Check frontend loads
curl -I https://your-domain.com

# Check the AI Gateway API is routed: expect 401 {"detail":"Virtual key not found"}.
# A 503 or an HTML page means /v1 does not reach the backend.
curl -s -w " %{http_code}\n" https://your-domain.com/v1/models -H "Authorization: Bearer sk-vw-invalid"

# View logs for any errors
docker compose logs -f --tail=100

# Check database connectivity
docker compose exec backend node -e "const {sequelize} = require('./dist/database/db'); sequelize.authenticate().then(() => console.log('DB OK')).catch(e => console.error(e))"
```

Check `curl -fsS http://localhost:3000/health/ready` (see [Health monitoring](#health-monitoring)), plus Docker health checks and logs.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Nginx (TLS Termination)                       │
│                         Port 443                                 │
└─────────────────────────────────────────────────────────────────┘
                    │                    │
                    ▼                    ▼
        ┌───────────────────┐  ┌───────────────────┐
        │     Frontend      │  │      Backend      │
        │    (React SPA)    │  │    (Express.js)   │
        │     Port 8080     │  │     Port 3000     │
        └───────────────────┘  └───────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────┐
        │                                │                        │
        ▼                                ▼                        ▼
┌───────────────┐              ┌───────────────┐         ┌───────────────┐
│   PostgreSQL  │              │     Redis     │         │  Eval Server  │
│   Port 5432   │              │   Port 6379   │         │   Port 8000   │
└───────────────┘              └───────────────┘         └───────────────┘
        │
        ▼
┌───────────────┐
│    Worker     │
│ (Background)  │
└───────────────┘
```

### Service descriptions

| Service | Purpose | Image |
|---------|---------|-------|
| frontend | React SPA web interface | verifywise-frontend |
| backend | Express.js REST API | verifywise-backend |
| worker | Background job processor | verifywise-backend |
| postgresdb | PostgreSQL 16 database | postgres:16.8 |
| redis | Redis 7 for caching/queues | redis:7 |
| eval_server | Python evaluation service | verifywise-eval-server |

---

## Multi-tenancy configuration

VerifyWise supports multi-tenant deployments with shared-schema isolation:

```bash
# Enable multi-tenancy
MULTI_TENANCY_ENABLED=true
```

When enabled:
- All data lives in a single `verifywise` PostgreSQL schema
- Data is isolated between organizations via `organization_id` columns
- Organization context is derived from JWT token (`req.organizationId`)

---

## Database management

### Initial setup

The database schema is automatically created on first startup. The backend service handles migrations.

### Manual migrations

```bash
# Run pending migrations
docker compose exec backend npm run migrate-db
```

Note: Migrations run automatically on service startup via the `start` script. Manual rollback is not supported via npm scripts - use Sequelize CLI directly if needed:

```bash
docker compose exec backend npx sequelize db:migrate:undo
```

### Database backup

```bash
# Create backup
docker compose exec postgresdb pg_dump -U $DB_USER $DB_NAME > backup.sql

# Restore backup
cat backup.sql | docker compose exec -T postgresdb psql -U $DB_USER $DB_NAME
```

### Scheduled backups

Create a cron job for automated backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/verifywise && docker compose exec -T postgresdb pg_dump -U postgres verifywise | gzip > /backups/verifywise-$(date +\%Y\%m\%d).sql.gz
```

---

## Health monitoring

### Health checks

| Component | Health check | Method |
|-----------|--------------|--------|
| PostgreSQL | `pg_isready` | Docker Compose built-in |
| Redis | `redis-cli ping` | Docker Compose built-in |
| Backend | `GET /health/live`, `GET /health/ready`, `GET /health` | HTTP probe / monitoring tool |

The backend exposes three rate-limited health endpoints:

| Endpoint | Checks | Use for |
|----------|--------|---------|
| `GET /health/live` | Nothing beyond the process serving HTTP; always `200` | Liveness probes |
| `GET /health/ready` | PostgreSQL and Redis (2s timeout each) | Readiness probes, load balancers, Docker `HEALTHCHECK` |
| `GET /health` | PostgreSQL, Redis and the AI Gateway | Uptime monitoring and dashboards |

`/health/ready` and `/health` return `200` with `{"status":"ok","checks":{...}}` when every check passes, or `503` with `"status":"degraded"` and the failing check's error. Do not use `/health` for liveness or readiness: an AI Gateway outage makes it return `503`, which would restart or de-route healthy backend pods. The bundled Kubernetes manifests, Helm chart, Dockerfile and Ansible playbooks already use `/health/live` and `/health/ready`.

### Monitoring with Docker

```bash
# View resource usage
docker stats

# View logs
docker compose logs -f backend

# View specific service logs
docker compose logs -f --tail=100 postgresdb
```

### Recommended monitoring tools

- **Prometheus + Grafana**: Metrics and dashboards
- **Loki**: Log aggregation
- **Uptime Kuma**: Endpoint monitoring

---

## Scaling considerations

### Horizontal scaling

For high-availability deployments:

1. **Database**: Use managed PostgreSQL (AWS RDS, Azure Database, Cloud SQL)
2. **Redis**: Use managed Redis (ElastiCache, Azure Cache, Memorystore)
3. **Backend**: Scale with multiple replicas behind load balancer
4. **Frontend**: Serve from CDN

### Docker Swarm example

```yaml
# docker-compose.prod.yml
services:
  backend:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

---

## Troubleshooting

### Common issues

**Services not starting:**

```bash
# Check logs for errors
docker compose logs

# Check if ports are in use
sudo lsof -i :3000
sudo lsof -i :5432
```

**Database connection errors:**

```bash
# Verify database is healthy
docker compose exec postgresdb pg_isready -U postgres

# Check connection from backend
docker compose exec backend node -e "require('./dist/config/database').testConnection()"
```

**Permission errors:**

```bash
# Fix volume permissions
sudo chown -R 1000:1000 ./data
```

### Reset deployment

```bash
# Stop all services
docker compose down

# Remove volumes (WARNING: deletes data)
docker compose down -v

# Start fresh
docker compose up -d
```

---

## Upgrade process

### Minor upgrades

```bash
# Pull new images
docker compose pull

# Restart with new images
docker compose up -d

# Verify health
docker compose ps
```

### Major upgrades

1. **Backup database** before upgrading
2. **Review changelog** for breaking changes
3. **Test in staging** environment first
4. **Schedule maintenance window**
5. **Deploy and verify**

```bash
# 1. Backup
docker compose exec postgresdb pg_dump -U postgres verifywise > backup-pre-upgrade.sql

# 2. Pull specific version
docker compose pull

# 3. Stop services
docker compose down

# 4. Start with new version
docker compose up -d

# 5. Migrations run automatically on startup, but can be run manually:
docker compose exec backend npm run migrate-db

# 6. Verify services are running
docker compose ps
docker compose logs --tail=50 backend
```

---

## Additional resources

- [Security Hardening Guide](./SECURITY_HARDENING_GUIDE.md)
- [Configuration Reference](./CONFIGURATION_REFERENCE.md)
- [Architecture Documentation](../technical/architecture/overview.md)
