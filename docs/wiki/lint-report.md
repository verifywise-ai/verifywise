---
title: VerifyWise Wiki — Lint Report
tags: [lint, health-check, audit]
date: 2026-04-30
status: active
---

# VerifyWise Wiki — Lint Report

> Otomatik sağlık taraması. Bu pass'te otomatik düzeltme yapılmadı, sadece raporlama.
> **Tarih:** 2026-04-30 (Phase 5 lint pass)

---

## Özet

| Kategori | Sayı | Severity |
|---|---|---|
| Toplam .md sayfa (raw hariç) | 49 | — |
| Toplam internal .md link | 163 | — |
| **Ölü iç link** | **28** | 🟡 ORTA — forward references |
| Eksik / bozuk frontmatter | 0 | ✅ |
| Orphan sayfa | 0 | ✅ |
| Tag tutarsızlığı (case farkı) | 0 | ✅ |
| status:conflict olup ÇELİŞKİ başlığı eksik | 0 | ✅ |

---

## 1. Ölü İç Linkler (28)

> Bu linkler **forward reference** — sayfa henüz yazılmamış. INGEST sırasında "decision/concept/entity exists, link et" mantığı sayfayı oluşturmuyor, sadece link veriyor. Lint bu durumu yakalıyor.

### CLAUDE.md (3) — örnek frontmatter dokümantasyonunda
- `../phase-docs/phase-4-proactive-ai.md` (örnek, gerçek sayfa değil)
- `../decisions/decision-bullmq-cron-pattern.md` (var: `decisions/decision-bullmq-cron-pattern.md` ama path yanlış: `../` extra)
- `../sorunlar/bug-duplicate-tsc-watch.md` (örnek)

> **Not:** CLAUDE.md içindeki bu linkler kod bloğu içindeki dokümantasyon örneği — false positive.

### Forward-Reference Decision Sayfaları (12)
Henüz yazılmamış decision sayfaları (sources/'da link verilmiş):
1. `decisions/decision-clean-architecture-layers.md`
2. `decisions/decision-public-intake-no-auth.md`
3. `decisions/decision-drag-drop-builder-pattern.md`
4. `decisions/decision-docker-compose-vs-k8s.md`
5. `decisions/decision-jwt-rotation-policy.md`
6. `decisions/decision-dataset-as-first-class-entity.md`
7. `decisions/decision-plugin-marketplace-separate-repo.md`
8. `decisions/decision-pastel-palette-vs-bright.md`
9. `decisions/decision-chip-component-canonical.md`
10. `decisions/decision-raw-sql-vs-orm.md`
11. `decisions/decision-fair-vs-monetary-only.md`
12. `decisions/decision-codebase-verification-before-claiming-gaps.md`
13. `decisions/decision-multi-tenancy-org-id-pattern.md`

### Forward-Reference Concept Sayfaları (3)
1. `concepts/concept-eu-ai-act-article-10.md`
2. `concepts/concept-agent-passport-dids.md`
3. `concepts/concept-aibom-cyclonedx.md`

### Forward-Reference Entity Sayfaları (2)
1. `entities/entity-agent-evidence.md`
2. `entities/entity-page-public-intake-form.md`

---

## 2. Frontmatter Sağlığı

✅ **0 sayfa** eksik / bozuk frontmatter.

Tüm 49 sayfa şu gerekli alanları içeriyor:
- `title:`
- `tags:`
- `date:`
- `status:`

---

## 3. Orphan Sayfa Tespiti

✅ **0 orphan sayfa.**

Tüm sayfalar en az bir başka sayfadan referans alıyor (index.md, syntheses/, sources/ veya çapraz link).

---

## 4. Tag Dağılımı (Top 20)

| Sayı | Tag |
|---|---|
| 16 | synthesis |
| 12 | decision |
| 10 | entity |
| 10 | concept |
| 10 | bug |
| 9 | multi-tenancy |
| 9 | frontend |
| 8 | mcp |
| 7 | phase-7 |
| 7 | phase-6 |
| 7 | palette |
| 6 | sequelize |
| 6 | organization-id |
| 6 | agentic |
| 5 | phase-4 |
| 5 | phase-2 |
| 5 | persona-agents |
| 5 | competitor-research |
| 4 | workflow |
| 4 | tenant-isolation |

✅ Tag tutarsızlığı yok (case-insensitive aynı tag farklı yazımla görünmüyor).

---

## 5. Çelişki (status: conflict) Kontrolü

✅ **0 sayfa** `status: conflict` ve `## ÇELİŞKİ` başlığı uyumsuzluğu.

Henüz wiki'de tespit edilen çelişki yok.

---

## 6. Önerilen Aksiyonlar (Manuel)

### A. Forward Reference Cleanup (Yüksek Öncelik)
17 forward-reference sayfanın ya:
1. **Yazılması** (kapsamı dar olanlar — `decision-public-intake-no-auth.md` 30 satırlık karar dokümanı)
2. **Linklerin geçici kaldırılması** (sayfa hiç yazılmayacaksa — örn. `decision-docker-compose-vs-k8s.md` çok detaya kaçabilir)
3. **`status: stub` ile placeholder yazılması** (mantığı kaydet, içeriği TODO bırak)

### B. CLAUDE.md Örnek Linkler
CLAUDE.md kod bloğu içindeki örnek "İlgili Sayfalar" linklerini **inline code** (`` ` `` ile sarılı) yap → markdown link olarak parse edilmesin → false positive lint'ten düş.

### C. Concept Coverage
Henüz sayfası olmayan ama ingest edilen kavramları açma:
- `concept-eu-ai-act-article-10` (Dataset Inventory tarafından refere)
- `concept-agent-passport-dids` (Trends 12 tarafından)
- `concept-aibom-cyclonedx` (Trends 12 tarafından)

---

## 7. Sayfa Sayıları (Kategori)

| Kategori | Sayı |
|---|---|
| `sources/phase-docs/` | 3 |
| `sources/transcripts/` | 0 |
| `sources/pr-descriptions/` | 0 |
| `sources/competitor-research/` | 5 |
| `sources/codebase-claude-md/` | 2 |
| `sources/docs/` | 10 |
| `entities/` | 5 |
| `concepts/` | 5 |
| `decisions/` | 6 |
| `sorunlar/` | 5 |
| `syntheses/` | 8 |
| `archive/` | 0 |
| **TOPLAM (raw hariç)** | **49** |

Plus root: `index.md`, `log.md`, `CLAUDE.md`, `lint-report.md` = 53 toplam markdown.

---

## Sonraki Lint Pass Önerisi

- 17 forward-reference sayfa yazıldıktan sonra dead-link sayısı 11 → 0'a düşmeli
- CLAUDE.md örneklerini code-fence içinde `inline` yap
- `transcripts/` ve `pr-descriptions/` boş — gerçek transcript/PR ingest ekle

## Kaynaklar

- Lint pass: 2026-04-30 Python regex scanner
- 49 markdown sayfası tarandı

## İlgili Sayfalar

- [CLAUDE.md](CLAUDE.md)
- [index.md](index.md)
- [log.md](log.md)
