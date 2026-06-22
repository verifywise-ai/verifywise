---
title: Production Deployment Guide — Docker Compose
tags: [deployment, docker-compose, production, devops]
source: raw/docs/production-deployment-guide.md
date: 2026-04-30
status: active
---

# Production Deployment Guide

## Amaç

Docker Compose ile VerifyWise'ı production'da çalıştırma rehberi.

## Ne yapıldı

### System requirements
- Min: 2 CPU + 4GB RAM + 20GB storage
- Önerilen: 4 CPU + 8GB RAM + 50GB SSD
- OS: Ubuntu 22.04 LTS

### Software
- Docker Engine 24.0+
- Docker Compose v2.20+
- Git

### Servisler
- PostgreSQL :5432
- Redis :6379
- Backend :3000
- Frontend (nginx) :80/:443
- EvalServer :8000
- AI Gateway :8100

## Değişen dosyalar

- `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.override.yml`
- `kubernetes/` (alternatif)

## Kararlar

- [decision-docker-compose-vs-k8s](../../decisions/decision-docker-compose-vs-k8s.md)

## Kaynaklar

- raw/docs/production-deployment-guide.md (orijinal: 12944 bayt)

## İlgili Sayfalar

- [2026-04-30-security-hardening-guide](2026-04-30-security-hardening-guide.md)
