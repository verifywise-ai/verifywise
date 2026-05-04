# Audit: ai-detection/scanning
**Article path:** shared/user-guide-content/content/ai-detection/scanning.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent
**Verdict:** ⚠️ minor issues (1)

## Summary
The article is largely accurate. All UI claims (button labels, tab names, governance status options) are verified against the codebase. Scan stages, statistics dashboard fields, and related article references are all correct. One quantitative claim requires correction: the article claims "100+ AI/ML patterns" but the actual codebase contains 83 patterns across three categories (45 cloud providers, 17 frameworks, 21 local-ml libraries).

## Findings

### Finding 1 — Pattern count overstated
- **Type:** Quantitative
- **Status:** ❌ wrong
- **Doc says:** "against 100+ AI/ML patterns (OpenAI, TensorFlow, PyTorch, LangChain, etc.)" (block index 2)
- **Reality:** Code contains 83 total patterns: 45 in cloud-providers.ts, 17 in frameworks.ts, 21 in local-ml.ts
- **Evidence:** `Servers/lib/ai-detection/patterns/cloud-providers.ts:45`, `Servers/lib/ai-detection/patterns/frameworks.ts:17`, `Servers/lib/ai-detection/patterns/local-ml.ts:21`
- **Suggested fix:** Change "100+" to "80+" or "over 80" to match current pattern inventory
- **Confidence:** high

## Verified claims (sampled)

- Claim: "Scan results are organized into nine tabs" (block 102) — verified in `Clients/src/presentation/pages/AIDetection/ScanDetailsPage.tsx` type definition: libraries, vulnerabilities, api-calls, models, rag, agents, secrets, security, compliance (9 total)
- Claim: "Click **Scan** to begin the analysis" (block 27) — verified button label at `Clients/src/presentation/pages/AIDetection/ScanPage.tsx:516`
- Claim: "You can cancel an in-progress scan at any time by clicking **Cancel**" (block 60) — verified button and `handleCancel` logic at `ScanPage.tsx:266-284`
- Claim: "Governance status... Reviewed, Approved, Flagged" (block 163-168) — verified exact labels at `Clients/src/presentation/pages/AIDetection/ScanDetailsPage.tsx:207-209`
- Claim: "The scan page shows statistics... Total scans, Repositories, Total findings, Libraries, API calls, Security issues" (blocks 76-86) — all stat fields verified in `ScanPage.tsx:89` (`getAIDetectionStats()`) and rendered at lines 323-364

## Skipped / non-verifiable

- "It finds 'shadow AI' (AI usage that hasn't been formally documented or approved)" (block 13) — motivation/framing, non-verifiable
- "A 2-phase LLM vulnerability pipeline also checks for the 10 OWASP LLM Top 10 vulnerability types" (block 17) — LLM phase implementation not in core scanner; flagged as aspirational pending verification of actual implementation
