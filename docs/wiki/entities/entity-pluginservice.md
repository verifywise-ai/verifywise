---
title: Plugin Service
tags: [entity, plugin, marketplace, installation, ai-skill]
source: Servers/services/plugin/pluginService.ts
date: 2026-04-30
status: active
---

# Plugin Service

## Tip

Backend service — plugin lifecycle management.

## Konum

`Servers/services/plugin/pluginService.ts`

## Sorumluluk

- `installPlugin(pluginKey)` — install + auto-create AI Skill from `aiSkill` manifest field
- `uninstallPlugin(pluginKey)` — uninstall + delete associated skills
- Plugin manifest validation
- Install/uninstall hooks

## Phase 7 Entegrasyonu

Plugin manifest'e yeni alan: `aiSkill`. Install sırasında bu alan varsa otomatik olarak `ai_skills` tablosuna skill kaydı oluşturulur.

```json
{
  "pluginKey": "slack-notifier",
  "aiSkill": {
    "skillKey": "slack-notify",
    "tools": [{"name": "send_message", "description": "..."}],
    "backend": "plugin"
  }
}
```

## Kaynaklar

- raw/docs/plugin-system.md
- raw/competitor-research/master-gap-analysis.md (Phase 7 reference)

## İlgili Sayfalar

- [synthesis-mcp-strateji](../syntheses/synthesis-mcp-strateji.md)
- [decision-plugin-marketplace-separate-repo](../decisions/decision-plugin-marketplace-separate-repo.md)
