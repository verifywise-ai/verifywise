---
title: BUG (CRITICAL) — memoryService.ts hiçbir yerde import edilmiyor
tags: [bug, critical, memory-service, ai-advisor, gdpr, agent-memory]
source: raw/competitor-research/master-gap-analysis.md
date: 2026-04-29
status: active
---

# BUG (CRITICAL): memoryService.ts bağlanmamış

## Belirti

VerifyWise'da agent memory için 3 tablo var (`agent_message_history`, `agent_working_memory`, `agent_semantic_memory`) ve `memoryService.ts` dosyası yazılmış. **AMA** `memoryService.ts` HİÇBİR YERDE import edilmiyor — `aiSdkAgent.ts` belleği tamamen bypass ediyor.

```bash
grep -r "memoryService" /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler/Servers/
# Sadece memoryService.ts'in kendi dosyası match — başka dosya import etmiyor
```

## Kök Neden

Phase 3-4 implementasyonunda memory service yazıldı ama aiSdkAgent.ts'e bağlanma adımı atlandı. Test edilmedi. Codebase verification ajanı tespit etti.

## Sonuç

- AI Advisor multi-turn conversation'da geçmişi hatırlamıyor (her message tek başına LLM'e gidiyor)
- 3 memory tablosu boş kalıyor
- `clearAgentMemory()` fonksiyonu var ama REST endpoint'e bağlanmamış → **GDPR risk** (right-to-erasure handle edilmiyor)
- Episodic memory (4. tip) hiç yok

## Fix (3-4 gün)

1. `Servers/advisor/aiSdkAgent.ts` → `memoryService.ts` import + her LLM call öncesi memory restore
2. POST/PATCH/DELETE `/api/advisor/conversations/:id/memory` endpoint
3. `episodic_memory` tablosu migration
4. End-to-end test: 2 mesajlık konuşma, ikincide birinciyi hatırlamalı

## Etkilenen Dosyalar

- `Servers/advisor/memory/memoryService.ts` (mevcut, kullanılmıyor)
- `Servers/advisor/aiSdkAgent.ts` (memoryService import edilmiyor)
- `Servers/routes/advisor.route.ts` (memory delete endpoint yok)
- Migration: `20260414122845-create-agent-memory-tables.js` (3 tablo zaten var)

## Önleme

- Phase merge öncesi "import graph" lint — yetim service dosyaları flag'le
- Integration test: agent memory persistence

## Kaynaklar

- raw/competitor-research/master-gap-analysis.md (codebase verification ajan a4c76cd794951b738 raporu)

## İlgili Sayfalar

- [synthesis-rakip-gap-analysis](../syntheses/synthesis-rakip-gap-analysis.md)
- [synthesis-bug-fix-patterns](../syntheses/synthesis-bug-fix-patterns.md)
- [concept-agentic-governance](../concepts/concept-agentic-governance.md)
