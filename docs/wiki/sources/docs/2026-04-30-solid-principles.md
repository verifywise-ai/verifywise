---
title: SOLID Principles — VerifyWise Code Foundations
tags: [solid, foundations, srp, ocp, lsp, isp, dip, clean-code]
source: raw/docs/solid-principles.md
date: 2026-04-30
status: active
---

# SOLID Principles

## Amaç

VerifyWise codebase'inde SOLID prensiplerinin uygulanması.

## Ne yapıldı

| Prensip | VerifyWise Uygulaması |
|---|---|
| **S**ingle Responsibility | Her service tek bir domain (`riskService`, `vendorService`, `policyService`) |
| **O**pen/Closed | Plugin system + AI Skills (Phase 7) — yeni özellik eklemek için core'a dokunmadan extension |
| **L**iskov Substitution | Agent registry — her agent `BaseAgent` interface'ini implement eder |
| **I**nterface Segregation | Domain-layer interfaces ayrı (`IRisk`, `IVendor`, `IModelInventory`) |
| **D**ependency Inversion | Repository pattern (`utils/{entity}.utils.ts` SQL'i izole eder) |

## Değişen dosyalar

- `Servers/domain.layer/interfaces/` — abstract contracts
- `Servers/services/` — concrete implementations
- `Servers/utils/` — data layer

## Kaynaklar

- raw/docs/solid-principles.md (orijinal: 16726 bayt)

## İlgili Sayfalar

- [synthesis-frontend-tasarim-pattern](../../syntheses/synthesis-frontend-tasarim-pattern.md)
- [entity-agent-registry](../../entities/entity-agent-registry.md)
