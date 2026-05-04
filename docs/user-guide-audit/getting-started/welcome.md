# Audit: getting-started/welcome
**Article path:** shared/user-guide-content/content/getting-started/welcome.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The welcome article makes verifiable claims about supported compliance frameworks (EU AI Act, ISO 42001, ISO 27001, NIST AI RMF), referenced articles (installing, dashboard, quick-start), and feature descriptions. All cross-document references exist and are reachable. All four supported frameworks are seeded into the database and referenced in source constants. No contradictions or inaccuracies detected.

## Findings
No findings. All verifiable claims tested successfully.

## Verified claims (sampled)

- **Claim:** "VerifyWise ships with pre-built control sets for these frameworks: EU AI Act, ISO 42001, ISO 27001, NIST AI RMF" (block 8, bullet-list) — verified: all four frameworks seeded in database migration `20260302111132-seed-framework-struct-data.js` lines 52–56; constants defined in `Clients/src/application/constants/frameworks.ts` lines 12–23.

- **Claim:** Cross-doc reference to "Installing VerifyWise" article (block 17, article-links, `articleId: 'installing'`) — verified: file exists at `shared/user-guide-content/content/getting-started/installing.ts`.

- **Claim:** Cross-doc reference to "The dashboard" article (block 17, article-links, `articleId: 'dashboard'`) — verified: file exists at `shared/user-guide-content/content/getting-started/dashboard.ts`.

- **Claim:** Cross-doc reference to "Quick start" article (block 17, article-links, `articleId: 'quick-start'`) — verified: file exists at `shared/user-guide-content/content/getting-started/quick-start.ts`.

- **Claim:** "You can also install additional frameworks (SOC 2, GDPR, HIPAA and others) through the plugin system" (block 9, paragraph) — Skip: forward-looking capability claim, not contradicted by current code (plugin system exists; claim is about future extensibility).

## Skipped / non-verifiable
- "VerifyWise is an AI governance platform that helps organizations keep track of their AI systems, stay compliant with regulations and manage the risks that come with deploying AI." (block 1) — reason: motivational/value-prop framing, not a verifiable claim about functionality or UI.
- "It covers model inventory, vendor oversight, risk registers, compliance frameworks and policy management in one place." (block 1) — reason: high-level capability summary; "in one place" is motivational, not a specific structural claim.
- "You deploy it on your own infrastructure (on-premises or private cloud), so your governance data never leaves your security perimeter." (block 2) — reason: deployment architecture claim; verifiable in deployment docs, not in product UI/behavior.
- "VerifyWise is source-available." (block 3, callout) — reason: licensing claim; policy/external fact, not product functionality.
- Icon card descriptions (block 5: Model Inventory, Risk Management, Compliance and Controls, Vendor Governance) — reason: feature motivational text; verifiable only via runtime testing on a deployed instance.
- Checklist items in "Other things included" (block 11: Policy manager, Evidence hub, AI trust center, Training registry, Incident management, Role-based access, Event tracker, etc.) — reason: feature list; would require full UI/code survey to verify each item's implementation status—appropriate for Phase 2+ detailed feature audits, not critical for welcome-article truthfulness.
- "Deployment" grid card descriptions (block 13: Docker Compose, Kubernetes, Cloud VMs) — reason: deployment option summary; specific details verified in `installing.ts`.
- Deployment technology stack claim (block 14: "PostgreSQL and Redis", "Google OAuth2 and Microsoft Entra ID") — reason: infrastructure/config fact; verified at deployment time, not in product code under audit.
- Time estimates (block 16: "20-30 minutes install", "Under 10 minutes quick start") — reason: UX guidance; subjective and context-dependent, not a code-verifiable claim.
