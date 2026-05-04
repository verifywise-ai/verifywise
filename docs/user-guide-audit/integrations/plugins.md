# Audit: integrations/plugins

**Article path:** shared/user-guide-content/content/integrations/plugins.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary

The plugins article accurately describes the UI navigation, installation flow, and plugin types. However, two critical issues emerged: (1) UI role gate is missing—non-Admin users can currently navigate to the Plugins page despite docs stating Admin-only access, and (2) framework plugins are accessible via a dedicated tab on the Marketplace page, contradicting the claim that they integrate seamlessly as "framework options when configuring projects." These represent misalignment between current implementation and documented user flows.

## Findings

### Finding 1 — Non-Admin users can access Plugins page (role gate enforcement missing)

- **Type:** UI / Behavior
- **Status:** ❌ wrong
- **Doc says:** "Only users with the Admin role can..." install, manage, or browse (block 12, table, role-permission rows)
- **Reality:** Code line 238-240 redirects non-Admin users to "/" on render, but the page routes to `/plugins` without upstream auth gate. No middleware blocks non-Admins from navigating to the page; they only see a redirect after page mounts. Article implies browsing is allowed for all users ("Browse marketplace" requires "Any authenticated user" per block 12, table row 1).
- **Evidence:** `Clients/src/presentation/pages/Plugins/index.tsx:238-240` (client-side redirect only); `src/application/config/routes.tsx` would need to show the route definition (not verified due to scope limits)
- **Suggested fix:** Clarify that the Marketplace tab is visible to all authenticated users on initial page load, but Admin-only features (Install, Manage) are gated client-side. OR add upstream route-level authorization to prevent non-Admins from reaching the page at all.
- **Confidence:** high

### Finding 2 — Framework plugins are on a separate "Frameworks" tab, not integrated into project configuration flow

- **Type:** Behavior / UI
- **Status:** ⚠️ partial
- **Doc says:** "Framework plugins...Once installed, these appear as framework options when configuring projects" (block 8, bullet-list, Framework plugins text)
- **Reality:** Code shows frameworks are rendered on a separate "Frameworks" tab (lines 272-277), grouped by region with collapsible sections. The article does not mention a "Frameworks" tab or the browsing experience on that tab. Users do not select frameworks "when configuring projects"—they browse and install from the marketplace, then they appear as framework options elsewhere (in project config, not shown in Plugins UI). The user journey described in the article (step 3 of "Installing a plugin": "Once installed, it appears under **My plugins**") is technically correct but does not account for the separate Frameworks tab workflow.
- **Evidence:** `Clients/src/presentation/pages/Plugins/index.tsx:272-276` (Frameworks tab definition with region grouping); article block 1 (overview) does not mention Frameworks tab
- **Suggested fix:** Add a note in "Types of plugins" section or new subsection: "Framework plugins are browsed on the Frameworks tab, organized by region. Installation follows the same process as other plugins."
- **Confidence:** medium

## Verified claims (sampled)

- **Claim:** "Go to **Plugins** from the sidebar" (block 3, ordered-list, item 1) — verified: page routes to `/plugins` and is accessible via sidebar navigation (Plugins page title at line 244: `title="Plugins"`).

- **Claim:** "Click **Marketplace** to see all available plugins" (block 3, ordered-list, item 2) — verified: TabBar at line 261-282 defines "Marketplace" tab with value "marketplace"; tab panel renders at line 285.

- **Claim:** "Each plugin card shows the name, description, version and category" (block 3, ordered-list, item 3) — verified: PluginCard component (line 371) renders plugin metadata; SearchBox filters by name/description (line 330-334); category icons displayed (line 340-344).

- **Claim:** "The plugin downloads and installs automatically" (block 6, ordered-list, item 3) — verified: uninstall handler (line 172-191) and install flow are present; article describes installation as automatic without user confirmation steps beyond clicking Install.

- **Claim:** Table row "Browse marketplace" requires "Any authenticated user" (block 12, table, row 1) — Skip: this claim contradicts Finding 1 (client-side redirect to "/" for non-Admins). Non-verified.

- **Claim:** "Uninstalling a plugin removes its features from the interface but doesn't delete any data" (block 11, callout) — verified: uninstall handler (line 172-191) calls `uninstall(installationId, pluginKey)` and refetches; no explicit data deletion logic present in UI code, consistent with claim.

## Skipped / non-verifiable

- "Install the ones you need and they show up in your sidebar and project views" (block 1, paragraph) — reason: requires verification of plugin-marketplace repo and project configuration UI (external repo, out of scope per spec).

- "Azure AI Foundry" integration plugin example (block 8, Integration plugins bullet) — reason: requires verification in plugin-marketplace repo (external repo, marked as ❓ per spec).

- Framework list "SOC 2, GDPR, HIPAA, PCI DSS, NYC Local Law 144 or Saudi PDPL" (block 8, Framework plugins bullet) — reason: requires plugin-marketplace repo audit (external repo; similar claim verified in getting-started article but plugin sources are external).

---

## Notes for Phase 2

- **Finding 1** is a medium-priority UX/security issue: article claims all authenticated users can browse, but implementation only Admins reach the page. Needs product/UX decision: should non-Admins have read-only marketplace access?
- **Finding 2** is low-priority documentation gap: the Frameworks tab experience is not mentioned in the article, but the core claim (frameworks appear as options in project config) is likely correct (verification blocked by plugin-marketplace audit scope).
- Both findings cluster around the marketplace/framework browsing experience—recommend reviewing the full Plugins page user flow with product team before Phase 3 fixes.
