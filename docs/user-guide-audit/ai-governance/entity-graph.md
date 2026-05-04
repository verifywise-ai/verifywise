# Audit: ai-governance/entity-graph
**Article path:** shared/user-guide-content/content/ai-governance/entity-graph.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article is substantially accurate in describing the entity graph UI, features, and relationships. Two minor discrepancies found: framework color label (described as "grey" but code uses blue-grey), and relationship direction/labels (article says "use case uses model" but code shows "model used by"). Evidence and framework filtering available but not mentioned as defaults.

## Findings
### Finding 1 — Framework entity color description
- **Type:** UI claim (color label)
- **Status:** ⚠️ partial
- **Doc says:** "Frameworks (grey): compliance frameworks (EU AI Act, ISO, etc.)" (block index 7, item 6)
- **Reality:** Framework color is `#607d8b`, which is "blue grey" (darker blue-grey tone), not neutral grey
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/EntityGraph/constants/index.ts:11` — `framework: '#607d8b', // Blue grey`
- **Suggested fix:** Change description to "Frameworks (blue grey)" or "Frameworks (slate blue)" to match actual rendered color
- **Confidence:** high

### Finding 2 — Use case → Model relationship direction and label
- **Type:** Behavior claim (relationship semantics)
- **Status:** ⚠️ partial
- **Doc says:** "Use case → Model: The use case uses this model" (block index 10, item 1)
- **Reality:** Edge is drawn from model → useCase with label "used by" (not "uses"). Direction in diagram shows model pointing to use case, not the reverse
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/EntityGraph/utils/nodeGenerator.ts:185` — `createEdge(..., 'used by', ...)` with source=`model-${m.id}` and target=`useCase-${pid}`
- **Suggested fix:** Clarify that edges point from model to use case with "used by" label, or rephrase as "Model ← Use case: This use case uses this model"
- **Confidence:** high

## Verified claims (sampled)
- "View relationships button, available on: Model inventory rows, Vendor rows, Risk rows, Use case rows" — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/components/ViewRelationshipsButton/index.tsx:32` (tooltip); rendered in tables and cards across codebase
- "Entity types: Use cases (green), Models (blue), Vendors (purple), Risks (red), Evidence (orange)" — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/EntityGraph/constants/index.ts:5-13` (entityColors object matches exactly)
- "By default, use cases, models, vendors and risks are visible" — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/EntityGraph/constants/index.ts:79` — `DEFAULT_VISIBLE_ENTITIES = ['useCases', 'models', 'vendors', 'risks']`
- "Use case → Vendor: The vendor provides services for this use case" — verified; code shows vendor → useCase edge with label "supplies" (semantically equivalent, direction shown in nodeGenerator.ts:214)
- "Entity → Risk: A risk is associated with this entity" — verified at nodeGenerator.ts:241-247 (risk edges to models, useCases, vendors with label "affects")

## Skipped / non-verifiable
- "Hover over any node to see additional details in a tooltip" — interactive tooltip feature; requires browser escalation to verify hover-state rendering
- "Drag nodes to rearrange the graph layout" — UI behavior claim; requires browser to test draggable state and visual feedback
- "The statistics bar shows how many entities and relationships are currently visible" — verified code renders stats (index.tsx:243) but exact bar positioning requires browser
- "Click and drag the background" / "Scroll or use the zoom controls (bottom-left)" — ReactFlow library behaviors; require browser interaction to fully verify zoom/pan is functional
- "Mini-map... use the overview in the bottom-right corner" — ReactFlow MiniMap component present (index.tsx:210) but positioning/functionality visual verification requires browser
