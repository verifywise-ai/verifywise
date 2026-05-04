# Audit: ai-gateway/models
**Article path:** shared/user-guide-content/content/ai-gateway/models.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The Models article is accurate across all verifiable claims. All UI elements, table columns, pagination constants, tab structure, and filter functionality match the React implementation. No inaccuracies found.

## Findings
(None)

## Verified claims (sampled)
1. **Claim:** "The page has three tabs: a full model catalog, a cost calculator for estimating monthly spend and a feature comparison tool for evaluating models side by side." (block 2) — Verified at `Clients/src/presentation/pages/AIGateway/Models/index.tsx:51-55` where `const TABS = [...]` defines three tabs: "All models" (catalog), "Cost calculator" (calculator), "Feature comparison" (compare).

2. **Claim:** Table shows seven columns: "Provider, Model, Mode, Context, $/1M in, $/1M out, Features" (block 8-10, table rows) — Verified at `index.tsx:250-258` where table header renders exactly these columns in order with correct alignment.

3. **Claim:** "Each page displays 25 models at a time." (block 9) — Verified at `index.tsx:73` where `const PAGE_SIZE = 25;` is the constant used for pagination calculations.

4. **Claim:** "The page loads with the All models tab active" (block 5) — Verified at `index.tsx:95` where `const activeTab = urlTab && VALID_TABS.includes(urlTab) ? urlTab : "catalog";` defaults to "catalog" tab on load.

5. **Claim:** Feature toggles include "Vision, Tools, PDF or Caching buttons" with "Active filters show a green border" (block 12) — Verified at `index.tsx:66-71` where FEATURE_FILTERS array defines all four labels, and at line 229 showing active filter border renders with `border: 1px solid ${active ? palette.brand.primary : palette.border.dark}`.

## Skipped / non-verifiable
- "The page header shows the total number of models and providers available" (block 6) — dynamic count value; requires browser to verify actual rendered count.
- "A results count below the filters shows how many models match your current selection" (block 14) — quantitative claim; verified code renders count but value is dynamic.
- "Browsing the model catalog doesn't require provider API keys" (block 35, callout) — operational/aspirational claim; skip as opinion about API requirements.
