# Audit: getting-started/quick-start
**Article path:** shared/user-guide-content/content/getting-started/quick-start.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent
**Verdict:** ⚠️ minor issues (1)

## Summary
The article contains accurate UI labels, navigation paths, and feature descriptions, with one significant discrepancy: it references "Assurance → Controls hub" as a sidebar menu item, but this menu does not exist in the codebase. The actual sidebar structure uses "ASSURANCE → Evidence" instead. All other verified claims (button labels, tab names, sidebar sections, file upload workflow) match the codebase.

## Findings
### Finding 1 — References non-existent "Controls hub" sidebar menu item
- **Type:** UI | Reference
- **Status:** ❌ wrong
- **Doc says:** "You can also see controls across all use cases from the sidebar: Assurance → Controls hub. This gives you a cross-cutting view of your entire control landscape." (block index 10)
- **Reality:** The sidebar has a "CONTROLS" section with "Evidence" menu item at path `/file-manager`. There is no "Controls hub" menu item in the ASSURANCE group. The ASSURANCE group contains: Risk management, Training registry, Evidence, Reporting, and AI trust center.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/components/Sidebar/index.tsx:114-209` defines the sidebar menuGroups. The ASSURANCE group (lines 146-178) contains 5 items, none labeled "Controls hub".
- **Suggested fix:** Replace "Assurance → Controls hub" with "Assurance → Evidence" or verify if a Controls hub feature is planned for future release.
- **Confidence:** high

## Verified claims (sampled)
- Claim: "From the dashboard, open the **"Add new"** dropdown and select **"Use case"**" (block 5) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/components/MegaDropdown/AddNewMegaDropdown.tsx:36-37` which defines "Use case" as a menu item with default button label "Add new"
- Claim: "Open the **"Frameworks/regulations"** tab" (block 8) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/ProjectView/V1.0ProjectView/index.tsx:2` which defines tab label "Frameworks/regulations" with value "frameworks"
- Claim: "In the sidebar, go to **Assurance → Evidence**" (block 17) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/components/Sidebar/index.tsx:161-165` which defines Evidence item with label "Evidence" and path "/file-manager" in ASSURANCE group
- Claim: "Governance → Vendors" (block 22) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/components/Sidebar/index.tsx:184-187` which defines Vendors item in GOVERNANCE group
- Claim: "Governance → Policy manager" (block 22) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/components/Sidebar/index.tsx:190-193` which defines "Policy manager" in GOVERNANCE group

## Skipped / non-verifiable
- "By the end of this guide, you'll have created an AI use case..." (block 2) — non-verifiable: motivational framing
- "Pick a name that your colleagues will recognize..." (block 7) — non-verifiable: opinion/best practice guidance
- "You probably already have documents that count as evidence..." (block 15) — non-verifiable: opinion/motivation
- "Time to complete: Under 10 minutes" (block 0) — non-verifiable: time estimates depend on user proficiency and data entry speed
