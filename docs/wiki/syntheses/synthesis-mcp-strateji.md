---
title: MCP Stratejisi — HTTP Backend (Phase 7) → Gerçek Protocol (Phase 8+)
tags: [synthesis, mcp, phase-7, phase-8, ai-skills, ai-gateway, plugin]
source: raw/competitor-research/master-gap-analysis.md
date: 2026-04-30
status: active
---

# MCP Stratejisi

## Mevcut Durum (2026-04)

VerifyWise iki "MCP yüzü" var ama **gerçek MCP protocol kullanılmıyor**:

### 1. Phase 7 AI Skills Backend
- `ai_skills` tablosu (skill_key, source, backend, tools JSONB)
- `executeSkillTool` dispatcher: HTTP POST `{tool, params}` → `mcp_server_url`
- 30s timeout
- Plugin manifest `aiSkill` field auto-registers
- **Protocol:** custom JSON over HTTP, not MCP

### 2. AI Gateway MCP UI Sayfaları
- `MCPServers` page
- `MCPToolCatalog`
- `MCPAuditLog`
- `MCPApprovals`
- `MCPGuardrails`
- `MCPAgentKeys`
- **Backend:** kısmen bağlanmamış — UI mock-data ile çalışıyor

## Rakip Tablosu

| Vendor | MCP Server | Yıl |
|---|---|---|
| Vanta | ✅ Hosted | Jun 2025 |
| Drata | ✅ Hosted, RBAC-respecting | Dec 2025 |
| IBM OpenPages | ✅ Local STDIO MCP | 9.1.3 |
| SAS Viya | ✅ MCP Server | 2025 |
| Salesforce | ✅ MCP Bridge | TDX 2026 |
| Anecdotes | ✅ MCP-native architecture | 2025 |
| Microsoft | ✅ Agent 365 + MCP | May 2026 |
| Google Cloud | ✅ Cloud API Registry | 2025 |
| Cisco AI Defense | ✅ MCP traffic monitor | 2025 |

> 8+ rakip MCP server shipped — VerifyWise için gecikme riski yüksek.

## Phase 8 Roadmap (Önerilen)

### Hafta 1: SDK Entegrasyonu
- `npm install @modelcontextprotocol/sdk`
- VerifyWise MCP Server class — frameworks, controls, risks, vendors, evidence, models, incidents, tasks expose
- Approval gateway tunneling (her tool call onaydan geçer)
- Tenant isolation (`organization_id` MCP context'inde)

### Hafta 2: Phase 7 Migration + AI Gateway Integration
- Phase 7 `executeSkillTool` HTTP backend → MCP transport (backward-compat)
- AI Gateway MCP UI sayfalarına gerçek backend bağlantısı
- MCP server registry crawler (customer'ın MCP endpoint'lerini keşfet)
- Open-source as `verifywise-mcp-server` package

## Faydalar

✅ Vanta/Drata/IBM ile interop  
✅ Claude Desktop, Cursor, Windsurf'te VerifyWise tools direkt kullanılabilir  
✅ Marketing wedge ("VerifyWise MCP-native")  
✅ Plugin marketplace MCP-native genişleme

## Risk

⚠️ MCP spec hala değişiyor (Anthropic standart kontrolü altında)  
⚠️ Authentication / multi-tenant guidance henüz olgun değil

## Kaynaklar

- [master-gap-analysis](../sources/competitor-research/2026-04-29-master-gap-analysis.md)
- [agent-trends-12](../sources/competitor-research/2026-04-29-agent-trends-12.md)
- [decision-mcp-http-backend-vs-modelcontextprotocol-sdk](../decisions/decision-mcp-http-backend-vs-modelcontextprotocol-sdk.md)

## İlgili Sayfalar

- [concept-mcp-protocol](../concepts/concept-mcp-protocol.md)
- [synthesis-rakip-gap-analysis](synthesis-rakip-gap-analysis.md)
- [entity-pluginservice](../entities/entity-pluginservice.md)
