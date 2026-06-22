# Phase 0 AI Features — Happy Path Testing Guide

> **Tarih:** 2026-03-25
> **Branch:** `feat/ai-foundation-infra`
> **Issues:** #3596, #3597, #3598, #3599

Bu belge, Phase 0 AI özelliklerini uçtan uca test etmek için adım adım kılavuzdur. Her issue için "happy path" senaryoları, beklenen sonuçlar ve kontrol noktaları içerir.

---

## Ön Gereksinimler

### 1. Servisleri Başlat

```bash
# Terminal 1 — Backend
cd Servers && npm install && npm run build && npx sequelize db:migrate && npm run watch

# Terminal 2 — Frontend
cd Clients && npm install && npm run dev
```

### 2. Login & JWT Token Al

```bash
# Login olup token al
curl -s -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-password"}' | jq .

# Dönen token'ı kaydet:
export TOKEN="eyJhbGciOi..."
```

### 3. Migration Kontrolü

```bash
cd Servers && npx sequelize db:migrate:status
```

Şu migration'lar "up" olmalı:
- `20260325161242-create-phase0-ai-tables`
- `20260325183928-add-readiness-unique-constraints`
- `20260325202908-readiness-project-scope-and-history`

DB'de bu tabloların varlığını doğrula:

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'verifywise'
  AND tablename IN (
    'evidence_ai_analysis',
    'control_readiness_scores',
    'framework_readiness_scores',
    'ai_content_metadata',
    'readiness_history'
  );
-- 5 satır dönmeli
```

---

## Issue #3596 — Shared Infrastructure

### Test: Tablo ve Index'ler Doğru Oluştu mu?

```sql
-- Unique index'ler var mı?
SELECT indexname FROM pg_indexes
WHERE tablename IN ('control_readiness_scores', 'framework_readiness_scores')
  AND indexname LIKE 'uq_%';
-- Beklenen: uq_ctrl_readiness_ctrl_fw_proj_org, uq_fw_readiness_fw_proj_org

-- readiness_history tablosu var mı?
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'verifywise' AND table_name = 'readiness_history'
ORDER BY ordinal_position;
-- 10 sütun: id, framework_type, project_id, avg_score, total_controls,
--           ready_count, needs_work_count, at_risk_count, not_started_count,
--           calculated_at, organization_id
```

**Beklenen Sonuç:** 5 tablo, 2 unique index, readiness_history tablosu oluşmuş olmalı.

---

## Issue #3597 — Evidence Agent (Document Intelligence)

### Test 1: Dosya Analiz Et (Happy Path)

**Ön koşul:** Sistemde en az 1 dosya yüklenmiş olmalı. Dosya ID'sini bul:

```sql
SELECT id, filename, type FROM files WHERE organization_id = 1 LIMIT 5;
```

```bash
# Dosyayı analiz et (file_id = 1 örnek)
curl -s -X POST http://localhost:3000/api/evidence-ai/analyze/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq .
```

**Beklenen Sonuç:**
```json
{
  "statusCode": 200,
  "data": {
    "id": 1,
    "file_id": 1,
    "summary": "...",
    "key_findings": ["..."],
    "compliance_areas": ["risk", "audit", ...],
    "quality_score": {
      "relevance": 40,
      "completeness": 30,
      "recency": 70,
      "reliability": 50,
      "specificity": 25
    },
    "overall_quality_score": 44,
    "suggested_control_links": [...]
  }
}
```

**Kontrol Noktaları:**
- [ ] HTTP 200 dönüyor
- [ ] `summary` boş değil
- [ ] `quality_score` 5 boyut içeriyor (her biri 0-100)
- [ ] `overall_quality_score` 0-100 arasında
- [ ] `compliance_areas` array, dosya içeriğine göre dolu
- [ ] `ai_content_metadata` tablosuna otomatik kayıt düştü mü? (aşağıda kontrol)

### Test 2: Analiz Sonucunu Getir

```bash
curl -s -X GET http://localhost:3000/api/evidence-ai/analysis/1 \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Beklenen:** HTTP 200, Test 1'de yazılan analysis verisini döner.

### Test 3: Quality Scores Dashboard

```bash
curl -s -X GET http://localhost:3000/api/evidence-ai/quality-scores \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Beklenen:** HTTP 200, analiz edilmiş dosyaların listesi ile quality score'ları.

### Test 4: Evidence Gap Analysis

```bash
# EU AI Act framework'ü için gap analizi
curl -s -X GET "http://localhost:3000/api/evidence-ai/gaps?framework_type=eu_ai_act&quality_threshold=50" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Beklenen Sonuç:**
```json
{
  "statusCode": 200,
  "data": {
    "total_controls": 20,
    "controls_without_evidence": 15,
    "controls_with_low_quality": 2,
    "controls_adequate": 3,
    "quality_threshold": 50,
    "gaps": [...]
  }
}
```

**Kontrol Noktaları:**
- [ ] `total_controls` > 0
- [ ] `gaps` array'inde her item'da `gap_type` var: "no_evidence" veya "low_quality"
- [ ] `framework_type=iso_42001` ile çağırınca farklı kontrol'ler dönüyor

### Test 5: Suggestions ve Apply

```bash
# Önerilen control link'leri getir
curl -s -X GET http://localhost:3000/api/evidence-ai/suggestions/1 \
  -H "Authorization: Bearer $TOKEN" | jq .

# Bir suggestion uygula
curl -s -X POST http://localhost:3000/api/evidence-ai/suggestions/1/apply \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"suggestions": [{"control_id": 1, "framework_type": "eu_ai_act"}]}' | jq .
```

**Beklenen:** Suggestions listesi döner, apply sonrası `applied_count` > 0.

---

## Issue #3598 — Control Assessment Agent (Readiness Scoring)

### Test 6: Tüm Framework'ler İçin Readiness Hesapla

```bash
curl -s -X POST http://localhost:3000/api/readiness/calculate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

**Beklenen Sonuç:**
```json
{
  "statusCode": 200,
  "data": [
    {
      "framework_type": "eu_ai_act",
      "avg_score": 15,
      "total_controls": 20,
      "ready_count": 0,
      "needs_work_count": 0,
      "at_risk_count": 3,
      "not_started_count": 17,
      "weakest_controls": [...]
    },
    {
      "framework_type": "iso_42001",
      "avg_score": 12,
      ...
    }
  ]
}
```

**Kontrol Noktaları:**
- [ ] HTTP 200 dönüyor
- [ ] 2 framework döndü (eu_ai_act, iso_42001)
- [ ] `total_controls` > 0
- [ ] `avg_score` 0-100 arasında
- [ ] `ready_count + needs_work_count + at_risk_count + not_started_count = total_controls`
- [ ] `readiness_history` tablosuna kayıt düştü mü:

```sql
SELECT * FROM readiness_history ORDER BY calculated_at DESC LIMIT 5;
-- Her framework için 1 satır olmalı
```

- [ ] `ai_content_metadata` tablosuna "readiness_score" kaydı düştü mü:

```sql
SELECT * FROM ai_content_metadata
WHERE entity_type = 'readiness_score'
ORDER BY created_at DESC LIMIT 5;
```

### Test 7: Belirli Framework İçin Readiness Hesapla

```bash
curl -s -X POST http://localhost:3000/api/readiness/calculate/eu_ai_act \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

**Beklenen:** Tek framework score objesi döner.

### Test 8: Framework Scores Getir

```bash
# Tüm framework score'ları
curl -s -X GET http://localhost:3000/api/readiness/scores \
  -H "Authorization: Bearer $TOKEN" | jq .

# Belirli framework
curl -s -X GET http://localhost:3000/api/readiness/scores/eu_ai_act \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Test 9: Per-Control Scores

```bash
curl -s -X GET http://localhost:3000/api/readiness/controls/eu_ai_act \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Beklenen:** Her control için ayrı score objesi. Her birinde 5 boyut score'u var.

**Kontrol Noktaları:**
- [ ] Her control'de `evidence_quality_score`, `evidence_count_score`, `evidence_recency_score`, `task_completion_score`, `risk_mitigation_score` var
- [ ] `readiness_level` değerleri: "ready", "needs_work", "at_risk", "not_started" — score'a uygun

### Test 10: Weakest Controls & Recommendations

```bash
# En zayıf kontrol'ler
curl -s -X GET "http://localhost:3000/api/readiness/weakest?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq .

# İyileştirme önerileri
curl -s -X GET "http://localhost:3000/api/readiness/recommendations?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Beklenen:** Weakest → en düşük score'lu control'ler sıralı. Recommendations → her biri `priority` (critical/high/medium) ve `recommendations` array'i içerir.

### Test 11: Readiness History (Trend)

```bash
# İlk hesaplamadan sonra
curl -s -X GET http://localhost:3000/api/readiness/history \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Beklenen:** En az 2 satır (eu_ai_act + iso_42001). Her satırda `calculated_at` timestamp'ı.

```bash
# 2. kez hesapla ve tekrar history çek
curl -s -X POST http://localhost:3000/api/readiness/calculate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{}' > /dev/null

curl -s -X GET http://localhost:3000/api/readiness/history \
  -H "Authorization: Bearer $TOKEN" | jq '.[].calculated_at'
```

**Kontrol:** Her hesaplamada yeni satır ekleniyor (overwrite değil).

### Test 12: Project-Scoped Hesaplama

```bash
# Project ID 1 için hesapla
curl -s -X POST http://localhost:3000/api/readiness/calculate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id": 1}' | jq .

# Org-wide scores (project_id yok)
curl -s -X GET http://localhost:3000/api/readiness/scores \
  -H "Authorization: Bearer $TOKEN" | jq .

# Project-scoped scores
curl -s -X GET "http://localhost:3000/api/readiness/scores?project_id=1" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Kontrol:** Org-wide ve project-scoped sonuçlar birbirini ezmez, ayrı satırlar.

---

## Issue #3599 — AI Content Badge (Transparency System)

### Test 13: AI Content Stats (İlk Durum)

```bash
curl -s -X GET http://localhost:3000/api/ai-content/stats \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Beklenen Sonuç (Test 1 ve 6 çalıştırıldıysa):**
```json
{
  "statusCode": 200,
  "data": {
    "total": 3,
    "reviewed": 0,
    "unreviewed": 3,
    "review_rate": 0,
    "by_badge_type": {
      "generated": 3,
      "assisted": 0,
      "reviewed": 0,
      "suggested": 0
    },
    "by_review_action": {
      "approved": 0,
      "modified": 0,
      "rejected": 0
    },
    "avg_confidence": 44
  }
}
```

**Kontrol Noktaları:**
- [ ] `total` > 0 (evidence analizi + readiness hesaplaması metadata yazmış olmalı)
- [ ] `unreviewed` = `total` (henüz hiçbiri review edilmedi)
- [ ] `by_badge_type.generated` > 0

### Test 14: Entity Bazlı Badge Getir

```bash
# Evidence analizi badge'i (Test 1'de file_id=1 analiz ettiyseniz)
curl -s -X GET http://localhost:3000/api/ai-content/evidence/1 \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Beklenen:** Array döner, her item'da:
- `badge_type`: "generated"
- `model_used`: "heuristic-v1"
- `tool_name`: "evidence-analysis"
- `human_reviewed`: false
- `confidence_score`: analysis'teki overall_quality_score

### Test 15: Unreviewed Content Listesi

```bash
curl -s -X GET "http://localhost:3000/api/ai-content/unreviewed?limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Beklenen:** `{ items: [...], total: N }` — review edilmemiş tüm AI content'ler.

### Test 16: Content Review (Approve)

```bash
# Unreviewed listesinden ilk item'ın id'sini al
ID=$(curl -s -X GET "http://localhost:3000/api/ai-content/unreviewed?limit=1" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.items[0].id')

# Approve et
curl -s -X PATCH "http://localhost:3000/api/ai-content/$ID/review" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"review_action": "approved"}' | jq .
```

**Beklenen:**
```json
{
  "statusCode": 200,
  "data": {
    "id": 1,
    "human_reviewed": true,
    "review_action": "approved",
    "reviewed_at": "2026-03-25T...",
    "reviewed_by": 1
  }
}
```

**Kontrol Sonrası:**
```bash
# Stats tekrar çek — review_rate artmış olmalı
curl -s -X GET http://localhost:3000/api/ai-content/stats \
  -H "Authorization: Bearer $TOKEN" | jq '.data.review_rate'
# 0'dan büyük olmalı
```

### Test 17: Content Reject

```bash
# Bir item reject et
curl -s -X PATCH "http://localhost:3000/api/ai-content/2/review" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"review_action": "rejected"}' | jq .
```

**Beklenen:** HTTP 200, `review_action: "rejected"`.

---

## Uçtan Uca (End-to-End) Senaryo

Bu senaryo tüm 4 issue'yu sırasıyla kullanır:

```
1. Login → JWT token al
2. [#3597] POST /evidence-ai/analyze/1 → Dosya analiz et
3. [#3597] GET /evidence-ai/analysis/1 → Sonucu doğrula
4. [#3597] GET /evidence-ai/gaps → Gap'leri gör
5. [#3598] POST /readiness/calculate → Tüm framework readiness hesapla
6. [#3598] GET /readiness/scores → Framework score'larını gör
7. [#3598] GET /readiness/controls/eu_ai_act → Per-control score'ları gör
8. [#3598] GET /readiness/weakest → En zayıf kontrol'leri gör
9. [#3598] GET /readiness/history → Trend verisini gör
10. [#3599] GET /ai-content/stats → Kaç AI content üretildi?
11. [#3599] GET /ai-content/unreviewed → Review bekleyenleri gör
12. [#3599] PATCH /ai-content/1/review → İlkini approve et
13. [#3599] GET /ai-content/stats → review_rate artmış mı?
```

---

## Frontend Test Checklist

Browser'da `http://localhost:5173` aç ve login ol.

### Evidence Hub (Issue #3597)

- [ ] `/model-inventory/evidence-hub` sayfasına git
- [ ] Dosya listesinde "AI Quality" sütunu görünüyor
- [ ] Analiz edilmiş dosyalarda quality badge var (renk kodlu: yeşil/mavi/turuncu/kırmızı)
- [ ] Analiz edilmemiş dosyalarda badge boş veya "—"

### Readiness Dashboard (Issue #3598)

- [ ] `/readiness` sayfasına git
- [ ] "Calculate Readiness" butonuna tıkla
- [ ] Loading spinner gösteriliyor
- [ ] Hesaplama sonrası framework score card'ları görünüyor
- [ ] Her card'da: score (0-100), level badge, kontrol sayıları
- [ ] Framework tab'ları çalışıyor (EU AI Act ↔ ISO 42001)
- [ ] Heatmap'te kontrol kutucukları renk kodlu
- [ ] ReadinessTrend bölümünde bar chart görünüyor
- [ ] WeakControlsList'te en zayıf kontrol'ler priority tag'li

### AI Content Badge (Issue #3599)

- [ ] Evidence analizi yapıldıktan sonra ilgili yerlerde badge göründüğünü doğrula
- [ ] AIContentBadge component'i import edip test sayfasında render edebilirsin:

```tsx
import AIContentBadge from "../../components/AIContentBadge";

// Inline variant
<AIContentBadge badgeType="generated" modelUsed="heuristic-v1" confidenceScore={75} />

// Card variant
<AIContentBadge badgeType="assisted" variant="card" humanReviewed={false} />

// Reviewed state
<AIContentBadge badgeType="reviewed" variant="inline" humanReviewed={true} reviewAction="approved" />
```

---

## Hata Senaryoları (Negative Path)

| Test | Komut | Beklenen |
|------|-------|----------|
| Geçersiz file ID | `POST /evidence-ai/analyze/999999` | 404 "File not found" |
| Geçersiz file ID format | `POST /evidence-ai/analyze/abc` | 400 "Invalid file ID" |
| Auth olmadan istek | Header'sız `GET /readiness/scores` | 401 |
| Geçersiz review action | `PATCH /ai-content/1/review` body: `{"review_action": "xxx"}` | 400 |
| Hesaplama yapılmadan score çekme | `GET /readiness/scores` (ilk kez) | 200 boş array |
| Var olmayan entity badge | `GET /ai-content/xyz/999999` | 200 boş array |

---

## DB Doğrulama Sorguları

Testlerin sonunda bu sorguları çalıştırarak verilerin düzgün yazıldığını doğrula:

```sql
-- Evidence analysis kayıtları
SELECT id, file_id, overall_quality_score, analysis_model, analyzed_at
FROM evidence_ai_analysis ORDER BY analyzed_at DESC LIMIT 5;

-- Control readiness scores
SELECT control_id, framework_type, project_id, overall_score, readiness_level
FROM control_readiness_scores ORDER BY overall_score ASC LIMIT 10;

-- Framework readiness scores
SELECT framework_type, project_id, avg_score, total_controls, ready_count
FROM framework_readiness_scores ORDER BY calculated_at DESC;

-- Readiness history (trend verileri — overwrite değil append)
SELECT framework_type, avg_score, calculated_at
FROM readiness_history ORDER BY calculated_at DESC LIMIT 10;

-- AI content metadata (transparency badge'ler)
SELECT id, entity_type, entity_id, badge_type, human_reviewed, review_action, tool_name
FROM ai_content_metadata ORDER BY created_at DESC LIMIT 10;

-- Project-scoped vs org-wide ayrımı
SELECT framework_type, project_id, avg_score
FROM framework_readiness_scores
ORDER BY framework_type, project_id;
-- NULL project_id = org-wide, sayısal = project-scoped
```

---

## Özet Checklist

| # | Issue | Test | Status |
|---|-------|------|--------|
| 1 | #3596 | Migration'lar çalıştı, 5 tablo var | ☐ |
| 2 | #3596 | Unique index'ler oluştu | ☐ |
| 3 | #3597 | Dosya analizi çalışıyor | ☐ |
| 4 | #3597 | Quality scores dönüyor | ☐ |
| 5 | #3597 | Gap analysis framework filter çalışıyor | ☐ |
| 6 | #3597 | Suggestions + Apply çalışıyor | ☐ |
| 7 | #3598 | Calculate All çalışıyor | ☐ |
| 8 | #3598 | Calculate single framework çalışıyor | ☐ |
| 9 | #3598 | Per-control scores doğru | ☐ |
| 10 | #3598 | Weakest + Recommendations çalışıyor | ☐ |
| 11 | #3598 | History append ediyor (overwrite değil) | ☐ |
| 12 | #3598 | Project-scoped vs org-wide ayrı | ☐ |
| 13 | #3599 | AI content metadata otomatik yazılıyor | ☐ |
| 14 | #3599 | Entity badge'leri dönüyor | ☐ |
| 15 | #3599 | Unreviewed listesi çalışıyor | ☐ |
| 16 | #3599 | Review workflow (approve/reject) çalışıyor | ☐ |
| 17 | #3599 | Stats doğru hesaplanıyor | ☐ |
| 18 | ALL | Frontend sayfalar yükleniyor | ☐ |
| 19 | ALL | Negative path'ler doğru hata veriyor | ☐ |
| 20 | ALL | Multi-tenancy: başka org'un verisi görünmüyor | ☐ |
