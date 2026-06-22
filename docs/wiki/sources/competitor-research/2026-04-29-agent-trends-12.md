---
title: Bleeding-Edge AI GRC Trendleri 2025-2026
tags: [trends, kya, dids, iatp, opa-rego, owasp-agentic, aibom, agentic-memory]
source: raw/competitor-research/agent-trends-12.md
date: 2026-04-29
status: active
---

# Bleeding-Edge AI GRC Trendleri 2025-2026

## Amaç

12. paralel ajan: rakip-bağımsız sektör trendlerini topla. Hangi yetenek 2027'de standart olacak?

## Ne yapıldı

### 12 Temel Trend

1. **Agent Identity & "Agent Passports" (KYA)** — DIDs (W3C), Verifiable Credentials, ERC-8004, IATP trust scoring
2. **Runtime Policy-as-Code (OPA/Rego)** — externalize edilmiş, prompt injection'a karşı dayanıklı (MS AGT: 0% violation vs 26.67% prompt-based)
3. **OWASP Top 10 for Agentic Applications (Dec 2025)** — ASI01-ASI10 + "Principle of Least Agency"
4. **Pre-Action Simulation / Digital-Twin Sandboxing** — yüksek-stake action'lar twin'den geçer
5. **AIBOM on CycloneDX 1.6 / SPDX 3.0** — model + data + code + hardware + governance bom
6. **Continuous Compliance Monitoring** — point-in-time → real-time control posture (0-100)
7. **Agentic Memory with Governance** — working/procedural/semantic/episodic + GDPR-vs-EU AI Act Article 12 conflict
8. **AI Control Tower / Command Center** — single pane of glass for 1st + 3rd-party agents
9. **AI Board Member / Persona Agents** (Diligent Apr 2026)
10. **NIST AI Agent Standards Initiative (Feb 2026)** — CSA Agentic NIST AI RMF Profile v1
11. **Shadow AI Discovery as a Module** — 82% of orgs found ≥1 ungoverned AI agent
12. **Agentic Auto-Remediation** — saga + rollback + kill-switch (88% AI-driven remediation today)

## VerifyWise için ders

| Trend | VerifyWise Durum |
|---|---|
| Agent Passports (DIDs) | Yok |
| OPA/Rego policy bundle | json-rules-engine var, OPA yok |
| OWASP Agentic Top 10 | Yok (LLM/ML var) |
| Pre-action Simulation | preview.ts var (kısmi) |
| AIBOM CycloneDX 1.6 | Custom format var |
| Continuous Compliance | Readiness score periodic |
| Agentic Memory | 3/4 tip + bağlanmamış |
| AI Control Tower | Workflows + Skills + Audit dağınık |
| Shadow AI Discovery | ✅ TAM VAR |
| Agentic Auto-Remediation | Kısmen (Compliance Autopilot) |

## Açık konular

- Phase 8+ roadmap'ine bu trendlerden hangileri girecek?
- Agent Passport standardı henüz olgunlaşmamış — bekle vs early-mover

## Kaynaklar

- raw/competitor-research/agent-trends-12.md (orijinal: `~/.claude/plans/tamam-ozaman-pahse-4-kind-flame-agent-aaed024e9ab208edc.md`, 18914 bayt)
- OWASP Top 10 Agentic Apps 2026 — https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- CSA Agentic NIST AI RMF Profile v1
- Microsoft AGT (open-source): https://github.com/microsoft/agent-governance-toolkit

## İlgili Sayfalar

- [concept-owasp-agentic-top-10](../../concepts/concept-owasp-agentic-top-10.md)
- [concept-agent-passport-dids](../../concepts/concept-agent-passport-dids.md)
- [concept-aibom-cyclonedx](../../concepts/concept-aibom-cyclonedx.md)
- [synthesis-rakip-gap-analysis](../../syntheses/synthesis-rakip-gap-analysis.md)
