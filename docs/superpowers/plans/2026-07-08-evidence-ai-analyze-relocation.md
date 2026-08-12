# Evidence AI Analyze Relocation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans or subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Move the evidence AI analyze capability from Model Inventory's Evidence Hub to the Evidence page (`FileManager`), as a per-row action and a bottom multi-select bulk action; remove it fully from Model Inventory.

**Architecture:** Frontend-only. Reuse `useEvidenceAi` hooks + `EvidenceAnalysisPanel`/`EvidenceQualityBadge`. Feature lives in `FileBasicTable.tsx` (Evidence-only table). No backend change.

**Tech Stack:** React 19, MUI, React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-08-evidence-ai-analyze-relocation-design.md`

---

## Task 1: Add per-row analyze + result modal to the Evidence page (TDD)

**Files:**
- Modify: `Clients/src/presentation/components/Table/FilesBasicTable/FileBasicTable.tsx`
- Test: `Clients/src/presentation/components/Table/FilesBasicTable/__tests__/FileBasicTable.analyze.test.tsx`

- [ ] **Step 1: Write the failing test** (mock `useEvidenceAi`, `EvidenceAnalysisPanel`)

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const mutate = vi.fn();
vi.mock("../../../../application/hooks/useEvidenceAi", () => ({
  useTriggerAnalysis: () => ({ mutate, mutateAsync: vi.fn(), isPending: false }),
  useQualityScores: () => ({ data: [{ file_id: 101, overall_quality_grade: "B", /* analysis */ }] }),
}));
vi.mock("../../../EvidenceAnalysisPanel", () => ({ default: () => <div data-testid="analysis-panel" /> }));

// Render FileBasicTable with one row whose id is "101". (Use the suite's existing
// render helper / minimal props — see the neighboring FileBasicTable test for the
// required props shape.)

it("triggers analysis with the numeric row id when the analyze button is clicked", () => {
  // ...render with a row { id: "101", fileName: "e.pdf", ... }
  fireEvent.click(screen.getByRole("button", { name: /analyze with ai/i }));
  expect(mutate).toHaveBeenCalledWith(101);
});
```
(Consult the existing FileBasicTable test in the same folder for the exact render props; reuse that harness so the row renders.)

- [ ] **Step 2: Run test — verify it fails** — `cd Clients && npx vitest run src/presentation/components/Table/FilesBasicTable/__tests__/FileBasicTable.analyze.test.tsx` → FAIL (no analyze button).

- [ ] **Step 3: Implement**

In `FileBasicTable.tsx`:
1. Imports: `import { Sparkles } from "lucide-react";` (if not already), `import { useTriggerAnalysis, useQualityScores } from "../../../../application/hooks/useEvidenceAi";`, `import EvidenceAnalysisPanel from "../../../EvidenceAnalysisPanel";`, `import { EvidenceQualityBadge } from "../../../EvidenceQualityBadge";`, `import StandardModal from "../../../Modals/StandardModal";`, `Tooltip` from MUI (if needed), `useState` (if not already).
2. In the component body (near other hooks): 
```tsx
const triggerAnalysis = useTriggerAnalysis();
const { data: qualityScores } = useQualityScores();
const analysisByFileId = useMemo(() => {
  const m = new Map<number, { grade: string | null; analysis: unknown }>();
  (qualityScores ?? []).forEach((q: any) => {
    if (q.file_id != null) m.set(Number(q.file_id), { grade: q.overall_quality_grade ?? null, analysis: q });
  });
  return m;
}, [qualityScores]);
const [selectedAnalysis, setSelectedAnalysis] = useState<any | null>(null);
```
3. In the action cell (`~830-861`), next to `<IconButton ...>`, add:
```tsx
{(() => {
  const fid = Number(row.id);
  const entry = analysisByFileId.get(fid);
  return (
    <>
      {entry?.grade && (
        <Box component="span" onClick={(e) => { e.stopPropagation(); setSelectedAnalysis(entry.analysis); }} sx={{ cursor: "pointer" }}>
          <EvidenceQualityBadge grade={entry.grade as any} />
        </Box>
      )}
      <Tooltip title={entry?.grade ? "Re-analyze with AI" : "Analyze with AI"}>
        <span>
          <MUIIconButton aria-label="Analyze with AI" size="small" disabled={triggerAnalysis.isPending}
            onClick={(e) => { e.stopPropagation(); if (fid) triggerAnalysis.mutate(fid); }}>
            <Sparkles size={16} />
          </MUIIconButton>
        </span>
      </Tooltip>
    </>
  );
})()}
```
(Import MUI `IconButton as MUIIconButton` to avoid clashing with the shared `IconButton`.)
4. Result modal, near the end of the returned JSX (mirror the removed MI dialog):
```tsx
<StandardModal isOpen={selectedAnalysis !== null} onClose={() => setSelectedAnalysis(null)} title="Evidence analysis" description="" hideFooter maxWidth="760px">
  {selectedAnalysis && <EvidenceAnalysisPanel analysis={selectedAnalysis} />}
</StandardModal>
```

- [ ] **Step 4: Run test — verify pass** — same vitest command → PASS.

- [ ] **Step 5: Commit**
```bash
git add Clients/src/presentation/components/Table/FilesBasicTable/FileBasicTable.tsx Clients/src/presentation/components/Table/FilesBasicTable/__tests__/FileBasicTable.analyze.test.tsx
git commit -m "feat(evidence): per-row AI analyze action + result modal on Evidence page"
```

---

## Task 2: Add bulk "Analyze with AI" to the bottom selection bar (TDD)

**Files:**
- Modify: `Clients/src/presentation/components/Table/FilesBasicTable/FileBasicTable.tsx` (`bulkActions`, ~491-508)
- Test: extend `FileBasicTable.analyze.test.tsx`

- [ ] **Step 1: Add the failing test**
```tsx
it("bulk analyze calls mutateAsync once per selected id", async () => {
  // select 2 rows (ids 101, 102) via the selection checkboxes, open the bottom bar,
  // click "Analyze with AI"; assert mutateAsync called with 101 and 102.
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — append to the `bulkActions` useMemo array:
```tsx
{
  id: "analyze_ai",
  label: "Analyze with AI",
  icon: <Sparkles size={16} />,
  disabled: triggerAnalysis.isPending,
  onClick: async () => { await Promise.all(selectedIds.map((id) => triggerAnalysis.mutateAsync(id))); },
},
```
Add `triggerAnalysis` and `selectedIds` to the `useMemo` dependency array.

- [ ] **Step 4: Run — verify pass.**

- [ ] **Step 5: Commit**
```bash
git add Clients/src/presentation/components/Table/FilesBasicTable
git commit -m "feat(evidence): bulk Analyze with AI action in the selection bar"
```

---

## Task 3: Remove the analyze feature from Model Inventory Evidence Hub

**Files:**
- Modify: `Clients/src/presentation/pages/ModelInventory/evidenceHubTable.tsx`

- [ ] **Step 1: Read the file's analyze-related regions** (imports ~47-48, hooks ~196-197, maps ~273-296, `selectedAnalysis` state, button ~650-687, badge cell/column, dialog ~801-863) to capture exact strings.

- [ ] **Step 2: Remove**, in order: the detail `Dialog` (+ `EvidenceAnalysisPanel` render), the analyze button, the quality-grade column header + cell, `selectedAnalysis` state, `qualityMap`/`qualityAnalysisMap`, `useQualityScores()`/`useTriggerAnalysis()` calls, and the now-orphaned imports (`useQualityScores`, `useTriggerAnalysis`, `EvidenceAnalysisPanel`, `Sparkles`/`EvidenceQualityBadge` if unused elsewhere in the file).

- [ ] **Step 3: Typecheck** — `cd Clients && npx tsc -b` → no errors (catches any orphaned reference).

- [ ] **Step 4: Existing test** — run the evidenceHubTable / ModelInventory test suite if present → PASS. If a test asserted the analyze button/badge, update it to reflect removal.

- [ ] **Step 5: Commit**
```bash
git add Clients/src/presentation/pages/ModelInventory/evidenceHubTable.tsx
git commit -m "refactor(evidence): remove AI analyze from Model Inventory evidence hub (moved to Evidence page)"
```

---

## Task 4: Full verify

- [ ] `cd Clients && npm run typecheck` → 0 errors.
- [ ] `cd Clients && npx vitest run src/presentation/components/Table/FilesBasicTable src/presentation/pages/ModelInventory src/presentation/components/EvidenceAnalysisPanel` → all pass.
- [ ] Live (preview): on /file-manager, a row shows the Sparkles analyze button; clicking triggers analysis; a grade badge + result modal appear; selecting rows shows "Analyze with AI" in the bottom bar. On Model Inventory evidence hub, the analyze button/badge/dialog are gone.

---

## Self-Review Notes
- **Spec coverage:** row action (Task 1), result modal (Task 1), bulk bar (Task 2), MI removal (Task 3), verify (Task 4). Covered.
- **Type consistency:** `Number(row.id)` everywhere; `analysisByFileId: Map<number,…>`; `EvidenceQualityBadge grade` prop; `StandardModal` props (isOpen/onClose/title/description/hideFooter/maxWidth) match the canonical component.
- **No new deps / no backend change.**
