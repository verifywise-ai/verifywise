# Security Hardening Guide

This guide provides security best practices and hardening steps for deploying VerifyWise in production environments.

---

## Pre-deployment checklist

Before deploying VerifyWise to production, complete the following security hardening steps:

- [ ] Generate unique cryptographic secrets
- [ ] Configure TLS/HTTPS
- [ ] Set up database security
- [ ] Configure network security
- [ ] Enable security monitoring
- [ ] Review access controls

---

## 1. Cryptographic secrets

### Generate secure secrets

All secrets must be unique, randomly generated values. Never use default or example values in production.

```bash
# Generate JWT secret (256-bit)
openssl rand -hex 64

# Generate refresh token secret (256-bit)
openssl rand -hex 64

# Generate encryption key (32 characters minimum)
openssl rand -base64 32
```

### Required secrets

| Variable | Purpose | Minimum length |
|----------|---------|----------------|
| `JWT_SECRET` | Signs access tokens | 64 hex characters |
| `REFRESH_TOKEN_SECRET` | Signs refresh tokens | 64 hex characters |
| `ENCRYPTION_KEY` | Encrypts sensitive data (LLM API keys) | 32 characters |
| `DB_PASSWORD` | Database authentication | 16 characters |

### Secret management recommendations

- Store secrets in a dedicated secrets manager (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)
- Never commit secrets to version control
- Rotate secrets periodically (recommended: every 90 days)
- Use different secrets for each environment (dev, staging, production)

---

## 2. TLS/HTTPS configuration

### Reverse proxy setup (recommended)

Deploy a reverse proxy (nginx, Traefik, Caddy) in front of VerifyWise to handle TLS termination.

**Nginx example:**

```nginx
server {
    listen 443 ssl http2;
    server_name verifywise.example.com;

    ssl_certificate /etc/ssl/certs/verifywise.crt;
    ssl_certificate_key /etc/ssl/private/verifywise.key;

    # Modern TLS configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS (1 year)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name verifywise.example.com;
    return 301 https://$server_name$request_uri;
}
```

### Environment variables for HTTPS

```bash
# Set NODE_ENV to enable secure cookies
NODE_ENV=production

# Update URLs to use HTTPS
FRONTEND_URL=https://verifywise.example.com
BACKEND_URL=https://verifywise.example.com/api
```

---

## 3. Database security

### PostgreSQL hardening

**Authentication configuration (pg_hba.conf):**

```
# Restrict connections to specific hosts
host    verifywise    verifywise_user    10.0.0.0/8    scram-sha-256
host    verifywise    verifywise_user    172.16.0.0/12    scram-sha-256

# Disable trust authentication
# local   all    all    trust  # REMOVE THIS LINE
```

**PostgreSQL configuration (postgresql.conf):**

```ini
# Disable remote connections to superuser
listen_addresses = 'localhost,10.0.1.5'

# Enable SSL
ssl = on
ssl_cert_file = '/etc/postgresql/server.crt'
ssl_key_file = '/etc/postgresql/server.key'

# Logging
log_connections = on
log_disconnections = on
log_statement = 'ddl'
```

### Database user permissions

Create a dedicated database user with minimal permissions:

```sql
-- Create application user
CREATE USER verifywise_app WITH PASSWORD 'secure_password';

-- Grant only required permissions
GRANT CONNECT ON DATABASE verifywise TO verifywise_app;
GRANT USAGE ON SCHEMA public TO verifywise_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO verifywise_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO verifywise_app;

-- For multi-tenant schemas (created dynamically)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO verifywise_app;
```

### Enable SSL connections

```bash
# Environment variable
DB_SSL=true
```

---

## 4. Network security

### Firewall configuration

Only expose required ports:

| Port | Service | Access |
|------|---------|--------|
| 443 | HTTPS (frontend + API) | Public |
| 80 | HTTP (redirect to HTTPS) | Public |
| 5432 | PostgreSQL | Internal only |
| 6379 | Redis | Internal only |
| 8000 | Eval Server | Internal only |

**UFW example (Ubuntu):**

```bash
# Default deny incoming
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (adjust port if changed)
sudo ufw allow 22/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Allow HTTP for redirect
sudo ufw allow 80/tcp

# Enable firewall
sudo ufw enable
```

### Docker network isolation

```yaml
# docker-compose.yml network configuration
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # No external access

services:
  frontend:
    networks:
      - frontend
      - backend

  backend:
    networks:
      - backend

  postgresdb:
    networks:
      - backend

  redis:
    networks:
      - backend
```

### CORS configuration

CORS is configured to allow requests from:
- The configured `HOST` value
- `localhost`
- `127.0.0.1`
- `::1` (IPv6 localhost)

Requests without an origin (mobile apps, curl, server-to-server) are allowed.

For production with a custom domain, ensure your reverse proxy (nginx) handles CORS headers appropriately, or configure the `HOST` environment variable to match your domain.

---

## 5. Authentication security

### Token configuration

The system uses JWT tokens with the following security features:

| Feature | Setting | Notes |
|---------|---------|-------|
| Access token expiry | 1 hour | Short-lived to limit exposure |
| Refresh token expiry | 30 days | Stored in HTTP-only cookie |
| Algorithm | HS256 | HMAC-SHA256 |
| Cookie flags | httpOnly, secure, sameSite | XSS and CSRF protection |

### Rate limiting

Built-in rate limiting protects against brute-force attacks:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/users/login` | 5 requests | 1 minute |
| `/api/users/register` | 5 requests | 15 minutes |
| `/api/users/refresh-token` | 5 requests | 15 minutes |
| `/api/users/reset-password` | 5 requests | 15 minutes |
| `/api/users/chng-pass/:id` | 5 requests | 15 minutes |
| File operations | 50 requests | 15 minutes |
| General API | 100 requests | 15 minutes |

### Password policy

Passwords must meet these requirements:
- Minimum 8 characters
- Maximum 20 characters
- At least one lowercase letter
- At least one uppercase letter
- At least one digit

---

## 6. Logging and monitoring

### Audit logging

VerifyWise maintains change history for compliance-relevant entities:
- Model Inventory
- Vendors
- Vendor Risks
- Use Cases (Projects)
- Project Risks
- Policies
- Incidents
- Frameworks
- Evidence Hub

Each change records:
- User ID
- Timestamp
- Field name
- Previous value
- New value

### Log security

```bash
# Ensure logs don't contain sensitive data
# Review and redact before shipping to log aggregators

# Recommended log retention
# - Access logs: 90 days
# - Audit logs: 1 year (or per compliance requirements)
# - Error logs: 30 days
```

### Monitoring recommendations

Set up alerts for:
- Failed login attempts (> 5 per minute from same IP)
- Database connection failures
- Unusual API request patterns
- Certificate expiration (30 days before)

---

## 7. Container security

### Docker best practices

```yaml
# Use specific version tags, not 'latest' in production
services:
  backend:
    image: ghcr.io/bluewave-labs/verifywise-backend:v1.2.3

    # Run as non-root user
    user: "1000:1000"

    # Read-only root filesystem where possible
    read_only: true

    # Limit capabilities
    cap_drop:
      - ALL

    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### Image scanning

Container images are automatically scanned for vulnerabilities using Trivy in CI/CD. Review scan results before deploying:

1. Check the Security tab in GitHub repository
2. Review any HIGH or CRITICAL vulnerabilities
3. Update base images if vulnerabilities are found

---

## 8. Secrets in environment

### Production environment file

Create a secure `.env` file for production:

```bash
# Production settings
NODE_ENV=production

# Database (use strong password)
DB_HOST=postgres-internal.example.com
DB_PORT=5432
DB_NAME=verifywise
DB_USER=verifywise_app
DB_PASSWORD=<generated-strong-password>
DB_SSL=true

# Authentication (generate unique secrets)
JWT_SECRET=<generated-64-hex-chars>
REFRESH_TOKEN_SECRET=<generated-64-hex-chars>
ENCRYPTION_KEY=<generated-32-chars>

# URLs (use HTTPS)
FRONTEND_URL=https://verifywise.example.com
BACKEND_URL=https://verifywise.example.com/api

# Email (configure your provider)
EMAIL_PROVIDER=exchange-online
EMAIL_ID=noreply@example.com
```

### Environment file permissions

```bash
# Restrict access to environment file
chmod 600 .env
chown root:root .env
```

---

## 9. Backup security

### Database backups

```bash
# Encrypted backup example
pg_dump -U verifywise_app verifywise | \
  gpg --symmetric --cipher-algo AES256 > backup-$(date +%Y%m%d).sql.gpg

# Store backups in separate location from primary data
# Recommended: Different cloud region or provider
```

### Backup retention

| Type | Retention |
|------|-----------|
| Daily | 7 days |
| Weekly | 4 weeks |
| Monthly | 12 months |

---

## 10. Incident response

### Security contacts

Maintain a list of contacts for security incidents:
- Security team email
- On-call rotation
- Management escalation path

### Incident response steps

1. **Detect**: Monitor alerts and user reports
2. **Contain**: Isolate affected systems
3. **Investigate**: Determine scope and cause
4. **Remediate**: Fix vulnerabilities
5. **Recover**: Restore normal operations
6. **Document**: Record lessons learned

---

## Security update process

1. **Monitor** for security advisories:
   - GitHub Dependabot alerts
   - CVE databases
   - Vendor security bulletins

2. **Assess** impact and urgency

3. **Test** updates in staging environment

4. **Deploy** during maintenance window

5. **Verify** functionality after update

---

## Compliance considerations

VerifyWise supports compliance with various frameworks:

| Framework | Relevant features |
|-----------|------------------|
| SOC 2 | Audit logging, access controls, encryption |
| GDPR | Data isolation (multi-tenancy), audit trails |
| ISO 27001 | Security controls, incident management |

For compliance documentation, contact support with your specific requirements.

---

## Additional resources

- [Production Deployment Guide](./PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Configuration Reference](./CONFIGURATION_REFERENCE.md)
- [Security Audit Findings](../SECURITY_AUDIT_FINDINGS.md)
- [Authentication Architecture](../technical/architecture/authentication.md)
