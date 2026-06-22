---
title: VerifyWise Wiki — Kullanım Talimatları
tags: [meta, instructions]
date: 2026-04-30
status: active
---

# VerifyWise Wiki — Kullanım Talimatları

## Amaç

VerifyWise için **kalıcı bilgi arşivi**. AI Governance Platform geliştirme tarihçesi — EU AI Act, ISO 42001, ISO 27001, NIST AI RMF uyum desteği. Phase 1-7 AI Agentic stack tasarım kararları, mimari seçimler, bug fix'leri, rakip analizleri ve agent fikirleri tek yerde toplanır.

Yeni özellik geliştirirken **"daha önce nasıl yapıldı?"** sorusuna saniyeler içinde cevap verir. Bu wiki:

- Tek bir kişinin kafasında değil — diske yazılı, herkes erişebilir
- Kaynaksız iddia kabul etmez — her bilgi referans gösterir
- Asla bilgi kaybetmez — eski sayfalar `archive/` altına taşınır, silinmez
- Çelişkileri saklar — yeni keşif eski karara ters düşerse her ikisi de durur, çelişki açıkça işaretlenir

---

## Dil Kuralları

- **TÜM wiki sayfaları Türkçe** yazılır
- İstisna olarak İngilizce kalır:
  - Dosya yolları (`Servers/services/...`)
  - SQL kolon isimleri (`overall_score`, `actor_type`)
  - TypeScript tip / interface adları (`WorkflowDefinition`, `SkillSource`)
  - Framework adları (EU AI Act, ISO 42001, OWASP Agentic, NIST AI RMF)
  - OWASP / ISO control ID'leri (LLM01, ASI01, A.5.1)
  - Endpoint path'leri (`/api/teamsWebhooks`)
  - Library / paket isimleri (`xstate`, `bullmq`, `@modelcontextprotocol/sdk`)
  - Kod blokları içeriği

---

## Naming

**kebab-case** dosya adları. Örnekler:

```
phase-4-proactive-ai.md
bug-duplicate-tsc-watch.md
decision-mcp-http-backend.md
entity-coordinator-agent.md
concept-owasp-agentic-top-10.md
synthesis-phase-1-7-mimari.md
```

İstisnalar:
- `index.md`, `log.md`, `CLAUDE.md` (wiki kökündeki standart dosyalar)
- `.gitkeep` (boş klasörleri git'e bağlamak için)

---

## Sayfa Formatı

Her sayfa şu yapıyı izler:

```markdown
---
title: Sayfa Başlığı
tags: [phase-4, proactive-ai, bullmq, teams-webhook]
source: raw/phase-docs/phase-4-implementation.md
date: 2026-04-29
status: active
---

# Sayfa Başlığı (H1)

İçerik...

## Kaynaklar

- raw/phase-docs/phase-4-implementation.md (satır 519-580)
- https://learn.microsoft.com/en-us/microsoftteams/...

## İlgili Sayfalar

- [phase-4-proactive-ai](../phase-docs/phase-4-proactive-ai.md)
- [decision-bullmq-cron-pattern](../decisions/decision-bullmq-cron-pattern.md)
- [bug-duplicate-tsc-watch](../sorunlar/bug-duplicate-tsc-watch.md)
```

### Frontmatter Alanları

| Alan | Tip | Açıklama |
|---|---|---|
| `title` | string | Sayfa başlığı (H1 ile uyumlu) |
| `tags` | string[] | Arama için etiketler |
| `source` | string \| string[] | Hangi raw dosya(lar)dan türetildi |
| `date` | YYYY-MM-DD | Sayfanın yazılma / son güncelleme tarihi |
| `status` | enum | `active` \| `superseded` \| `conflict` |

---

## Üç Operasyon Workflow'u

Bu wiki **llm-wiki** skill'inin VerifyWise'a uyarlanmış versiyonudur. Üç operasyon:

### 1. INGEST (yeni kaynak işle)

**Tetikleyici:** kullanıcı `INGEST <yol>` veya `INGEST all` der.

**Akış:**

1. Kaynak dosyaları sırasıyla oku: `raw/phase-docs/`, `raw/transcripts/`, `raw/pr-descriptions/`, `raw/competitor-research/`
2. Her kaynak için içeriği tara, ana konuyu çıkar
3. `sources/<klasör>/YYYY-MM-DD-slug.md` dosyası yaz, şu başlıklarla:
   - **Amaç** — problem ne idi, niye yapıldı?
   - **Ne yapıldı** — özet, hangi kararlar alındı
   - **Değişenler** — hangi dosyalar, hangi DB tabloları, hangi endpoint'ler
   - **Kararlar** — atomik decision sayfalarına link
   - **Sorunlar** — `sorunlar/` klasörüne link
   - **Açık konular** — TODO, follow-up
4. `index.md`'i güncelle (uygun kategoriye satır ekle)
5. Bahsedilen entity / concept / decision / sorun sayfalarını aç veya güncelle (çapraz-bağlantı)
6. `log.md`'e tek satırlık kayıt ekle:
   ```
   - 2026-04-30 14:33 [INGEST]: raw/phase-docs/phase-4.md → sources/phase-docs/2026-04-29-phase-4-proactive-ai.md
   ```

### 2. QUERY (soruyu wiki üzerinden cevapla)

**Tetikleyici:** kullanıcı bir soru sorar (`Phase 4'te Teams webhook nasıl kuruldu?`).

**Akış:**

1. Soruyla ilgili tag / başlık / içerik araması yap (`grep -r`, `find`)
2. İlgili sayfaları oku (max 5)
3. Cevap üret — sadece bulunan sayfalardan, **wiki dışı bilgi uydurma**
4. Cevabın sonunda **kullanılan sayfaları** "## Kaynaklar" başlığı altında listele
5. Bilgi yoksa açıkça söyle: *"Wiki'de bu konuda kayıt yok. INGEST yapılması gerek."*

### 3. LINT (sağlık taraması)

**Tetikleyici:** kullanıcı `LINT` der veya periyodik olarak.

**Kontroller:**

- Ölü iç linkler (var olmayan dosyaya `[link](path)`)
- Eksik / hatalı YAML frontmatter (zorunlu alanlar: `title`, `tags`, `date`, `status`)
- `## Kaynaklar` başlığı eksik sayfalar
- Aynı `tag` farklı yazımlarla (`phase-4`, `phase4`, `Phase4`)
- `status: conflict` olup hala "## ÇELİŞKİ" başlığı taşımayan sayfalar
- Çift dosya adı (case-insensitive)

Sonuçları `log.md`'e `[LINT]` tipinde tek satır + ekran çıktısına detay yazar.

---

## INGEST Özel Durumu — VerifyWise Kaynak Tipleri

### `raw/phase-docs/` — Phase Implementation Plans

**Beklenen format:** her phase için ayrı `.md` dosyası, yapı:
- Context / Why now / Outcome
- Architecture decisions
- Steps
- Files Summary
- Verification

**Çıkartılacak bilgi:** her step için ayrı entity sayfası, her tasarım tercihi için ayrı decision sayfası, her bug fix için ayrı `sorunlar/` sayfası.

### `raw/transcripts/` — Chat / Oturum Transcript'leri

**Beklenen format:** kullanıcı-Claude diyalog metni veya özeti.

**Çıkartılacak bilgi:** alınan kararlar (decisions/), tartışılan kavramlar (concepts/), karşılaşılan bug'lar (sorunlar/), ortaya çıkan açık konular.

### `raw/pr-descriptions/` — Pull Request Açıklamaları

**Beklenen format:** GitHub PR description metni (`## Summary`, `## Changes`, `## Test plan` vb. başlıklar).

**Çıkartılacak bilgi:** PR'ın hangi phase'e ait olduğu, hangi dosyaları değiştirdiği, hangi conflict'lerin çözüldüğü, review yorumları.

### `raw/competitor-research/` — Rakip Raporları

**Beklenen format:** 12 paralel ajan raporları (Credo AI, Holistic AI, OneTrust, vb.) — markdown.

**Çıkartılacak bilgi:** rakibin sahip olduğu özellikler, VerifyWise'ın eksiği, agent fikirleri (concepts veya syntheses altına).

---

## Hard Rules (asla ihlal edilmez)

1. **`raw/` asla değiştirilmez.** Read-only ham veri. Yanlışlıkla edit edersen geri al.
2. **Kaynaksız iddia yasak.** Her bilgi `## Kaynaklar` altında refere edilir. Kaynak yoksa bilgi yazma.
3. **Sayfa silme yok.** Eskimiş bir sayfa `archive/` klasörüne taşınır. Frontmatter'da `status: superseded` olur. Yeni sayfa eskisine link verir.
4. **Çelişkiler işaretlenir, silinmez.** A sayfası "X yapılır" diyor, B sayfası "X yapılmaz" diyor → her iki sayfaya da `## ÇELİŞKİ` başlığı + birbirlerinin link'i + nedenin kısa açıklaması eklenir. `status: conflict` set edilir. İnsan bir karar verene kadar her ikisi de durur.
5. **Yeni karar eski karara ters:**
   - Eski sayfa: `status: superseded` + en üste "→ Bu sayfa artık geçerli değil. Yeni karar: [new-page]"
   - Eski sayfayı `archive/` altına taşı (commit'te `git mv`)
   - Yeni sayfa: `status: active` + "## Tarihçe" başlığı altında eski sayfaya link

---

## Hızlı Komut Referansı

```bash
# Yeni INGEST tetikle
INGEST raw/phase-docs/phase-4-implementation.md

# Tüm raw'ı işle
INGEST all

# Sorgu
QUERY Phase 4 Teams webhook nasıl kuruldu?

# Sağlık taraması
LINT
```

---

## Sources

- `/Users/halitozger/.claude/plugins/cache/omc/oh-my-claudecode/4.13.5/skills/wiki/SKILL.md` — llm-wiki temeli
- VerifyWise codebase — `/Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler/`

## Related

- [index.md](./index.md)
- [log.md](./log.md)
