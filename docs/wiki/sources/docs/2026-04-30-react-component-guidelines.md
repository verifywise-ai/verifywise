---
title: React Component Guidelines
tags: [react, components, frontend, hooks, mui, clean-architecture]
source: raw/docs/react-component-guidelines.md
date: 2026-04-30
status: active
---

# React Component Guidelines

## Amaç

VerifyWise frontend'inde React 19 + TypeScript + MUI 7 + Redux Toolkit + React Query stack'i için component tasarım kuralları.

## Ne yapıldı

### Layer Flow
1. **Component** (`src/presentation/components/{Name}/index.tsx`) — Hooks first, handlers, early returns, render
2. **Page** (`src/presentation/pages/{Name}/index.tsx`) — Hooks, loading/error states, PageTitle
3. **Repository** (`src/application/repository/{entity}.repository.ts`) — CustomAxios calls
4. **Hook** (`src/application/hooks/use{Entity}.ts`) — React Query `useQuery`/`useMutation`
5. **Route** (`src/application/config/routes.tsx`) — `<Route>` inside dashboard

### Naming
- Components/Classes: PascalCase
- Files (Components): PascalCase (`UserProfile.tsx`)
- Files (Utilities): camelCase (`formatDate.ts`)

### Patterns
- Custom Chip component canonical for status badges
- `cardSx` shared style for all dashboard cards
- AIAuditDashboard pattern as reference for stat cards + table layout

## Kararlar

- [decision-clean-architecture-layers](../../decisions/decision-clean-architecture-layers.md)
- [decision-ai-audit-dashboard-pattern-for-skills-page](../../decisions/decision-ai-audit-dashboard-pattern-for-skills-page.md)

## Kaynaklar

- raw/docs/react-component-guidelines.md (orijinal: 23868 bayt)

## İlgili Sayfalar

- [synthesis-frontend-tasarim-pattern](../../syntheses/synthesis-frontend-tasarim-pattern.md)
- [entity-component-chip](../../entities/entity-component-chip.md)
