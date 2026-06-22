---
title: MCP HTTP Backend vs @modelcontextprotocol/sdk
tags: [decision, mcp, phase-7, ai-skills, http-backend]
source: raw/competitor-research/master-gap-analysis.md
date: 2026-04-29
status: active
---

# Decision: MCP HTTP Backend (Phase 7) vs Gerçek MCP Protocol

## Bağlam

Phase 7 AI Skills implementasyonunda dış sistemlere bağlanmak için bir protokole ihtiyaç var. Seçenekler:

1. **Gerçek MCP** (`@modelcontextprotocol/sdk`) — STDIO/SSE based, Anthropic standardı
2. **HTTP-style backend** — POST {tool, params} to mcp_server_url, custom

## Karar

**HTTP-style backend** seçildi (Phase 7 için).

## Gerekçe

- Hızlı time-to-market (1-2 hafta vs 3-4 hafta)
- VerifyWise tenant izolasyonu HTTP layer'da daha kolay
- Approval gateway'e geçiş daha temiz
- Backward-compat: gerçek MCP protocol Phase 8'de eklenecek

## Sonuçlar

✅ Phase 7 hızlı shipped
✅ AI Gateway tarafında MCP UI sayfaları (MCPServers, MCPToolCatalog, MCPAuditLog, MCPApprovals, MCPGuardrails) eklendi
⚠️ AI Gateway MCP UI sayfaları için BACKEND eksik — Phase 8'de gerçek protocol bağlanacak
⚠️ Vanta, Drata, IBM OpenPages gibi rakipler resmi MCP server shipped — VerifyWise rekabette geri kalıyor

## Açık konular

- Phase 8: gerçek `@modelcontextprotocol/sdk` ile MCP server expose et
- AI Gateway MCP UI sayfalarına backend bağlantısı

## Kaynaklar

- raw/competitor-research/master-gap-analysis.md
- raw/competitor-research/agent-trends-12.md
- Phase 7 implementation: `Servers/services/skills/`, `Servers/advisor/toolBridge.ts`

## İlgili Sayfalar

- [concept-mcp-protocol](../concepts/concept-mcp-protocol.md)
- [synthesis-mcp-strateji](../syntheses/synthesis-mcp-strateji.md)
- [synthesis-rakip-gap-analysis](../syntheses/synthesis-rakip-gap-analysis.md)
