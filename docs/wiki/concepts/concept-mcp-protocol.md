---
title: MCP (Model Context Protocol)
tags: [concept, mcp, anthropic, tool-protocol, agent-interop]
source: raw/competitor-research/master-gap-analysis.md
date: 2026-04-30
status: active
---

# MCP (Model Context Protocol)

## Tanım

Anthropic'in geliştirdiği standart — LLM'ler ve external sistemler arasında **tool calling** için protokol. STDIO veya SSE üzerinden mesaj alışverişi.

## Neden Önemli

2026 itibarıyla **enterprise interop standardı**:
- 10K+ enterprise MCP server (toplam)
- 97M `@modelcontextprotocol/sdk` download
- MS, Google, AWS, SAS, Salesforce, Vanta, Drata, IBM, Anecdotes, Cisco hepsi MCP shipped

## Kavramlar

- **MCP Server** — yetenek sağlayıcı (örn. Vanta API'sini MCP olarak expose eder)
- **MCP Client** — LLM tarafı (Claude Desktop, Cursor, Windsurf, vb.)
- **Tool** — fonksiyon (`get_compliance_score`, `list_risks`)
- **Resource** — read-only data (`policy/123`, `framework/eu-ai-act`)
- **Prompt** — parametreli template

## VerifyWise Durum

⚠️ **Phase 7 HTTP-style backend** kullanıyor — gerçek MCP protocol değil.
- POST `{tool, params}` to `mcp_server_url`
- 30s timeout
- Custom approval gateway entegrasyonu

✅ AI Gateway tarafında MCP UI sayfaları var:
- MCP Servers
- MCP Tool Catalog
- MCP Audit Log
- MCP Approvals
- MCP Guardrails

❌ Gerçek MCP protocol (`@modelcontextprotocol/sdk`) Phase 8'de planlandı.

## Rakipler

| Vendor | MCP Status |
|---|---|
| Vanta | MCP Server (Jun 2025) |
| Drata | MCP Server (Dec 2025) |
| IBM OpenPages | Local MCP Server (9.1.3) |
| SAS Viya | MCP Server |
| Salesforce | MCP Bridge |
| Anecdotes | MCP-native architecture |

## Kaynaklar

- raw/competitor-research/master-gap-analysis.md
- raw/competitor-research/agent-trends-12.md
- Anthropic MCP docs: https://modelcontextprotocol.io

## İlgili Sayfalar

- [decision-mcp-http-backend-vs-modelcontextprotocol-sdk](../decisions/decision-mcp-http-backend-vs-modelcontextprotocol-sdk.md)
- [synthesis-mcp-strateji](../syntheses/synthesis-mcp-strateji.md)
