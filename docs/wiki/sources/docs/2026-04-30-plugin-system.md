---
title: Plugin System Architecture
tags: [plugin-system, marketplace, framework-plugins, integration, extension]
source: raw/docs/plugin-system.md
date: 2026-04-30
status: active
---

# Plugin System Architecture

## Amaç

VerifyWise'da plugin sistemi nasıl çalışır — frontend slot'ları, backend extension point'leri, plugin marketplace.

## Ne yapıldı

3 plugin tipi:
- **Integration plugins**: External servisler (Slack, MLflow, Azure AI)
- **Data plugins**: Import/export (Risk Import)
- **Framework plugins**: Compliance frameworks (SOC 2, GDPR, HIPAA, vb.)

Pluginler `bluewave-labs/plugin-marketplace` repo'sunda. Code-base'in kendisinde değil.

### Frontend Integration
- Plugin slot pattern (`PluginSlot` component)
- Settings sayfasına dinamik tab ekleme (`pluginTabs`)
- `usePluginRegistry` hook ile registered plugin'lere erişim

### Backend Integration
- Plugin manifest schema
- `aiSkill` field — auto-skill registration (Phase 7)
- Plugin install/uninstall lifecycle

## Kararlar

- [decision-plugin-marketplace-separate-repo](../../decisions/decision-plugin-marketplace-separate-repo.md)

## Kaynaklar

- raw/docs/plugin-system.md (orijinal: `docs/PLUGIN_SYSTEM.md`, 12061 bayt)
- Plugin marketplace: https://github.com/bluewave-labs/plugin-marketplace

## İlgili Sayfalar

- [synthesis-mcp-strateji](../../syntheses/synthesis-mcp-strateji.md)
- [entity-pluginservice](../../entities/entity-pluginservice.md)
