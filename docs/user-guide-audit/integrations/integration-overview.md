# Audit: integrations/integration-overview
**Article path:** shared/user-guide-content/content/integrations/integration-overview.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The article is well-structured with mostly accurate claims about Slack and MLflow integrations. Cross-doc references to Slack integration article verified. One minor issue: the article references a "scheduled sync every hour" for MLflow but no substantiating code evidence was found for this specific timing. Admin-role access claim could not be verified against route guards in Clients/src.

## Findings
### Finding 1 — MLflow scheduled sync timing unverified
- **Type:** Quantitative
- **Status:** ❓ unverifiable
- **Doc says:** "Scheduled sync every hour" (block index 28, under MLflow integration key features)
- **Reality:** MLflow integration API endpoints exist in `integration.repository.ts`, but the specific hourly schedule constant/enum could not be located in Clients/src.
- **Evidence:** `Clients/src/application/repository/integration.repository.ts` has MLflow config methods but no sync schedule constant found
- **Suggested fix:** Either cite the backend scheduling code (Server/Python) or remove the quantitative claim pending verification.
- **Confidence:** low

## Verified claims (sampled)
- Claim: "The Slack integration lets VerifyWise send real-time notifications about AI governance activities to your Slack workspace" (block 15) — verified in `shared/user-guide-content/content/integrations/slack-integration.ts` with matching content.
- Claim: Cross-doc reference to `slack-integration` article (block 15, articleId field) — article exists at `shared/user-guide-content/content/integrations/slack-integration.ts`.
- Claim: "Status labels: Not configured, Configured, Error" (block 12) — consistent with integration card UI patterns in Slack integration article.
- Claim: "Slack integration card shown on Integrations page" (block 10, icon-cards) — verified article structure matches UI schema.
- Claim: "MLflow integration connects to MLflow tracking server" (block 28) — verified in `integration.repository.ts` with `/integrations/mlflow/config` endpoint.

## Skipped / non-verifiable
- "Integrations help you automate data sync and keep your team informed through channels they already use" (block 1) — opinion/motivation framing.
- "Only users with the Admin role can access and configure integrations" (block 7, callout) — claim is UI/behavior but no route guard code with explicit Admin check found in grep of Clients/src; flagged as ❓ during verification but insufficient evidence to mark wrong; requires Server-side validation.
- "Customizable notification routing" (Slack feature, block 16) — motivational claim without specific UI/behavior tied to it.
