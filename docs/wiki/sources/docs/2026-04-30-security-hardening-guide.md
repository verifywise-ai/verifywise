---
title: Security Hardening Guide
tags: [security, hardening, production, jwt, cors, rate-limit, https]
source: raw/docs/security-hardening-guide.md
date: 2026-04-30
status: active
---

# Security Hardening Guide

## Amaç

Production'da VerifyWise'ı güvenli hale getirme — JWT secret rotation, CORS, rate limiting, HTTPS, secret management, container security.

## Ne yapıldı

Production deployment'tan ayrı, security-spesifik konular:

- JWT secret minimum length + rotation policy
- CORS allowed origins
- Rate limit per endpoint (özellikle `/api/auth/*`)
- HTTPS / TLS termination
- Secret management (env vars, vault, K8s secrets)
- Container hardening (non-root user, read-only FS)
- Audit logging
- Database encryption at rest
- Redis password protection

## Kararlar

- [decision-jwt-rotation-policy](../../decisions/decision-jwt-rotation-policy.md)

## Kaynaklar

- raw/docs/security-hardening-guide.md (orijinal: 11894 bayt)

## İlgili Sayfalar

- [2026-04-30-production-deployment-guide](2026-04-30-production-deployment-guide.md)
- [concept-multi-tenancy-organization-id](../../concepts/concept-multi-tenancy-organization-id.md)
