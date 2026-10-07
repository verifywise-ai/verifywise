# Risk Inheritance (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a project risk is created or updated on the Risk Management page, show a summary of up to 5 other risks that may be affected by that change, each with the reason it matched and a recommendation.

**Architecture:** The relation between two risks is **derived, never stored** — no migration, no new table, no new endpoint. `GET /projectRisks` already returns every field the scoring needs (`r.*` plus aggregated `projects`), org-scoped and unpaginated, and the Risk Management page already holds that whole list in state. Scoring is therefore a pure function in the client, consumed by a read-only summary modal. Nothing is written to the related risks.

**Tech Stack:** React 19 + TypeScript, MUI 7, Vitest + @testing-library/react. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-11-risk-inheritance-design.md`

## Global Constraints

- **No backend changes.** No migration, no route, no controller, no util. If a task seems to need one, stop and re-read the spec.
- **No propagation.** The feature never writes to the related risks — no severity, likelihood, or status updates. Read-only surfacing.
- **All user-facing strings in English**, matching the rest of the app. (The spec discussion happened in Turkish; the UI does not.)
- **Max 5 results**, always. No "show all" link in phase 1.
- **Empty result renders nothing** — no empty modal, no toast.
- **The scoring module imports no React and no repository/network code.** It is a pure function so it can be lifted to the backend later without rewriting.
- Follow existing conventions: components in `src/presentation/components/<Name>/index.tsx`, pure helpers in `src/application/tools/`, tests in a sibling `__tests__/` folder.
- Run `npm run build` in `Clients` before declaring the work done (project PR gate, `Clients/CLAUDE.md`).

---

## File Structure

| File | Responsibility |
|---|---|
| `Clients/src/application/tools/relatedRisks.ts` | **New.** All scoring logic: signal weights, ranking, reason strings, recommendation resolution. Exports `RelatedRisk` and `findRelatedRisks`. No React, no network. |
| `Clients/src/application/tools/__tests__/relatedRisks.test.ts` | **New.** Unit tests for the above. |
| `Clients/src/domain/models/Common/risks/risk.model.ts` | **Modify.** Add `projects?: number[]` — the API returns it, the model never declared it. |
| `Clients/src/presentation/components/RelatedRisksSummary/index.tsx` | **New.** Presentational modal. Receives the computed list, renders rows, emits `onOpenRisk`/`onClose`. No scoring, no fetching. |
| `Clients/src/presentation/components/RelatedRisksSummary/__tests__/index.test.tsx` | **New.** Render tests. |
| `Clients/src/presentation/pages/RiskManagement/index.tsx` | **Modify.** Wire post-save: return the fresh list from `fetchProjectRisks`, pick the saved risk, call the scorer, hold modal state, render the modal. |
| `docs/technical/domains/risk-management.md` | **Modify.** Document the feature. |

---

### Task 1: Scoring function

**Files:**
- Create: `Clients/src/application/tools/relatedRisks.ts`
- Create: `Clients/src/application/tools/__tests__/relatedRisks.test.ts`
- Modify: `Clients/src/domain/models/Common/risks/risk.model.ts`

**Interfaces:**
- Consumes: `RiskModel` from `Clients/src/domain/models/Common/risks/risk.model.ts`; the enums `AiLifeCyclePhase` and `RiskLevelAutoCalculated` from `Clients/src/domain/enums/`.
- Produces:
  ```ts
  export interface RelatedRisk {
    risk: RiskModel;
    score: number;
    reasons: string[];
    recommendation: string;
  }
  export function findRelatedRisks(subject: RiskModel, all: RiskModel[]): RelatedRisk[];
  ```
  Tasks 2 and 3 both import `RelatedRisk`; Task 3 imports `findRelatedRisks`.

**Background you need:**

`GET /projectRisks` (server: `getAllRisksQuery`, `Servers/utils/risk.utils.ts:59`) returns each risk's columns plus a `projects` array of project ids aggregated from the `projects_risks` junction. `Clients/src/domain/models/Common/risks/risk.model.ts` declares every field this task reads **except `projects`** — that is why step 1 adds it. The page assigns the raw API response to `RiskModel[]` state rather than constructing class instances, so adding the property declaration is enough; do not touch the constructor.

`risk_category` is a string array, `ai_lifecycle_phase` / `risk_level_autocalculated` are string enums, `controls_mapping` / `assessment_mapping` / `mitigation_plan` are plain strings that are frequently empty.

- [ ] **Step 1: Add the missing `projects` field to the client risk model**

In `Clients/src/domain/models/Common/risks/risk.model.ts`, in the property list of the `RiskModel` class, immediately after the `is_demo?: boolean;` line, add:

```ts
  projects?: number[];
```

Do not add anything to the constructor.

- [ ] **Step 2: Write the failing tests**

Create `Clients/src/application/tools/__tests__/relatedRisks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findRelatedRisks } from "../relatedRisks";
import { RiskModel } from "../../../domain/models/Common/risks/risk.model";
import { AiLifeCyclePhase } from "../../../domain/enums/aiLifeCyclePhase.enum";
import { RiskLevelAutoCalculated } from "../../../domain/enums/riskLevelAutoCalculated.enum";

/**
 * Builds a risk with every scoring signal switched off by default, so each
 * test only turns on the signals it is about.
 */
const makeRisk = (overrides: Partial<RiskModel> & { id: number }): RiskModel =>
  ({
    risk_name: `Risk ${overrides.id}`,
    risk_category: [],
    ai_lifecycle_phase: "" as AiLifeCyclePhase,
    controls_mapping: "",
    assessment_mapping: "",
    mitigation_plan: "",
    risk_level_autocalculated: RiskLevelAutoCalculated.MediumRisk,
    projects: [],
    ...overrides,
  }) as RiskModel;

describe("findRelatedRisks", () => {
  it("ranks a higher-scoring match above a lower-scoring one", () => {
    const subject = makeRisk({
      id: 1,
      risk_category: ["Bias & Fairness"],
      controls_mapping: "AC-1",
    });
    const twoSignals = makeRisk({
      id: 2,
      risk_category: ["Bias & Fairness"],
      controls_mapping: "AC-1",
    });
    const oneSignal = makeRisk({ id: 3, risk_category: ["Bias & Fairness"] });

    const result = findRelatedRisks(subject, [oneSignal, twoSignals]);

    expect(result.map((r) => r.risk.id)).toEqual([2, 3]);
    expect(result[0].score).toBe(5);
    expect(result[1].score).toBe(3);
  });

  it("breaks a score tie by risk level, then by id", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const medium = makeRisk({
      id: 2,
      risk_category: ["Security"],
      risk_level_autocalculated: RiskLevelAutoCalculated.MediumRisk,
    });
    const highLaterId = makeRisk({
      id: 9,
      risk_category: ["Security"],
      risk_level_autocalculated: RiskLevelAutoCalculated.HighRisk,
    });
    const highEarlierId = makeRisk({
      id: 4,
      risk_category: ["Security"],
      risk_level_autocalculated: RiskLevelAutoCalculated.HighRisk,
    });

    const result = findRelatedRisks(subject, [medium, highLaterId, highEarlierId]);

    expect(result.map((r) => r.risk.id)).toEqual([4, 9, 2]);
  });

  it("excludes the subject itself by id", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const sameRiskInList = makeRisk({ id: 1, risk_category: ["Security"] });

    expect(findRelatedRisks(subject, [sameRiskInList])).toEqual([]);
  });

  it("returns an empty array when no signal matches", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const unrelated = makeRisk({ id: 2, risk_category: ["Data Quality"] });

    expect(findRelatedRisks(subject, [unrelated])).toEqual([]);
  });

  it("caps the result at 5", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const candidates = [2, 3, 4, 5, 6, 7, 8].map((id) =>
      makeRisk({ id, risk_category: ["Security"] }),
    );

    expect(findRelatedRisks(subject, candidates)).toHaveLength(5);
  });

  it("does not treat two empty mappings as a match", () => {
    const subject = makeRisk({ id: 1, controls_mapping: "   ", assessment_mapping: "" });
    const candidate = makeRisk({ id: 2, controls_mapping: "", assessment_mapping: "" });

    expect(findRelatedRisks(subject, [candidate])).toEqual([]);
  });

  it("matches categories and mappings case-insensitively, ignoring surrounding space", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"], controls_mapping: "AC-1" });
    const candidate = makeRisk({
      id: 2,
      risk_category: [" security "],
      controls_mapping: " ac-1 ",
    });

    expect(findRelatedRisks(subject, [candidate])[0].score).toBe(5);
  });

  it("uses the related risk's mitigation plan as the recommendation when it has one", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const candidate = makeRisk({
      id: 2,
      risk_category: ["Security"],
      mitigation_plan: "Rotate the signing keys quarterly",
    });

    expect(findRelatedRisks(subject, [candidate])[0].recommendation).toBe(
      "Rotate the signing keys quarterly",
    );
  });

  it("falls back to the template of the highest-weight signal when there is no mitigation plan", () => {
    const subject = makeRisk({
      id: 1,
      risk_category: ["Security"],
      controls_mapping: "AC-1",
    });
    const candidate = makeRisk({
      id: 2,
      risk_category: ["Security"],
      controls_mapping: "AC-1",
    });

    expect(findRelatedRisks(subject, [candidate])[0].recommendation).toBe(
      "Same category (Security) — re-check this risk's likelihood and severity for consistency.",
    );
  });

  it("falls back to the control template when only the control matches", () => {
    const subject = makeRisk({ id: 1, controls_mapping: "AC-1" });
    const candidate = makeRisk({ id: 2, controls_mapping: "AC-1" });

    expect(findRelatedRisks(subject, [candidate])[0].recommendation).toBe(
      "Shared control AC-1 — if that control changed, re-assess this risk.",
    );
  });

  it("names the matched values in the reason badges", () => {
    const subject = makeRisk({
      id: 1,
      risk_category: ["Bias & Fairness", "Security"],
      ai_lifecycle_phase: AiLifeCyclePhase.ModelDevelopmentAndTraining,
      controls_mapping: "AC-1",
      assessment_mapping: "Q1.2",
      projects: [7],
    });
    const candidate = makeRisk({
      id: 2,
      risk_category: ["Bias & Fairness", "Security"],
      ai_lifecycle_phase: AiLifeCyclePhase.ModelDevelopmentAndTraining,
      controls_mapping: "AC-1",
      assessment_mapping: "Q1.2",
      projects: [7, 8],
    });

    const [match] = findRelatedRisks(subject, [candidate]);

    expect(match.score).toBe(10);
    expect(match.reasons).toEqual([
      "Shared category: Bias & Fairness, Security",
      "Shared control: AC-1",
      "Shared assessment: Q1.2",
      "Same lifecycle phase: Model development & training",
      "Same project",
    ]);
  });

  it("tolerates risks whose array fields are missing", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const brokenRow = {
      id: 2,
      risk_name: "No arrays",
      controls_mapping: "",
      assessment_mapping: "",
      mitigation_plan: "",
    } as unknown as RiskModel;

    expect(() => findRelatedRisks(subject, [brokenRow])).not.toThrow();
    expect(findRelatedRisks(subject, [brokenRow])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd Clients && npx vitest run src/application/tools/__tests__/relatedRisks.test.ts
```

Expected: FAIL — the suite cannot resolve `../relatedRisks`.

If instead you get a vite config error about `@vitejs/plugin-react-swc`, the dependencies are stale: run `npm install` in `Clients` first.

- [ ] **Step 4: Write the implementation**

Create `Clients/src/application/tools/relatedRisks.ts`:

```ts
import { RiskModel } from "../../domain/models/Common/risks/risk.model";

/**
 * A risk that shares one or more signals with the risk the user just saved,
 * together with why it matched and what to do about it.
 */
export interface RelatedRisk {
  risk: RiskModel;
  score: number;
  /** Human-readable badges naming the values that matched. */
  reasons: string[];
  /** Never empty: the related risk's mitigation plan, or a template sentence. */
  recommendation: string;
}

const MAX_RESULTS = 5;

/** Higher wins when two candidates score the same. */
const RISK_LEVEL_RANK: Record<string, number> = {
  "Very high risk": 6,
  "High risk": 5,
  "Medium risk": 4,
  "Low risk": 3,
  "Very low risk": 2,
  "No risk": 1,
};

const norm = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/** Values present on both sides, in the subject's original casing. */
const sharedCategories = (a?: string[], b?: string[]): string[] => {
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  const other = new Set(b.map(norm).filter(Boolean));
  return a.filter((value) => norm(value) !== "" && other.has(norm(value)));
};

const sharesProject = (a?: number[], b?: number[]): boolean => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const other = new Set(b);
  return a.some((id) => other.has(id));
};

/** Equal and non-empty. Two blanks are not a match. */
const sameText = (a?: string, b?: string): boolean => norm(a) !== "" && norm(a) === norm(b);

const rank = (risk: RiskModel): number => RISK_LEVEL_RANK[risk.risk_level_autocalculated] ?? 0;

/**
 * Scores one candidate against the subject. Signals are evaluated in
 * recommendation-priority order, so the first template collected is the one
 * belonging to the highest-weight matched signal.
 */
const scoreCandidate = (subject: RiskModel, candidate: RiskModel): RelatedRisk | null => {
  const reasons: string[] = [];
  const templates: string[] = [];
  let score = 0;

  const categories = sharedCategories(subject.risk_category, candidate.risk_category);
  if (categories.length > 0) {
    const list = categories.join(", ");
    score += 3;
    reasons.push(`Shared category: ${list}`);
    templates.push(
      `Same category (${list}) — re-check this risk's likelihood and severity for consistency.`,
    );
  }

  if (sameText(subject.controls_mapping, candidate.controls_mapping)) {
    score += 2;
    reasons.push(`Shared control: ${candidate.controls_mapping}`);
    templates.push(
      `Shared control ${candidate.controls_mapping} — if that control changed, re-assess this risk.`,
    );
  }

  if (sameText(subject.assessment_mapping, candidate.assessment_mapping)) {
    score += 2;
    reasons.push(`Shared assessment: ${candidate.assessment_mapping}`);
    templates.push(
      `Shared assessment ${candidate.assessment_mapping} — confirm the answer still holds.`,
    );
  }

  if (sameText(subject.ai_lifecycle_phase, candidate.ai_lifecycle_phase)) {
    score += 2;
    reasons.push(`Same lifecycle phase: ${candidate.ai_lifecycle_phase}`);
    templates.push(
      `Same lifecycle phase (${candidate.ai_lifecycle_phase}) — verify the mitigation plans do not conflict.`,
    );
  }

  if (sharesProject(subject.projects, candidate.projects)) {
    score += 1;
    reasons.push("Same project");
    templates.push("Same project — review the project's risk profile as a whole.");
  }

  if (score === 0) return null;

  const plan = typeof candidate.mitigation_plan === "string" ? candidate.mitigation_plan.trim() : "";

  return {
    risk: candidate,
    score,
    reasons,
    recommendation: plan !== "" ? plan : templates[0],
  };
};

/**
 * Returns up to 5 risks related to `subject`, best match first.
 *
 * The relation is derived, not stored: risks are related when they overlap on
 * category (3), control mapping (2), assessment mapping (2), lifecycle phase
 * (2), or project (1). Ties break on risk level, then on id so the order is
 * deterministic.
 */
export function findRelatedRisks(subject: RiskModel, all: RiskModel[]): RelatedRisk[] {
  return all
    .filter((candidate) => candidate.id !== subject.id)
    .map((candidate) => scoreCandidate(subject, candidate))
    .filter((match): match is RelatedRisk => match !== null)
    .sort(
      (a, b) =>
        b.score - a.score || rank(b.risk) - rank(a.risk) || (a.risk.id ?? 0) - (b.risk.id ?? 0),
    )
    .slice(0, MAX_RESULTS);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd Clients && npx vitest run src/application/tools/__tests__/relatedRisks.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 6: Typecheck**

```bash
cd Clients && npx tsc --noEmit -p tsconfig.json
```

Expected: exit code 0, no output.

- [ ] **Step 7: Commit**

```bash
git add Clients/src/application/tools/relatedRisks.ts Clients/src/application/tools/__tests__/relatedRisks.test.ts Clients/src/domain/models/Common/risks/risk.model.ts
git commit -m "feat(risk): add derived related-risk scoring"
```

---

### Task 2: Summary modal component

**Files:**
- Create: `Clients/src/presentation/components/RelatedRisksSummary/index.tsx`
- Create: `Clients/src/presentation/components/RelatedRisksSummary/__tests__/index.test.tsx`

**Interfaces:**
- Consumes: `RelatedRisk` from `Clients/src/application/tools/relatedRisks` (Task 1); `RiskModel`; the existing `StandardModal` and `Chip` components.
- Produces:
  ```ts
  interface RelatedRisksSummaryProps {
    subject: RiskModel;
    related: RelatedRisk[];       // caller guarantees length > 0
    onClose: () => void;
    onOpenRisk: (risk: RiskModel) => void;
  }
  export default RelatedRisksSummary;
  ```
  Task 3 renders this component.

**Background you need:**

`StandardModal` lives at `Clients/src/presentation/components/Modals/StandardModal` and takes `isOpen`, `onClose`, `title`, `description`, `children`, and a set of footer switches. This modal is informational: pass `hideSubmitButton`, `cancelButtonText="Close"` and `fitContent` so it sizes to its content and shows a single closing button. Do **not** pass `onSubmit`.

`CustomizableButton` lives at `Clients/src/presentation/components/button/customizable-button` and takes `text`, `variant`, `onClick`, and `sx`; the `text` value becomes the button's accessible name.

`Chip` lives at `Clients/src/presentation/components/Chip` (the file is `Chip.tsx`, not the sibling `Chip/` folder, which holds `CategoryChip` and `DaysChip`) and takes `label`, `variant`, and `size`. It maps well-known labels to colors automatically — `<Chip label="High risk" />` renders in the high-risk color, which is exactly how `VWProjectRisksTableBody.tsx:292` renders the same field. For reason badges pass `variant="default"` explicitly so an unrecognised string never picks up a semantic color by accident.

This component is presentational: it does no scoring, no fetching, and holds no state.

- [ ] **Step 1: Write the failing tests**

Create `Clients/src/presentation/components/RelatedRisksSummary/__tests__/index.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RelatedRisksSummary from "../index";
import { RiskModel } from "../../../../domain/models/Common/risks/risk.model";
import { RelatedRisk } from "../../../../application/tools/relatedRisks";
import { RiskLevelAutoCalculated } from "../../../../domain/enums/riskLevelAutoCalculated.enum";

const risk = (id: number, name: string): RiskModel =>
  ({
    id,
    risk_name: name,
    risk_level_autocalculated: RiskLevelAutoCalculated.HighRisk,
  }) as RiskModel;

const related: RelatedRisk[] = [
  {
    risk: risk(2, "Training data drift"),
    score: 5,
    reasons: ["Shared category: Data Quality", "Shared control: AC-1"],
    recommendation: "Re-run the validation pipeline",
  },
  {
    risk: risk(3, "Vendor model opacity"),
    score: 3,
    reasons: ["Shared category: Data Quality"],
    recommendation: "Same category (Data Quality) — re-check this risk's likelihood and severity for consistency.",
  },
];

describe("RelatedRisksSummary", () => {
  it("names the saved risk and lists every related risk with its reasons and recommendation", () => {
    render(
      <RelatedRisksSummary
        subject={risk(1, "Biased hiring model")}
        related={related}
        onClose={vi.fn()}
        onOpenRisk={vi.fn()}
      />,
    );

    expect(screen.getByText(/Biased hiring model/)).toBeInTheDocument();
    expect(screen.getByText("Training data drift")).toBeInTheDocument();
    expect(screen.getByText("Vendor model opacity")).toBeInTheDocument();
    expect(screen.getByText("Shared control: AC-1")).toBeInTheDocument();
    expect(screen.getByText("Re-run the validation pipeline")).toBeInTheDocument();
  });

  it("passes the clicked risk to onOpenRisk", async () => {
    const onOpenRisk = vi.fn();
    render(
      <RelatedRisksSummary
        subject={risk(1, "Biased hiring model")}
        related={related}
        onClose={vi.fn()}
        onOpenRisk={onOpenRisk}
      />,
    );

    await userEvent.click(screen.getAllByRole("button", { name: "Open" })[0]);

    expect(onOpenRisk).toHaveBeenCalledTimes(1);
    expect(onOpenRisk.mock.calls[0][0].id).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Clients && npx vitest run src/presentation/components/RelatedRisksSummary
```

Expected: FAIL — cannot resolve `../index`.

- [ ] **Step 3: Write the component**

Create `Clients/src/presentation/components/RelatedRisksSummary/index.tsx`:

```tsx
import { FC } from "react";
import { Stack, Typography } from "@mui/material";
import StandardModal from "../Modals/StandardModal";
import Chip from "../Chip";
import { CustomizableButton } from "../button/customizable-button";
import { RiskModel } from "../../../domain/models/Common/risks/risk.model";
import { RelatedRisk } from "../../../application/tools/relatedRisks";

interface RelatedRisksSummaryProps {
  /** The risk the user just saved. */
  subject: RiskModel;
  /** Scored matches, best first. The caller only renders this when non-empty. */
  related: RelatedRisk[];
  onClose: () => void;
  onOpenRisk: (risk: RiskModel) => void;
}

/**
 * Read-only summary shown after a risk is created or updated: the other risks
 * that share signals with it, why they matched, and what to look at. Opening a
 * row hands the risk back to the page, which opens it in the risk form.
 */
const RelatedRisksSummary: FC<RelatedRisksSummaryProps> = ({
  subject,
  related,
  onClose,
  onOpenRisk,
}) => (
  <StandardModal
    isOpen
    onClose={onClose}
    title="Risks that may be affected"
    description={`"${subject.risk_name}" was saved. These risks share signals with it — review whether they need an update.`}
    cancelButtonText="Close"
    hideSubmitButton
    fitContent
    maxWidth="760px"
  >
    <Stack spacing={4}>
      {related.map(({ risk, reasons, recommendation }) => (
        <Stack
          key={risk.id}
          spacing={2}
          sx={{
            border: "1px solid #EAECF0",
            borderRadius: "4px",
            padding: "12px",
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{risk.risk_name}</Typography>
              {risk.risk_level_autocalculated && (
                <Chip label={risk.risk_level_autocalculated} size="small" />
              )}
            </Stack>
            <CustomizableButton
              variant="text"
              text="Open"
              onClick={() => onOpenRisk(risk)}
              sx={{ minWidth: "auto" }}
            />
          </Stack>
          <Stack direction="row" flexWrap="wrap" gap={2}>
            {reasons.map((reason) => (
              <Chip key={reason} label={reason} variant="default" size="small" />
            ))}
          </Stack>
          <Typography sx={{ fontSize: 13, color: "#475467" }}>{recommendation}</Typography>
        </Stack>
      ))}
    </Stack>
  </StandardModal>
);

export default RelatedRisksSummary;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd Clients && npx vitest run src/presentation/components/RelatedRisksSummary
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck**

```bash
cd Clients && npx tsc --noEmit -p tsconfig.json
```

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add Clients/src/presentation/components/RelatedRisksSummary
git commit -m "feat(risk): add related risks summary modal"
```

---

### Task 3: Wire the summary into the Risk Management page

**Files:**
- Modify: `Clients/src/presentation/pages/RiskManagement/index.tsx` (`fetchProjectRisks` ~466-475, `handleSuccess` ~628-641, `handleUpdate` ~643-658, render tree ~1048)
- Modify: `docs/technical/domains/risk-management.md`

**Interfaces:**
- Consumes: `findRelatedRisks` and `RelatedRisk` (Task 1), `RelatedRisksSummary` (Task 2).
- Produces: nothing further; this is the last task.

**Background you need — read this before editing:**

The page renders the risk form inside a `StandardModal` and passes `onSuccess={selectedRow.length > 0 ? handleUpdate : handleSuccess}` (line ~1039). `onSuccess` takes **no arguments** (`useRiskForm.ts:517` and `:540`), and `selectedRow` holds the risk as it was *before* the edit. So the page cannot read the saved values directly — it has to re-read the list and find the saved risk in it:

- **Update:** find by `selectedRow[0].id`, captured synchronously (the form calls `closePopup()` right after `onSuccess()`, which clears `selectedRow`).
- **Create:** there is no id, so snapshot the current ids before refetching and find the one that is new.

`fetchProjectRisks` currently returns `void`. Step 1 makes it also return the list; existing callers ignore the return value and keep working.

Both handlers already call `fetchProjectRisks()` — hook onto that call rather than adding a second network round-trip. Leave the existing `setRefreshKey` calls, toasts, and flash-row timings alone; they are not part of this feature.

- [ ] **Step 1: Make `fetchProjectRisks` return the list**

Replace the body of `fetchProjectRisks` (around line 466):

```tsx
  const fetchProjectRisks = useCallback(async (filter: "active" | "deleted" | "all" = "active") => {
    try {
      const response = await getAllProjectRisks({ filter });
      setShowCustomizableSkeleton(false);
      setProjectRisks(response.data);
      return response.data as RiskModel[];
    } catch (error) {
      console.error("Error fetching project risks:", error);
      handleToast("error", "Unexpected error occurs while fetching project risks.");
      return [] as RiskModel[];
    }
  }, []);
```

- [ ] **Step 2: Add the imports and the modal state**

Add to the import block at the top of the file, next to the other component imports:

```tsx
import RelatedRisksSummary from "../../components/RelatedRisksSummary";
import { findRelatedRisks, RelatedRisk } from "../../../application/tools/relatedRisks";
```

Add next to the other `useState` declarations (after `const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);`):

```tsx
  const [relatedSummary, setRelatedSummary] = useState<{
    subject: RiskModel;
    related: RelatedRisk[];
  } | null>(null);
```

- [ ] **Step 3: Add the shared helper**

Add immediately above `handleSuccess` (around line 628):

```tsx
  /**
   * Finds the risk that was just saved in the freshly fetched list and, if it
   * has related risks, opens the summary. Silent when nothing matches.
   */
  const showRelatedRisks = (fresh: RiskModel[], matchSubject: (risk: RiskModel) => boolean) => {
    const subject = fresh.find(matchSubject);
    if (!subject) return;
    const related = findRelatedRisks(subject, fresh);
    if (related.length > 0) {
      setRelatedSummary({ subject, related });
    }
  };
```

- [ ] **Step 4: Trigger it on create**

Replace `handleSuccess` (around line 628) with:

```tsx
  const handleSuccess = () => {
    const previousIds = new Set(projectRisks.map((risk) => risk.id));

    setTimeout(() => {
      setIsLoading(initialLoadingState);
      handleToast("success", "Risk created successfully");
    }, 1000);

    // set pagination for FIFO risk listing after adding a new risk
    const rowsPerPage = 5;
    const pageCount = Math.floor(projectRisks.length / rowsPerPage);
    setCurrentPage(pageCount);

    void fetchProjectRisks().then((fresh) => {
      showRelatedRisks(fresh, (risk) => !previousIds.has(risk.id));
    });
    setRefreshKey((prevKey) => prevKey + 1);
  };
```

- [ ] **Step 5: Trigger it on update**

Replace `handleUpdate` (around line 643) with:

```tsx
  const handleUpdate = () => {
    const subjectId = selectedRow[0]?.id;
    // Set flash immediately to ensure visibility
    setCurrentRow(subjectId!); // set current row to trigger flash-feedback

    setTimeout(() => {
      setIsLoading(initialLoadingState);
      handleToast("success", "Risk updated successfully");
      // Fetch fresh data after flash is set
      void fetchProjectRisks().then((fresh) => {
        showRelatedRisks(fresh, (risk) => risk.id === subjectId);
      });
    }, 500);

    setTimeout(() => {
      setCurrentRow(null);
    }, 3000); // Flash duration consistent with other tables
    setRefreshKey((prevKey) => prevKey + 1);
  };
```

- [ ] **Step 6: Render the modal**

Insert immediately after the `</Stack>` that closes the main page stack and before `<AddNewRiskMITModal` (around line 1049):

```tsx
      {relatedSummary && (
        <RelatedRisksSummary
          subject={relatedSummary.subject}
          related={relatedSummary.related}
          onClose={() => setRelatedSummary(null)}
          onOpenRisk={(risk) => {
            setRelatedSummary(null);
            setSelectedRow([risk]);
            setIsRiskModalOpen(true);
          }}
        />
      )}
```

- [ ] **Step 7: Typecheck and run the full client test suite**

```bash
cd Clients && npx tsc --noEmit -p tsconfig.json && npx vitest run
```

Expected: typecheck exit 0; the test suite passes with no new failures. Compare against `git stash`-ing your changes if you are unsure whether a failure pre-existed.

- [ ] **Step 8: Build**

```bash
cd Clients && npm run build
```

Expected: build succeeds. This is the project's PR gate (`Clients/CLAUDE.md`).

- [ ] **Step 9: Document the feature**

In `docs/technical/domains/risk-management.md`, add this section immediately before the "Backend" file table near the end of the document:

```markdown
## Related Risks (risk inheritance, phase 1)

After a project risk is created or updated on the Risk Management page, a
summary lists up to 5 other risks that may be affected by the change.

The relation is **derived, not stored** — there is no risk-to-risk table. Two
risks are related when they overlap on shared category (3 points), shared
`controls_mapping` (2), shared `assessment_mapping` (2), same
`ai_lifecycle_phase` (2), or a shared project (1). Matches are ranked by score,
then by risk level, then by id, and capped at 5. Empty values never match.

Each row shows badges naming the values that matched and a recommendation: the
related risk's `mitigation_plan` if it has one, otherwise a template sentence
keyed to the highest-weight matched signal.

The summary is read-only — nothing is written to the related risks.

Scoring lives in `Clients/src/application/tools/relatedRisks.ts` as a pure
function with no React or network imports, so it can be lifted to a
`GET /projectRisks/:id/related` endpoint if a second consumer needs it.

Design: `docs/superpowers/specs/2026-08-11-risk-inheritance-design.md`
```

Also update the "Last Updated" date at the top of `docs/technical/domains/risk-management.md` if it has one.

- [ ] **Step 10: Commit**

```bash
git add Clients/src/presentation/pages/RiskManagement/index.tsx docs/technical/domains/risk-management.md
git commit -m "feat(risk): show related risks after saving a risk"
```

---

## Manual verification (after Task 3)

Automated tests do not exercise the browser path, and the app requires a login the agent cannot perform. Ask the user to check, or check yourself if you have a session:

1. Start the stack (`servers` and `clients` from `.claude/launch.json`; Postgres and Redis must be running).
2. Open Risk Management, create a risk with a category that an existing risk already uses.
3. Expect the summary modal listing that existing risk with a `Shared category: …` badge.
4. Click **Open** — the risk form opens on that risk.
5. Edit a risk that shares nothing with any other risk; expect **no** modal.
