# Audit: ai-governance/linked-models
**Article path:** shared/user-guide-content/content/ai-governance/linked-models.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The linked-models article accurately describes the UI behavior, data model, and linking workflow. All UI labels, table columns, and navigation claims are verified against the codebase. The article correctly states that the Linked models tab is read-only and that model-project associations are managed from the model inventory.

## Findings
None. All verifiable claims confirmed accurate.

## Verified claims (sampled)

- **Claim:** "The Linked models tab in a project shows which AI models from your model inventory are connected to that use case" (block 1, overview paragraph) — verified: `LinkedModelsView` component fetches models via `/modelInventory/by-projectId/{projectId}` (LinkedModels/index.tsx:16), displaying project-linked models only.

- **Claim:** "a list of all models that have been linked to this project, with their name, provider, version and status" (block 3, viewing section) — verified: `TABLE_COLUMNS` in LinkedModelsView (index.tsx:23-28) defines exactly these four columns: `provider`, `model`, `version`, `status`.

- **Claim:** "Click any model row to open its full record in the model inventory" (block 5, viewing section) — verified: `LinkedModelsView` table row click navigates to `/model-inventory?modelId=${model.id}` (LinkedModelsView/index.tsx:173).

- **Claim:** "The linked models tab is a read-only view of those associations" (block 8, linking section callout) — verified: `LinkedModelsView` component has no edit controls; it only displays data and renders navigation links. Project associations are managed only in NewModelInventory modal (lines 836–909).

- **Claim:** "When you create or edit a model in the inventory, you can assign it to one or more projects" (block 7, linking section) — verified: NewModelInventory modal includes "Used in use cases" autocomplete field (lines 836–909) with `handleSelectUsedInProjectChange` handler (lines 374–384) that maps project titles to IDs and stores them in the `projects` array.

- **Claim:** "To add or remove model links, go to the model inventory and edit the model's project associations" (block 8, callout title "Where to link") — verified: model-project linking is exclusively implemented in NewModelInventory component, not in the project view. The Linked models tab provides no edit UI.

## Skipped / non-verifiable
- "Auditors and compliance reviewers need to know exactly which AI models are used in each project" (block 10, why-it-matters section) — reason: motivation/use case, not a verifiable claim about product behavior.
