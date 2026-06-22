---
title: Intake Form System — Implementation Plan
tags: [intake-form, drag-and-drop, public-form, admin-approval, anonymous]
source: raw/docs/intake-form-implementation.md
date: 2026-04-30
status: active
---

# Intake Form System

## Amaç

Multi-entity intake form sistemi — admin'ler drag-and-drop ile form oluşturur, çalışanlardan model/use case/incident submission toplar. Public unauthenticated URL ile erişim, admin onayı ile pending entry'ler.

## Ne yapıldı

- Drag-and-drop form builder (admin tarafı)
- Public form URL'leri (unique slug, auth gerektirmez)
- Submission → pending entry → admin approve/reject
- Email notifications (submission alındı, onaylandı, reddedildi)

### Entity'ler
- Model intake (yeni AI model bildirimi)
- Use case intake
- Incident intake

## Değişen dosyalar

- `Clients/src/presentation/pages/IntakeFormBuilder/`
- `Clients/src/presentation/pages/PublicIntakeForm/`
- `Servers/routes/intakeForm.route.ts`
- `Servers/templates/intake-*.mjml`

## Kararlar

- [decision-public-intake-no-auth](../../decisions/decision-public-intake-no-auth.md)
- [decision-drag-drop-builder-pattern](../../decisions/decision-drag-drop-builder-pattern.md)

## Açık konular

- Anonymous bias reporting channel için Public Intake altyapısı adapt edilebilir (Phase 11+ önerisi)

## Kaynaklar

- raw/docs/intake-form-implementation.md (orijinal: 23964 bayt)

## İlgili Sayfalar

- [entity-page-public-intake-form](../../entities/entity-page-public-intake-form.md)
- [synthesis-rakip-gap-analysis](../../syntheses/synthesis-rakip-gap-analysis.md)
