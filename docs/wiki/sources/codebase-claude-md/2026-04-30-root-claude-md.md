---
title: Root CLAUDE.md — VerifyWise Development Guide
tags: [architecture, multi-tenancy, jwt, roles, conventions]
source: raw/codebase-claude-md/root-claude.md
date: 2026-04-30
status: active
---

# Root CLAUDE.md — VerifyWise Development Guide

## Amaç

VerifyWise codebase için cross-cutting kurallar. Directory-scoped guide'ları (Servers, Clients, EvalServer, AIGateway) tetikleyen üst-düzey kontrol dokümanı. Claude'un projeyi nasıl ele alacağını tanımlar.

## Ne yapıldı

Tek bir kapsamlı README + meta-talimat dosyası. İçerik:

- Custom agent: **verifywise-explorer** — codebase explorer agent (`.claude/agents/verifywise-explorer.md`)
- Tech stack: React 19 + TypeScript + Vite + MUI 7 + Redux + React Query (frontend), Node.js 22 + Express 4 + TypeScript + Sequelize 6 (backend), PostgreSQL + Redis + BullMQ, FastAPI + Python 3.12 (EvalServer + AI Gateway)
- Multi-tenancy: shared schema + `organization_id` izolasyon
- JWT payload: `{id, email, organizationId, tenantId, roleName, expire}`
- 4 role: Admin, Reviewer, Editor, Auditor
- Naming: camelCase (vars/fns), PascalCase (components/classes), UPPER_SNAKE_CASE (constants), kebab-case (API), snake_case (DB tables)
- 80% min test coverage

## Değişen dosyalar

- `CLAUDE.md` (root)

## Kararlar

- [decision-multi-tenancy-org-id-pattern](../../decisions/decision-multi-tenancy-org-id-pattern.md)

## Kaynaklar

- raw/codebase-claude-md/root-claude.md (orijinal: `CLAUDE.md`, 7543 bayt)

## İlgili Sayfalar

- [2026-04-30-servers-claude-md](2026-04-30-servers-claude-md.md)
- [concept-multi-tenancy-organization-id](../../concepts/concept-multi-tenancy-organization-id.md)
- [synthesis-multi-tenancy-mimari](../../syntheses/synthesis-multi-tenancy-mimari.md)
