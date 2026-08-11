# Evidence AI Analyze — Relocation to Evidence Page

> **Date:** 2026-07-08
> **Status:** Approved (design), pre-implementation
> **Area:** `Clients/src/presentation` (frontend only — no backend/API change)

## Problem / Context

The "Evidence AI Analyze" agent (trigger AI analysis of an evidence file → quality grade + `EvidenceAnalysisPanel`) currently lives **only** in Model Inventory's Evidence Hub tab (`pages/ModelInventory/evidenceHubTable.tsx`). The user wants it on the **Evidence page** (`pages/FileManager`, /file-manager) instead: as a per-row action AND in the bottom multi-select bar.

The analysis is keyed by numeric `file_id`. Confirmed: FileManager rows carry the exact same `files.id` the analyzer uses (`Servers/controllers/evidenceAi.ctrl.ts` selects from `files WHERE id = :fileId`), so `triggerAnalysis.mutate(Number(row.id))` works directly — no id mapping. The hooks (`useTriggerAnalysis`, `useQualityScores`, `useEvidenceAnalysis`) and `EvidenceAnalysisPanel` / `EvidenceQualityBadge` are reusable as-is.

`FileBasicTable` (`components/Table/FilesBasicTable/FileBasicTable.tsx`) is used only by `FileTable` → only by `FileManager`, i.e. **Evidence-page-only** — adding the feature there does not affect other tables.

## Goal

Move (full: remove from source) the evidence AI analyze capability from Model Inventory's Evidence Hub to the Evidence page, exposed both as a per-row action and as a bottom multi-select bulk action, reusing the existing hooks and panel.

## Design

### Part A — Remove from Model Inventory Evidence Hub
`pages/ModelInventory/evidenceHubTable.tsx`: remove the analyze button, the quality-grade badge column (header + cell), the analysis detail dialog, and all now-unused state/hooks/maps/imports:
- imports: `useQualityScores`, `useTriggerAnalysis` (line 48), `EvidenceAnalysisPanel` (line 47), and any icon (`Sparkles`) / `EvidenceQualityBadge` used only by these.
- state/hooks: `useQualityScores()` (196), `useTriggerAnalysis()` (197), `qualityMap` / `qualityAnalysisMap` (273-296), `selectedAnalysis` state.
- JSX: analyze button (~650-687), quality-grade column header + cell (badge click → `selectedAnalysis` at ~637), detail `Dialog` (~801-863).
After removal, remove orphaned imports/vars **that this change creates**; leave the rest of the table (columns, sorting, rows) untouched.

### Part B — Add to Evidence page
`components/Table/FilesBasicTable/FileBasicTable.tsx` (Evidence-only):
- **Hooks/state:** `const triggerAnalysis = useTriggerAnalysis();` `const { data: qualityScores } = useQualityScores();` a `Map<number, {grade, analysis}>` by `file_id`; `const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisData|null>(null);`.
- **Per-row action (action cell, ~830-861):** a standalone Sparkles icon button next to the existing shared `<IconButton>`:
  - Tooltip `Re-analyze with AI` if a grade exists for `Number(row.id)`, else `Analyze with AI`.
  - onClick → `triggerAnalysis.mutate(Number(row.id))`; `disabled={triggerAnalysis.isPending}`.
  - When a grade exists, render `<EvidenceQualityBadge grade={grade} />`; clicking it → `setSelectedAnalysis(analysis)`.
- **Bottom bulk bar:** append one `BulkAction` to `bulkActions` (~491-508):
  - `{ id: "analyze_ai", label: "Analyze with AI", icon: <Sparkles size={16} />, disabled: triggerAnalysis.isPending, onClick: async () => { await Promise.all(selectedIds.map((id) => triggerAnalysis.mutateAsync(id))); } }`
  - `selectedIds` (number[]) already in scope from `useBulkSelection`.
- **Result view:** a `StandardModal` (`isOpen={selectedAnalysis !== null}`, `hideFooter`, title "Evidence analysis") rendering `<EvidenceAnalysisPanel analysis={selectedAnalysis} />`, mirroring the removed MI dialog.

### Reuse (unchanged)
`application/hooks/useEvidenceAi.ts` (`useTriggerAnalysis`, `useQualityScores`), `components/EvidenceAnalysisPanel`, `components/EvidenceQualityBadge`.

## Error Handling / Edge Cases
- No grade yet → button says "Analyze with AI", no badge.
- Bulk analyze over N files → `Promise.all` of `mutateAsync`; a single failure rejects the batch — acceptable for MVP (react-query surfaces the error; the toolbar re-enables). No partial UI.
- `row.id` is a stringified number → always `Number(row.id)` before use.

## Non-Goals (YAGNI)
- No backend/API/schema change.
- No new bulk endpoint (loop client-side).
- No change to the shared `IconButton` dropdown menu (standalone button instead — avoids touching a component used by many tables).
- No per-file streaming/progress UI for bulk.

## Testing (TDD)
Vitest, `useEvidenceAi` + `EvidenceAnalysisPanel` mocked:
1. FileBasicTable: per-row analyze button renders; click → `triggerAnalysis.mutate` called with the numeric row id.
2. FileBasicTable: `bulkActions` includes an "Analyze with AI" action; invoking it calls `mutateAsync` once per selected id.
3. FileBasicTable: a row with a known grade renders `EvidenceQualityBadge`; clicking it opens the analysis modal.
4. evidenceHubTable: after removal, its existing test suite still passes and no analyze button/badge/dialog remains.

## File-Level Change List
- **Modify:** `Clients/src/presentation/pages/ModelInventory/evidenceHubTable.tsx` (remove analyze feature)
- **Modify:** `Clients/src/presentation/components/Table/FilesBasicTable/FileBasicTable.tsx` (add row action + bulk action + result modal + hooks)
- **New test:** `Clients/src/presentation/components/Table/FilesBasicTable/__tests__/FileBasicTable.analyze.test.tsx`
- **Reuse (no change):** `useEvidenceAi.ts`, `EvidenceAnalysisPanel`, `EvidenceQualityBadge`
