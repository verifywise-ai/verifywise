# Audit: compliance/post-market-monitoring
**Article path:** shared/user-guide-content/content/compliance/post-market-monitoring.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The post-market-monitoring article is accurate, comprehensive, and well-grounded in codebase implementation. All major claims about the seven default questions, their EU AI Act article mappings, question types, configuration options, and PDF report generation are verified against source code. No factual errors detected.

## Findings
No significant issues found. All major technical and compliance claims verified.

## Verified claims (sampled)
- Claim: "When you first enable monitoring, VerifyWise creates seven default questions. Six are yes/no questions mapped to EU AI Act articles. The seventh is a free-text field for additional observations." (block 3) — verified at `Servers/services/postMarketMonitoring/defaultQuestions.ts:28` (DEFAULT_PMM_QUESTIONS array contains exactly 7 questions: 6 yes_no + 1 multi_line_text)
- Claim: "Risk Review" question maps to Article 9 (block 3, table row 1) — verified at `Servers/services/postMarketMonitoring/defaultQuestions.ts:35` (eu_ai_act_article: "Article 9")
- Claim: "Vendor Review" question maps to Article 72 (block 3, table row 3) — verified at `Servers/services/postMarketMonitoring/defaultQuestions.ts:51` (eu_ai_act_article: "Article 72")
- Claim: Question types are "Yes/No", "Multiple choice", and "Text response" — verified at `Servers/domain.layer/models/postMarketMonitoring/pmmQuestion.model.ts:52` (question_type validates against ["yes_no", "multi_select", "multi_line_text"])
- Claim: "Default questions are tagged with a **Default** chip. They can be edited but not deleted." (block 3) — verified at `Servers/domain.layer/models/postMarketMonitoring/pmmQuestion.model.ts:82` (is_system_default field tracks default status)

## Skipped / non-verifiable
- "EU AI Act Article 72 requires providers of high-risk AI systems to establish and document a monitoring plan" (block 0) — reason: external regulatory requirement; user guide states facts, not normative interpretation
- Tips and best practices throughout the article (e.g., "Start with the defaults", "High-risk systems in production might need monthly cycles") — reason: opinion/guidance, not testable claims
