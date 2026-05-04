# Audit: ai-governance/ai-trust-center
**Article path:** shared/user-guide-content/content/ai-governance/ai-trust-center.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The AI trust center article accurately describes navigation path and core functionality. However, two claims about content sections are inaccurate or incomplete: the article lists four content section types ("Introduction", "Compliance badges", "Company description", "Privacy and contact") but the UI actually implements only three distinct badges in the enum, excluding NIST AI RMF. The article's framing of "sections" is also imprecise—all four content areas are configured as fields within a single Overview form with visibility toggles, not as separate sections.

## Findings
### Finding 1 — Compliance badges exclude NIST AI RMF
- **Type:** Quantitative
- **Status:** ❌ wrong
- **Doc says:** "Display certifications like EU AI Act, ISO 42001, ISO 27001 and NIST AI RMF" (block index 8, bullet 2)
- **Reality:** Code constants define only 8 badges: SOC2 Type I, SOC2 Type II, ISO 27001, ISO 42001, CCPA, GDPR, HIPAA, EU AI Act. NIST AI RMF is not in the enum and cannot be displayed.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/AITrustCenter/Overview/constants.ts:1-14` defines COMPLIANCE_BADGES array without NIST AI RMF
- **Suggested fix:** Remove "NIST AI RMF" from the list or add it to the compliance badges enum if support is planned.
- **Confidence:** high

### Finding 2 — Content sections framing imprecise; not separate sections
- **Type:** UI | Behavior
- **Status:** ⚠️ partial
- **Doc says:** "The AI trust center can include the following sections: Introduction, Compliance badges, Company description, Privacy and contact" (block index 9, four-item bullet list)
- **Reality:** The UI implements these not as separate sections but as fields within a single Overview form. All four content areas (intro, compliance_badges, company_description, terms_and_contact) are configured together in the Overview tab with per-field visibility toggles. The article's bullet-list framing suggests four independent sections, which is misleading.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/AITrustCenter/Overview/index.tsx:250-450` shows one unified form with sections for intro, compliance_badges, company_description, and terms_and_contact fields with individual visibility toggles, not separate sections
- **Suggested fix:** Clarify that content areas are configured in a single Overview form with per-field visibility toggles, or restructure the bullet list to reflect the actual UI organization (Overview form, Resources tab, Subprocessors tab, Settings tab).
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Go to **Assurance > AI trust center** in the sidebar" (block index 6) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/components/Sidebar/index.tsx:95-101`, sidebar menu group "ASSURANCE" contains item with label "AI trust center" and path "/ai-trust-center"
- Claim: "You can customize what information to display and generate a shareable link for external stakeholders" (block index 6) — verified in `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/AITrustCenter/index.tsx:62-78`, preview button opens public page via tenant hash
- Claim: "Display certifications like EU AI Act, ISO 42001, ISO 27001" (block index 8, partial) — verified; these three badges are present in `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/AITrustCenter/Overview/constants.ts`
- Claim: "Sensitive or internal-only data is never exposed unless you explicitly configure it" (block index 10, callout) — verified; Settings and Overview components require explicit visibility toggles before data is saved
- Claim: "Describe your organization, core values and commitment to responsible AI" (block index 9, Company description bullet) — verified in `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/AITrustCenter/Overview/index.tsx`, form includes `company_description` field with visibility toggle

## Skipped / non-verifiable
- "Show your commitment to responsible AI through transparency" (block index 4) — opinion/motivation, not verifiable
- "Meet disclosure requirements under the EU AI Act and other regulations" (block index 4) — legal compliance claim without code linkage, low-confidence per spec
- "The trust center makes it easy to tell your AI governance story" (block index 3) — motivation/benefit, opinion-based
- "Set yourself apart from competitors by showing governance maturity" (block index 4) — competitive positioning claim, non-verifiable
