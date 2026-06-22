---
title: BUG — Duplicate tsc-watch process'leri 502 hatasına sebep oluyor
tags: [bug, tsc-watch, 502, port-conflict, dev-environment]
source: 2026-04-29 chat session
date: 2026-04-29
status: active
---

# BUG: Duplicate tsc-watch → HTTP 502

## Belirti

Frontend'den backend'e istek atınca `Request failed with status code 502`.

## Kök Neden

Önceki backend restart'ta `tsc-watch` process'i düzgün öldürülmemiş. İki paralel `tsc-watch` çalışıyor (PID 7821 + 8777). Her dosya değişikliğinde her ikisi de `dist/index.js`'i restart etmeye çalışıyor → port 3000 çakışması → server crash döngüsü.

```
PID 7821 (tsc-watch) ──┬─► dist/index.js (yarış kazanan)
PID 8777 (tsc-watch) ──┘    └─► CRASH (port çakışması)
```

## Tespit

```bash
ps aux | grep tsc-watch | grep -v grep
# 2 satır görüyorsan duplicate var
lsof -ti:3000   # port'a bağlı PID
```

## Fix

```bash
pkill -f "tsc-watch.*Servers"
pkill -f "node.*dist/index.js"
pkill -f "node.*dist/jobs/worker"
sleep 2
cd Servers && npm run watch &
cd Servers && npm run worker &
```

## Önleme

- Backend restart'ında `kill %1` yerine `pkill -f` kullan
- Process tree audit script'i (cron) — duplicate detect ederse uyar

## Etkilenen Dosyalar

- `Servers/package.json` (watch script)
- Worker init: `Servers/jobs/worker.ts`

## Açık konular

- Sürekli karşılaşılan bug — startup script'i daha defensive yapılmalı

## Kaynaklar

- 2026-04-29 user testing session — 502 raporu
- Backend log: `tail /private/tmp/claude-501/.../bz9kkeavw.output`

## İlgili Sayfalar

- [synthesis-bug-fix-patterns](../syntheses/synthesis-bug-fix-patterns.md)
- [decision-bullmq-cron-pattern](../decisions/decision-bullmq-cron-pattern.md)
