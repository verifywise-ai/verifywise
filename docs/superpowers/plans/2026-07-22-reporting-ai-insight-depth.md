# Reporting AI insight depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI insight blocks in generated reports analyse the data instead of restating it, so they cite specific values, relate one section to another, and read as being about this organization rather than any organization.

**Architecture:** A deterministic facts substrate — computed in TypeScript, no LLM — is injected into every analyzer prompt, so the three summary consumers stop paraphrasing a paraphrase and gain numbers, dates and identifiers to reason over. Because that substrate is whole-estate, a single prompt now holds every section at once and cross-section correlation becomes expressible without adding an eighth AI block. Prompts gain an arithmetic carve-out, per-section-type analytic questions and severity calibration; rows gain a labelled inference basis and a counterfactual; a trigram-overlap gate detects restatement in code and re-issues once. Both renderers are extended so the added depth is visible rather than merely stored.

**Tech Stack:** Node.js 22, TypeScript, Jest (`ts-jest`), Zod 4, Vercel AI SDK 6 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`), Sequelize 6 over PostgreSQL, EJS + Puppeteer for PDF and the `docx` package for DOCX, Vitest on the frontend.

**Spec:** [`docs/superpowers/specs/2026-07-22-reporting-ai-insight-depth-design.md`](../specs/2026-07-22-reporting-ai-insight-depth-design.md)

---

## File Structure

Everything below is under `Servers/` unless the path says otherwise.

**Created**

| File | Responsibility |
|------|----------------|
| `services/reporting/analyzers/facts.ts` | `collectFacts` builds the storable `FactsSnapshot`; `renderFacts` turns it (plus an optional prior snapshot) into the prompt block. Pure — no LLM, no database. |
| `services/reporting/analyzers/novelty.ts` | `trigramJaccard` and `isRestatement`, plus the `NOVELTY_THRESHOLD` calibration knob. The one measurable definition of "deeper" in this design. |
| `services/reporting/analyzers/__tests__/facts.test.ts` | Aggregates, ranking, truncation stamps, delta rendering. |
| `services/reporting/analyzers/__tests__/novelty.test.ts` | Similarity on realistic restatement-versus-analysis fixtures. |
| `services/reporting/tests/index.priorFacts.spec.ts` | The §10 wiring end to end through `generateReport`. |

**Modified**

| File | What changes |
|------|--------------|
| `services/reporting/dataCollector.ts` | Four wrong or dropped column reads; exports the single `isoDate` date normaliser the whole pipeline shares. |
| `services/reporting/analyzers/prompts.ts` | `GROUNDING_RULES` arithmetic carve-out; `SECTION_INSTRUCTIONS` per section key; truncation stamps and materiality ranking on `truncateArray`; `ANALYZER_VERSION` → v2. |
| `services/reporting/analyzers/registry.ts` | `AnalyzerExtras.facts`; all six `buildUserPrompt`s receive the facts block; rewritten system prompts. |
| `services/reporting/analyzers/schemas.ts` | `basis`, `what_would_close_this`, `related_sections`; calibration anchors in `.describe()`; row caps 300 → 600. |
| `services/reporting/analyzers/runAnalyzers.ts` | Per-attempt timeout, output budget, second correction attempt, the novelty gate. |
| `services/reporting/analyzers/collectAnalyzerInputs.ts` | `collectFactsInput`; harvests `sections.models` for allowed owners. |
| `services/reporting/analyzers/sectionSummaries.ts` | Per-section-type instructions, 900-token budget, `finishReason` warning. |
| `services/reporting/analyzers/mapToSummaries.ts` | Carries the new row fields; owns `ANALYSIS_LABELS` and `isOperationalAbstention`. |
| `services/reporting/analyzers/persistAnalyses.ts` | Writes the facts snapshot and the gate result into `audit_metadata`. |
| `services/reporting/index.ts`, `reportRunOrchestrator.ts` | Thread the facts substrate and the schedule id through the run. |
| `services/reporting/docxGenerator.ts`, `templates/reports/report-pdf.ejs` | Render `top_risks`, severities, rationales, basis, counterfactuals and abstentions. |
| `domain.layer/interfaces/i.reportGeneration.ts` | `AISummaries` and the section data interfaces, all additions optional. |
| `advisor/llmSelfCorrect.ts` | Optional `timeoutMs`, giving each attempt its own abort signal. |
| `utils/reportRunAnalysis.utils.ts` | Reads the most recent prior snapshot for a schedule. |
| `Clients/src/domain/interfaces/i.reporting.ts` | The one deliberate frontend change: the hand-mirrored payload types follow the schema. |

**Deliberately not touched:** `ConfigureReportWizard.test.tsx`, `TemplateBuilder.test.tsx` and `reportTemplateResolver.test.ts` all pin seven `ai_blocks`. No block is added and no migration is required. If one of those three fails, the change is wrong.

---

## Phase 1 — Collector corrections and per-attempt timeout

> Bug fixes first: everything downstream reasons over this data, and a shared timeout that eats retries would mask every later phase.

### Task 1: Read the real `model_risks` columns instead of a column that does not exist

**Files:**
- Modify: `Servers/services/reporting/dataCollector.ts:58` (insert the exported `isoDate` helper after `RISK_LEVEL_COLORS`, which closes on line 58)
- Modify: `Servers/services/reporting/dataCollector.ts:822-831` (`collectModelRisks` return map)
- Modify: `Servers/domain.layer/interfaces/i.reportGeneration.ts:292-301` (`ModelRisksSectionData`)
- Test: `Servers/services/reporting/tests/dataCollector.spec.ts`

- [ ] **Step 1: Write the failing test**

In `Servers/services/reporting/tests/dataCollector.spec.ts`, the file currently ends (lines 217-220) with the close of `describe("collectAllData")` followed by the close of `describe("dataCollector")`:

```ts
      expect(result.branding.primaryColor).toBe("#13715B");
    });
  });
});
```

Replace those last three lines with this — the new `describe` sits inside `describe("dataCollector")` so it inherits the existing `beforeEach` mocks (`mockGetProject` returns `{ project_title: "Test Project", owner: 5, is_organizational: false }`, `mockGetUser` returns `{ name: "John", surname: "Doe" }`, `mockQuery` and the three report queries return `[]`):

```ts
      expect(result.branding.primaryColor).toBe("#13715B");
    });
  });

  describe("collector column corrections", () => {
    it("reads model_risks.status (not the non-existent mitigation_status) and surfaces plan/date/impact/likelihood", async () => {
      // verifywise.model_risks has no `mitigation_status` column, so the old
      // read made every model risk in every report literally "Unknown".
      mockQuery.mockResolvedValue([
        {
          id: 3,
          model_name: "gpt-4o",
          risk_name: "Prompt injection",
          risk_level: "High",
          status: "In Progress",
          mitigation_plan: "Add an input classifier in front of the endpoint.",
          target_date: new Date(2026, 7, 14),
          impact: "Data exfiltration from the retrieval store.",
          likelihood: "Likely",
        },
      ] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["modelRisks"]);

      const risk = result.sections.modelRisks!.risks[0];
      expect(risk.mitigationStatus).toBe("In Progress");
      expect(risk.mitigationPlan).toBe("Add an input classifier in front of the endpoint.");
      expect(risk.targetDate).toBe("2026-08-14");
      expect(risk.impact).toBe("Data exfiltration from the retrieval store.");
      expect(risk.likelihood).toBe("Likely");
    });

    it("leaves the optional model-risk fields undefined rather than inventing them", async () => {
      mockQuery.mockResolvedValue([
        { id: 4, model_name: "claude", risk_name: "Drift", risk_level: "Low" },
      ] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["modelRisks"]);

      const risk = result.sections.modelRisks!.risks[0];
      expect(risk.mitigationStatus).toBe("Unknown");
      expect(risk.mitigationPlan).toBeUndefined();
      expect(risk.targetDate).toBeUndefined();
    });
  });
});
```

`collectAllData(["modelRisks"])` is safe to assert against `mockQuery` alone: `collectChartData` only calls `collectRiskDistribution` when the section list contains `projectRisks` or `all` (`dataCollector.ts:319-321`), so `collectModelRisks` is the only consumer of `sequelize.query` in this test.

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/dataCollector.spec.ts`

Expected: FAIL — first test: `expect(risk.mitigationStatus).toBe("In Progress")` receives `"Unknown"`, because line 829 reads `mr.mitigation_status`, a column that does not exist; `mitigationPlan`, `targetDate`, `impact` and `likelihood` are all `undefined` because the map never emits them.

- [ ] **Step 3: Implement**

3a. In `Servers/services/reporting/dataCollector.ts`, insert the date helper immediately after the closing `};` of `RISK_LEVEL_COLORS` (line 58), before the commented-out `STATUS_COLORS` block on line 60:

```ts
/**
 * ISO `YYYY-MM-DD`, or undefined when there is no usable date.
 *
 * EXPORTED deliberately: this is the report pipeline's ONE date
 * normalisation. The analyzers' facts substrate (§1/§3) hands the model a
 * reference date and asks it to compare due dates against it, so both sides of
 * that comparison must be sliced the same way or they disagree by a day.
 *
 * Locale-independent on purpose: `toLocaleDateString()` renders whatever the
 * server's locale happens to be. Built from LOCAL components rather than
 * `toISOString()` — pg hands back a DATE column as local midnight, and
 * UTC-shifting that reports the previous day anywhere west of Greenwich.
 */
export const isoDate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
```

3b. Replace the `collectModelRisks` return block (lines 822-831):

```ts
      return {
        totalRisks: modelRisks.length,
        risks: modelRisks.map((mr) => ({
          id: mr.id,
          modelName: mr.model_name || "Unknown Model",
          riskName: mr.risk_name || "Unnamed Risk",
          riskLevel: mr.risk_level || "Unknown",
          // model_risks has `status`, not `mitigation_status`. The old read
          // resolved to undefined for every row, so every model risk in every
          // report rendered as "Unknown".
          mitigationStatus: mr.status || "Unknown",
          // All four are already fetched by the SELECT mr.* above and were
          // being discarded here.
          mitigationPlan: mr.mitigation_plan || undefined,
          targetDate: isoDate(mr.target_date),
          impact: mr.impact || undefined,
          likelihood: mr.likelihood || undefined,
        })),
      };
```

3c. Replace `ModelRisksSectionData` in `Servers/domain.layer/interfaces/i.reportGeneration.ts` (lines 292-301):

```ts
export interface ModelRisksSectionData {
  totalRisks: number;
  risks: Array<{
    id: number;
    modelName: string;
    riskName: string;
    riskLevel: string;
    /** model_risks.status. Read from a non-existent `mitigation_status`
     *  column until 2026-07, so every row rendered as "Unknown". */
    mitigationStatus: string;
    mitigationPlan?: string;
    /** ISO YYYY-MM-DD. */
    targetDate?: string;
    impact?: string;
    likelihood?: string;
  }>;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/dataCollector.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/dataCollector.ts \
        Servers/domain.layer/interfaces/i.reportGeneration.ts \
        Servers/services/reporting/tests/dataCollector.spec.ts
git commit -m "$(cat <<'EOF'
fix(reporting): read model_risks.status, not a column that does not exist

collectModelRisks read mr.mitigation_status, which verifywise.model_risks
has never had, so every model risk in every report was literally "Unknown".
Read status, and surface mitigation_plan, target_date, impact and likelihood
— all four were already fetched by the SELECT mr.* and then dropped in the
map. Dates render as locale-independent ISO so analyzers can compare them
against the report's reference date.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

> **Seam note for Phase 2 (binding, ruling R5).** `isoDate` is the single date
> normalisation for this pipeline. `analyzers/facts.ts` MUST import it
> (`import { isoDate } from "../dataCollector";`) rather than defining its own
> `referenceDay` over `toISOString()`. If facts.ts wants the name, it is one
> line over the shared helper: `const referenceDay = (v: unknown) => isoDate(v) ?? "";`.
> Consequence Phase 2 must budget for: importing `../dataCollector` pulls
> `Servers/database/db` into the analyzer import graph, and that module
> constructs the real Sequelize instance at load. `facts.test.ts` therefore
> needs `jest.mock("../../../../database/db", () => ({ sequelize: {} }))`
> — the same guard `dataCollector.spec.ts:10-12` and
> `collectAnalyzerInputs.test.ts:11-17` already carry, for the same reason.

---

### Task 2: Resolve the compliance control owner, and keep category and due date

**Files:**
- Modify: `Servers/services/reporting/dataCollector.ts:587-625` (`collectCompliance`, JSDoc through closing brace)
- Modify: `Servers/domain.layer/interfaces/i.reportGeneration.ts:218-230` (`ComplianceSectionData`)
- Test: `Servers/services/reporting/tests/dataCollector.spec.ts`

- [ ] **Step 1: Write the failing test**

Add this test to the `describe("collector column corrections", ...)` block created in Task 1, immediately after the `it("leaves the optional model-risk fields undefined rather than inventing them", ...)` test:

```ts
    it("resolves the numeric control owner to a name and keeps the control family and due date", async () => {
      // getControlByIdQuery (eu.utils.ts:467-496) selects `c.owner AS owner`
      // (line 482) — a users FK — and no owner_name/owner_surname aliases at
      // all. It does select `c.due_date AS due_date` (line 484), which the
      // collector then dropped.
      mockGetCompliance.mockResolvedValue([
        {
          name: "Human oversight",
          controls: [
            {
              id: 7,
              title: "Assign an oversight owner",
              status: "In progress",
              owner: 42,
              due_date: new Date(2026, 8, 30),
              description: "Named accountable person per high-risk system.",
            },
            { id: 8, title: "Log oversight decisions", status: "Done", owner: null, due_date: null },
          ],
        },
      ] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["compliance"]);

      const controls = result.sections.compliance!.controls;
      expect(mockGetUser).toHaveBeenCalledWith(42);
      expect(controls[0].owner).toBe("John Doe");
      expect(controls[0].category).toBe("Human oversight");
      expect(controls[0].dueDate).toBe("2026-09-30");
      // No owner id, no invented owner; no due date, no invented date.
      expect(controls[1].owner).toBeUndefined();
      expect(controls[1].dueDate).toBeUndefined();
      expect(controls[1].category).toBe("Human oversight");
    });
```

The compliance branch requires `frameworkId === 1 && !isOrganizational` (`dataCollector.ts:143-147`); `createDataCollector(10, 1, 1, 100, 5)` and the `beforeEach` project mock satisfy both. `collectComplianceProgress` consumes the same mocked categories for the chart rollup, which is harmless here.

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/dataCollector.spec.ts`

Expected: FAIL — `expect(controls[0].owner).toBe("John Doe")` receives `undefined` (line 622 reads `c.owner_name`, which no control row carries), and `controls[0].category` / `controls[0].dueDate` are `undefined` because the map at lines 616-623 computes `categoryName` at line 604 and then drops it, and never reads `due_date`.

- [ ] **Step 3: Implement**

3a. Replace the whole of `collectCompliance` in `Servers/services/reporting/dataCollector.ts` (lines 587-625, i.e. the JSDoc block through the method's closing brace):

```ts
  /**
   * Resolve users.id -> "Name Surname" for the ids handed in.
   *
   * Controls carry a numeric `owner` FK, not a name (eu.utils.ts:482). One
   * lookup per DISTINCT id, in parallel; a failed lookup degrades that one
   * owner to undefined rather than failing the report.
   */
  private async resolveUserNames(ids: unknown[]): Promise<Map<number, string>> {
    const distinct = Array.from(
      new Set(ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id))),
    );
    const entries = await Promise.all(
      distinct.map(async (id) => {
        try {
          const user = await getUserByIdQuery(id);
          const name = user ? `${user.name || ""} ${user.surname || ""}`.trim() : "";
          return name ? ([id, name] as [number, string]) : null;
        } catch {
          return null;
        }
      }),
    );
    const resolved = new Map<number, string>();
    for (const entry of entries) {
      if (entry) resolved.set(entry[0], entry[1]);
    }
    return resolved;
  }

  /**
   * Collect compliance section data
   * Note: getComplianceReportQuery returns control categories with nested controls
   */
  private async collectCompliance(): Promise<ComplianceSectionData> {
    const controlCategories = (await getComplianceReportQuery(
      this.projectFrameworkId,
      this.organizationId,
    )) as any[];

    // Flatten controls from all categories
    const allControls: any[] = [];
    controlCategories.forEach((category) => {
      const controls = category.dataValues?.controls || category.controls || [];
      controls.forEach((control: any) => {
        allControls.push({
          ...control,
          categoryName: category.name || category.dataValues?.name || "Unknown",
        });
      });
    });

    const completedControls = allControls.filter((c) => c.status === "Done").length;
    const ownerNames = await this.resolveUserNames(allControls.map((c) => c.owner));

    return {
      overallProgress:
        allControls.length > 0 ? Math.round((completedControls / allControls.length) * 100) : 0,
      totalControls: allControls.length,
      completedControls,
      controls: allControls.map((c) => ({
        id: c.id,
        controlId: c.control_id || `C-${c.id}`,
        title: c.title || "Untitled Control",
        status: c.status || "Unknown",
        description: c.description,
        // `c.owner_name` was undefined for every control: the row carries a
        // numeric `owner` FK, not a joined name.
        owner: typeof c.owner === "number" ? ownerNames.get(c.owner) : undefined,
        // categoryName was computed above and then dropped. Control family is
        // exactly the grouping the compliance analysis needs.
        category: c.categoryName,
        dueDate: isoDate(c.due_date),
      })),
    };
  }
```

3b. Replace `ComplianceSectionData` in `Servers/domain.layer/interfaces/i.reportGeneration.ts` (lines 218-230):

```ts
export interface ComplianceSectionData {
  overallProgress: number;
  totalControls: number;
  completedControls: number;
  controls: Array<{
    id: number;
    controlId: string;
    title: string;
    status: string;
    description?: string;
    /** Resolved from the numeric controls_eu.owner FK; undefined when unset. */
    owner?: string;
    /** Control family (control category name). */
    category?: string;
    /** ISO YYYY-MM-DD. */
    dueDate?: string;
  }>;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/dataCollector.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/dataCollector.ts \
        Servers/domain.layer/interfaces/i.reportGeneration.ts \
        Servers/services/reporting/tests/dataCollector.spec.ts
git commit -m "$(cat <<'EOF'
fix(reporting): resolve control owner, keep control family and due date

collectCompliance read c.owner_name against a control row that carries a
numeric `owner` FK, so the field was undefined for every control in every
report. Resolve the distinct owner ids once and map them to names. Keep the
categoryName the flattening loop already computes and then discarded, and
carry due_date through as an ISO date.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

> Side effect worth knowing, and it is a good one: `collectAllowedOwners`
> already harvests `sections.compliance.controls[].owner`
> (`collectAnalyzerInputs.ts:188`) but filters on `typeof v === "string"`, so
> numeric FKs never reached it. Once this task resolves owners to names,
> control owners become legitimate `suggestedOwner` values. `approver` stays a
> numeric FK and stays filtered out — correct, not a bug to chase.

---

### Task 3: Stamp silent truncation, and rank by materiality before slicing

**Files:**
- Modify: `Servers/services/reporting/analyzers/prompts.ts:34-54` (`truncateArray` + `truncateWithStamp`)
- Modify: `Servers/services/reporting/analyzers/prompts.ts:61-131` (`prepareSectionData` call sites)
- Test: `Servers/services/reporting/analyzers/__tests__/registry.test.ts:51-55`

- [ ] **Step 1: Write the failing test**

Replace the existing test at `registry.test.ts:51-55`:

```ts
  it("truncates long section arrays to protect the context window", () => {
    const risks = Array.from({ length: 200 }, (_, i) => ({ name: `R${i}` }));
    const out = prepareSectionData("projectRisks", { risks });
    expect(JSON.parse(out).risks).toHaveLength(50);
  });
```

with these four:

```ts
  it("truncates long section arrays to protect the context window, and says it did", () => {
    const risks = Array.from({ length: 200 }, (_, i) => ({ name: `R${i}` }));
    const out = JSON.parse(prepareSectionData("projectRisks", { risks }));
    expect(out.risks).toHaveLength(50);
    // Silent truncation reads to the model as a complete set — the top-level
    // arrays now carry the same stamp the nested ones already did.
    expect(out._risksTruncated).toBe("showing 50 of 200");
  });

  it("ranks by materiality BEFORE truncating, so the model sees the worst rows not the oldest", () => {
    // The collector's queries order by id ASC, so a plain slice hands the
    // model 50 Low rows and cuts the Critical one sitting at index 60.
    const risks = [
      ...Array.from({ length: 60 }, (_, i) => ({ name: `Low${i}`, riskLevel: "Low" })),
      { name: "CriticalLate", riskLevel: "Critical" },
      { name: "HighLate", riskLevel: "High" },
    ];
    const out = JSON.parse(prepareSectionData("projectRisks", { risks }));
    expect(out.risks).toHaveLength(50);
    expect(out.risks[0].name).toBe("CriticalLate");
    expect(out.risks[1].name).toBe("HighLate");
    expect(out._risksTruncated).toBe("showing 50 of 62");
  });

  it("breaks severity ties by deadline and leaves unrankable rows in query order", () => {
    const risks = [
      { name: "LateHigh", riskLevel: "High", targetDate: "2026-12-01" },
      { name: "EarlyHigh", riskLevel: "High", targetDate: "2026-01-05" },
      { name: "NoLevelA" },
      { name: "NoLevelB" },
    ];
    const out = JSON.parse(prepareSectionData("projectRisks", { risks }));
    expect(out.risks.map((r: any) => r.name)).toEqual([
      "EarlyHigh",
      "LateHigh",
      "NoLevelA",
      "NoLevelB",
    ]);
    // Nothing was dropped, so nothing is stamped.
    expect(out._risksTruncated).toBeUndefined();
  });

  it("does not mutate the caller's array while ranking (the renderers get the same objects)", () => {
    const risks = [
      { name: "Low1", riskLevel: "Low" },
      { name: "Crit1", riskLevel: "Critical" },
    ];
    prepareSectionData("projectRisks", { risks });
    expect(risks.map((r) => r.name)).toEqual(["Low1", "Crit1"]);
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`

Expected: FAIL — `expect(out._risksTruncated).toBe("showing 50 of 200")` receives `undefined` (`truncateArray` slices silently), and `expect(out.risks[0].name).toBe("CriticalLate")` receives `"Low0"` (no ranking, so the slice keeps the oldest 50).

- [ ] **Step 3: Implement**

3a. In `Servers/services/reporting/analyzers/prompts.ts`, replace lines 34-54 — `truncateArray` and `truncateWithStamp` together — with:

```ts
/** Materiality order for the level/severity vocabularies used across sections.
 * Lower index = more material. */
const LEVEL_RANK: Record<string, number> = {
  critical: 0,
  "very high": 1,
  high: 2,
  medium: 3,
  low: 4,
  "very low": 5,
};

const levelOf = (row: any): number => {
  const raw = row?.riskLevel ?? row?.severity ?? row?.level;
  const rank = typeof raw === "string" ? LEVEL_RANK[raw.trim().toLowerCase()] : undefined;
  return rank ?? 99;
};

/** Deadline-shaped fields only. Sooner = more urgent, unambiguously; a
 * "reported" or "completed" date does not order that way, so it is left out
 * rather than sorted backwards. */
const dateOf = (row: any): number => {
  const raw = row?.targetDate ?? row?.dueDate ?? row?.reviewDate;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

/**
 * Rank by materiality BEFORE truncating. The collector's queries order by
 * `id ASC` / `name ASC`, so a plain slice hands the model the OLDEST rows and
 * it then writes confident prose about "the inventory".
 *
 * Copies rather than sorting in place: these arrays are the live section
 * objects the renderers also consume. Sort is stable, so rows carrying
 * neither a level nor a deadline keep their original query order.
 */
function rankByMateriality<T>(arr: T[]): T[] {
  return [...arr].sort((a, b) => levelOf(a) - levelOf(b) || dateOf(a) - dateOf(b));
}

/**
 * Ranks obj[field], truncates it to max items and, only when items were
 * actually dropped, stamps a sibling `_<field>Truncated` count on obj. Used
 * for every capped array — the top-level ones (risks, controls, vendors,
 * models, records, policies, incidents) and the nested ones (assessment
 * questions, clause/annex sub-items, NIST subcategories) alike, none of which
 * have a total-count field of their own to signal truncation to the model
 * (Fix 5 — silent truncation reads as "complete").
 */
function truncateWithStamp(obj: any, field: string, max: number): any[] {
  const original = obj[field];
  if (!Array.isArray(original)) return [];
  const truncated = rankByMateriality(original).slice(0, max);
  if (truncated.length < original.length) {
    obj[`_${field}Truncated`] = `showing ${truncated.length} of ${original.length}`;
  }
  return truncated;
}
```

3b. In the same file, switch the seven `truncateArray` call sites inside `prepareSectionData` to `truncateWithStamp` — lines 70, 73, 114, 117, 120, 123, 126:

```ts
    case "projectRisks":
    case "vendorRisks":
    case "modelRisks":
      clone.risks = truncateWithStamp(clone, "risks", MAX_DATA_ITEMS);
      break;
    case "compliance":
      clone.controls = truncateWithStamp(clone, "controls", MAX_DATA_ITEMS);
      break;
```

```ts
    case "vendors":
      clone.vendors = truncateWithStamp(clone, "vendors", MAX_DATA_ITEMS);
      break;
    case "models":
      clone.models = truncateWithStamp(clone, "models", MAX_DATA_ITEMS);
      break;
    case "trainingRegistry":
      clone.records = truncateWithStamp(clone, "records", MAX_DATA_ITEMS);
      break;
    case "policyManager":
      clone.policies = truncateWithStamp(clone, "policies", MAX_DATA_ITEMS);
      break;
    case "incidentManagement":
      clone.incidents = truncateWithStamp(clone, "incidents", MAX_DATA_ITEMS);
      break;
```

`truncateArray` now has no callers and is deleted by 3a; `noUnusedLocals` would fail the build if it were left behind.

The four existing nested-truncation tests (`registry.test.ts:120-192`) stay green without edits: assessment topics, clauses, annexes and NIST subcategories carry `status`/`progress` but no `riskLevel`/`severity`/`level` and no deadline field, so every row scores `99` / `Infinity` and the stable sort preserves query order. Do not "fix" them.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts services/reporting/analyzers/__tests__/sectionSummaries.test.ts`

Expected: PASS — both suites. `sectionSummaries.test.ts` shares `prepareSectionData` and must stay green.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/prompts.ts \
        Servers/services/reporting/analyzers/__tests__/registry.test.ts
git commit -m "$(cat <<'EOF'
fix(reporting): stamp truncated section arrays and rank before slicing

truncateArray dropped items silently while its sibling truncateWithStamp
stamped "showing N of M" — a silently cut array reads to the model as a
complete set. Fold the two into one helper so every capped array is stamped.

The underlying queries order by id ASC / name ASC, so the slice was handing
the model the oldest 50 rows. Rank by level, then by deadline, before
truncating. Stable sort: rows with neither keep query order.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

> **Seam note for Phase 2 (binding, ruling R4).** `LEVEL_RANK` stays in
> `prompts.ts` with lower-index-is-more-material, exactly as written above.
> `facts.ts` must NOT introduce a second `LEVEL_RANK`: its inverted map
> (higher-is-more-material, sorted `b - a`) is named `MATERIALITY_SCORE` and
> carries a comment naming this sibling and the inverted polarity, so nobody
> copies one helper into the other and silently reverses "most material".
> Do not add a forward reference here — `facts.ts` does not exist until
> Phase 2, and the comment belongs on the newer of the two.

---

### Task 4: Give `generateObjectWithSelfCorrection` an optional per-attempt timeout

**Files:**
- Modify: `Servers/advisor/llmSelfCorrect.ts` — `SelfCorrectingParams` (lines 41-66; insert between `innerMaxRetries` on line 58 and the `extra` doc block starting line 59)
- Modify: `Servers/advisor/llmSelfCorrect.ts:251-262` (inner call params, inside the retry loop opened at line 249)
- Test: `Servers/advisor/__tests__/llmSelfCorrect.test.ts`

- [ ] **Step 1: Write the failing test**

In `Servers/advisor/__tests__/llmSelfCorrect.test.ts`, add these three tests at the end of the `describe("llmSelfCorrect / generateObjectWithSelfCorrection", ...)` block — immediately after the `it("temperature defaults to 0", ...)` test (lines 279-291) and before that describe's closing `});` on line 292:

```ts
  it("omits abortSignal entirely when timeoutMs is absent (existing callers unchanged)", async () => {
    let captured: Record<string, unknown> | null = null;
    const mock: GenerateObjectImpl = (async (p: Record<string, unknown>) => {
      captured = p;
      return { object: { name: "Erin", count: 1 } };
    }) as unknown as GenerateObjectImpl;

    await generateObjectWithSelfCorrection<Sample>(
      { model: {}, schema: sampleSchema, system: "s", prompt: "p" },
      mock,
    );
    expect(captured).not.toBeNull();
    expect(Object.keys(captured!)).not.toContain("abortSignal");
  });

  it("gives every attempt its OWN timeout signal when timeoutMs is set", async () => {
    const calls: Array<Record<string, unknown>> = [];
    let invocation = 0;
    const mock: GenerateObjectImpl = (async (p: Record<string, unknown>) => {
      calls.push(p);
      invocation += 1;
      if (invocation === 1) throw makeZodError("name", "too short");
      return { object: { name: "Frank", count: 1 } };
    }) as unknown as GenerateObjectImpl;

    const result = await generateObjectWithSelfCorrection<Sample>(
      { model: {}, schema: sampleSchema, system: "s", prompt: "p", timeoutMs: 1000 },
      mock,
    );

    expect(result.attempts).toBe(2);
    expect(calls[0].abortSignal).toBeInstanceOf(AbortSignal);
    expect(calls[1].abortSignal).toBeInstanceOf(AbortSignal);
    // One shared signal IS the bug: the retry inherits whatever is left of
    // the first attempt's budget, so a slow first call aborts the correction.
    expect(calls[0].abortSignal).not.toBe(calls[1].abortSignal);
  });

  it("timeoutMs wins over an abortSignal smuggled in through extra", async () => {
    const stale = AbortSignal.timeout(5000);
    let captured: Record<string, unknown> | null = null;
    const mock: GenerateObjectImpl = (async (p: Record<string, unknown>) => {
      captured = p;
      return { object: { name: "Gina", count: 1 } };
    }) as unknown as GenerateObjectImpl;

    await generateObjectWithSelfCorrection<Sample>(
      {
        model: {},
        schema: sampleSchema,
        system: "s",
        prompt: "p",
        timeoutMs: 1000,
        extra: { abortSignal: stale },
      },
      mock,
    );
    expect(captured!.abortSignal).toBeInstanceOf(AbortSignal);
    expect(captured!.abortSignal).not.toBe(stale);
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- advisor/__tests__/llmSelfCorrect.test.ts`

Expected: FAIL — `expect(calls[0].abortSignal).toBeInstanceOf(AbortSignal)` receives `undefined`: `SelfCorrectingParams` has no `timeoutMs`, so the value is ignored and no signal is ever constructed. (The first test passes already; it is the regression guard for the absent-`timeoutMs` path.)

- [ ] **Step 3: Implement**

3a. In `Servers/advisor/llmSelfCorrect.ts`, add the field to `SelfCorrectingParams`, between `innerMaxRetries` (line 58) and the `extra` doc block (line 59):

```ts
  /**
   * Forwarded to the underlying SDK for transport-level retries
   * (network / rate-limit). Independent from self-correction.
   */
  innerMaxRetries?: number;
  /**
   * When set, each attempt gets its OWN AbortSignal.timeout(timeoutMs).
   * When absent, behaviour is unchanged (existing callers keep working).
   */
  timeoutMs?: number;
```

3b. Replace the inner call params (lines 251-262) so a fresh signal is built per iteration of the retry loop:

```ts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callParams: any = {
        ...(params.extra ?? {}),
        model,
        // The runtime SDK accepts Zod schemas directly; the type is
        // intentionally loose here to avoid pinning to one SDK version.
        schema: params.schema,
        system: augmentedSystem,
        prompt: params.prompt,
        temperature: params.temperature ?? 0,
        maxRetries: innerMaxRetries,
        // Constructed INSIDE the loop, deliberately: a signal built once by
        // the caller and spread in from `extra` covers the first attempt and
        // every self-correction with one shared budget, so a slow first call
        // leaves the correction no time at all. Spread last so it also wins
        // over any abortSignal a caller left in `extra`.
        ...(params.timeoutMs ? { abortSignal: AbortSignal.timeout(params.timeoutMs) } : {}),
      };
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- advisor/__tests__/llmSelfCorrect.test.ts`

Expected: PASS — including the pre-existing `it("forwards extra params (like maxOutputTokens) to the inner call", ...)` at lines 257-277, which must stay green: `extra` is still spread first and unfiltered.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/advisor/llmSelfCorrect.ts \
        Servers/advisor/__tests__/llmSelfCorrect.test.ts
git commit -m "$(cat <<'EOF'
feat(advisor): optional per-attempt timeout for generateObjectWithSelfCorrection

A caller-built AbortSignal spread in through params.extra is one object
shared by the first attempt and every self-correction, so a slow first call
leaves the retry no budget. Add an optional timeoutMs and construct a fresh
AbortSignal.timeout inside the retry loop. Absent timeoutMs leaves the call
params byte-identical, so the three existing advisor callers are untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Move the reporting analyzers onto a 60s per-attempt budget

**Files:**
- Modify: `Servers/services/reporting/analyzers/runAnalyzers.ts:142-143` (`LLM_TIMEOUT_MS`)
- Modify: `Servers/services/reporting/analyzers/runAnalyzers.ts:206-213` (the `generateObjectWithSelfCorrection` call)
- Test: `Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts:122-128`

- [ ] **Step 1: Write the failing test**

Replace the test at `runAnalyzers.test.ts:122-128`:

```ts
  it("bounds each call with a timeout and a single self-correction retry", async () => {
    await runAnalyzers({ reportData, llmKey, blocks: only("riskAnalysis") });

    const params = mockGenerate.mock.calls[0][0];
    expect(params.maxSelfCorrectionAttempts).toBe(1);
    expect(params.extra?.abortSignal).toBeInstanceOf(AbortSignal);
  });
```

with:

```ts
  it("bounds each ATTEMPT with its own 60s timeout and a single self-correction retry", async () => {
    await runAnalyzers({ reportData, llmKey, blocks: only("riskAnalysis") });

    const params = mockGenerate.mock.calls[0][0];
    expect(params.maxSelfCorrectionAttempts).toBe(1);
    // timeoutMs, not extra.abortSignal: one pre-built signal is shared by the
    // first call and its retry, so a deeper (slower) analysis aborts and
    // degrades into a generic abstention.
    expect(params.timeoutMs).toBe(60_000);
    expect(params.extra).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/runAnalyzers.test.ts`

Expected: FAIL — `expect(params.timeoutMs).toBe(60000)` receives `undefined`, and `expect(params.extra).toBeUndefined()` receives `{ abortSignal: AbortSignal {} }`.

- [ ] **Step 3: Implement**

3a. In `Servers/services/reporting/analyzers/runAnalyzers.ts`, replace the constant and its comment (lines 142-143):

```ts
/**
 * Per-ATTEMPT budget — llmSelfCorrect builds a fresh AbortSignal.timeout for
 * each attempt from this, rather than one signal shared by the first call and
 * its self-correction. Doubled from aiSummarizer's 30s because an abort here
 * is not a retry, it is a generic abstention in a regulator-facing artifact.
 */
const LLM_TIMEOUT_MS = 60_000;
```

3b. Replace the call at lines 206-213:

```ts
    const result = await generateObjectWithSelfCorrection({
      model,
      schema: def.schema,
      system: def.buildSystemPrompt(),
      prompt: userPrompt,
      maxSelfCorrectionAttempts: 1,
      timeoutMs: LLM_TIMEOUT_MS,
    });
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/runAnalyzers.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/runAnalyzers.ts \
        Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts
git commit -m "$(cat <<'EOF'
fix(reporting): per-attempt 60s analyzer timeout instead of a shared 30s one

The analyzers built one AbortSignal.timeout(30_000) per analyzer and passed
it through extra, where llmSelfCorrect spread the same object into the first
call and every self-correction — one budget for both. Pass timeoutMs instead
so each attempt gets its own, and double it: an abort here does not retry,
it abstains.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

> **Seam notes for Phase 3 — this task's two assertions are the ones later
> phases must carry forward.**
>
> - **Ruling R1.** `LLM_TIMEOUT_MS = 60_000` and `timeoutMs: LLM_TIMEOUT_MS`
>   are settled here and are NOT to be redeclared, reverted to `30_000`, or
>   moved back into `extra.abortSignal`. Phase 3 Task 49 adds exactly
>   `extra: { maxOutputTokens: ANALYZER_MAX_OUTPUT_TOKENS }` to this call, and
>   in that same task updates `expect(params.extra).toBeUndefined()` above to
>   `expect(params.extra).toEqual({ maxOutputTokens: 2000 })`.
> - **Ruling R12.** `maxSelfCorrectionAttempts` stays at `1` in Phase 1 — a
>   bump buys nothing until the Phase 3 schema fields exist, and would only
>   widen the worst-case latency. Phase 3 raises it to `2` alongside those
>   fields and, in the same task, updates
>   `expect(params.maxSelfCorrectionAttempts).toBe(1)` above to `toBe(2)`.

---

### Task 6: Let the models section supply allowed action owners

**Files:**
- Modify: `Servers/services/reporting/analyzers/collectAnalyzerInputs.ts:184-190` (`collectAllowedOwners` harvest block)
- Test: `Servers/services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`

- [ ] **Step 1: Write the failing test**

In `Servers/services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`, add this test immediately after the existing `it("harvests owner names that actually appear in the report data", ...)` test (lines 98-106):

```ts
  it("harvests owners from the models section — its omission is why every action had a null owner", () => {
    // dataCollector.collectModelsList emits `owner` as a resolved name string
    // (dataCollector.ts:772). Leaving it out meant sanitizeOwners nulled any
    // model owner the analyzer proposed.
    const owners = collectAllowedOwners({
      sections: {
        models: { totalModels: 2, models: [{ id: 1, name: "gpt-4o", owner: "Dana Reed" }, { id: 2, name: "claude" }] },
      },
    } as any);
    expect(owners).toEqual(["Dana Reed"]);
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`

Expected: FAIL — `expect(owners).toEqual(["Dana Reed"])` receives `[]`; `collectAllowedOwners` harvests seven section arrays and `sections.models` is not one of them.

- [ ] **Step 3: Implement**

In `Servers/services/reporting/analyzers/collectAnalyzerInputs.ts`, replace the harvest block (lines 184-190) with:

```ts
  harvest(sections.projectRisks?.risks, ["owner"]);
  harvest(sections.vendorRisks?.risks, ["owner", "actionOwner"]);
  harvest(sections.modelRisks?.risks, ["owner"]);
  harvest(sections.vendors?.vendors, ["assignee", "reviewer"]);
  // The models section was omitted here, which is why every recommended
  // action in the live corpus came back with suggestedOwner: null.
  harvest(sections.models?.models, ["owner"]);
  harvest(sections.compliance?.controls, ["owner", "approver"]);
  harvest(sections.trainingRegistry?.records, ["owner"]);
  harvest(sections.policyManager?.policies, ["owner", "reviewer"]);
```

`sanitizeOwners` is untouched (invariant 2): this widens the allowlist to owners the report data actually names, it does not relax the check.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/collectAnalyzerInputs.ts \
        Servers/services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts
git commit -m "$(cat <<'EOF'
fix(reporting): harvest model owners into allowedOwners

collectAllowedOwners covered seven section arrays but not sections.models,
so sanitizeOwners nulled any model owner an analyzer proposed. Every
recommended action in the live corpus has suggestedOwner: null.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Verify the phase end to end

Scope note: this verifies **Phase 1**, and covers design success criteria 1 and 2 only. Criteria 3-6 (a real run producing ratios/date comparisons/identifiers, the gate's overlap score, `riskAnalysis`/`vendorRisk` producing prose, the rendered PDF/DOCX) cannot be observed until Phases 2-5 land and are owned there; criterion 4's after-the-fact observability is Phase 6's `audit_metadata` write. Do not treat this task as the design's end-to-end check.

**Files:**
- Test: `Servers/services/reporting/tests/dataCollector.spec.ts`
- Test: `Servers/services/reporting/analyzers/__tests__/`
- Test: `Servers/advisor/__tests__/llmSelfCorrect.test.ts`

- [ ] **Step 1: Type-check the whole backend**

Run: `cd Servers && npm run build`

Expected: PASS. The two interface additions (`ModelRisksSectionData`, `ComplianceSectionData`) are what let the new collector fields compile; `noUnusedLocals` is what catches a leftover `truncateArray`.

- [ ] **Step 2: Run every suite this phase touched**

Run:

```bash
cd Servers && npm run test:unit -- services/reporting/tests/dataCollector.spec.ts \
  services/reporting/analyzers/__tests__ \
  advisor/__tests__/llmSelfCorrect.test.ts
```

Expected: PASS. `payloadShape.test.ts`, `schemas.test.ts` and `mapToSummaries.test.ts` must be untouched and green — this phase changes no schema and no payload shape. `runAnalyzers.test.ts`'s three verbatim abstain strings are likewise untouched.

- [ ] **Step 3: Confirm the frontend block-count pins were not disturbed**

Run: `cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler && git diff --name-only 8ac55e1b1..HEAD -- Clients/`

Expected: empty output. Any file listed means a change crept outside the backend, and the seven-`ai_block` contract (`ConfigureReportWizard.test.tsx`, `TemplateBuilder.test.tsx`, `reportTemplateResolver.test.ts`) is at risk.

- [ ] **Step 4: Run the full unit suite once**

Run: `cd Servers && npm run test:unit`

Expected: PASS — no new failures against the pre-phase baseline. Never `npx jest` on anything under `Servers/tests/integration/`.

---

## Phase 2 — Facts substrate, correlation wiring, prompt rewrite

> The 45% + 20% + 10% causes. Largest single quality gain in the design.

### Task 20: Facts substrate — `collectFacts`

**Preconditions (both from Phase 1, which lands first):**
- `Servers/services/reporting/dataCollector.ts` exports `isoDate` (`export const isoDate = ...`, Phase 1 Task 1). This task imports it; there is no second date helper anywhere in the reporting stack.
- `Servers/services/reporting/analyzers/prompts.ts` already holds `LEVEL_RANK` (Phase 1 Task 3), a **sort index where lower is more material**. The map added here is its inverse and is named differently on purpose — see the comment in Step 3.

**Files:**
- Create: `Servers/services/reporting/analyzers/facts.ts`
- Test: `Servers/services/reporting/analyzers/__tests__/facts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// Servers/services/reporting/analyzers/__tests__/facts.test.ts

// facts.ts imports isoDate from dataCollector (one date normalisation for the
// whole report), and dataCollector imports the real sequelize instance at
// module load. Same reason collectAnalyzerInputs.test.ts mocks evidenceAi.utils:
// leaving it unmocked opens a DB connection during a unit test.
jest.mock("../../../../database/db", () => ({ sequelize: {} }));

import { collectFacts, referenceDay } from "../facts";

const reportData: any = {
  metadata: {
    // Built from LOCAL components: isoDate reads local components (it is the
    // same helper that produced every dueDate/reviewDate in this data), so a
    // fixture built this way expects the same day in every timezone the suite
    // runs in.
    generatedAt: new Date(2026, 6, 22, 9, 0, 0),
    frameworkName: "ISO 42001",
    projectTitle: "Acme Corp",
  },
  charts: {
    riskDistribution: [
      { level: "High", count: 2 },
      { level: "Low", count: 1 },
    ],
    complianceProgress: [
      { category: "Governance", completed: 9, total: 10, percentage: 90 },
      { category: "Data", completed: 1, total: 9, percentage: 11 },
    ],
    assessmentStatus: [
      { status: "Answered", count: 4 },
      { status: "Pending", count: 6 },
    ],
  },
  sections: {
    projectRisks: {
      totalRisks: 3,
      risks: [
        { name: "Stale register", riskLevel: "Low", mitigationStatus: "Approved", owner: "Alice" },
        { name: "Unbounded model access", riskLevel: "Critical", mitigationStatus: "Unknown", owner: "Unassigned" },
        { name: "Vendor sprawl", riskLevel: "High", mitigationStatus: "Unknown", owner: "" },
      ],
    },
    policyManager: {
      totalPolicies: 2,
      policies: [
        { policyName: "Acceptable use", status: "Draft", owner: "Bob" },
        { policyName: "Model release", status: "Approved", reviewDate: "1/1/2026", owner: "Bob" },
      ],
    },
  },
};

describe("collectFacts", () => {
  it("§1 — carries the reference day, framework and subject off metadata", () => {
    const facts = collectFacts(reportData);
    expect(facts.generatedAt).toBe("2026-07-22");
    expect(facts.framework).toBe("ISO 42001");
    expect(facts.subject).toBe("Acme Corp");
  });

  it("§1 — falls back rather than throwing when metadata is absent", () => {
    const facts = collectFacts({ sections: {} } as any);
    expect(facts.framework).toBe("AI governance");
    expect(facts.subject).toBe("the organization");
    expect(facts.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(facts.sections).toEqual({});
  });

  it("§1 — copies the aggregates already on the section object and counts the rows", () => {
    const risks = collectFacts(reportData).sections.projectRisks;
    expect(risks.totalRisks).toBe(3);
    expect(risks.items).toBe(3);
  });

  it("§1 — counts rows by enum-ish fields and counts ownerless rows", () => {
    const risks = collectFacts(reportData).sections.projectRisks;
    expect(risks.riskLevel_Critical).toBe(1);
    expect(risks.mitigationStatus_Unknown).toBe(2);
    // "Unassigned" (dataCollector's placeholder) and "" both count as ownerless.
    expect(risks.ownerless).toBe(2);
  });

  it("§1 — the chart rollup overwrites the row-derived bucket rather than duplicating it", () => {
    // charts.riskDistribution is the authoritative whole-set rollup; the rows
    // can be a truncated view of the same register.
    expect(collectFacts(reportData).sections.projectRisks.riskLevel_High).toBe(2);
  });

  it("§1 — surfaces the weakest compliance categories from the discarded chart data", () => {
    const compliance = collectFacts(reportData).sections.compliance;
    expect(compliance.weakestCategory1).toBe("Data 1/9 (11%)");
    expect(compliance.weakestCategory2).toBe("Governance 9/10 (90%)");
  });

  it("§1 — carries the assessment rollup even though no assessment section was collected", () => {
    const assessment = collectFacts(reportData).sections.assessment;
    expect(assessment.questions_Answered).toBe(4);
    expect(assessment.questions_Pending).toBe(6);
  });

  it("§1 — ranks by materiality BEFORE truncating, and stamps what it dropped", () => {
    const risks = Array.from({ length: 10 }, (_, i) => ({
      name: `R${i}`,
      riskLevel: "Low",
      mitigationStatus: "Approved",
      owner: "Alice",
    }));
    risks[9] = {
      name: "Critical late arrival",
      riskLevel: "Critical",
      mitigationStatus: "Unknown",
      owner: "Alice",
    };

    const facts = collectFacts({
      metadata: reportData.metadata,
      charts: {},
      sections: { projectRisks: { totalRisks: 10, risks } },
    } as any);

    // Ordered last by id, first by materiality. This is the whole point of the
    // ranking: the underlying queries order by id ASC.
    expect(String(facts.sections.projectRisks.top1)).toContain("Critical late arrival");
    expect(facts.sections.projectRisks.top_showing).toBe("showing 3 of 10");
  });

  it("§1 — ranks the policy with no review date above the one that has one", () => {
    const policies = collectFacts(reportData).sections.policyManager;
    expect(String(policies.top1)).toContain("Acceptable use");
    expect(policies.status_Draft).toBe(1);
    expect(policies.ownerless).toBe(0);
  });

  it("§1 — flattens clauses, sub-clauses and annex controls into one status set", () => {
    const facts = collectFacts({
      metadata: reportData.metadata,
      charts: {},
      sections: {
        clausesAndAnnexes: {
          clauses: [
            {
              clauseId: "4.1",
              title: "Context",
              status: "Done",
              subClauses: [{ title: "Scope", status: "Waiting" }],
            },
          ],
          annexes: [
            { annexId: "A.2", controls: [{ controlId: "A.2.1", title: "Policy", status: "Waiting" }] },
          ],
        },
      },
    } as any);

    const ca = facts.sections.clausesAndAnnexes;
    expect(ca.items).toBe(3);
    expect(ca.status_Waiting).toBe(2);
    expect(ca.status_Done).toBe(1);
    expect(String(ca.top1)).toContain("Waiting");
  });

  it("§1 — keeps a present-but-empty section as an explicit zero, and omits an absent one", () => {
    const facts = collectFacts({
      metadata: reportData.metadata,
      charts: {},
      sections: { vendors: { totalVendors: 0, vendors: [] } },
    } as any);
    expect(facts.sections.vendors).toEqual({ totalVendors: 0, items: 0, ownerless: 0 });
    expect(facts.sections.models).toBeUndefined();
  });

  it("§1 — referenceDay is the one shared date normalisation, and falls back to today", () => {
    // A one-line wrapper over dataCollector's isoDate — the SAME helper that
    // produced every dueDate/reviewDate the model is asked to compare against.
    expect(referenceDay(new Date(2026, 6, 22, 9, 0, 0))).toBe("2026-07-22");
    expect(referenceDay("2026-07-22T09:00:00.000Z")).toBe("2026-07-22");
    expect(referenceDay(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/facts.test.ts`
Expected: FAIL — `Cannot find module '../facts' from 'services/reporting/analyzers/__tests__/facts.test.ts'`

- [ ] **Step 3: Implement**

```ts
// Servers/services/reporting/analyzers/facts.ts
/**
 * Deterministic facts substrate for the report analyzers (design §1).
 *
 * No LLM, no database: every value here is computed from ReportData, so it
 * cannot be hallucinated. Because it names identifiers it also STRENGTHENS
 * sanitizeProvenance — a control id or vendor name the model cites is now
 * present in the prompt that guard checks it against, where today it is
 * dropped for being absent.
 */
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import { isoDate } from "../dataCollector";

/** Structured, storable snapshot. Persisted to report_run_analyses.audit_metadata
 *  so a later run can diff against it without a second LLM call. */
export interface FactsSnapshot {
  /** The report's reference DAY, `YYYY-MM-DD`. Day granularity on purpose:
   *  every date the collector emits is day-granular, and every comparison the
   *  model is asked to make against this value is a day comparison. */
  generatedAt: string;
  framework: string;
  subject: string;
  /** section key -> flat map of aggregate name to value. Flat on purpose: a
   *  flat map diffs numerically without a tree walk. */
  sections: Record<string, Record<string, number | string>>;
}

type Agg = Record<string, number | string>;

/** Ranked items kept per section. The block's ceiling is TOP_N x
 *  MAX_LABEL_CHARS per section; a typical six-section report renders near
 *  2,000 characters against the 60,000-character prompt budget.
 *  ponytail: fixed N, not a per-section knob. Tune here if a section needs more. */
const TOP_N = 3;
const MAX_LABEL_CHARS = 80;
/** A field with more distinct values than this is a name column, not an enum —
 *  keep the heaviest buckets and drop the tail rather than blow the budget. */
const MAX_BUCKETS = 8;

/**
 * Materiality of the level/severity vocabularies, HIGHER IS MORE MATERIAL.
 *
 * Deliberately NOT named LEVEL_RANK: `prompts.ts` in this same directory has a
 * `LEVEL_RANK` with the opposite polarity (a sort index where LOWER is more
 * material). Two maps, two polarities, one directory — copying a helper from
 * one file into the other silently reverses "most material", which is exactly
 * the failure §9 exists to fix.
 */
const MATERIALITY_SCORE: Record<string, number> = {
  critical: 5,
  "very high": 4,
  high: 3,
  medium: 2,
  low: 1,
  "very low": 0,
};

const text = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : "unset";
};

/** True for the placeholders dataCollector writes when a lookup found nobody. */
const missing = (v: unknown): boolean => {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "" || s === "unassigned" || s === "unknown" || s === "undefined" || s === "null";
};

const materialityScore = (v: unknown): number =>
  MATERIALITY_SCORE[
    String(v ?? "")
      .trim()
      .toLowerCase()
  ] ?? 0;

/** dataCollector treats "Done" as the completed state (dataCollector.ts:382, :609). */
const incomplete = (v: unknown): number =>
  String(v ?? "")
    .trim()
    .toLowerCase() === "done"
    ? 0
    : 1;

/**
 * The report's reference day, `YYYY-MM-DD`.
 *
 * One line over dataCollector's isoDate, which is the SAME helper that
 * produced every dueDate, reviewDate and targetDate in this report. That is
 * the point: isoDate builds from LOCAL components, so a locally-midnight due
 * date and this "today" are on the same calendar. A second normalisation via
 * toISOString() would put them a day apart west of Greenwich — on the one
 * comparison §3 exists to enable.
 *
 * Exported: Stage 1 (sectionSummaries) needs the same "today" the facts block
 * declares. This is a fourth export beyond the three the contract froze, and
 * it is deliberate — the alternative is two date helpers.
 */
export const referenceDay = (value: unknown): string => isoDate(value) ?? isoDate(new Date())!;

interface SectionSpec {
  /** The rows to aggregate, flattened here for the nested sections. */
  rows: (section: any) => any[];
  /** Numeric fields already sitting on the section object — copied, never recomputed. */
  totals?: string[];
  /** Row fields to bucket by value. */
  counts?: string[];
  /** Row field carrying an owner; rows missing it are counted as ownerless. */
  owner?: string;
  /** Higher = more material. Applied BEFORE truncation, so the top-N is the
   *  worst N rather than the oldest N — the queries order by id/name ASC. */
  rank?: (row: any) => number;
  label: (row: any) => string;
}

const SPECS: Record<string, SectionSpec> = {
  projectRisks: {
    rows: (s) => s.risks ?? [],
    totals: ["totalRisks"],
    counts: ["riskLevel", "mitigationStatus"],
    owner: "owner",
    rank: (r) => materialityScore(r.riskLevel),
    label: (r) =>
      `${text(r.name)} (${text(r.riskLevel)}, ${text(r.mitigationStatus)}, owner ${text(r.owner)})`,
  },
  vendorRisks: {
    rows: (s) => s.risks ?? [],
    totals: ["totalRisks"],
    counts: ["riskLevel"],
    owner: "actionOwner",
    rank: (r) => materialityScore(r.riskLevel),
    label: (r) =>
      `${text(r.riskName)} (${text(r.vendorName)}, ${text(r.riskLevel)}, owner ${text(r.actionOwner)})`,
  },
  modelRisks: {
    rows: (s) => s.risks ?? [],
    totals: ["totalRisks"],
    counts: ["riskLevel", "mitigationStatus"],
    rank: (r) => materialityScore(r.riskLevel),
    label: (r) =>
      `${text(r.riskName)} (${text(r.modelName)}, ${text(r.riskLevel)}, ${text(r.mitigationStatus)})`,
  },
  compliance: {
    rows: (s) => s.controls ?? [],
    totals: ["totalControls", "completedControls", "overallProgress"],
    counts: ["status"],
    owner: "owner",
    rank: (r) => incomplete(r.status),
    label: (r) => `${text(r.controlId)} ${text(r.title)} (${text(r.status)}, owner ${text(r.owner)})`,
  },
  assessment: {
    rows: (s) => s.topics ?? [],
    totals: ["totalQuestions", "answeredQuestions"],
    rank: (r) => 100 - (typeof r.progress === "number" ? r.progress : 0),
    label: (r) => `${text(r.title)} (${typeof r.progress === "number" ? r.progress : 0}% answered)`,
  },
  clausesAndAnnexes: {
    // One flat row set: the statuses that matter live on the leaves.
    rows: (s) => [
      ...(s.clauses ?? []).map((c: any) => ({
        _id: text(c.clauseId),
        _title: text(c.title),
        status: c.status,
      })),
      ...(s.clauses ?? []).flatMap((c: any) =>
        (c.subClauses ?? []).map((sc: any) => ({
          _id: text(c.clauseId),
          _title: text(sc.title),
          status: sc.status,
        })),
      ),
      ...(s.annexes ?? []).flatMap((a: any) =>
        (a.controls ?? []).map((ac: any) => ({
          _id: text(ac.controlId),
          _title: text(ac.title),
          status: ac.status,
        })),
      ),
    ],
    counts: ["status"],
    rank: (r) => incomplete(r.status),
    label: (r) => `${r._id} ${r._title} (${text(r.status)})`,
  },
  nistSubcategories: {
    rows: (s) =>
      (s.functions ?? []).flatMap((f: any) =>
        (f.categories ?? []).flatMap((c: any) =>
          (c.subcategories ?? []).map((sub: any) => ({ ...sub, _fn: text(f.name) })),
        ),
      ),
    counts: ["status", "_fn"],
    rank: (r) => incomplete(r.status),
    label: (r) =>
      `${text(r.subcategoryId)} (${r._fn}, ${text(r.status)}, ${(r.risks ?? []).length} linked risks)`,
  },
  vendors: {
    rows: (s) => s.vendors ?? [],
    totals: ["totalVendors"],
    counts: ["riskStatus"],
    owner: "assignee",
    rank: (r) => (missing(r.assignee) ? 1 : 0),
    label: (r) => `${text(r.name)} (${text(r.riskStatus)}, assignee ${text(r.assignee)})`,
  },
  models: {
    rows: (s) => s.models ?? [],
    totals: ["totalModels"],
    // owner is bucketed deliberately: "all 25 models are owned by one person"
    // is a finding, and MAX_BUCKETS bounds the cost of a high-cardinality column.
    counts: ["status", "owner"],
    owner: "owner",
    rank: (r) => (missing(r.owner) ? 1 : 0),
    label: (r) => `${text(r.name)} ${text(r.version)} (${text(r.status)}, owner ${text(r.owner)})`,
  },
  trainingRegistry: {
    rows: (s) => s.records ?? [],
    totals: ["totalRecords"],
    counts: ["status"],
    owner: "assignee",
    rank: (r) => incomplete(r.status),
    label: (r) => `${text(r.trainingName)} (${text(r.status)}, completed ${text(r.completionDate)})`,
  },
  policyManager: {
    rows: (s) => s.policies ?? [],
    totals: ["totalPolicies"],
    counts: ["status"],
    owner: "owner",
    rank: (r) => (missing(r.reviewDate) ? 1 : 0),
    label: (r) =>
      `${text(r.policyName)} (${text(r.status)}, review ${text(r.reviewDate)}, owner ${text(r.owner)})`,
  },
  incidentManagement: {
    rows: (s) => s.incidents ?? [],
    totals: ["totalIncidents"],
    counts: ["severity", "status"],
    owner: "assignee",
    rank: (r) => materialityScore(r.severity),
    label: (r) =>
      `${text(r.incidentId)} ${text(r.type)} (${text(r.severity)}, ${text(r.status)}, reported ${text(r.reportedDate)})`,
  },
};

export function collectFacts(reportData: ReportData): FactsSnapshot {
  const meta: any = reportData?.metadata ?? {};
  const sections: Record<string, Agg> = {};

  const put = (key: string, name: string, value: number | string) => {
    if (!sections[key]) sections[key] = {};
    sections[key][name] = value;
  };

  for (const key of Object.keys(SPECS)) {
    const data: any = (reportData?.sections as any)?.[key];
    if (!data) continue;
    const spec = SPECS[key];
    const rows: any[] = (spec.rows(data) ?? []).filter(Boolean);

    for (const field of spec.totals ?? []) {
      if (typeof data[field] === "number") put(key, field, data[field]);
    }
    // Kept alongside the collector's own total on purpose: when the two
    // disagree, rows were dropped somewhere and the model can see that.
    put(key, "items", rows.length);

    for (const field of spec.counts ?? []) {
      const buckets: Record<string, number> = {};
      rows.forEach((row) => {
        const bucket = text(row?.[field]);
        buckets[bucket] = (buckets[bucket] ?? 0) + 1;
      });
      Object.entries(buckets)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_BUCKETS)
        .forEach(([bucket, count]) => put(key, `${field}_${bucket}`, count));
    }

    const ownerField = spec.owner;
    if (ownerField) {
      put(key, "ownerless", rows.filter((row) => missing(row?.[ownerField])).length);
    }

    const rank = spec.rank;
    const ranked = rank ? [...rows].sort((a, b) => rank(b) - rank(a)) : rows;
    ranked
      .slice(0, TOP_N)
      .forEach((row, i) => put(key, `top${i + 1}`, spec.label(row).slice(0, MAX_LABEL_CHARS)));
    if (rows.length > TOP_N) put(key, "top_showing", `showing ${TOP_N} of ${rows.length}`);
  }

  // The three rollups collectChartData already computed (dataCollector.ts:111)
  // and which were then discarded before any analyzer ran. No recomputation.
  const charts: any = reportData?.charts ?? {};
  // Same key namespace as the row-derived buckets on purpose: the chart is the
  // authoritative whole-set rollup, so it overwrites rather than duplicating.
  (charts.riskDistribution ?? []).forEach((d: any) =>
    put("projectRisks", `riskLevel_${text(d?.level)}`, Number(d?.count) || 0),
  );
  const progress = [...(charts.complianceProgress ?? [])].sort(
    (a: any, b: any) => (a?.percentage ?? 0) - (b?.percentage ?? 0),
  );
  progress
    .slice(0, TOP_N)
    .forEach((c: any, i: number) =>
      put(
        "compliance",
        `weakestCategory${i + 1}`,
        `${text(c?.category)} ${c?.completed ?? 0}/${c?.total ?? 0} (${c?.percentage ?? 0}%)`,
      ),
    );
  if (progress.length > TOP_N) {
    put("compliance", "weakestCategory_showing", `showing ${TOP_N} of ${progress.length}`);
  }
  (charts.assessmentStatus ?? []).forEach((a: any) =>
    put("assessment", `questions_${text(a?.status)}`, Number(a?.count) || 0),
  );

  return {
    generatedAt: referenceDay(meta.generatedAt),
    framework: meta.frameworkName ?? "AI governance",
    subject: meta.projectTitle ?? "the organization",
    sections,
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/facts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/facts.ts \
        Servers/services/reporting/analyzers/__tests__/facts.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): deterministic facts substrate for the analyzers

collectFacts turns ReportData into a flat, storable snapshot: the reference
day, the per-section aggregates the collector already computed, the three
chart rollups that were discarded before any analyzer ran, and a materiality-
ranked top-3 per section with an explicit truncation stamp. Ranking happens
before truncation — the underlying queries order by id ASC, so the old
behaviour showed the model the oldest rows and called it the inventory.

The reference day comes from dataCollector's isoDate, the same helper that
produced every due date in the data, so the model compares two dates on one
calendar rather than a local-midnight date against a UTC-sliced today.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: Facts substrate — `renderFacts` and the prior-run delta

**Files:**
- Modify: `Servers/services/reporting/analyzers/facts.ts` (extend the import block at the top; append `renderFacts` and `changedAggregates` at the end)
- Test: `Servers/services/reporting/analyzers/__tests__/facts.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `Servers/services/reporting/analyzers/__tests__/facts.test.ts`, and extend the `../facts` import to `import { collectFacts, referenceDay, renderFacts, type FactsSnapshot } from "../facts";`:

```ts
describe("renderFacts", () => {
  it("§1 — leads with the reference date, framework and subject", () => {
    const out = renderFacts(collectFacts(reportData));
    expect(out).toContain("Reference date: 2026-07-22");
    expect(out).toContain("Framework: ISO 42001");
    expect(out).toContain("Subject: Acme Corp");
  });

  it("§1 — renders one labelled line per section, numbers bare and strings quoted", () => {
    const out = renderFacts(collectFacts(reportData));
    expect(out).toContain("[Use Case Risks] totalRisks=3;");
    expect(out).toContain("[Policy Manager]");
    expect(out).toContain('top1="Acceptable use (Draft, review unset, owner Bob)"');
    // The raw section key must not leak in place of the human label.
    expect(out).not.toContain("[projectRisks]");
  });

  it("§1 — emits no change block when there is no prior snapshot", () => {
    expect(renderFacts(collectFacts(reportData))).not.toContain("Change since");
    expect(renderFacts(collectFacts(reportData), null)).not.toContain("Change since");
  });

  it("§10 — emits one delta line per changed numeric aggregate, signed", () => {
    const prior: FactsSnapshot = {
      // A snapshot stored before this change carries a full ISO timestamp;
      // one stored after carries a day. The header handles both.
      generatedAt: "2026-06-22T09:00:00.000Z",
      framework: "ISO 42001",
      subject: "Acme Corp",
      sections: {
        projectRisks: { totalRisks: 1, items: 1, ownerless: 5, top1: "something else entirely" },
      },
    };

    const out = renderFacts(collectFacts(reportData), prior);
    const deltaBlock = out.split("Change since the previous report run")[1];

    expect(out).toContain("Change since the previous report run (2026-06-22):");
    expect(deltaBlock).toContain("Use Case Risks totalRisks: 3 (was 1, +2)");
    expect(deltaBlock).toContain("Use Case Risks ownerless: 2 (was 5, -3)");
    // Labels churn between runs without the estate changing; only numbers diff.
    expect(deltaBlock).not.toContain("top1");
    // An aggregate the prior run did not record is not a change.
    expect(deltaBlock).not.toContain("riskLevel_Critical");
  });

  it("§10 — an unchanged estate produces no change block at all", () => {
    const snapshot = collectFacts(reportData);
    expect(renderFacts(snapshot, snapshot)).not.toContain("Change since");
  });

  it("§1 — stays inside its prompt budget for a full eight-section estate", () => {
    const rows = (n: number, make: (i: number) => any) => Array.from({ length: n }, (_, i) => make(i));
    const full: any = {
      metadata: reportData.metadata,
      charts: {},
      sections: {
        projectRisks: {
          totalRisks: 60,
          risks: rows(60, (i) => ({ name: `Risk ${i}`, riskLevel: "High", mitigationStatus: "Unknown", owner: "Alice" })),
        },
        vendorRisks: {
          totalRisks: 40,
          risks: rows(40, (i) => ({ riskName: `VR ${i}`, vendorName: `Vendor ${i}`, riskLevel: "Medium" })),
        },
        modelRisks: {
          totalRisks: 30,
          risks: rows(30, (i) => ({ riskName: `MR ${i}`, modelName: `Model ${i}`, riskLevel: "Low", mitigationStatus: "Unknown" })),
        },
        compliance: {
          totalControls: 80,
          completedControls: 20,
          overallProgress: 25,
          controls: rows(80, (i) => ({ controlId: `C-${i}`, title: `Control ${i}`, status: "Waiting", owner: "" })),
        },
        vendors: {
          totalVendors: 25,
          vendors: rows(25, (i) => ({ name: `Vendor ${i}`, riskStatus: "Not started", assignee: "" })),
        },
        models: {
          totalModels: 25,
          models: rows(25, (i) => ({ name: `Model ${i}`, version: "1.0", status: "Approved", owner: "Alice" })),
        },
        policyManager: {
          totalPolicies: 20,
          policies: rows(20, (i) => ({ policyName: `Policy ${i}`, status: "Draft", owner: "Bob" })),
        },
        incidentManagement: {
          totalIncidents: 12,
          incidents: rows(12, (i) => ({ incidentId: `INC-${i}`, type: "Outage", severity: "High", status: "Open", reportedDate: "1/2/2026" })),
        },
      },
    };

    const out = renderFacts(collectFacts(full));
    expect(out.length).toBeLessThan(3000);
    expect(out).toContain('top_showing="showing 3 of 60"');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/facts.test.ts`
Expected: FAIL — `TypeError: (0 , facts_1.renderFacts) is not a function` (the `renderFacts` export does not exist yet).

- [ ] **Step 3: Implement**

Extend the import block at the top of `Servers/services/reporting/analyzers/facts.ts` from:

```ts
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import { isoDate } from "../dataCollector";
```

to:

```ts
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import { isoDate } from "../dataCollector";
import { SECTION_LABELS } from "./prompts";
```

Then append to the end of the file:

```ts
/** Prompt-ready text. `prior` renders a delta line per changed aggregate. */
export function renderFacts(facts: FactsSnapshot, prior?: FactsSnapshot | null): string {
  const lines: string[] = [
    `Reference date: ${facts.generatedAt} — treat this as today when comparing any date below.`,
    `Framework: ${facts.framework}`,
    `Subject: ${facts.subject}`,
    "",
    "Estate facts (computed directly from this report's own data — ratios, shares and differences over these values are yours to draw):",
  ];

  Object.keys(facts.sections).forEach((key) => {
    const body = Object.entries(facts.sections[key])
      .map(([name, value]) => (typeof value === "number" ? `${name}=${value}` : `${name}="${value}"`))
      .join("; ");
    if (body) lines.push(`[${SECTION_LABELS[key] || key}] ${body}`);
  });

  const deltas = changedAggregates(facts, prior);
  if (deltas.length > 0 && prior) {
    lines.push(
      "",
      // slice(0, 10) is a no-op for a snapshot written by collectFacts and
      // tolerates one persisted before generatedAt became day-granular.
      `Change since the previous report run (${prior.generatedAt.slice(0, 10)}):`,
      ...deltas,
    );
  }

  return lines.join("\n");
}

/**
 * One line per changed NUMERIC aggregate.
 *
 * ponytail: numbers only. The top-N labels churn between runs without the
 * estate having changed, so diffing them would bury the signal in noise. An
 * aggregate the prior snapshot never recorded is not reported as a change —
 * the facts block above already shows it.
 */
function changedAggregates(facts: FactsSnapshot, prior?: FactsSnapshot | null): string[] {
  if (!prior?.sections) return [];
  const out: string[] = [];
  Object.keys(facts.sections).forEach((key) => {
    const before = prior.sections[key] ?? {};
    Object.entries(facts.sections[key]).forEach(([name, value]) => {
      const was = before[name];
      if (typeof value !== "number" || typeof was !== "number" || was === value) return;
      const delta = value - was;
      out.push(
        `${SECTION_LABELS[key] || key} ${name}: ${value} (was ${was}, ${delta > 0 ? "+" : ""}${delta})`,
      );
    });
  });
  return out;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/facts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/facts.ts \
        Servers/services/reporting/analyzers/__tests__/facts.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): render the facts snapshot for the prompt, with run-over-run deltas

renderFacts turns the snapshot into one labelled line per section and, when a
prior snapshot is supplied, a signed delta line per changed numeric aggregate.
Nothing supplies `prior` yet — that is the §10 phase — but the parameter and
the delta rendering work and are tested now so the later phase is a wiring
change rather than a design change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: `GROUNDING_RULES` gains the arithmetic carve-out

**Files:**
- Modify: `Servers/services/reporting/analyzers/prompts.ts` — the whole `GROUNDING_RULES` template literal, from `/** Shared anti-fabrication preamble applied to every analyzer. */` to the closing backtick after `- Write in professional third-person tone.` (last block in the file). No line numbers: Phase 1 Task 3 rewrites `prompts.ts:34-54` and shifts everything below it.
- Test: `Servers/services/reporting/analyzers/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Change line 2 of `Servers/services/reporting/analyzers/__tests__/registry.test.ts` from:

```ts
import { prepareSectionData, renderSections, SECTION_LABELS } from "../prompts";
```

to:

```ts
import { GROUNDING_RULES, prepareSectionData, renderSections, SECTION_LABELS } from "../prompts";
```

and add this test directly after the `"keeps the twelve human-readable section labels"` test (currently lines 57-60):

```ts
  it("§3 — grounding rules permit arithmetic over supplied values without loosening the ban on invented ones", () => {
    // The live corpus contains not one percentage, not one date comparison and
    // not one ratio: taken literally, "never introduce a number that does not
    // appear in the data" forbids dividing two numbers that do.
    expect(GROUNDING_RULES).toContain("Compute ratios, percentages, shares, counts and differences");
    expect(GROUNDING_RULES).toContain("compare any date in the data against the supplied reference date");
    expect(GROUNDING_RULES).toContain("neither supplied nor derivable");
    // The anti-fabrication rule itself must survive the carve-out verbatim.
    expect(GROUNDING_RULES).toContain(
      "Use ONLY the data supplied below. Never introduce a fact, name, number, control, vendor or risk that does not appear in it.",
    );
    expect(GROUNDING_RULES).toContain("An honest abstention is correct");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`
Expected: FAIL — `expect(received).toContain(expected)`, because `GROUNDING_RULES` has no arithmetic clause.

- [ ] **Step 3: Implement**

Replace the `GROUNDING_RULES` block in `Servers/services/reporting/analyzers/prompts.ts` with:

```ts
/** Shared anti-fabrication preamble applied to every analyzer. */
export const GROUNDING_RULES = `You are an AI governance analyst producing a section of a formal compliance report.

Absolute rules:
- Use ONLY the data supplied below. Never introduce a fact, name, number, control, vendor or risk that does not appear in it.
- Arithmetic over the supplied values is expected, not forbidden. Compute ratios, percentages, shares, counts and differences; rank items against one another; and compare any date in the data against the supplied reference date. A value you derived that way is grounded, and citing it is what makes the analysis specific. A value that is neither supplied nor derivable from what is supplied is a fabrication and a serious defect.
- If the supplied data is empty or too thin to support a grounded analysis, set abstain_reason and keep the rest of your output minimal and factual. An honest abstention is correct; an invented finding in a compliance artifact is a serious defect.
- Do not use markdown, bullet characters or headers inside prose fields. Write flowing paragraphs.
- Even when you abstain, write at least one complete sentence in the prose field explaining what is missing.
- Write in professional third-person tone.`;
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/prompts.ts \
        Servers/services/reporting/analyzers/__tests__/registry.test.ts
git commit -m "$(cat <<'EOF'
fix(reporting): stop the grounding rules reading as a ban on arithmetic

"Never introduce a number that does not appear in the data" was obeyed
literally: across 17 stored analyses there is not one percentage, ratio or
date comparison. State the carve-out positively — deriving values from
supplied ones is grounded — while leaving the fabrication ban verbatim.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 23: `SECTION_INSTRUCTIONS` — one analytic body per section key

**Files:**
- Modify: `Servers/services/reporting/analyzers/prompts.ts` — insert directly beneath the closing `};` of `SECTION_LABELS` (today line 32; above the helpers Phase 1 Task 3 rewrites, so the anchor holds either way)
- Test: `Servers/services/reporting/analyzers/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Change line 2 of `Servers/services/reporting/analyzers/__tests__/registry.test.ts` (as left by Task 22) to:

```ts
import {
  GENERIC_SECTION_INSTRUCTION,
  GROUNDING_RULES,
  prepareSectionData,
  renderSections,
  SECTION_INSTRUCTIONS,
  SECTION_LABELS,
} from "../prompts";
```

and add this test directly after the `"keeps the twelve human-readable section labels"` test:

```ts
  it("§3 — every section key has its own analytic instruction, with a generic fallback for anything unmapped", () => {
    // One shared instruction for all 12 section types is why every section
    // summary reads the same. The key set must track SECTION_LABELS exactly,
    // or a section silently falls back to the generic text.
    expect(Object.keys(SECTION_INSTRUCTIONS).sort()).toEqual(Object.keys(SECTION_LABELS).sort());
    Object.entries(SECTION_INSTRUCTIONS).forEach(([key, body]) => {
      expect(body.length).toBeGreaterThan(120);
      // The raw key must never appear in prose the model is shown — the human
      // label is what the prompt uses.
      expect(body).not.toContain(key);
    });

    // The three the design names as the pattern.
    expect(SECTION_INSTRUCTIONS.projectRisks).toContain("unmitigated high and critical");
    expect(SECTION_INSTRUCTIONS.policyManager).toContain("reference date");
    expect(SECTION_INSTRUCTIONS.compliance).toContain("completion rate");

    // An unmapped key must degrade to today's behaviour, not lose its summary.
    expect(SECTION_INSTRUCTIONS.somethingNew).toBeUndefined();
    expect(GENERIC_SECTION_INSTRUCTION).toContain("Highlights key observations and patterns");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`
Expected: FAIL — `TypeError: Cannot convert undefined or null to object` at `Object.keys(SECTION_INSTRUCTIONS)`; neither `SECTION_INSTRUCTIONS` nor `GENERIC_SECTION_INSTRUCTION` is exported.

- [ ] **Step 3: Implement**

Insert into `Servers/services/reporting/analyzers/prompts.ts` directly beneath the closing `};` of `SECTION_LABELS`:

```ts
/**
 * Per-section analytic questions, one entry per SECTION_LABELS key.
 *
 * Replaces the single generic instruction that was reused verbatim for all 12
 * section types — the reason every section summary reads interchangeably. Each
 * body asks for the ratios, distributions and named items that only exist in
 * THAT section's data (see dataCollector.ts for what each one actually holds).
 */
export const SECTION_INSTRUCTIONS: Record<string, string> = {
  projectRisks: `- How many risks are unmitigated high and critical, and what share of the register is that?
- Which rows carry no named owner, and which combination of impact and likelihood is the worst in the set?
- Does the level distribution match the raw count, or is a large register scored almost entirely at one level?
- Name the single risk that carries the most exposure and say what makes it worse than the next one.`,

  vendorRisks: `- How many vendor risks are unmitigated high and critical, and what share of the register is that?
- Which rows have no action owner, and which have no action plan recorded at all?
- Is the exposure spread across suppliers or concentrated in one or two named vendors?
- Compare the level distribution against the raw count rather than reporting the count on its own.`,

  modelRisks: `- How many model risks are unmitigated high and critical, and what share of the register is that?
- Which models carry more than one risk, and which risks show no mitigation status?
- Compare the level distribution against the raw count rather than reporting the count on its own.
- Name the model whose risk profile is the worst and say what distinguishes it from the rest.`,

  compliance: `- Which control family has the weakest completion rate within its category, and how does that rate compare with the overall progress figure?
- How many controls have no owner, and do the unowned ones cluster in one family?
- Name the specific control identifiers that are furthest from done.
- Say whether overall progress is being carried by one strong family while another lags well behind it.`,

  assessment: `- What share of questions is answered, and which topics sit furthest below that share?
- Do the unanswered questions cluster in one topic, or are they spread evenly across the tracker?
- Name the topics at or near zero progress and say what that gap means under this framework.
- Where an answer is present but thin, say so rather than counting it as coverage.`,

  clausesAndAnnexes: `- What share of clauses and what share of annex controls is complete, and which of the two lags?
- Which clause has the most incomplete sub-clauses, by identifier?
- Do the incomplete items cluster in one clause or annex, or are they scattered across many?
- Name the specific clause or annex identifiers a reader should look at first.`,

  nistSubcategories: `- Which of the four functions has the weakest completion rate, and by how much against the others?
- How many subcategories carry a linked risk, and how many carry none at all?
- Name the specific subcategory identifiers that are furthest behind.
- Say whether the gaps concentrate in one function or run across all of them.`,

  vendors: `- What is the distribution of review status across the list, and how many suppliers are unreviewed?
- How many have no assignee, and how many have no named contact person?
- Name the suppliers a reader should chase first, and say why those and not the others.
- Compare the number of suppliers against the number that carry a recorded risk.`,

  models: `- What is the status distribution across the inventory, and how many entries are not in a reviewed state?
- How many distinct owners cover the inventory? If one person owns most of it, say so and name the concentration.
- Which entries carry no owner, and which carry no version?
- Name the entries a reader should look at first and say what makes them urgent.`,

  trainingRegistry: `- What share of records is complete, and how many carry no completion date at all?
- How many records have no assignee?
- Do the incomplete records concentrate in one training, or are they spread across many?
- Say plainly whether the registry demonstrates coverage or only demonstrates that rows exist.`,

  policyManager: `- What is the ratio of draft to approved policies, stated as a ratio and not only as two counts?
- Which policies have a review date already past the reference date, and by how long?
- Which policies carry no review date, and which carry no owner?
- Name the policies that need attention first and say what puts them first.`,

  incidentManagement: `- How many incidents are still open, broken down by severity?
- How long has each open incident been open, measured against the reference date?
- Does one type recur, and is it tied to a named model, supplier or project?
- Name the incident a reader should look at first and say why.`,
};

/** Fallback for a section key with no entry above: today's generic text, so an
 *  unmapped section degrades to current behaviour instead of losing its summary. */
export const GENERIC_SECTION_INSTRUCTION = `- Highlights key observations and patterns
- Identifies areas of concern or non-compliance
- Notes strengths and areas of good practice
- Provides context for decision-makers`;
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/prompts.ts \
        Servers/services/reporting/analyzers/__tests__/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): give each of the twelve sections its own analytic questions

One generic instruction was reused verbatim for all 12 section types, which is
why the summaries are interchangeable. Each key now asks for the ratios,
distributions and named items that only exist in that section's data. An
unmapped key falls back to the old text rather than losing its summary.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: Section summaries consume the per-section instruction and the reference date

**Files:**
- Modify: `Servers/services/reporting/analyzers/sectionSummaries.ts:1-6` (imports), `:31-66` (`summariseSection`), `:86-92` (inside `runSectionSummaries`)
- Test: `Servers/services/reporting/analyzers/__tests__/sectionSummaries.test.ts`

> Phase 1 does not touch `sectionSummaries.ts`, so these line numbers hold when this task is reached.

- [ ] **Step 1: Write the failing test**

Add the db mock to the top of `Servers/services/reporting/analyzers/__tests__/sectionSummaries.test.ts`, directly beneath the existing `jest.mock("ai", …)` on line 2:

```ts
// sectionSummaries imports referenceDay from ./facts, which imports isoDate
// from dataCollector, which imports the real sequelize instance at module
// load. Unmocked, that opens a DB connection during a unit test.
jest.mock("../../../../database/db", () => ({ sequelize: {} }));
```

Replace the existing test at lines 45-54 with the version below, and add the two tests that follow it:

```ts
  it("prompt names the section label, framework, project, reference date, grounding sentence and word count", async () => {
    await runSectionSummaries("model" as any, reportData as any);
    const firstPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(firstPrompt).toContain("Use Case Risks"); // SECTION_LABELS lookup, not the raw key
    expect(firstPrompt).not.toContain("projectRisks");
    expect(firstPrompt).toContain("EU AI Act");
    expect(firstPrompt).toContain("Acme Project");
    expect(firstPrompt).toContain("Use only the data provided — never introduce a fact that does not appear in it.");
    expect(firstPrompt).toContain("150-250 words");
    // §1: Stage 1 needs the same "today" the facts block declares, or a date
    // in the data has nothing to be compared against.
    expect(firstPrompt).toMatch(/Reference date: \d{4}-\d{2}-\d{2}/);
  });

  it("§3 — asks the section-specific analytic questions, not the shared generic four", async () => {
    await runSectionSummaries("model" as any, reportData as any);
    const firstPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(firstPrompt).toContain("unmitigated high and critical");
    expect(firstPrompt).not.toContain("Highlights key observations and patterns");
  });

  it("§3 — an unmapped section key degrades to the generic instruction instead of losing its summary", async () => {
    const out = await runSectionSummaries("model" as any, {
      sections: { somethingNew: { rows: [1] } },
      metadata: { frameworkName: "EU AI Act", projectTitle: "Acme Project" },
    } as any);
    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("Highlights key observations and patterns");
    expect(out.somethingNew).toBe("A summary.");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/sectionSummaries.test.ts`
Expected: FAIL — the prompt contains neither `Reference date:` nor `unmitigated high and critical`, and still contains `Highlights key observations and patterns`.

- [ ] **Step 3: Implement**

Replace lines 1-6 of `Servers/services/reporting/analyzers/sectionSummaries.ts` with:

```ts
import { generateText } from "ai";
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import logger from "../../../utils/logger/fileLogger";
import { referenceDay } from "./facts";
import {
  GENERIC_SECTION_INSTRUCTION,
  hasContent,
  MAX_PROMPT_CHARS,
  prepareSectionData,
  SECTION_INSTRUCTIONS,
  SECTION_LABELS,
} from "./prompts";

/** Stage 1's own budget. Unrelated to runAnalyzers.ts's LLM_TIMEOUT_MS: this
 *  path calls generateText directly, not generateObjectWithSelfCorrection, so
 *  there is no per-attempt retry to budget for. */
const LLM_TIMEOUT_MS = 30_000;
```

Replace `summariseSection` (lines 31-66) with:

```ts
async function summariseSection(
  key: string,
  data: any,
  frameworkName: string,
  projectTitle: string,
  referenceDate: string,
  model: any,
): Promise<string> {
  try {
    const label = SECTION_LABELS[key] || key;
    const prompt = `You are an AI governance analyst writing the "${label}" section analysis for a ${frameworkName} compliance report on the project "${projectTitle}".

Reference date: ${referenceDate} — treat this as today when comparing any date in the data.

Analyze the following data and write a concise summary (150-250 words) that answers these questions:
${SECTION_INSTRUCTIONS[key] ?? GENERIC_SECTION_INSTRUCTION}

Every claim must carry the value it rests on: a count, a share, a status, a name or a date. A sentence that would read the same for any other organization is not an analysis.

Write in professional third-person tone. Do not use markdown formatting. Do not include headers or bullet points — write flowing paragraphs only.

Use only the data provided — never introduce a fact that does not appear in it. Counting, ranking and computing ratios or differences over the supplied values is expected.

Data:
${clampSectionData(key, data)}`;

    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    return result.text.trim();
  } catch (error) {
    logger.warn(`Section summary failed for "${key}":`, error);
    return "";
  }
}
```

Replace lines 86-92 (inside `runSectionSummaries`) with:

```ts
  const frameworkName = reportData.metadata?.frameworkName ?? "AI governance";
  const projectTitle = reportData.metadata?.projectTitle ?? "the organization";
  const referenceDate = referenceDay(reportData.metadata?.generatedAt);

  const summaries = await runWithConcurrency(
    entries.map(
      ([key, data]) => () =>
        summariseSection(key, data, frameworkName, projectTitle, referenceDate, model),
    ),
    MAX_CONCURRENT,
  );
```

> The "150-250 words" ask and `maxOutputTokens: 500` move together in the §8 phase; raising the ask here alone would widen the mid-sentence truncation that cut run 2 off at 997 characters.

> **Anchors this task leaves for Phase 3 Task 50.** After this task, `sectionSummaries.ts` no longer contains a `that:`-style bullet list. The prompt line to re-anchor on is `Analyze the following data and write a concise summary (150-250 words) that answers these questions:`, immediately followed by `${SECTION_INSTRUCTIONS[key] ?? GENERIC_SECTION_INSTRUCTION}`. The `'150-250 words'` assertion now lives inside the test named `"prompt names the section label, framework, project, reference date, grounding sentence and word count"` — not on line 53.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/sectionSummaries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/sectionSummaries.ts \
        Servers/services/reporting/analyzers/__tests__/sectionSummaries.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): section summaries ask section-specific questions

Stage 1 now reads SECTION_INSTRUCTIONS for its own key and is given the
report's reference date — the same isoDate-normalised day the collector used
for every stored review date, so a date comparison is on one calendar. An
unmapped key still falls back to the old generic text. The word count and the
token cap stay coupled and move together in the output-caps phase.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: `AnalyzerExtras.facts`, threaded into all six analyzer prompts

**Files:**
- Modify: `Servers/services/reporting/analyzers/registry.ts:39-53` (interface), `:80-85` (after `renderSummaries`), `:87-189` (the six `buildUserPrompt`s)
- Test: `Servers/services/reporting/analyzers/__tests__/registry.test.ts`

> Phase 1 does not touch `registry.ts`, so these line numbers hold when this task is reached.

- [ ] **Step 1: Write the failing test**

Add these three tests to `Servers/services/reporting/analyzers/__tests__/registry.test.ts`, directly before the closing `});` of the outer `describe`:

```ts
  describe("§2 — the facts substrate reaches every analyzer", () => {
    const reportData: any = {
      metadata: { frameworkName: "EU AI Act", projectTitle: "Acme", organizationId: 5 },
      sections: {
        projectRisks: { totalRisks: 1, risksByLevel: [{ level: "High", count: 1 }], risks: [{ name: "R1" }] },
        vendorRisks: { totalRisks: 1, risks: [{ riskName: "VR1" }] },
        vendors: { totalVendors: 1, vendors: [{ name: "Acme Corp" }] },
        compliance: { totalControls: 1, completedControls: 0, overallProgress: 0, controls: [{ id: 1 }] },
      },
    };
    const extras = {
      facts: "FACTS-MARKER totalRisks=41; ownerless=7",
      readiness: { controlScores: [{ control_id: 1, overall_score: 25 }], weakestControls: [], frameworkScore: null, stale: true },
      sectionSummaries: { projectRisks: "Use case risks are concentrated in one high-severity item." },
    };

    it("all six carry the facts block, so a single prompt holds the whole estate", () => {
      // Correlation between sections is only expressible once one prompt sees
      // more than one section. The three raw-section analyzers get it too:
      // aggregates are exactly what they lack.
      for (const def of Object.values(ANALYZERS)) {
        expect(def.buildUserPrompt(reportData, extras)).toContain("FACTS-MARKER");
      }
    });

    it("facts alone never buys an LLM call for a section with no data", () => {
      // Invariant: abstention stays cheap and reachable. The facts block is
      // whole-estate, so treating it as input would end every abstention.
      const empty: any = { metadata: reportData.metadata, sections: {} };
      for (const def of Object.values(ANALYZERS)) {
        expect(def.buildUserPrompt(empty, { facts: "FACTS-MARKER" })).toBe("");
      }
    });

    it("omitting facts leaves today's prompts byte-for-byte unchanged", () => {
      const withoutFacts = ANALYZERS.riskAnalysis.buildUserPrompt(reportData, {});
      expect(withoutFacts).toContain("Risk data:");
      expect(withoutFacts).not.toContain("FACTS-MARKER");
      expect(withoutFacts.startsWith("Framework: EU AI Act\nSubject: Acme\n\nRisk data:")).toBe(true);
    });
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`
Expected: FAIL — `expect(received).toContain("FACTS-MARKER")`; no analyzer reads `extras.facts` (and TypeScript has no such field).

- [ ] **Step 3: Implement**

In `Servers/services/reporting/analyzers/registry.ts`, insert into `AnalyzerExtras` immediately before its closing `}` (line 53):

```ts
  /** Rendered output of renderFacts(). Whole-estate, so a single prompt can
   *  relate one section to another. */
  facts?: string;
```

Insert after `renderSummaries`'s closing brace (line 85), before `export const ANALYZERS`:

```ts

/**
 * The deterministic facts substrate, when the caller supplied one. Rendered
 * ahead of the prose so the model reads values before wording, and handed to
 * ALL six analyzers: aggregates are exactly what the raw-section analyzers
 * lack, and a whole-estate block is what makes cross-section claims possible.
 */
function factsBlock(extras: AnalyzerExtras): string {
  return extras.facts ? `${extras.facts}\n\n` : "";
}
```

Then replace each `buildUserPrompt` body. `executiveSummary`, `keyFindings` and `recommendedActions` (identical in all three):

```ts
    buildUserPrompt: (rd, extras) => {
      const body = renderSummaries(extras.sectionSummaries);
      return body ? `${header(rd)}\n\n${factsBlock(extras)}Section analyses:\n${body}` : "";
    },
```

`riskAnalysis` — note the second parameter is new; today's signature is `(rd)`:

```ts
    buildUserPrompt: (rd, extras) => {
      const body = renderSections(rd.sections as any, RISK_SECTIONS);
      return body ? `${header(rd)}\n\n${factsBlock(extras)}Risk data:\n${body}` : "";
    },
```

`vendorRisk` — same, the second parameter is new:

```ts
    buildUserPrompt: (rd, extras) => {
      const body = renderSections(rd.sections as any, VENDOR_SECTIONS);
      return body ? `${header(rd)}\n\n${factsBlock(extras)}Vendor data:\n${body}` : "";
    },
```

`complianceGap` — replace its final `return` statement (line 175) with:

```ts
      return `${header(rd)}\n\n${factsBlock(extras)}Stored readiness scores (project-scoped):\n${scores}\n\nEvidence-gap analysis (organization + framework scoped — a SEPARATE dataset; do not assume a row here corresponds to a row above):\n${gapsBlock}\n\nCompliance section data:\n${compliance || "None."}`;
```

No change is needed in `runAnalyzers.ts`: Stage 1 passes `extras` straight through and Stage 2 spreads it (`{ ...extras, sectionSummaries: summaries }`), so `facts` already reaches both stages.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`
Expected: PASS (including the pre-existing `"returns an empty prompt — not a wasted LLM call"` test).

Then `cd Servers && npm run build` — `noUnusedParameters` is on, so the new `extras` parameters on `riskAnalysis` and `vendorRisk` only compile because `factsBlock(extras)` reads them.
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/registry.ts \
        Servers/services/reporting/analyzers/__tests__/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): hand every analyzer the whole-estate facts block

Stage 2 previously saw only Stage 1 prose — no number, identifier, date, owner
or status survived into it, so the only available operation was re-wording.
All six analyzers now receive the facts block ahead of their own input. It is
never treated as input on its own: a section with no data still returns an
empty prompt and abstains without spending a call.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 26: Build the facts block on the real report path

**Files:**
- Modify: `Servers/services/reporting/analyzers/collectAnalyzerInputs.ts` (add one import after line 12; append `collectFactsInput` at the end of the file)
- Modify: `Servers/services/reporting/index.ts:18-23` (the `collectAnalyzerInputs` named-import list only), `:120-134` (extras assembly)
- Test: `Servers/services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`

> **Do not replace `index.ts` lines 17-24 as a block.** Line 24 is
> `import { mapAnalysesToSummaries } from "./analyzers/mapToSummaries";` and
> `index.ts:144` still calls it. Only the named-import list on lines 18-23 is
> touched here.

- [ ] **Step 1: Write the failing test**

Add the db mock to `Servers/services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`, directly beneath the existing `evidenceAi.utils` mock (line 17):

```ts
// collectAnalyzerInputs now imports ./facts, which imports isoDate from
// dataCollector, which imports the real sequelize instance at module load.
jest.mock("../../../../database/db", () => ({ sequelize: {} }));
```

Extend the import block at lines 19-24 to:

```ts
import {
  collectReadinessInput,
  collectEvidenceGapsInput,
  collectAllowedOwners,
  collectFactsInput,
  resolveBlocks,
} from "../collectAnalyzerInputs";
```

and add these two tests before the closing `});` of the `describe("collectAnalyzerInputs")` block:

```ts
  it("§1 — builds the facts block and returns the snapshot for a later run to diff against", () => {
    const out = collectFactsInput({
      metadata: {
        // Local components: isoDate reads local components, so this fixture
        // expects the same day in every timezone the suite runs in.
        generatedAt: new Date(2026, 6, 22),
        frameworkName: "ISO 42001",
        projectTitle: "Acme",
      },
      charts: {},
      sections: {
        policyManager: {
          totalPolicies: 2,
          policies: [
            { policyName: "Acceptable use", status: "Draft", owner: "Bob" },
            { policyName: "Model release", status: "Approved", reviewDate: "1/1/2026", owner: "Bob" },
          ],
        },
      },
    } as any);

    // The snapshot is what §10 persists to audit_metadata, so the caller needs
    // it alongside the rendered text.
    expect(out.snapshot.generatedAt).toBe("2026-07-22");
    expect(out.snapshot.sections.policyManager.status_Draft).toBe(1);
    expect(out.facts).toContain("Reference date: 2026-07-22");
    expect(out.facts).toContain("[Policy Manager]");
    expect(out.facts).toContain("Acceptable use");
  });

  it("§10 — renders the delta when a prior snapshot is supplied", () => {
    const rd: any = {
      metadata: { generatedAt: new Date(2026, 6, 22), frameworkName: "ISO 42001", projectTitle: "Acme" },
      charts: {},
      sections: { policyManager: { totalPolicies: 2, policies: [{ policyName: "A" }, { policyName: "B" }] } },
    };
    const prior = collectFactsInput({ ...rd, sections: { policyManager: { totalPolicies: 1, policies: [{ policyName: "A" }] } } }).snapshot;

    expect(collectFactsInput(rd, prior).facts).toContain("totalPolicies: 2 (was 1, +1)");
    expect(collectFactsInput(rd).facts).not.toContain("Change since");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`
Expected: FAIL — `TypeError: (0 , collectAnalyzerInputs_1.collectFactsInput) is not a function`

- [ ] **Step 3: Implement**

Add to the imports at the top of `Servers/services/reporting/analyzers/collectAnalyzerInputs.ts` (after line 12, `import type { AiBlocks } from "./runAnalyzers";`):

```ts
import { collectFacts, renderFacts, type FactsSnapshot } from "./facts";
```

Append to the end of `Servers/services/reporting/analyzers/collectAnalyzerInputs.ts`:

```ts
/**
 * The deterministic facts substrate every analyzer receives (design §1).
 *
 * Returns the snapshot alongside its rendered form: §10 persists the snapshot
 * to report_run_analyses.audit_metadata and diffs the next run against it, so
 * the caller needs both. `prior` is that stored snapshot; with none supplied
 * the rendered block simply carries no change lines. The parameter exists from
 * the start so §10 is a one-argument change at the call site, not a rewrite.
 */
export function collectFactsInput(
  reportData: ReportData,
  prior?: FactsSnapshot | null,
): { snapshot: FactsSnapshot; facts: string } {
  const snapshot = collectFacts(reportData);
  return { snapshot, facts: renderFacts(snapshot, prior) };
}
```

In `Servers/services/reporting/index.ts`, add `collectFactsInput,` to the existing named-import list on lines 18-23 so it reads:

```ts
import {
  collectAllowedOwners,
  collectEvidenceGapsInput,
  collectFactsInput,
  collectReadinessInput,
  resolveBlocks,
} from "./analyzers/collectAnalyzerInputs";
```

Leave line 24 (`import { mapAnalysesToSummaries } from "./analyzers/mapToSummaries";`) exactly as it is — `index.ts:144` calls it.

Replace lines 120-134 (the `extras` assembly) with:

```ts
        // Deterministic whole-estate aggregates, for every analyzer and every
        // block combination. No LLM call, no query — computed from the
        // ReportData already in hand.
        const { facts } = collectFactsInput(reportData);

        // Two independent inputs, fetched in parallel and kept separate.
        const extras = blocks.complianceGap
          ? await (async () => {
              const [readiness, evidenceGaps] = await Promise.all([
                collectReadinessInput(
                  request.projectId,
                  request.frameworkId,
                  reportData.metadata.organizationId,
                  userId,
                ),
                collectEvidenceGapsInput(request.frameworkId, reportData.metadata.organizationId),
              ]);
              return { readiness, evidenceGaps, facts };
            })()
          : { facts };
```

> `facts` goes into both branches rather than being assigned onto `extras`
> afterwards: `noUnusedLocals`/`strict` are on, and a post-hoc
> `extras.facts = …` on a `{…} | {}` union does not compile without an added
> type annotation. §10 changes exactly one line here — `collectFactsInput(reportData, priorFacts)` — and destructures `snapshot` alongside `facts`.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`
Expected: PASS

Then confirm the `index.ts` wiring compiles: `cd Servers && npm run build`
Expected: exit 0, no output.

> Note for §10: any later test that imports `collectAnalyzerInputs` for real needs the same `jest.mock("../../../../database/db", …)` line, for the same reason.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/collectAnalyzerInputs.ts \
        Servers/services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts \
        Servers/services/reporting/index.ts
git commit -m "$(cat <<'EOF'
feat(reporting): populate the facts block on the real report path

collectFactsInput takes the prior snapshot from the start and returns the new
one alongside its rendered text, so the prior-run comparison phase is a
one-argument change rather than a restructured call site. The generator builds
the block unconditionally — it costs no query and no LLM call, and every block
combination benefits.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 27: Executive summary leads with a finding; key findings span sections

**Files:**
- Modify: `Servers/services/reporting/analyzers/registry.ts` — the `executiveSummary` and `keyFindings` entries, as left by Task 25 (today lines 88-108; Task 25 shifts them)
- Test: `Servers/services/reporting/analyzers/__tests__/registry.test.ts`

> This task owns the `keyFindings` base system prompt, including the §2
> correlation instruction and the two substrings pinned below. Phase 3 Task 48
> APPENDS its provenance-field instruction to this text; it does not rewrite it.

- [ ] **Step 1: Write the failing test**

Add to `Servers/services/reporting/analyzers/__tests__/registry.test.ts`, directly before the closing `});` of the outer `describe`:

```ts
  describe("§3 — the executive summary stops being an outline", () => {
    const reportData: any = {
      metadata: { frameworkName: "EU AI Act", projectTitle: "Acme", organizationId: 5 },
      sections: {},
    };
    const extras = { sectionSummaries: { projectRisks: "One high-severity item dominates the register." } };

    it("asks for a lead finding with its evidence instead of the fixed four-part outline", () => {
      const system = ANALYZERS.executiveSummary.buildSystemPrompt();
      expect(system).toContain("open with the single most consequential finding");
      expect(system).toContain("Do not work through a fixed outline");
      // Both live runs reproduced this outline in order, paragraph by paragraph.
      expect(system).not.toContain(
        "overall compliance and governance posture; critical findings requiring immediate attention",
      );
    });

    it("puts the framework and subject NAMES into the instruction, not only the header", () => {
      // The live corpus literally says "align all policies with the framework's
      // requirements" — the name never reached the instruction body.
      const prompt = ANALYZERS.executiveSummary.buildUserPrompt(reportData, extras);
      expect(prompt).toContain("Write the executive summary for Acme against EU AI Act.");
      expect(ANALYZERS.executiveSummary.buildSystemPrompt()).toContain('never write "the framework"');
    });

    it("still spends nothing when there are no summaries to work from", () => {
      expect(ANALYZERS.executiveSummary.buildUserPrompt(reportData, {})).toBe("");
    });

    it("§2 — key findings are told to name the sections a finding spans", () => {
      const system = ANALYZERS.keyFindings.buildSystemPrompt();
      expect(system).toContain("name the sections it spans");
      expect(system).toContain("must not simply restate a sentence");
    });
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`
Expected: FAIL — the executive-summary system prompt still contains the four-part outline and none of the required phrases.

- [ ] **Step 3: Implement**

Replace the `executiveSummary` and `keyFindings` entries in `Servers/services/reporting/analyzers/registry.ts` with:

```ts
  executiveSummary: {
    key: "executiveSummary",
    schema: executiveSummarySchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are writing the Executive Summary, in three to five paragraphs.\n\nRequired lead: open with the single most consequential finding in this report and the specific evidence that supports it — a count, a share, a date or a named item. Everything after the lead follows from it: why it matters under this framework, what else in the estate it connects to, and what the reader should do about it. Do not work through a fixed outline, and do not give a paragraph to a topic the data does not support.\n\nName the framework and the subject explicitly wherever you would otherwise write "the framework" or "the organization" — never write "the framework" when the input names it.`,
    buildUserPrompt: (rd, extras) => {
      const body = renderSummaries(extras.sectionSummaries);
      if (!body) return "";
      const fw = rd.metadata?.frameworkName ?? "AI governance";
      const subject = rd.metadata?.projectTitle ?? "the organization";
      return `${header(rd)}\n\n${factsBlock(extras)}Section analyses:\n${body}\n\nWrite the executive summary for ${subject} against ${fw}.`;
    },
  },

  keyFindings: {
    key: "keyFindings",
    schema: keyFindingsSchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are extracting Key Findings: five to eight of the most important observations across the supplied sections. Attribute each finding to the section key it came from.\n\nA finding must carry the evidence that makes it a finding — a count, a share, a status, a date or a named item — and must not simply restate a sentence from the section analyses. Where the estate facts show the same weakness in more than one section, say so in the finding text and name the sections it spans; one finding that connects two sections is worth more than two findings that repeat each other.`,
    buildUserPrompt: (rd, extras) => {
      const body = renderSummaries(extras.sectionSummaries);
      return body ? `${header(rd)}\n\n${factsBlock(extras)}Section analyses:\n${body}` : "";
    },
  },
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/registry.ts \
        Servers/services/reporting/analyzers/__tests__/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): lead the executive summary with a finding, not an outline

The fixed four-part outline was itself the boilerplate — both live runs
reproduced it paragraph by paragraph. Replace it with a required lead: the
single most consequential finding and the evidence behind it, with structure
following content. The framework and subject names now reach the instruction
body, so the output stops saying "the framework's requirements". Key findings
are told to name the sections a finding spans.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 28: Bump `ANALYZER_VERSION` to `report-analyzer-v2`

> Sole owner of the version bump for this design. No other phase touches
> `ANALYZER_VERSION` or the test below.

**Files:**
- Modify: `Servers/services/reporting/analyzers/prompts.ts:9`
- Test: `Servers/services/reporting/analyzers/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the existing `"carries a version string"` test (lines 12-14) of `Servers/services/reporting/analyzers/__tests__/registry.test.ts` with:

```ts
  it("carries a version string, pinned to the prompt generation that produced it", () => {
    expect(ANALYZER_VERSION).toMatch(/^report-analyzer-v\d+$/);
    // Stamped into report_run_analyses.audit_metadata: stored analyses must
    // stay traceable to the prompts that produced them, so this is pinned
    // exactly and bumped deliberately alongside a prompt or schema change.
    expect(ANALYZER_VERSION).toBe("report-analyzer-v2");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`
Expected: FAIL — `Expected: "report-analyzer-v2"` / `Received: "report-analyzer-v1"`

- [ ] **Step 3: Implement**

Replace line 9 of `Servers/services/reporting/analyzers/prompts.ts`:

```ts
export const ANALYZER_VERSION = "report-analyzer-v2";
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`
Expected: PASS

Then run the whole analyzer suite and the build, since this task closes the phase:

```
cd Servers && npm run test:unit -- services/reporting/analyzers
cd Servers && npm run build
```
Expected: all analyzer suites pass (`facts`, `registry`, `sectionSummaries`, `runAnalyzers`, `schemas`, `payloadShape`, `collectAnalyzerInputs`, `mapToSummaries`) and the build exits 0. No frontend file is touched, so the three tests pinning seven `ai_blocks` are untouched.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/prompts.ts \
        Servers/services/reporting/analyzers/__tests__/registry.test.ts
git commit -m "$(cat <<'EOF'
chore(reporting): bump the analyzer version to report-analyzer-v2

The facts substrate, the grounding carve-out, the per-section instructions and
the executive-summary rewrite all change what the model was asked. The version
is stamped into audit_metadata, so stored analyses stay traceable to the
prompts that produced them; the test now pins it exactly rather than matching
any digit.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Provenance labels, calibration, counterfactual, output caps

> Schema changes, grouped so the payload shape moves exactly once.

### Task 45: Provenance labels and the counterfactual on every row object

**Files:**
- Modify: `Servers/services/reporting/analyzers/schemas.ts` — insert two shared consts after the `severity` const (today's line 23), then the `keyFindings` row object (`:42-58`), the `recommendedActions` row object (`:72-95`), the `complianceGap` gaps row (`:141-145`) and the `vendorRisk` concerns row (`:172-176`). Nothing in Phases 1 or 2 touches this file, so these line numbers are still live when the task is reached.
- Test: `Servers/services/reporting/analyzers/__tests__/schemas.test.ts`
- Test: `Servers/services/reporting/analyzers/__tests__/payloadShape.test.ts`
- Test: `Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts`

- [ ] **Step 1: Prove the zod-4 introspection accessors before writing tests on top of them**

This task and Task 47 reach into zod internals — `.shape[list].element`, `.shape.<field>.options`, `.shape.<field>.description`. The repo is on `zod ^4.4.3`. Confirm all three exist, and that `.nullable()` requires the key while permitting the value, before writing anything:

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler/Servers
cat > zodprobe.tmp.js <<'EOF'
const { z } = require("zod");
const sev = z.enum(["low", "medium", "high", "critical"]).describe("SEV TEXT");
const basis = z.enum(["observed", "inferred", "absent"]).nullable().describe("B");
const row = z
  .object({
    text: z.string().min(15).max(600),
    severity: sev,
    basis,
    what_would_close_this: z.string().min(10).max(300).nullable(),
    related_sections: z.array(z.string()).max(6),
  })
  .strict();
const schema = z.object({ findings: z.array(row).min(0).max(8).describe("list") }).strict();
const el = schema.shape.findings.element;
console.log("element:", !!el, Object.keys(el.shape));
console.log("options:", el.shape.severity.options);
console.log("description:", el.shape.severity.description, "/", el.shape.basis.description);
const ok = { text: "Twelve controls have no evidence.", severity: "high", basis: null, what_would_close_this: null, related_sections: [] };
const t = (o) => { try { row.parse(o); return "NO THROW"; } catch { return "throws"; } };
console.log("null values parse:", t(ok));
console.log("missing basis key:", t({ ...ok, basis: undefined }));
console.log("bad basis value:", t({ ...ok, basis: "assumed" }));
console.log("counterfactual under min:", t({ ...ok, what_would_close_this: "n/a" }));
EOF
node zodprobe.tmp.js; rm -f zodprobe.tmp.js
```

Expected (verified against the installed 4.4.3 on 2026-07-22):

```
element: true [ 'text', 'severity', 'basis', 'what_would_close_this', 'related_sections' ]
options: [ 'low', 'medium', 'high', 'critical' ]
description: SEV TEXT / B
null values parse: NO THROW
missing basis key: throws
bad basis value: throws
counterfactual under min: throws
```

If any line differs, stop: the five tests below and the four in Task 47 all rest on these accessors, and a silent `undefined` there makes `expect(...).toContain(...)` fail for a reason that has nothing to do with the change.

- [ ] **Step 2: Write the failing test**

`Servers/services/reporting/analyzers/__tests__/schemas.test.ts` — replace the `keyFindings` test (lines 37-44) and the `recommendedActions` test (lines 46-58) with the versions below. Leave the `riskAnalysis, complianceGap and vendorRisk each accept an abstaining payload` test (lines 60-67) exactly as it is: it passes `gaps: []` and `concerns: []`, so no row-level field reaches it and it does not need fixing.

```ts
  it("keyFindings caps the array and requires a section key", () => {
    const parsed = keyFindingsSchema.parse({
      findings: [
        {
          text: "Twelve controls have no evidence attached.",
          section: "compliance",
          severity: "high",
          basis: "observed",
          what_would_close_this: "Evidence is attached to each of the twelve controls.",
          related_sections: [],
        },
      ],
      abstain_reason: null,
    });
    expect(parsed.findings[0].severity).toBe("high");
    expect(parsed.findings[0].basis).toBe("observed");
    expect(parsed.findings[0].related_sections).toEqual([]);
    expect(() =>
      keyFindingsSchema.parse({
        findings: [
          {
            text: "x",
            section: "compliance",
            severity: "high",
            basis: "observed",
            what_would_close_this: "Evidence is attached to each of the twelve controls.",
            related_sections: [],
          },
        ],
        abstain_reason: null,
      }),
    ).toThrow();
  });

  it("recommendedActions allows a null owner but not an unknown priority", () => {
    const parsed = recommendedActionsSchema.parse({
      actions: [
        {
          action: "Attach evidence to the twelve uncovered controls.",
          suggestedOwner: null,
          priority: "high",
          rationale: "These controls are unevidenced.",
          basis: "observed",
        },
      ],
      abstain_reason: null,
    });
    expect(parsed.actions[0].suggestedOwner).toBeNull();
    expect(parsed.actions[0].basis).toBe("observed");
    expect(() =>
      recommendedActionsSchema.parse({
        actions: [
          {
            action: "Do the thing properly.",
            suggestedOwner: null,
            priority: "urgent",
            rationale: "Because it matters.",
            basis: "observed",
          },
        ],
        abstain_reason: null,
      }),
    ).toThrow();
  });
```

Then append these four tests before the closing `});` of the file:

```ts
  it("requires the basis KEY on every finding, action, gap and concern", () => {
    // Required key, nullable value — the abstain_reason pattern this file
    // already uses. Omitting it entirely is what must fail.
    expect(() =>
      keyFindingsSchema.parse({
        findings: [
          {
            text: "Twelve controls have no evidence attached.",
            section: "compliance",
            severity: "high",
            what_would_close_this: "Evidence is attached to all twelve controls.",
            related_sections: [],
          },
        ],
        abstain_reason: null,
      }),
    ).toThrow();

    expect(() =>
      vendorRiskSchema.parse({
        narrative: "Third-party exposure is concentrated in a single unreviewed supplier.",
        concerns: [{ vendor: "Acme Corp", concern: "No DPA on file for this vendor.", severity: "high" }],
        abstain_reason: null,
      }),
    ).toThrow();
  });

  it("accepts an explicit null basis and null counterfactual rather than throwing the analysis away", () => {
    // A hard-required basis turns one model omission into a thrown parse, an
    // abstained analyzer and "this analysis could not be produced because the
    // AI service call failed" — a produced analysis becoming a lost one, which
    // invariant 3 forbids. The prompt asks for a label; the schema does not
    // destroy the report when it does not get one.
    const parsed = keyFindingsSchema.parse({
      findings: [
        {
          text: "Twelve controls have no evidence attached.",
          section: "compliance",
          severity: "high",
          basis: null,
          what_would_close_this: null,
          related_sections: [],
        },
      ],
      abstain_reason: null,
    });
    expect(parsed.findings[0].basis).toBeNull();
    expect(parsed.findings[0].what_would_close_this).toBeNull();
  });

  it("rejects a basis outside the three declared labels", () => {
    expect(() =>
      keyFindingsSchema.parse({
        findings: [
          {
            text: "Twelve controls have no evidence attached.",
            section: "compliance",
            severity: "high",
            basis: "assumed",
            what_would_close_this: "Evidence is attached to all twelve controls.",
            related_sections: [],
          },
        ],
        abstain_reason: null,
      }),
    ).toThrow();
  });

  it("caps related_sections at six and accepts an empty list", () => {
    const row = {
      text: "Policy approval lags the control evidence that depends on it.",
      section: "policyManager",
      severity: "medium",
      basis: "inferred",
      what_would_close_this: "Each draft policy reaches approved status.",
      related_sections: ["compliance"],
    };
    expect(
      keyFindingsSchema.parse({ findings: [row], abstain_reason: null }).findings[0].related_sections,
    ).toEqual(["compliance"]);
    expect(() =>
      keyFindingsSchema.parse({
        findings: [{ ...row, related_sections: ["a", "b", "c", "d", "e", "f", "g"] }],
        abstain_reason: null,
      }),
    ).toThrow();
  });

  it("requires a non-null counterfactual to say something, not merely exist", () => {
    expect(() =>
      complianceGapSchema.parse({
        narrative: "Readiness is uneven across the control set and two families lag the rest.",
        gaps: [
          {
            control: "AC-12",
            gap: "No evidence attached to this control.",
            priority: "high",
            basis: "absent",
            what_would_close_this: "n/a",
          },
        ],
        scores_caveat: null,
        abstain_reason: null,
      }),
    ).toThrow();
  });
```

`Servers/services/reporting/analyzers/__tests__/payloadShape.test.ts` — append the row-level pin after the existing `describe` block. `EXPECTED_TOP_LEVEL_KEYS` (lines 20-27) stays exactly as it is: every field this phase adds is row-level, so the top-level pin the tripwire table expected to fire does not fire, and that is the correct outcome rather than a missed step.

```ts
/**
 * The row objects are the half of the contract the top-level pin above never
 * saw. Phase 3 adds basis / what_would_close_this / related_sections here, and
 * the same hand-mirrored frontend interface has to follow (Task 51).
 */
const EXPECTED_ROW_KEYS: Record<string, { list: string; keys: string[] }> = {
  keyFindings: {
    list: "findings",
    keys: ["text", "section", "severity", "basis", "what_would_close_this", "related_sections"],
  },
  recommendedActions: {
    list: "actions",
    keys: ["action", "suggestedOwner", "priority", "rationale", "basis"],
  },
  riskAnalysis: { list: "top_risks", keys: ["name", "level", "why"] },
  complianceGap: {
    list: "gaps",
    keys: ["control", "gap", "priority", "basis", "what_would_close_this"],
  },
  vendorRisk: { list: "concerns", keys: ["vendor", "concern", "severity", "basis"] },
};

describe("analyzer row shapes (frontend type contract)", () => {
  for (const [name, { list, keys }] of Object.entries(EXPECTED_ROW_KEYS)) {
    it(`${name}.${list}[] exposes exactly ${keys.join(", ")}`, () => {
      const element = (SCHEMAS[name].shape[list] as any).element;
      expect(Object.keys(element.shape).sort()).toEqual([...keys].sort());
    });
  }
});
```

`Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts` — add the schema import directly beneath the existing `import { runAnalyzers, type AiBlocks } from "../runAnalyzers";` (line 18):

```ts
import { complianceGapSchema } from "../schemas";
```

and append this test directly after the existing test `"passes a control through untouched when it differs from the input only by case and whitespace"`, inside the `// ---- provenance guard ----` comment region. (The `gapRow` helper above it stays as it is — those tests feed `mockGenerate` a raw object that never goes through zod, so they do not need the new fields.)

```ts
  it("still drops an invented control when the model labels the claim basis 'inferred'", async () => {
    // The CRITICAL Phase 3 invariant. `basis` labels the CLAIM; it does not
    // relax the requirement that the row's SUBJECT appear verbatim in the
    // analyzer's own prompt. Built through the real schema so the fixture
    // cannot drift from what the model is actually allowed to emit.
    const object = complianceGapSchema.parse({
      narrative: "Readiness is uneven across the control set and two families lag the rest.",
      gaps: [
        {
          control: "AC-12 Access Review",
          gap: "No evidence is attached to this control.",
          priority: "high",
          basis: "observed",
          what_would_close_this: "An approved access-review record is attached to AC-12.",
        },
        {
          control: "SC-99 Invented Control",
          gap: "The control family appears to lack a documented owner.",
          priority: "critical",
          basis: "inferred",
          what_would_close_this: "A named owner is recorded against the control family.",
        },
      ],
      scores_caveat: null,
      abstain_reason: null,
    });
    mockGenerate.mockResolvedValue({ object, attempts: 1, selfCorrected: false });

    const withControls: any = {
      ...reportData,
      sections: { compliance: { controls: [{ id: 1, title: "AC-12 Access Review" }] } },
    };

    const out = await runAnalyzers({
      reportData: withControls,
      llmKey,
      blocks: only("complianceGap"),
    });

    expect(out.complianceGap!.payload.gaps).toHaveLength(1);
    expect(out.complianceGap!.payload.gaps[0].control).toBe("AC-12 Access Review");
    expect(out.complianceGap!.payload.gaps[0].basis).toBe("observed");
    expect(out.complianceGap!.payload.gaps[0].what_would_close_this).toBe(
      "An approved access-review record is attached to AC-12.",
    );
  });
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/schemas.test.ts services/reporting/analyzers/__tests__/payloadShape.test.ts services/reporting/analyzers/__tests__/runAnalyzers.test.ts`

Expected: FAIL. `schemas.test.ts` — every fixture carrying `basis`/`what_would_close_this`/`related_sections` throws on `.strict()` ("Unrecognized key"), and the four new negative tests do not throw because the fields do not exist yet. `payloadShape.test.ts` — the row key sets come back without the new keys. `runAnalyzers.test.ts` — `complianceGapSchema.parse` throws on the unrecognized `basis` key before the analyzer ever runs.

- [ ] **Step 4: Implement**

`Servers/services/reporting/analyzers/schemas.ts` — insert the two shared field definitions directly after the `severity` const (today's line 23):

```ts
/**
 * Provenance label. It describes the CLAIM, never the SUBJECT: sanitizeProvenance
 * in runAnalyzers.ts still drops any control, vendor or risk name that is not
 * present verbatim in that analyzer's own prompt, whatever basis the model
 * attaches to the row.
 *
 * .nullable(), not required-non-null — the same shape abstain_reason already
 * uses in this file. The key must be present so the model makes an explicit
 * statement; the value may be null so that one omission does not throw the
 * parse, abstain the analyzer and persist "this analysis could not be produced
 * because the AI service call failed" over an analysis that was in fact
 * produced.
 */
const basis = z
  .enum(["observed", "inferred", "absent"])
  .nullable()
  .describe(
    "Declare how this claim relates to the supplied data. Use \"observed\" when the data states the claim directly. Use \"inferred\" when the claim follows from the supplied data by reasoning the data does not itself state — a ratio, a comparison against the reference date, a pattern running across two sections. Use \"absent\" when the claim is that something required is missing from the data. This label describes the claim only: every control, vendor, risk or person you name must still appear verbatim in the supplied data, whichever label you choose. Use null only when none of the three fits, which should be rare.",
  );

const whatWouldCloseThis = z
  .string()
  .min(10)
  .max(300)
  .nullable()
  .describe(
    "The counterfactual: state what would specifically have to become true for this to stop being an issue — a status reaching a named value, an owner recorded, a document attached, a date met. Write it so the next report could check it against the same fields. Do not restate the problem and do not write a generic instruction such as \"review and update\". Use null only when the supplied data gives you no concrete condition to name.",
  );
```

Replace the `keyFindings` row object (today's lines 42-58) with:

```ts
        z
          .object({
            text: z
              .string()
              .min(15)
              .max(300)
              .describe("One concise observation grounded in the supplied data."),
            section: z
              .string()
              .min(2)
              .max(40)
              .describe(
                "The section key this finding came from (e.g. 'compliance', 'projectRisks'). Must be one of the section keys present in the input.",
              ),
            severity,
            basis,
            what_would_close_this: whatWouldCloseThis,
            // Not nullable, unlike its two siblings: an empty array is already
            // the natural "none" answer, so null would add a second way to say
            // the same thing and a null case to every consumer.
            related_sections: z
              .array(z.string())
              .max(6)
              .describe(
                "Other section keys this finding also draws on, written exactly as they appear in the input (e.g. ['policyManager', 'compliance']). Never invent a label. Use an empty array when the finding sits inside a single section.",
              ),
          })
          .strict(),
```

Add `basis` to the `recommendedActions` row object, immediately after `rationale` (today's line 94):

```ts
            rationale: z
              .string()
              .min(10)
              .max(300)
              .describe("One sentence tying this action to a specific signal in the input."),
            basis,
```

Replace the `complianceGap` gaps row object (today's lines 141-145) with:

```ts
          .object({
            control: z.string().min(1).max(200).describe("Control identifier or title, copied verbatim from the input."),
            gap: z.string().min(10).max(300).describe("What is missing, grounded in the supplied score fields."),
            priority: severity,
            basis,
            what_would_close_this: whatWouldCloseThis,
          })
```

Replace the `vendorRisk` concerns row object (today's lines 172-176) with:

```ts
          .object({
            vendor: z.string().min(1).max(200).describe("Vendor name, copied verbatim from the input."),
            concern: z.string().min(10).max(300).describe("The specific concern, grounded in the input."),
            severity,
            basis,
          })
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/schemas.test.ts services/reporting/analyzers/__tests__/payloadShape.test.ts services/reporting/analyzers/__tests__/runAnalyzers.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/schemas.ts \
        Servers/services/reporting/analyzers/__tests__/schemas.test.ts \
        Servers/services/reporting/analyzers/__tests__/payloadShape.test.ts \
        Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): label every analyzer claim with its basis

Findings, actions, gaps and concerns now declare basis (observed /
inferred / absent); findings and gaps also carry a counterfactual, and
findings carry related_sections so a cross-section theme is expressible
without inventing a label.

basis and what_would_close_this are nullable-but-required, matching
abstain_reason: the key must be present, the value may be null. A hard
requirement would convert one model omission into a thrown parse and a
"could not be produced" abstention over an analysis that was produced.

sanitizeProvenance is untouched. basis labels the claim, not the
subject: an invented gaps[].control is still dropped when the model
labels it "inferred", which the new runAnalyzers test pins.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 46: Raise the binding 300-character row caps to 600

**Files:**
- Modify: `Servers/services/reporting/analyzers/schemas.ts` — `findings[].text`, `actions[].action`, `actions[].rationale`, `gaps[].gap`, `concerns[].concern`
- Test: `Servers/services/reporting/analyzers/__tests__/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `Servers/services/reporting/analyzers/__tests__/schemas.test.ts`, before the closing `});`:

```ts
  it("gives findings, actions, rationales, gaps and concerns room for a mechanism, a value and an effect", () => {
    const long = "x".repeat(450);

    const finding = {
      text: long,
      section: "compliance",
      severity: "high",
      basis: "observed",
      what_would_close_this: "Evidence is attached to each of the twelve controls.",
      related_sections: [],
    };
    expect(keyFindingsSchema.parse({ findings: [finding], abstain_reason: null }).findings[0].text).toHaveLength(450);
    expect(() =>
      keyFindingsSchema.parse({ findings: [{ ...finding, text: "x".repeat(601) }], abstain_reason: null }),
    ).toThrow();

    const action = {
      action: long,
      suggestedOwner: null,
      priority: "high",
      rationale: long,
      basis: "observed",
    };
    expect(recommendedActionsSchema.parse({ actions: [action], abstain_reason: null }).actions[0].rationale).toHaveLength(450);
    expect(() =>
      recommendedActionsSchema.parse({ actions: [{ ...action, action: "x".repeat(601) }], abstain_reason: null }),
    ).toThrow();
    expect(() =>
      recommendedActionsSchema.parse({ actions: [{ ...action, rationale: "x".repeat(601) }], abstain_reason: null }),
    ).toThrow();

    const gapPayload = {
      narrative: "Readiness is uneven across the control set and two families lag the rest.",
      gaps: [
        {
          control: "AC-12 Access Review",
          gap: long,
          priority: "high",
          basis: "absent",
          what_would_close_this: "An approved access-review record is attached to AC-12.",
        },
      ],
      scores_caveat: null,
      abstain_reason: null,
    };
    expect(complianceGapSchema.parse(gapPayload).gaps[0].gap).toHaveLength(450);
    expect(() =>
      complianceGapSchema.parse({ ...gapPayload, gaps: [{ ...gapPayload.gaps[0], gap: "x".repeat(601) }] }),
    ).toThrow();

    const concernPayload = {
      narrative: "Third-party exposure is concentrated in a single unreviewed supplier.",
      concerns: [{ vendor: "Acme Corp", concern: long, severity: "high", basis: "observed" }],
      abstain_reason: null,
    };
    expect(vendorRiskSchema.parse(concernPayload).concerns[0].concern).toHaveLength(450);
    expect(() =>
      vendorRiskSchema.parse({ ...concernPayload, concerns: [{ ...concernPayload.concerns[0], concern: "x".repeat(601) }] }),
    ).toThrow();
  });

  it("leaves the prose caps alone — the row caps were what was binding", () => {
    expect(executiveSummarySchema.parse({ summary: "x".repeat(3500), abstain_reason: null }).summary).toHaveLength(3500);
    expect(() => executiveSummarySchema.parse({ summary: "x".repeat(3501), abstain_reason: null })).toThrow();
    expect(
      riskAnalysisSchema.parse({ narrative: "x".repeat(2500), top_risks: [], abstain_reason: null }).narrative,
    ).toHaveLength(2500);
    expect(() =>
      riskAnalysisSchema.parse({ narrative: "x".repeat(2501), top_risks: [], abstain_reason: null }),
    ).toThrow();
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/schemas.test.ts`

Expected: FAIL on the first new test — the 450-character `text`, `action`, `rationale`, `gap` and `concern` values all exceed the current `.max(300)`. The prose-cap test passes already and is there as a guard.

- [ ] **Step 3: Implement**

`Servers/services/reporting/analyzers/schemas.ts` — five field replacements. `findings[].text`:

```ts
            text: z
              .string()
              .min(15)
              .max(600)
              .describe(
                "One observation grounded in the supplied data. Name the specific values it rests on — the count, ratio, date, identifier or owner — rather than characterising them; there is room for the evidence and the observation in one place.",
              ),
```

`actions[].action`:

```ts
            action: z
              .string()
              .min(15)
              .max(600)
              .describe(
                "A specific, actionable step. Not a restatement of the problem. State the mechanism, what it applies to, and the effect expected once it is done; there is room for all three.",
              ),
```

`actions[].rationale`:

```ts
            rationale: z
              .string()
              .min(10)
              .max(600)
              .describe(
                "Tie this action to a specific signal in the input, quoting the value that motivates it. One or two sentences.",
              ),
```

`gaps[].gap`:

```ts
            gap: z
              .string()
              .min(10)
              .max(600)
              .describe(
                "What is missing, grounded in the supplied score fields. Name the score or field that shows it.",
              ),
```

`concerns[].concern`:

```ts
            concern: z
              .string()
              .min(10)
              .max(600)
              .describe(
                "The specific concern, grounded in the input. Name the field that evidences it — review status, contract date, risk level.",
              ),
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/schemas.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/schemas.ts \
        Servers/services/reporting/analyzers/__tests__/schemas.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): raise the row-level output caps from 300 to 600

A 300-character action cannot carry a mechanism, a subject, a date and
an expected effect at once, which is the shape that produced "review
and update the X policy" on every run in the live corpus. Raised on
findings[].text, actions[].action, actions[].rationale, gaps[].gap and
concerns[].concern, with each .describe() asking for the extra content
rather than leaving the room unused.

The prose caps (summary 3500, the three narratives 2500) are unchanged
and now pinned by a test — they were never what was binding.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 47: Written calibration anchors for severity and priority

**Files:**
- Modify: `Servers/services/reporting/analyzers/schemas.ts:19-23` (the shared `severity` const), and the inline `priority` enum in `recommendedActions` (today's lines 85-89)
- Test: `Servers/services/reporting/analyzers/__tests__/schemas.test.ts`

> The `.options` and `.description` accessors these tests use were proven against the installed zod 4.4.3 in Task 45 Step 1. Do not write this test before that probe has been run.

- [ ] **Step 1: Write the failing test**

Append to `Servers/services/reporting/analyzers/__tests__/schemas.test.ts`, before the closing `});`:

```ts
  /**
   * In this codebase the .describe() text IS the prompt, so the calibration
   * anchors are only real if they are in it. Modelled on
   * advisor/evidenceAnalyzer/prompts.ts, which carries 25 written grade
   * anchors and an explicit anti-inflation rule; this is the small version.
   */
  describe("severity and priority calibration", () => {
    const severityField = (keyFindingsSchema.shape.findings as any).element.shape.severity;
    const priorityField = (recommendedActionsSchema.shape.actions as any).element.shape.priority;

    it("keeps the four levels exactly as they are", () => {
      expect(severityField.options).toEqual(["low", "medium", "high", "critical"]);
      expect(priorityField.options).toEqual(["low", "medium", "high", "critical"]);
    });

    it("writes one anchor per severity level plus an anti-inflation rule", () => {
      const text = severityField.description as string;
      for (const level of ["critical:", "high:", "medium:", "low:"]) {
        expect(text).toContain(level);
      }
      expect(text).toContain("choose the LOWER");
      // The live corpus rated "20 of 22 training records are demo-seed" as
      // critical. Volume is not severity, and the anchor text has to say so.
      expect(text).toContain("a hundred low items stay low");
      // The pre-existing vocabulary mapping and anti-invention rule survive.
      expect(text).toContain("map 'Very High' to critical");
      expect(text).toContain("Never invent a level");
    });

    it("writes one anchor per priority level plus an anti-inflation rule", () => {
      const text = priorityField.description as string;
      for (const level of ["critical:", "high:", "medium:", "low:"]) {
        expect(text).toContain(level);
      }
      expect(text).toContain("choose the LOWER");
      expect(text).toContain("order of work");
    });

    it("shares the calibrated severity text with gaps[].priority and concerns[].severity", () => {
      const gapPriority = (complianceGapSchema.shape.gaps as any).element.shape.priority;
      const concernSeverity = (vendorRiskSchema.shape.concerns as any).element.shape.severity;
      expect(gapPriority.description).toBe(severityField.description);
      expect(concernSeverity.description).toBe(severityField.description);
    });
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/schemas.test.ts`

Expected: FAIL — the current `severity` and `priority` descriptions are one sentence each; they contain no `critical:` anchor, no `choose the LOWER` rule and no volume rule. The enum-options test and the shared-description test pass already.

- [ ] **Step 3: Implement**

`Servers/services/reporting/analyzers/schemas.ts` — replace the `severity` const (today's lines 19-23) with:

```ts
const severity = z
  .enum(["low", "medium", "high", "critical"])
  .describe(
    [
      "Severity judged only from the supplied data. The input's risk vocabulary is wider than this enum: map 'Very High' to critical, 'Very Low' to low. Never invent a level for an item whose severity the input does not state.",
      "Calibration anchors. Each level must clear the one below it:",
      "critical: a governing obligation is unmet now and the supplied data shows the exposure is live — an unmitigated critical-level risk, an expired or missing control on a high-risk use case, an open incident with no owner. Reserve this for items where doing nothing until the next report is indefensible.",
      "high: the same obligation is at material risk but not yet breached — coverage is partial, a due date in the data has passed on a non-trivial item, or a single point of failure is visible across the estate.",
      "medium: a real weakness with a bounded blast radius — one section, one owner, one document — that would not on its own fail an audit.",
      "low: housekeeping. Correcting it improves the record without changing the organization's exposure.",
      "Anti-inflation: when an item sits between two levels, choose the LOWER one. Volume is not severity — a hundred low items stay low, however striking the count.",
    ].join("\n"),
  );
```

Replace the inline `priority` field in `recommendedActions` (today's lines 85-89) with:

```ts
            priority: z
              .enum(["low", "medium", "high", "critical"])
              .describe(
                [
                  "Priority judged only from the supplied data. The input's risk vocabulary is wider than this enum: map 'Very High' to critical, 'Very Low' to low. Never invent a level for an item whose severity the input does not state.",
                  "Calibration anchors. Priority is order of work, not how bad the finding sounds:",
                  "critical: must start before anything else in this report, because another action depends on it or because the data shows a live exposure with no owner.",
                  "high: scheduled this cycle; it closes a material gap the supplied data actually evidences.",
                  "medium: worth starting once the high items are underway; it improves coverage rather than removing exposure.",
                  "low: opportunistic tidy-up.",
                  "Anti-inflation: when an action sits between two levels, choose the LOWER one. At most one action in the list should be critical, and only when the data names a live, unowned exposure.",
                ].join("\n"),
              ),
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/schemas.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/schemas.ts \
        Servers/services/reporting/analyzers/__tests__/schemas.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): calibrate severity and priority with written anchors

The enums carried a vocabulary note and nothing else, and the live
corpus shows the result: "20 of 22 training records are demo-seed"
rated critical while "all 25 models are owned by one person" rated
medium in the same run. One sentence per level saying what separates it
from the level below, an explicit choose-the-lower rule, and a volume
rule, in the style of advisor/evidenceAnalyzer/prompts.ts but smaller.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 48: Tell the analyzers, in their system prompts, about the new fields

**Files:**
- Modify: `Servers/services/reporting/analyzers/registry.ts` — the `buildSystemPrompt` of `keyFindings`, `recommendedActions`, `complianceGap` and `vendorRisk`
- Test: `Servers/services/reporting/analyzers/__tests__/registry.test.ts`

> No line numbers: Phase 2 Tasks 25 and 27 add `AnalyzerExtras.facts`, the `factsBlock` helper and a longer `executiveSummary`/`keyFindings` prompt to this file, so every number below where `AnalyzerExtras` ends has moved. Anchor on the quoted text.
>
> **This task APPENDS to `keyFindings`. It does not rewrite it.** Phase 2 Task 27 owns that prompt's `§2` correlation instruction and pins two of its substrings; the replacement below reproduces the Task-27 text verbatim and adds one paragraph after it. If the anchor text is not in the file, Phase 2 has not landed — land it first rather than writing a keyFindings prompt from scratch.

- [ ] **Step 1: Write the failing test**

Append to `Servers/services/reporting/analyzers/__tests__/registry.test.ts`, before the closing `});` of the outer `describe`:

```ts
  it("names the provenance and counterfactual fields in the system prompts that have them", () => {
    const findings = ANALYZERS.keyFindings.buildSystemPrompt();
    // Phase 2 Task 27's §2 correlation instruction must survive this append.
    expect(findings).toContain("name the sections it spans");
    expect(findings).toContain("must not simply restate a sentence");

    expect(findings).toContain("basis");
    expect(findings).toContain("what_would_close_this");
    expect(findings).toContain("related_sections");
    // The three labels must be spelled out, not merely referenced: the model
    // has to know what "inferred" licenses and what it does not.
    expect(findings).toContain('"observed"');
    expect(findings).toContain('"inferred"');
    expect(findings).toContain('"absent"');

    for (const key of ["recommendedActions", "complianceGap", "vendorRisk"] as const) {
      expect(ANALYZERS[key].buildSystemPrompt()).toContain("basis");
    }
    expect(ANALYZERS.complianceGap.buildSystemPrompt()).toContain("what_would_close_this");
  });

  it("repeats the anti-fabrication rule wherever basis is introduced", () => {
    // basis labels the CLAIM. It must never read as permission to name a
    // control or vendor that is not in the input — sanitizeProvenance would
    // drop the row anyway, so an unwarned model just loses content.
    for (const key of ["keyFindings", "complianceGap", "vendorRisk", "recommendedActions"] as const) {
      expect(ANALYZERS[key].buildSystemPrompt()).toContain("verbatim");
    }
  });

  it("does not ask the executive summary for row fields it has no schema for", () => {
    expect(ANALYZERS.executiveSummary.buildSystemPrompt()).not.toContain("what_would_close_this");
    expect(ANALYZERS.executiveSummary.buildSystemPrompt()).not.toContain("related_sections");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`

Expected: FAIL — no system prompt mentions `basis`, `what_would_close_this` or `related_sections`, and neither `keyFindings` nor `complianceGap` contains the word "verbatim" (`GROUNDING_RULES` does not use it, before or after Phase 2 Task 22). The `recommendedActions` and `vendorRisk` halves of the second test pass already; the executive-summary test passes already.

- [ ] **Step 3: Implement**

`Servers/services/reporting/analyzers/registry.ts` — four `buildSystemPrompt` bodies.

`keyFindings` — replace the arrow whose body begins `` `${GROUNDING_RULES}\n\nYou are extracting Key Findings `` (as left by Phase 2 Task 27) with the identical string plus one appended paragraph:

```ts
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are extracting Key Findings: five to eight of the most important observations across the supplied sections. Attribute each finding to the section key it came from.\n\nA finding must carry the evidence that makes it a finding — a count, a share, a status, a date or a named item — and must not simply restate a sentence from the section analyses. Where the estate facts show the same weakness in more than one section, say so in the finding text and name the sections it spans; one finding that connects two sections is worth more than two findings that repeat each other.\n\nEvery finding also carries three further fields, and each key must be present:\n- basis: "observed" when the supplied data states the claim directly, "inferred" when it follows from the supplied data by reasoning the data does not itself state, "absent" when the claim is that something required is missing. The label describes the CLAIM. It never licenses naming a control, vendor, risk or person that does not appear verbatim in the supplied data. Use null only when none of the three fits.\n- what_would_close_this: the specific condition under which this stops being a finding, written so the next report could check it against the same fields. Use null only when the data gives you no concrete condition to name.\n- related_sections: the other section keys this finding draws on, spelled exactly as they appear in the input. Use an empty array when the finding sits inside a single section.`,
```

`recommendedActions` — replace the arrow whose body begins `` `${GROUNDING_RULES}\n\nYou are producing three to five prioritised `` with:

```ts
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are producing three to five prioritised, actionable recommendations.\n\nOwner rule: set suggestedOwner ONLY when that exact person or role name appears verbatim in the supplied data. Otherwise it MUST be null. Never infer an owner from context and never invent one.\n\nEvery action also carries basis, and the key must be present: "observed" when the supplied data states the problem this action addresses, "inferred" when the problem follows from the supplied data by reasoning the data does not itself state, "absent" when the problem is that something required is missing. The label describes the CLAIM, not the subject — an "inferred" action still may not name anything absent from the supplied data. Use null only when none of the three fits.`,
```

`complianceGap` — replace the arrow whose body begins `` `${GROUNDING_RULES}\n\nYou are explaining and prioritising STORED readiness scores `` with:

```ts
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are explaining and prioritising STORED readiness scores. You do not compute or re-score anything — the scores are given.\n\nTwo hard constraints:\n- If the readiness input is empty or stale, say so plainly in scores_caveat. The absence of scores is NOT evidence of an absence of gaps, and must never be presented as such.\n- Some stored score dimensions are known to be recorded as zero for every control and carry no signal. Where a caveat notes this, do not interpret those zeros as findings or turn them into prose.\n\nEvery gap carries two further fields, and each key must be present:\n- basis: "observed" when the supplied scores state the gap directly, "inferred" when it follows from them by reasoning they do not state, "absent" when the gap is that something required is missing from the data. The label describes the CLAIM: the control you name must still appear verbatim in the supplied data whichever label you choose. Use null only when none of the three fits.\n- what_would_close_this: the specific condition under which this control would no longer be a gap. Use null only when the data gives you no concrete condition to name.`,
```

`vendorRisk` — replace the arrow whose body begins `` `${GROUNDING_RULES}\n\nYou are writing the third-party risk narrative `` with:

```ts
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are writing the third-party risk narrative and naming specific vendor concerns. Every vendor you name must appear verbatim in the supplied data.\n\nEvery concern also carries basis, and the key must be present: "observed" when the supplied data states the concern directly, "inferred" when it follows from the supplied data by reasoning the data does not itself state, "absent" when the concern is that required vendor information is missing. The label describes the CLAIM and never relaxes the verbatim rule on the vendor name. Use null only when none of the three fits.`,
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/registry.test.ts`

Expected: PASS — including Phase 2 Task 27's `"§2 — key findings are told to name the sections a finding spans"`, which is why the keyFindings replacement reproduces that text rather than replacing it.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/registry.ts \
        Servers/services/reporting/analyzers/__tests__/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): tell the analyzers about the new row fields

The .describe() text carries the field-level instruction, but the
system prompt is where the model learns the shape of the job. Each of
the four analyzers with row objects now spells out basis and, where it
applies, what_would_close_this and related_sections — each with the
reminder that the label describes the claim and never relaxes the
verbatim rule on the subject.

keyFindings keeps its cross-section correlation instruction verbatim;
this appends to that prompt rather than replacing it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 49: State the structured analyzers' output budget and give the deeper schema a second correction

**Files:**
- Modify: `Servers/services/reporting/analyzers/runAnalyzers.ts` — one const added beneath `LLM_TIMEOUT_MS`, and the `generateObjectWithSelfCorrection` call inside `runOne`
- Test: `Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts`

> Depends on Phase 1 Task 5, which set `const LLM_TIMEOUT_MS = 60_000;` and moved the budget from `extra.abortSignal` to `timeoutMs`. This task does not redeclare that constant and does not reintroduce `abortSignal` — a signal built once per analyzer is shared by the call and its self-corrections, which is the bug §7 exists to remove. If `LLM_TIMEOUT_MS` is not `60_000` here, land Phase 1 Task 5 first.

- [ ] **Step 1: Write the failing test**

`Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts` — replace the test Phase 1 Task 5 left as `"bounds each ATTEMPT with its own 60s timeout and a single self-correction retry"` with:

```ts
  it("bounds each ATTEMPT with its own 60s timeout, allows two corrections, and states an output budget", async () => {
    await runAnalyzers({ reportData, llmKey, blocks: only("riskAnalysis") });

    const params = mockGenerate.mock.calls[0][0];
    // timeoutMs, not extra.abortSignal: one pre-built signal is shared by the
    // first call and its retries, so a deeper (slower) analysis aborts and
    // degrades into a generic abstention.
    expect(params.timeoutMs).toBe(60_000);
    // Two, not one. basis and what_would_close_this are new required keys on
    // four analyzers; one correction turns a second omission into
    // "this analysis could not be produced because the AI service call
    // failed". Each attempt now has its own 60s budget, so a second is safe.
    expect(params.maxSelfCorrectionAttempts).toBe(2);
    // Nothing was passed before, so the output ceiling was whatever the
    // provider happened to default to — the same silence that truncated a
    // section summary mid-sentence and went unnoticed for two runs. runOne is
    // shared by both stages, so this one pin covers all six analyzers.
    expect(params.extra).toEqual({ maxOutputTokens: 2000 });
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/runAnalyzers.test.ts`

Expected: FAIL — `maxSelfCorrectionAttempts` is `1` and `extra` is `undefined`. `timeoutMs` already passes, from Phase 1.

- [ ] **Step 3: Implement**

`Servers/services/reporting/analyzers/runAnalyzers.ts` — insert directly beneath the closing line of the Phase 1 constant `const LLM_TIMEOUT_MS = 60_000;`, before the `runAnalyzers` doc comment:

```ts

/**
 * Stated, not inherited. These payloads carry a 3500-character summary, or up
 * to eight findings that each now carry a counterfactual and a related-section
 * list — more than a provider's default ceiling reliably allows, and a silent
 * truncation here reads downstream as a short answer rather than a cut-off one.
 */
const ANALYZER_MAX_OUTPUT_TOKENS = 2000;
```

Then replace the `generateObjectWithSelfCorrection` call inside `runOne` — as Phase 1 Task 5 left it:

```ts
    const result = await generateObjectWithSelfCorrection({
      model,
      schema: def.schema,
      system: def.buildSystemPrompt(),
      prompt: userPrompt,
      maxSelfCorrectionAttempts: 1,
      timeoutMs: LLM_TIMEOUT_MS,
    });
```

with:

```ts
    const result = await generateObjectWithSelfCorrection({
      model,
      schema: def.schema,
      system: def.buildSystemPrompt(),
      prompt: userPrompt,
      // Two corrections, not one: Task 45 added required keys to four row
      // objects, and a repeat omission must not cost the whole analysis.
      maxSelfCorrectionAttempts: 2,
      timeoutMs: LLM_TIMEOUT_MS,
      extra: { maxOutputTokens: ANALYZER_MAX_OUTPUT_TOKENS },
    });
```

`llmSelfCorrect` spreads `extra` into the `generateObject` call params (`Servers/advisor/llmSelfCorrect.ts:253`, `...(params.extra ?? {})`), and `maxSelfCorrectionAttempts: 2` means up to three attempts (`llmSelfCorrect.ts:249`, `attempt <= maxAttempts + 1`) at 60 s each. Cost is an explicit non-goal of this design; the wall-clock ceiling per analyzer is the thing to remember when reading a slow run.

Phase 4 Task 63 rewrites this call into a `call(systemPrompt)` closure. It must carry `maxSelfCorrectionAttempts: 2`, `timeoutMs: LLM_TIMEOUT_MS` and the same `extra` forward — the test above pins all three, so a Phase 4 draft that reverts any of them fails this suite on its own run.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/runAnalyzers.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/runAnalyzers.ts \
        Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): state the analyzers' output budget, allow a second correction

The six structured analyzers passed no maxOutputTokens at all, so the
ceiling was whatever the provider defaulted to. With findings now
carrying a counterfactual and a related-section list, and the row caps
raised to 600, an unstated ceiling is a silent truncation waiting to
happen. 2000 tokens, stated.

maxSelfCorrectionAttempts goes from 1 to 2 in the same change: four row
objects gained required keys this phase, and a repeat omission must not
turn a produced analysis into "could not be produced". Safe now that
each attempt has its own 60s budget rather than sharing one signal.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 50: Stop section summaries truncating unnoticed

**Files:**
- Modify: `Servers/services/reporting/analyzers/sectionSummaries.ts` — the constant block, the word-count ask inside the prompt template, and the `generateText` call plus its result handling
- Test: `Servers/services/reporting/analyzers/__tests__/sectionSummaries.test.ts`

> Depends on Phase 2 Task 24, which rewrote this prompt template and the test that pins it. Every anchor below is quoted against the POST-Task-24 file: the ask now ends `that answers these questions:` and is followed by `${SECTION_INSTRUCTIONS[key] ?? GENERIC_SECTION_INSTRUCTION}`, not by a four-bullet list. If the file still says `that:` followed by `- Highlights key observations and patterns`, Phase 2 Task 24 has not landed — land it first.

- [ ] **Step 1: Write the failing test**

`Servers/services/reporting/analyzers/__tests__/sectionSummaries.test.ts`:

1. Replace the import line `import { runSectionSummaries, MAX_CONCURRENT } from "../sectionSummaries";` with the two lines:

```ts
import { runSectionSummaries, MAX_CONCURRENT, SECTION_SUMMARY_MAX_TOKENS } from "../sectionSummaries";
import logger from "../../../../utils/logger/fileLogger";
```

2. Inside the test Phase 2 Task 24 named `"prompt names the section label, framework, project, reference date, grounding sentence and word count"`, change its one word-count assertion:

```ts
    expect(firstPrompt).toContain("150-250 words");
```

to:

```ts
    expect(firstPrompt).toContain("300-450 words");
```

3. Append these three tests before the closing `});` of the file:

```ts
  it("asks for a word count the output budget can actually hold", async () => {
    // Run 2 asked for 150-250 words against a 500-token ceiling and was cut
    // off at 997 characters mid-sentence; the executive summary then finished
    // the sentence for it. The ask and the cap have to move together.
    await runSectionSummaries("model" as any, reportData as any);
    expect(SECTION_SUMMARY_MAX_TOKENS).toBe(900);
    expect(mockGenerateText.mock.calls[0][0].maxOutputTokens).toBe(SECTION_SUMMARY_MAX_TOKENS);
  });

  it("warns when the model stopped because it ran out of output budget", async () => {
    const warnSpy = jest.spyOn(logger as any, "warn").mockImplementation(() => undefined);
    try {
      mockGenerateText.mockResolvedValue({
        text: "The policy register contains fourteen policies, of which nine remain in draft and",
        finishReason: "length",
      });

      const out = await runSectionSummaries("model" as any, {
        sections: { projectRisks: { totalRisks: 2, risks: [{ name: "R1" }] } },
      } as any);

      // The truncated text is still kept — a cut-off summary beats no summary.
      expect(out.projectRisks).toContain("nine remain in draft");
      const warned = warnSpy.mock.calls.map((c) => String(c[0])).join(" | ");
      expect(warned).toContain("projectRisks");
      expect(warned).toContain("truncated");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not warn when the model finished on its own", async () => {
    const warnSpy = jest.spyOn(logger as any, "warn").mockImplementation(() => undefined);
    try {
      mockGenerateText.mockResolvedValue({ text: "A complete summary.", finishReason: "stop" });
      await runSectionSummaries("model" as any, {
        sections: { projectRisks: { totalRisks: 2, risks: [{ name: "R1" }] } },
      } as any);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
```

The suite's `beforeEach` mock resolves `{ text: "  A summary.  " }` with no `finishReason`, so `undefined !== "length"` and every pre-existing test stays silent.

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/sectionSummaries.test.ts`

Expected: FAIL — `SECTION_SUMMARY_MAX_TOKENS` is not exported (`undefined`), the prompt still says `150-250 words` so the updated substring assertion fails, `maxOutputTokens` is the inline `500`, and nothing inspects `finishReason` so no warning is emitted.

- [ ] **Step 3: Implement**

`Servers/services/reporting/analyzers/sectionSummaries.ts` — insert between `const LLM_TIMEOUT_MS = 30_000;` (as left by Phase 2 Task 24) and `export const MAX_CONCURRENT = 3;`:

```ts
/**
 * Was an inline 500 against a "150-250 words" ask. Run 2 hit that ceiling and
 * was cut off at 997 characters mid-sentence, and because nothing looked at
 * finishReason the executive summary silently finished the sentence for it.
 * 900 tokens holds the 300-450 word ask below with the same 2x headroom the
 * old pairing had.
 */
export const SECTION_SUMMARY_MAX_TOKENS = 900;
```

Inside the prompt template in `summariseSection`, replace the ask line:

```
Analyze the following data and write a concise summary (150-250 words) that answers these questions:
```

with:

```
Analyze the following data and write a section analysis (300-450 words) that answers these questions:
```

Leave the `${SECTION_INSTRUCTIONS[key] ?? GENERIC_SECTION_INSTRUCTION}` line beneath it, and everything else in the template, untouched.

Replace the `generateText` call and its result handling:

```ts
    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    return result.text.trim();
```

with:

```ts
    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: SECTION_SUMMARY_MAX_TOKENS,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (result.finishReason === "length") {
      // These summaries are the INPUT to the executive summary, key findings
      // and recommended actions, so a sentence cut off here propagates into
      // three headline blocks. Keep the text — a truncated summary beats none
      // — but stop it happening silently.
      logger.warn(
        `Section summary for "${key}" was truncated: the model hit the ${SECTION_SUMMARY_MAX_TOKENS}-token output cap`,
      );
    }
    return result.text.trim();
```

`abortSignal` stays here: `generateText` is a single call with no self-correction loop, so one signal per call is one signal per attempt.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/sectionSummaries.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/sectionSummaries.ts \
        Servers/services/reporting/analyzers/__tests__/sectionSummaries.test.ts
git commit -m "$(cat <<'EOF'
fix(reporting): stop section summaries truncating unnoticed

500 output tokens against a 150-250 word ask cut run 2 off at 997
characters mid-sentence, and the executive summary — which reads these
summaries as its only input — finished the sentence for it. The cap is
now a named constant at 900, the ask is 300-450 words, and a
finishReason of "length" logs a warning instead of passing a cut-off
paragraph downstream in silence.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 51: Follow the payload change into the hand-mirrored frontend interface

**Files:**
- Modify: `Clients/src/domain/interfaces/i.reporting.ts:161-199` (`KeyFindingsPayload`, `RecommendedActionsPayload`, `ComplianceGapPayload`, `VendorRiskPayload`)
- Test: `Clients/src/presentation/components/ReportAnalysisPanel/__tests__/ReportAnalysisPanel.test.tsx`

> `payloadShape.test.ts`'s docblock says it plainly: *"If this test fails, the analyzer payload changed and that file must change with it."* Task 45 changed the payload and Task 45's own new pin repeats the instruction, so this is the file it points at. `EvidenceAnalysisPanel` is what happens when nobody follows the pointer.
>
> This is the ONE deliberate `Clients/` change in the whole design. The three files pinning seven `ai_blocks` — `ConfigureReportWizard.test.tsx`, `TemplateBuilder.test.tsx`, `reportTemplateResolver.test.ts` — are not touched, and no block is added. Rendering the new fields in the panel is out of scope: §11 is about the PDF and DOCX surfaces (Phase 5), and the type is what goes stale, not the UI.

- [ ] **Step 1: Write the failing test**

Append to `Clients/src/presentation/components/ReportAnalysisPanel/__tests__/ReportAnalysisPanel.test.tsx`, before the closing `});` of the outer `describe`:

```tsx
  it("accepts a v2 payload carrying basis, counterfactual and related sections", () => {
    // Type-first test: this file is typechecked by `tsc -b` (tsconfig.test.json
    // includes __tests__), so an interface that has not followed the analyzer
    // schema fails the build here rather than in a panel six months later.
    // Runtime behaviour is unchanged — the panel renders what it always did.
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[
          row("keyFindings", {
            findings: [
              {
                text: "Nine of fourteen policies remain in draft.",
                section: "policyManager",
                severity: "high",
                basis: "observed",
                what_would_close_this: "Each of the nine draft policies reaches approved status.",
                related_sections: ["compliance"],
              },
            ],
            abstain_reason: null,
          }),
          row("complianceGap", {
            narrative: "Readiness is uneven across the control set.",
            gaps: [
              {
                control: "A.5.1",
                gap: "No documented policy.",
                priority: "high",
                basis: "absent",
                what_would_close_this: "An approved policy document is attached to A.5.1.",
              },
            ],
            scores_caveat: null,
            abstain_reason: null,
          }, { id: 2 }),
        ]}
      />,
    );
    expect(screen.getByText("Nine of fourteen policies remain in draft.")).toBeInTheDocument();
    expect(screen.getByText("No documented policy.")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Clients && npm run typecheck`

Expected: FAIL — `TS2353: Object literal may only specify known properties, and 'basis' does not exist in type '{ text: string; section: string; severity: AnalysisSeverity; }'`, and the same for `what_would_close_this` / `related_sections` on the finding and on the gap.

- [ ] **Step 3: Implement**

`Clients/src/domain/interfaces/i.reporting.ts` — replace lines 161-199 with:

```ts
/**
 * The three row-level fields added by report-analyzer-v2.
 *
 * OPTIONAL on the read side even though the backend schema requires the key:
 * this interface describes rows already persisted in report_run_analyses, and
 * every row written by v1 has none of them. `basis` is additionally nullable
 * because the analyzer schema permits an explicit null rather than losing a
 * whole analysis to one missing label.
 */
export type AnalysisBasis = "observed" | "inferred" | "absent";

export interface KeyFindingsPayload {
  findings: Array<{
    text: string;
    section: string;
    severity: AnalysisSeverity;
    basis?: AnalysisBasis | null;
    what_would_close_this?: string | null;
    related_sections?: string[];
  }>;
  abstain_reason: string | null;
}

export interface RecommendedActionsPayload {
  actions: Array<{
    action: string;
    suggestedOwner: string | null;
    priority: AnalysisSeverity;
    rationale: string;
    basis?: AnalysisBasis | null;
  }>;
  abstain_reason: string | null;
}

export interface RiskAnalysisPayload {
  narrative: string;
  // `level` is a free string, not the severity enum: the analyzer copies the
  // risk level verbatim from the input, whose vocabulary is wider.
  top_risks: Array<{ name: string; level: string; why: string }>;
  abstain_reason: string | null;
}

export interface ComplianceGapPayload {
  narrative: string;
  gaps: Array<{
    control: string;
    gap: string;
    priority: AnalysisSeverity;
    basis?: AnalysisBasis | null;
    what_would_close_this?: string | null;
  }>;
  scores_caveat: string | null;
  abstain_reason: string | null;
}

export interface VendorRiskPayload {
  narrative: string;
  concerns: Array<{
    vendor: string;
    concern: string;
    severity: AnalysisSeverity;
    basis?: AnalysisBasis | null;
  }>;
  abstain_reason: string | null;
}
```

`RiskAnalysisPayload` is reproduced unchanged because it sits between the two edited blocks; `top_risks` gains nothing this phase.

- [ ] **Step 4: Run the test and watch it pass**

Run:

```bash
cd Clients && npm run typecheck && npx vitest run src/presentation/components/ReportAnalysisPanel
```

Expected: PASS both. The panel's existing v1-shaped fixtures still compile — the new fields are optional.

Then confirm nothing else in `Clients/` moved:

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler && git status --porcelain -- Clients/
```

Expected: exactly two modified paths — `Clients/src/domain/interfaces/i.reporting.ts` and `Clients/src/presentation/components/ReportAnalysisPanel/__tests__/ReportAnalysisPanel.test.tsx`.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Clients/src/domain/interfaces/i.reporting.ts \
        Clients/src/presentation/components/ReportAnalysisPanel/__tests__/ReportAnalysisPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(reporting): mirror the v2 row fields into the frontend payload types

There is no shared types package across the Servers/Clients boundary,
so i.reporting.ts hand-mirrors the analyzer schemas and payloadShape.ts
exists to catch the moment it stops matching. Findings, actions, gaps
and concerns now carry basis, what_would_close_this and
related_sections.

Optional on this side, required on the backend: these types describe
rows already stored in report_run_analyses, and every v1 row has none
of the three. No ai_block is added and no panel rendering changes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Shallowness gate

> Needs Phases 2 and 3 in place to calibrate its threshold against real output.

### Task 62: Novelty primitive — trigram Jaccard and the restatement test

**Files:**
- Create: `Servers/services/reporting/analyzers/novelty.ts`
- Test: `Servers/services/reporting/analyzers/__tests__/novelty.test.ts`

Nothing else imports it yet — this task ships the measurement, Task 63 wires it in. Every number quoted below and in the source comments is a measured value, not an estimate: the restatement scores **0.847** against its source block, the analysis **0.375**, and the same restatement scores **0.457** against the 2,139-character prompt that contains that block and **0.429** against an 8,494-character one. (Verified by running the exact `trigrams`/`trigramJaccard` implementation in Step 3 over the exact fixtures in Step 1.)

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/analyzers/__tests__/novelty.test.ts`:

```ts
import { NOVELTY_THRESHOLD, isRestatement, trigramJaccard } from "../novelty";

/** A section summary of the shape sectionSummaries actually produces. */
const SECTION_SUMMARY = `[Policy Manager]
The Policy Manager section comprises 14 policies, of which 9 remain in draft status and 5 have been approved. Ownership is recorded for 11 of the 14 policies; the remaining 3 carry no assigned owner at all. The most recent approval was recorded on 12 March 2026, and 6 of the approved policies list a review date that has already passed. Tagging is inconsistent: 4 policies carry no tag, while the Data Protection tag is applied to 5 separate documents that differ in scope. Two policies share the same title under different identifiers, which suggests a duplicate that was never retired. No policy in the section records an approver other than its own author, so the separation between drafting and approval is not evidenced anywhere in the supplied data. Review cadence is not stated for any of the 14 records.`;

/**
 * The observed run-2 failure, reproduced: the input block copied through with
 * one verb swapped ("comprises" -> "consists of") and one generic sentence
 * appended, so the output is slightly LONGER than its input and still says
 * nothing the input did not.
 */
const RESTATEMENT = `The Policy Manager section consists of 14 policies, of which 9 remain in draft status and 5 have been approved. Ownership is recorded for 11 of the 14 policies; the remaining 3 carry no assigned owner at all. The most recent approval was recorded on 12 March 2026, and 6 of the approved policies list a review date that has already passed. Tagging is inconsistent: 4 policies carry no tag, while the Data Protection tag is applied to 5 separate documents that differ in scope. Two policies share the same title under different identifiers, which suggests a duplicate that was never retired. No policy in the section records an approver other than its own author, so the separation between drafting and approval is not evidenced anywhere in the supplied data. Overall the organization maintains a policy set that requires continued attention from governance stakeholders.`;

/**
 * The target behaviour: same nouns, same numbers, same 12 March 2026 date —
 * but ratios, a ranking and a causal claim the input never states. The gate
 * must not punish this, or "deeper" costs a second call on every good run.
 */
const ANALYSIS = `Sixty-four percent of the policy set has never cleared approval, and the five that did are already ageing: six carry a review date behind the 12 March 2026 reference point, which means the approved population is smaller than the raw count of five suggests. Single-author approval compounds this. Every record names the drafter as its own approver, so the control that would normally catch a stale or duplicated document does not operate at all, which is the most economical explanation for the duplicated title surviving unretired. The three ownerless records are the ones to escalate first, because an unowned draft has nobody to trigger its review, and the reused Data Protection tag across five documents of differing scope means a reviewer searching by tag cannot tell which of them is authoritative.`;

/** The other sections a real prompt carries alongside the one being copied. */
const OTHER_BLOCKS = [
  `[AI Models]\nTwenty-five models are registered. Every one of them lists Priya Raman as its accountable owner, which concentrates the entire inventory on a single individual. Nine models have no documented evaluation, and the capability column is blank for the four newest entries.`,
  `[Vendors]\nEleven suppliers are on file. Four have no security questionnaire attached, and the renewal date has lapsed for two of those four. Contract value is unrecorded for six suppliers, so exposure cannot be ranked by spend.`,
  `[Training Registry]\nTwenty-two learning records exist; twenty carry the demonstration seed marker and were created within the same minute, so the register describes fixture data rather than delivered training. Completion percentages therefore mean nothing.`,
  `[Incident Management]\nThree incidents are logged over the reporting window. None has a closure date, and severity is recorded only for the oldest. Root-cause text is absent throughout, which prevents any trend statement about recurrence.`,
  `[Compliance Controls]\nOne hundred and forty controls span nine families. Access management sits lowest at 31 percent completion, while documentation reaches 88 percent. Forty-one controls have neither an owner nor a due date recorded against them.`,
].join("\n\n");

describe("trigramJaccard", () => {
  it("scores identical strings 1", () => {
    expect(trigramJaccard(SECTION_SUMMARY, SECTION_SUMMARY)).toBe(1);
  });

  it("scores strings with no shared trigram 0", () => {
    expect(trigramJaccard("aaaaaaaa", "bbbbbbbb")).toBe(0);
  });

  it("scores 0 when either side is shorter than one trigram", () => {
    expect(trigramJaccard("", SECTION_SUMMARY)).toBe(0);
    expect(trigramJaccard(SECTION_SUMMARY, "ok")).toBe(0);
  });

  it("ignores casing and whitespace reflow", () => {
    expect(trigramJaccard("The  POLICY\nset", "the policy set")).toBe(1);
  });
});

describe("isRestatement", () => {
  it("catches a verbatim block re-emitted inside a slightly longer paraphrase", () => {
    // Measured: 0.847.
    expect(trigramJaccard(RESTATEMENT, SECTION_SUMMARY)).toBeGreaterThan(0.8);
    expect(isRestatement(RESTATEMENT, SECTION_SUMMARY)).toBe(true);
  });

  it("passes an analysis that cites the same nouns, numbers and dates", () => {
    // Measured: 0.375 — a 0.13 margin under the threshold.
    expect(trigramJaccard(ANALYSIS, SECTION_SUMMARY)).toBeLessThan(NOVELTY_THRESHOLD);
    expect(isRestatement(ANALYSIS, SECTION_SUMMARY)).toBe(false);
  });

  it("still catches the restatement when its source is one block of a long prompt", () => {
    // Mutation guard, and the reason the comparison is per block: the union
    // grows with the prompt while the intersection does not, so the same
    // verbatim copy measures 0.847 against its source block but only 0.457
    // against this 2,139-character prompt (and 0.429 against an 8,494-character
    // one). A whole-prompt implementation returns false here and the gate can
    // never fire in production.
    const prompt = `Framework: ISO 42001\nSubject: Acme\n\nSection analyses:\n${SECTION_SUMMARY}\n\n${OTHER_BLOCKS}`;

    expect(trigramJaccard(RESTATEMENT, prompt)).toBeLessThan(NOVELTY_THRESHOLD);
    expect(isRestatement(RESTATEMENT, prompt)).toBe(true);
    expect(isRestatement(ANALYSIS, prompt)).toBe(false);
  });

  it("returns false for empty prose, so an abstention never costs a second call", () => {
    expect(isRestatement("", SECTION_SUMMARY)).toBe(false);
    expect(isRestatement("   ", SECTION_SUMMARY)).toBe(false);
    expect(isRestatement(RESTATEMENT, "")).toBe(false);
  });

  it("honours an explicit threshold", () => {
    expect(isRestatement(ANALYSIS, SECTION_SUMMARY, 0.3)).toBe(true);
    expect(isRestatement(RESTATEMENT, SECTION_SUMMARY, 0.9)).toBe(false);
  });

  it("pins the calibrated threshold", () => {
    expect(NOVELTY_THRESHOLD).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/novelty.test.ts`

Expected: FAIL — `Cannot find module '../novelty' from 'services/reporting/analyzers/__tests__/novelty.test.ts'`. The whole suite fails to load; no individual assertion runs yet.

- [ ] **Step 3: Implement**

Create `Servers/services/reporting/analyzers/novelty.ts`:

```ts
/**
 * Shallowness gate primitive (design §6).
 *
 * Character trigrams, not word sets: the observed failure re-cased and
 * re-worded ("comprises" -> "consists of") while leaving 791 contiguous
 * characters identical. Character n-grams survive that edit; a word-overlap
 * measure cannot separate it from a genuine analysis that cites the same nouns.
 *
 * Pure. No LLM, no database, no dependencies.
 */

/** Calibration knob. Run 2's failure measured 86.8% character overlap, so 0.5
 *  catches it with margin. Expect to retune against real corpora. */
export const NOVELTY_THRESHOLD = 0.5;

/** Case-folded and whitespace-collapsed — the observed failure re-cased the
 *  first word and reflowed the paragraph, and neither is a real edit. */
function trigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

/**
 * |A ∩ B| / |A ∪ B| over character trigrams. 1 for identical strings, 0 for
 * disjoint ones, 0 when either side is shorter than a single trigram.
 */
export function trigramJaccard(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / (A.size + B.size - shared);
}

/**
 * True when `output` reads as a restatement of `input` rather than an analysis
 * of it.
 *
 * Scored block by block (blank-line separated), never against the whole input
 * at once. Distinct trigrams saturate, so the union grows with the prompt while
 * the intersection does not: the same 870-character copy of one 829-character
 * block measures 0.847 against that block, 0.457 against a 2,139-character
 * prompt containing it and 0.429 at 8,494 characters — monotonically decreasing
 * as the prompt grows, and already under the threshold at the smallest realistic
 * prompt size. Whole-prompt Jaccard therefore cannot detect the one failure this
 * gate exists for.
 *
 * Blank-line splitting matches what the prompts actually look like:
 * registry.ts's renderSummaries and renderSections both `.join("\n\n")`, and
 * every buildUserPrompt separates header from body with "\n\n".
 *
 * ponytail: most sensitive where the input block is prose — which is where the
 * observed failure was (the Stage 2 summary consumers). Against a block that is
 * pretty-printed JSON, a narrative rarely scores near the threshold, so for the
 * three raw-section analyzers this gate is a backstop rather than a live check.
 */
export function isRestatement(
  output: string,
  input: string,
  threshold: number = NOVELTY_THRESHOLD,
): boolean {
  if (!output.trim() || !input.trim()) return false;
  return input.split(/\n{2,}/).some((block) => trigramJaccard(output, block) >= threshold);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/novelty.test.ts`

Expected: PASS — 10 tests across the two describes (4 + 6), 0 failures.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/novelty.ts \
        Servers/services/reporting/analyzers/__tests__/novelty.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): trigram novelty primitive for the shallowness gate

Character-trigram Jaccard plus isRestatement, scored per blank-line block
rather than against the whole prompt: distinct trigrams saturate, so a
verbatim copy of one section measures 0.847 against that section but 0.457
against a 2,139-character prompt containing it and 0.429 at 8,494. Whole-prompt
scoring cannot fire.

NOVELTY_THRESHOLD is 0.5, exported as a calibration knob — run 2's failure
measured 86.8% overlap, and the fixtures here measure 0.847 for that shape
against 0.375 for an analysis citing the same nouns, numbers and dates.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 63: Wire the gate into runOne — one re-issue, never a lost analysis

**Files:**
- Modify: `Servers/services/reporting/analyzers/runAnalyzers.ts` — four edits. No line numbers are cited anywhere in this task: Phases 1 and 3 both edit this file and shift every number in it. Each edit is anchored on quoted text that survives those phases:
  1. the import block, above `import { ANALYZERS, ANALYZER_VERSION, type AnalysisSectionKey, type AnalyzerExtras } from "./registry";`
  2. `export interface AnalyzerRunResult {`
  3. the module-level constants that sit between `const SUMMARY_CONSUMERS: AnalysisSectionKey[] = [` and the `runAnalyzers` doc comment (`LLM_TIMEOUT_MS` from Phase 1, `ANALYZER_MAX_OUTPUT_TOKENS` from Phase 3)
  4. the tail of `runOne`, from `const result = await generateObjectWithSelfCorrection({` down to and including the `] as const;` that closes its return
- Test: `Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts`
- Read first: `Servers/advisor/llmSelfCorrect.ts` — confirm Phase 1 Task 4 put the fresh `AbortSignal.timeout(params.timeoutMs)` *inside* `for (let attempt = 1; attempt <= maxAttempts + 1; attempt++) {`, next to the `const callParams: any = { ...(params.extra ?? {}), model, ... }` it builds. The re-issue below is a second call to `generateObjectWithSelfCorrection`, so it must get its own 60 s budget rather than inheriting a signal already partly consumed by the first call's self-correction.

Two constants from earlier phases are referenced here and never re-declared: `LLM_TIMEOUT_MS = 60_000` (Phase 1 Task 5) and `ANALYZER_MAX_OUTPUT_TOKENS = 2000` (Phase 3 Task 49). `maxSelfCorrectionAttempts` is **2** in the replacement block below — Phase 3 raised it from 1 to 2 and this task must carry that value through; writing 1 here silently reverts it.

`restatementRetried` on `AnalyzerRunResult` is the field Phase 6 Task 90 writes into `audit_metadata`. Keep the name exactly as spelled — success criterion 4 is observable after the fact only through it.

- [ ] **Step 1: Write the failing test**

In `Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts`, append this block as the last group inside `describe("runAnalyzers", …)` — i.e. after the final `it(...)` in the file and immediately before the file's closing `});`. Do not anchor on a line number or on a specific neighbouring test: Phase 3 Task 45 appends into the same describe and shifts whatever was last.

```ts
  // ---- shallowness gate (§6) -------------------------------------------

  const SUMMARY_BLOCK =
    "The Policy Manager section comprises 14 policies, of which 9 remain in draft status and 5 have been approved. Ownership is recorded for 11 of the 14 policies; the remaining 3 carry no assigned owner at all. The most recent approval was recorded on 12 March 2026, and 6 of the approved policies list a review date that has already passed. Tagging is inconsistent: 4 policies carry no tag, while the Data Protection tag is applied to 5 separate documents that differ in scope. Two policies share the same title under different identifiers, which suggests a duplicate that was never retired.";
  // Measured against the rendered prompt block: RESTATED 0.84, ANALYSED 0.34.
  const RESTATED = SUMMARY_BLOCK.replace("comprises", "consists of") +
    " Overall the organization maintains a policy set that requires continued attention from governance stakeholders.";
  const ANALYSED =
    "Sixty-four percent of the policy set has never cleared approval, and the five that did are already ageing: six carry a review date behind the 12 March 2026 reference point, so the approved population is smaller than the raw count suggests. Every record names its own drafter as approver, which is the most economical explanation for a duplicated title surviving unretired, and the three ownerless drafts have nobody to trigger the review that would catch it.";

  /** executiveSummary over one section summary — the run-2 failure's shape. */
  const restatingRun = () => {
    mockSectionSummaries.mockResolvedValue({ policyManager: SUMMARY_BLOCK });
    return runAnalyzers({
      reportData,
      llmKey,
      blocks: only("sectionSummaries", "executiveSummary"),
    });
  };

  it("re-issues once with a corrective directive when the prose restates its input", async () => {
    mockGenerate
      .mockResolvedValueOnce({ object: { summary: RESTATED, abstain_reason: null }, attempts: 1, selfCorrected: false })
      .mockResolvedValueOnce({ object: { summary: ANALYSED, abstain_reason: null }, attempts: 1, selfCorrected: false });

    const out = await restatingRun();

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockGenerate.mock.calls;
    expect(secondCall[0].system).toContain("RESTATEMENT DETECTED");
    expect(firstCall[0].system).not.toContain("RESTATEMENT DETECTED");
    // Same question, re-asked. Only the system prompt changes.
    expect(secondCall[0].prompt).toBe(firstCall[0].prompt);
    // The re-issue gets the same guardrails as the first call, including its
    // own fresh timeout budget. Asserted relative to the first call so this
    // test does not re-pin the values Phases 1 and 3 own.
    expect(secondCall[0].timeoutMs).toBe(firstCall[0].timeoutMs);
    expect(secondCall[0].maxSelfCorrectionAttempts).toBe(firstCall[0].maxSelfCorrectionAttempts);
    expect(secondCall[0].extra).toEqual(firstCall[0].extra);
    expect(out.executiveSummary!.payload.summary).toBe(ANALYSED);
    expect(out.executiveSummary!.restatementRetried).toBe(true);
    expect(out.executiveSummary!.attempts).toBe(2);
  });

  it("keeps the first payload when the re-issue restates its input as well", async () => {
    // Invariant: the gate must never turn a produced analysis into a lost one.
    mockGenerate
      .mockResolvedValueOnce({ object: { summary: RESTATED, abstain_reason: null }, attempts: 1, selfCorrected: false })
      .mockResolvedValueOnce({ object: { summary: SUMMARY_BLOCK, abstain_reason: null }, attempts: 1, selfCorrected: false });

    const out = await restatingRun();

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(out.executiveSummary!.payload.summary).toBe(RESTATED);
    expect(out.executiveSummary!.abstained).toBe(false);
    expect(out.executiveSummary!.restatementRetried).toBe(true);
  });

  it("keeps the first payload when the re-issue throws", async () => {
    mockGenerate
      .mockResolvedValueOnce({ object: { summary: RESTATED, abstain_reason: null }, attempts: 1, selfCorrected: false })
      .mockRejectedValueOnce(new Error("llm exploded"));

    const out = await restatingRun();

    expect(out.executiveSummary!.payload.summary).toBe(RESTATED);
    expect(out.executiveSummary!.abstained).toBe(false);
    expect(out.executiveSummary!.restatementRetried).toBe(true);
    // Not the generic AI-service-failed abstention: the throw happened inside
    // runOne's own try, so collect()'s rejected branch is never reached and
    // the three verbatim abstain strings stay authoritative.
    expect(out.executiveSummary!.abstain_reason).toBeNull();
  });

  it("does not re-issue for prose that analyses its input", async () => {
    mockGenerate.mockResolvedValue({ object: { summary: ANALYSED, abstain_reason: null }, attempts: 1, selfCorrected: false });

    const out = await restatingRun();

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(out.executiveSummary!.payload.summary).toBe(ANALYSED);
    expect(out.executiveSummary!.restatementRetried).toBe(false);
  });

  it("does not re-issue an abstention, however closely it echoes the input", async () => {
    // Invariant 5: abstention stays cheap. Paying a second call to make an
    // honest abstention wordier is exactly the padding this must not buy.
    mockGenerate.mockResolvedValue({
      object: { summary: RESTATED, abstain_reason: "the policy section carries no approval dates" },
      attempts: 1,
      selfCorrected: false,
    });

    const out = await restatingRun();

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(out.executiveSummary!.abstained).toBe(true);
    expect(out.executiveSummary!.restatementRetried).toBe(false);
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/runAnalyzers.test.ts`

Expected: FAIL — 5 failures, all five new tests. `jest.config.js` sets ts-jest `diagnostics: false`, so reading a not-yet-declared `restatementRetried` off `AnalyzerRunResult` does not break compilation; each test fails on its assertion:

- tests 1 and 2 on `expect(mockGenerate).toHaveBeenCalledTimes(2)` receiving `1` — `runOne` makes one call and returns whatever it gets;
- tests 3, 4 and 5 on `restatementRetried` being `undefined` rather than `true` / `false` (test 3's payload assertions pass already, since the rejected second mock is never consumed).

Every test already in the file passes unchanged.

- [ ] **Step 3: Implement**

3a. Add the import to `runAnalyzers.ts`, above the `./registry` import:

```ts
import { isRestatement } from "./novelty";
```

3b. Extend `AnalyzerRunResult` — replace the whole `export interface AnalyzerRunResult { … }` declaration with:

```ts
export interface AnalyzerRunResult {
  payload: any;
  abstained: boolean;
  abstain_reason: string | null;
  model: string | null;
  attempts: number;
  /** True when the shallowness gate fired and the call was re-issued (§6).
   *  Optional so abstain() and sectionSummaries need not carry it. Persisted
   *  into audit_metadata by persistAnalyses — that is what makes the gate's
   *  firing observable after the run rather than only in the log. */
  restatementRetried?: boolean;
}
```

3c. Add the gate's two constants directly beneath `ANALYZER_MAX_OUTPUT_TOKENS` (Phase 3), before the `runAnalyzers` doc comment:

```ts
/**
 * Prose fields the shallowness gate checks (§6). keyFindings and
 * recommendedActions have none: structured arrays are not checked.
 */
const PROSE_FIELD: Partial<Record<AnalysisSectionKey, string>> = {
  executiveSummary: "summary",
  riskAnalysis: "narrative",
  complianceGap: "narrative",
  vendorRisk: "narrative",
};

/** Appended to the system prompt for the one re-issue the gate allows. */
const RESTATEMENT_DIRECTIVE = `

## RESTATEMENT DETECTED
Your previous response reproduced its input rather than analysing it: the prose repeated the supplied text back with only cosmetic edits. Answer again from scratch. Do not reuse the input's sentences, clause order or phrasing. Say what the data implies that it does not state: which values are out of line with which others, which single item is most consequential and why, and what the supplied dates and counts mean when related to each other. If the data genuinely cannot support that, set abstain_reason and say so plainly — an honest abstention is correct and padding is not.`;
```

3d. Replace the tail of `runOne` — everything from `const result = await generateObjectWithSelfCorrection({` down to and including the closing `] as const;` — with:

```ts
    const system = def.buildSystemPrompt();
    const call = (systemPrompt: string) =>
      generateObjectWithSelfCorrection({
        model,
        schema: def.schema,
        system: systemPrompt,
        prompt: userPrompt,
        maxSelfCorrectionAttempts: 2,
        timeoutMs: LLM_TIMEOUT_MS,
        extra: { maxOutputTokens: ANALYZER_MAX_OUTPUT_TOKENS },
      });

    // userPrompt is exactly what this analyzer was given, so it is the only
    // honest thing to check "copied verbatim from the input" against.
    const sanitize = (object: any): any => {
      const p = sanitizeProvenance(key, object, userPrompt);
      return key === "recommendedActions"
        ? { ...p, actions: sanitizeOwners(p.actions, allowedOwners) }
        : p;
    };
    const prose = (p: any): string => {
      const field = PROSE_FIELD[key];
      return field && typeof p?.[field] === "string" ? p[field] : "";
    };

    const first = await call(system);
    let payload: any = sanitize(first.object);
    let attempts = first.attempts;
    let restatementRetried = false;

    // Shallowness gate (§6). Skipped on an abstention: its prose is a sentence
    // about what is missing, and re-issuing would turn a cheap honest
    // abstention into a paid one.
    if (!payload?.abstain_reason && isRestatement(prose(payload), userPrompt)) {
      restatementRetried = true;
      logger.warn(
        `Report analyzer "${key}" (${ANALYZER_VERSION}) restated its input instead of analysing it; re-issuing once`,
      );
      try {
        const retry = await call(system + RESTATEMENT_DIRECTIVE);
        attempts += retry.attempts;
        const retryPayload = sanitize(retry.object);
        if (isRestatement(prose(retryPayload), userPrompt)) {
          logger.warn(
            `Report analyzer "${key}" (${ANALYZER_VERSION}) restated its input again; keeping the first payload`,
          );
        } else {
          payload = retryPayload;
        }
      } catch (e) {
        // The gate must never convert a produced analysis into a lost one.
        logger.warn(
          `Report analyzer "${key}" (${ANALYZER_VERSION}) re-issue failed; keeping the first payload`,
          e,
        );
      }
    }

    return [
      key,
      {
        payload,
        abstained: !!payload?.abstain_reason,
        abstain_reason: payload?.abstain_reason ?? null,
        model: modelLabel,
        attempts,
        restatementRetried,
      },
    ] as const;
```

`sanitizeProvenance` and `sanitizeOwners` are unchanged and still run on whichever payload wins — the gate reads only prose fields, which neither sanitizer touches, so ordering between them is immaterial and the re-issued payload is sanitized on exactly the same terms as the first.

Cost, stated rather than discovered: with `maxSelfCorrectionAttempts: 2` and one re-issue, the worst case per analyzer is 6 LLM calls, each with its own 60 s budget. Analyzers inside a stage run under `Promise.allSettled`, so that is a per-analyzer bound on wall clock, not a sum across the six. Cost is an explicit non-goal of this design; the bound is written down here so nobody has to rediscover it from a slow run.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/runAnalyzers.test.ts`

Expected: PASS — the five new tests plus every test already in the file (20 before Phase 3; Phase 3 Task 45 appends more), 0 failures. The log will show three `restated its input instead of analysing it; re-issuing once` warnings, one `restated its input again` and one `re-issue failed`; those are the three degradation paths announcing themselves and are expected output, not failures.

Then confirm nothing else in the phase regressed:

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/`

Expected: PASS across all eight analyzer suites (the seven existing plus `novelty.test.ts` from Task 62). `payloadShape.test.ts`, `registry.test.ts`, `schemas.test.ts` and `sectionSummaries.test.ts` are untouched by this task — a failure there means an earlier phase's tripwire was left unupdated, not this one. The three verbatim abstain strings in `runAnalyzers.test.ts` are also untouched by design: the gate keeps the produced payload on every failure path, so it never reaches the abstention text.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/runAnalyzers.ts \
        Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): re-issue an analyzer that restates its input

runOne now scores its prose field (summary on executiveSummary, narrative on
the three raw-section analyzers) against its own user prompt and, above the
novelty threshold, re-issues the identical call once with a directive naming
the failure. Structured arrays are not scored.

Three degradation paths, all keeping the payload already produced: a second
restatement keeps the first payload, a throwing re-issue keeps the first
payload, and an abstention never spends the second call at all. The gate can
cost an LLM call; it can never cost an analysis.

restatementRetried on AnalyzerRunResult makes the firing observable, and
persistAnalyses carries it into audit_metadata.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Render layer, docs

> Makes the depth visible. Last because the payload shape must be settled first.

### Task 72: Carry structured findings, basis labels and filtered abstentions onto the render contract

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.reportGeneration.ts:119-148`
- Modify: `Servers/services/reporting/analyzers/mapToSummaries.ts:37-52,66`
- Test: `Servers/services/reporting/analyzers/__tests__/mapToSummaries.test.ts`

This task owns three shared surfaces the rest of Phase 5 consumes:
`AISummaries.keyFindingsDetailed` / `AISummaries.abstentions`, the single
`ANALYSIS_LABELS` map both renderers use, and the operational/analytical
abstention split.

- [ ] **Step 1: Write the failing test**

Change the import line at the top of
`Servers/services/reporting/analyzers/__tests__/mapToSummaries.test.ts` (line 1) to:

```ts
import { ANALYSIS_LABELS, isOperationalAbstention, mapAnalysesToSummaries } from "../mapToSummaries";
```

Append these six cases inside the existing `describe("mapAnalysesToSummaries", ...)` block, directly after the `"populates both the structured actions and the legacy string list"` case (before that describe's closing `});`):

```ts
  it("carries structured findings alongside the flat string list", () => {
    const out = mapAnalysesToSummaries({
      keyFindings: ok({
        findings: [
          {
            text: "Only 3 of 25 models name an owner",
            section: "models",
            severity: "high",
            basis: "observed",
            related_sections: ["modelRisks"],
            what_would_close_this: "An owner recorded on every model inventory row",
          },
        ],
      }),
    } as any);

    // The flat list stays: the renderers fall back to it.
    expect(out.keyFindings).toEqual(["Only 3 of 25 models name an owner"]);
    expect(out.keyFindingsDetailed).toEqual([
      {
        text: "Only 3 of 25 models name an owner",
        section: "models",
        severity: "high",
        basis: "observed",
        related_sections: ["modelRisks"],
        what_would_close_this: "An owner recorded on every model inventory row",
      },
    ]);
  });

  it("normalises the list fields but never invents a basis", () => {
    // Two payload shapes reach here: an older row with no basis key at all, and
    // a v2 row whose nullable basis came back null. Both must render no label.
    const out = mapAnalysesToSummaries({
      keyFindings: ok({
        findings: [
          { text: "Legacy finding text", section: "compliance", severity: "low" },
          {
            text: "Nullable finding text",
            section: "compliance",
            severity: "low",
            basis: null,
            what_would_close_this: null,
          },
        ],
      }),
    } as any);

    expect(out.keyFindingsDetailed?.[0].related_sections).toEqual([]);
    expect(out.keyFindingsDetailed?.[0].what_would_close_this).toBe("");
    // Absent is absent — a defaulted "observed" would be a fabricated
    // provenance claim, which is exactly what the basis label exists to prevent.
    expect(out.keyFindingsDetailed?.[0].basis).toBeUndefined();
    expect(out.keyFindingsDetailed?.[1].basis).toBeUndefined();
    expect(out.keyFindingsDetailed?.[1].what_would_close_this).toBe("");
  });

  it("carries the action basis label and rationale onto the render contract", () => {
    const out = mapAnalysesToSummaries({
      recommendedActions: ok({
        actions: [
          {
            action: "Assign owners to the 22 ownerless models",
            suggestedOwner: null,
            priority: "high",
            rationale: "22 of 25 model rows have no owner",
            basis: "observed",
          },
        ],
      }),
    } as any);

    expect(out.recommendedActions?.[0].basis).toBe("observed");
    expect(out.recommendedActions?.[0].sourceSignal).toBe("22 of 25 model rows have no owner");
  });

  it("records stated abstention reasons and skips the ones with nothing to say", () => {
    const out = mapAnalysesToSummaries({
      riskAnalysis: abstained,
      vendorRisk: { payload: null, abstained: true, abstain_reason: null, model: "m", attempts: 0 },
      executiveSummary: ok({ summary: "Posture is uneven." }),
    } as any);

    expect(out.abstentions).toEqual({ riskAnalysis: "no data" });
  });

  it("replaces an operational failure reason with a neutral sentence", () => {
    // "the AI service call failed" tells a regulator nothing about the
    // organization's posture and everything about our infrastructure. The
    // analytical reason next to it is the reader's actual answer, so it stays
    // verbatim.
    const out = mapAnalysesToSummaries({
      riskAnalysis: {
        payload: null,
        abstained: true,
        abstain_reason: "this analysis could not be produced because the AI service call failed",
        model: "m",
        attempts: 1,
      },
      vendorRisk: {
        payload: null,
        abstained: true,
        abstain_reason: "insufficient data for this section",
        model: "m",
        attempts: 0,
      },
    } as any);

    expect(out.abstentions).toEqual({
      riskAnalysis: "This analysis was not produced.",
      vendorRisk: "insufficient data for this section",
    });
  });

  it("labels every one of the seven analyzer keys, exactly once", () => {
    // ONE map. docxGenerator imports it and pdfGenerator passes it to EJS, so a
    // renderer that gains a block cannot drift its heading away from the other.
    expect(ANALYSIS_LABELS).toEqual({
      sectionSummaries: "Section summaries",
      executiveSummary: "Executive summary",
      keyFindings: "Key findings",
      recommendedActions: "Recommended actions",
      riskAnalysis: "Risk analysis",
      complianceGap: "Compliance gap analysis",
      vendorRisk: "Third-party risk analysis",
    });
  });
```

Then append this second top-level `describe` at the end of the file, after the closing `});` of `describe("mapAnalysesToSummaries", ...)`:

```ts
describe("isOperationalAbstention", () => {
  it("is true for the two reasons that describe the service rather than the data", () => {
    // Both strings are pinned verbatim in runAnalyzers.test.ts; they are
    // produced at runAnalyzers.ts:251 and :176.
    expect(
      isOperationalAbstention("this analysis could not be produced because the AI service call failed"),
    ).toBe(true);
    expect(isOperationalAbstention("no LLM key is configured for this organization")).toBe(true);
  });

  it("is false for every reason that tells the reader something about the data", () => {
    for (const reason of [
      "insufficient data for this section",
      "no section summaries were available to summarise",
      "no section produced a summary",
      "the vendor list contained no third-party processors",
    ]) {
      expect(isOperationalAbstention(reason)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/mapToSummaries.test.ts`

Expected: FAIL — the suite does not compile: `ANALYSIS_LABELS` and `isOperationalAbstention` are not exported from `../mapToSummaries`. Once they exist, the remaining failures are `out.keyFindingsDetailed` undefined (the mapper only produces the flat string list), `out.recommendedActions[0].basis` undefined (the action map drops the field), and `out.abstentions` undefined (nothing collects abstention reasons today).

- [ ] **Step 3: Implement**

Replace the `AISummaries` interface in `Servers/domain.layer/interfaces/i.reportGeneration.ts` (lines 119-148) with:

```ts
export interface AISummaries {
  executiveSummary?: string;
  keyFindings?: string[];
  /** Structured findings. Renderers prefer this when present and fall back to
   *  the flat keyFindings string list when absent.
   *
   *  basis is OPTIONAL: the schema field is nullable and older stored payloads
   *  predate it entirely. The mapper passes it through rather than defaulting
   *  it, because a defaulted "observed" is a fabricated provenance claim. */
  keyFindingsDetailed?: Array<{
    text: string;
    section: string;
    severity: "low" | "medium" | "high" | "critical";
    basis?: "observed" | "inferred" | "absent";
    related_sections: string[];
    what_would_close_this: string;
  }>;
  /** Per-analyzer abstention reasons, keyed by analyzer key, already filtered
   *  for presentation by mapAnalysesToSummaries. Today an abstention has no
   *  document surface at all. */
  abstentions?: Record<string, string>;
  recommendations?: string[];
  sectionSummaries: Record<string, string>;
  riskHighlights?: string;
  recommendedActions?: Array<{
    action: string;
    suggestedOwner?: string;  // MUST be an existing org member/role or omitted
    suggestedDueDate?: string;
    priority?: "low" | "medium" | "high" | "critical";
    sourceSignal?: string;
    basis?: "observed" | "inferred" | "absent";
  }>;
  /** Structured output of the riskAnalysis analyzer. */
  riskAnalysis?: {
    narrative: string;
    top_risks: Array<{ name: string; level: string; why: string }>;
  };
  /** Structured output of the complianceGap analyzer. Forwarded whole, so a
   *  nullable schema field arrives here as null rather than as undefined. */
  complianceGap?: {
    narrative: string;
    gaps: Array<{
      control: string;
      gap: string;
      priority: string;
      basis?: "observed" | "inferred" | "absent" | null;
      what_would_close_this?: string | null;
    }>;
    scores_caveat?: string | null;
  };
  /** Structured output of the vendorRisk analyzer. Forwarded whole; see above. */
  vendorRisk?: {
    narrative: string;
    concerns: Array<{
      vendor: string;
      concern: string;
      severity: string;
      basis?: "observed" | "inferred" | "absent" | null;
    }>;
  };
}
```

In `Servers/services/reporting/analyzers/mapToSummaries.ts`, insert this above the `mapAnalysesToSummaries` docblock (i.e. between the two `import type` lines and the `/** Flatten structured analyzer output ... */` comment on line 4):

```ts
/**
 * Display names for the seven analyzer keys, in ONE place. docxGenerator
 * imports this; pdfGenerator passes it into the EJS render data as
 * `analysisLabels`. Two hand-kept copies drift the first time a renderer gains
 * a block, and the mismatch is invisible until someone diffs a PDF against a
 * DOCX of the same run.
 */
export const ANALYSIS_LABELS: Record<string, string> = {
  sectionSummaries: "Section summaries",
  executiveSummary: "Executive summary",
  keyFindings: "Key findings",
  recommendedActions: "Recommended actions",
  riskAnalysis: "Risk analysis",
  complianceGap: "Compliance gap analysis",
  vendorRisk: "Third-party risk analysis",
};

/**
 * Two of the abstain_reason strings runAnalyzers can produce describe the
 * SERVICE, not the data (runAnalyzers.ts:251 and :176). In a regulator-facing
 * document "the AI service call failed" says nothing about the organization's
 * governance posture; the neutral sentence below is the honest amount of
 * information. Every other reason — "insufficient data for this section", "no
 * section produced a summary", and anything the model itself stated in
 * abstain_reason — IS a finding about the data and prints verbatim.
 */
const OPERATIONAL_ABSTAIN_REASONS = new Set([
  "this analysis could not be produced because the AI service call failed",
  "no LLM key is configured for this organization",
]);

export const OPERATIONAL_ABSTENTION_TEXT = "This analysis was not produced.";

export function isOperationalAbstention(reason: string): boolean {
  return OPERATIONAL_ABSTAIN_REASONS.has(reason.trim().toLowerCase());
}
```

Replace lines 37-52 of the same file with:

```ts
  const findings = take("keyFindings");
  if (findings?.findings?.length) {
    out.keyFindings = findings.findings.map((f: { text: string }) => f.text);
    // Structured copy for the renderers. related_sections and
    // what_would_close_this normalise to empty ("nothing to say"); basis
    // normalises null to undefined and is never defaulted, so a payload that
    // never stated one renders no label rather than a fabricated claim.
    out.keyFindingsDetailed = findings.findings.map((f: any) => ({
      text: f.text,
      section: f.section,
      severity: f.severity,
      basis: f.basis ?? undefined,
      related_sections: f.related_sections ?? [],
      what_would_close_this: f.what_would_close_this ?? "",
    }));
  }

  const actions = take("recommendedActions");
  if (actions?.actions?.length) {
    out.recommendedActions = actions.actions.map((a: any) => ({
      action: a.action,
      suggestedOwner: a.suggestedOwner ?? undefined,
      priority: a.priority,
      sourceSignal: a.rationale,
      basis: a.basis ?? undefined,
    }));
    // Keep the plain-string list the existing renderers already read.
    out.recommendations = actions.actions.map((a: any) => a.action);
  }
```

Then insert this immediately before the final `return out;` (line 66):

```ts
  // Why a block is missing. Only reasons the analyzer actually stated — an
  // abstention with no reason has nothing to tell the reader, so it stays out.
  // Operational failures are neutralised here rather than in each renderer, so
  // the two formats cannot disagree about what a reader is told.
  const abstentions: Record<string, string> = {};
  for (const [key, result] of Object.entries(analyses ?? {})) {
    const reason = result?.abstained ? result.abstain_reason : null;
    if (!reason) continue;
    abstentions[key] = isOperationalAbstention(reason) ? OPERATIONAL_ABSTENTION_TEXT : reason;
  }
  if (Object.keys(abstentions).length > 0) out.abstentions = abstentions;

```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/mapToSummaries.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/domain.layer/interfaces/i.reportGeneration.ts \
        Servers/services/reporting/analyzers/mapToSummaries.ts \
        Servers/services/reporting/analyzers/__tests__/mapToSummaries.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): carry structured findings, basis and abstentions to the renderers

mapAnalysesToSummaries flattened findings to bare strings and dropped
severity, section, basis and the counterfactual. Abstention reasons never
reached AISummaries at all, so a missing block had no explanation anywhere
in the document.

basis is optional throughout and is never defaulted: a defaulted "observed"
would be a fabricated provenance claim. Abstention reasons that describe the
service rather than the data are replaced with a neutral sentence here, once,
so the two renderers cannot disagree. ANALYSIS_LABELS lives here for the same
reason. All AISummaries additions are optional, so hand-built fixtures keep
compiling and the flat keyFindings list stays for renderer fallback.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 73: PDF renders structured findings, one page-break unit per finding

**Files:**
- Modify: `Servers/templates/reports/report-pdf.ejs:82-93,194-205`
- Test: `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

Append these three cases inside the existing `describe("report-pdf.ejs template", ...)` block in `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`, directly before the final `it("the template compiles at all", ...)` case:

```ts
  it("renders structured findings with severity, basis, counterfactual and related sections", () => {
    const html = render({
      sectionSummaries: {},
      executiveSummary: "Posture is uneven.",
      keyFindings: ["flat fallback text"],
      keyFindingsDetailed: [
        {
          text: "Only 3 of 25 models name an owner",
          section: "models",
          severity: "high",
          basis: "observed",
          related_sections: ["modelRisks", "policyManager"],
          what_would_close_this: "An owner recorded on every model inventory row",
        },
      ],
    });

    expect(html).toContain("Only 3 of 25 models name an owner");
    expect(html).toContain("chip chip-high");
    expect(html).toContain("observed");
    expect(html).toContain("Closes when: An owner recorded on every model inventory row");
    expect(html).toContain("modelRisks, policyManager");
    // The structured list replaces the flat one rather than printing both.
    expect(html).not.toContain("flat fallback text");
  });

  it("falls back to the flat keyFindings list when no structured findings exist", () => {
    const html = render({
      sectionSummaries: {},
      executiveSummary: "Posture is uneven.",
      keyFindings: ["flat fallback text"],
    });
    expect(html).toContain("flat fallback text");
  });

  it("avoids page breaks per finding, not around the whole executive summary block", () => {
    const html = render({ sectionSummaries: {}, executiveSummary: "Posture is uneven." });
    // include() returns "" in this harness, so the <style> slice is the
    // template's own inline CSS and nothing from pdf.css.
    const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    expect(css.replace(/\s+/g, " ")).toContain(".ai-finding { page-break-inside: avoid;");
    // A block taller than a page cannot honour the rule; it only pushes a blank
    // page ahead of itself.
    expect(css).not.toContain(".ai-executive-summary");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts`

Expected: FAIL — the first case fails on `"chip chip-high"` (the template renders `keyFindings` as bare `<li>` text and never reads `keyFindingsDetailed`), and the third fails on the missing `.ai-finding` rule while `.ai-executive-summary { page-break-inside: avoid; }` is still present at lines 82-84.

- [ ] **Step 3: Implement**

In `Servers/templates/reports/report-pdf.ejs`, replace lines 82-93:

```
    .ai-executive-summary {
      page-break-inside: avoid;
    }
    .ai-findings-list {
      padding-left: 20px;
      margin: 8px 0;
    }
    .ai-findings-list li {
      margin-bottom: 6px;
      font-size: 12px;
      color: #344054;
    }
```

with:

```
    /* Page-break avoidance sits on the individual finding, never on the whole
       AI block: an executive summary plus eight findings is taller than a
       page, and avoiding a break on a block that cannot fit only pushes a
       blank page ahead of it. The .ai-executive-summary wrapper div at the
       body keeps its class — it is the block's structural hook — it just no
       longer carries a break rule. */
    .ai-findings-list {
      padding-left: 20px;
      margin: 8px 0;
    }
    .ai-findings-list li {
      margin-bottom: 6px;
      font-size: 12px;
      color: #344054;
      page-break-inside: avoid;
    }
    .ai-finding {
      page-break-inside: avoid;
      margin: 0 0 12px 0;
      padding-left: 10px;
      border-left: 2px solid var(--color-border);
    }
    .ai-finding-text {
      font-size: 12px;
      line-height: 1.5;
      color: #344054;
    }
    .ai-finding-meta {
      font-size: 10px;
      color: #667085;
      margin-top: 3px;
    }
```

Then replace lines 194-205 (the Key Findings block):

```
      <% if (aiSummaries.keyFindings && aiSummaries.keyFindings.length > 0) { %>
      <div class="subsection">
        <div class="subsection-header">
          <h3 class="subsection-title">Key Findings</h3>
        </div>
        <ul class="ai-findings-list">
          <% aiSummaries.keyFindings.forEach(function(finding) { %>
          <li><%= finding %></li>
          <% }); %>
        </ul>
      </div>
      <% } %>
```

with:

```
      <% if (aiSummaries.keyFindingsDetailed && aiSummaries.keyFindingsDetailed.length > 0) { %>
      <div class="subsection">
        <div class="subsection-header">
          <h3 class="subsection-title">Key Findings</h3>
        </div>
        <% aiSummaries.keyFindingsDetailed.forEach(function(f) { %>
        <div class="ai-finding">
          <div>
            <span class="chip chip-<%= String(f.severity || 'default').toLowerCase() %>"><%= f.severity || 'unrated' %></span>
            <span class="ai-finding-meta"><%= f.section %><% if (f.basis) { %> &middot; <%= f.basis %><% } %></span>
          </div>
          <div class="ai-finding-text"><%= f.text %></div>
          <% if (f.what_would_close_this) { %>
          <div class="ai-finding-meta">Closes when: <%= f.what_would_close_this %></div>
          <% } %>
          <% if (f.related_sections && f.related_sections.length > 0) { %>
          <div class="ai-finding-meta">Related sections: <%= f.related_sections.join(', ') %></div>
          <% } %>
        </div>
        <% }); %>
      </div>
      <% } else if (aiSummaries.keyFindings && aiSummaries.keyFindings.length > 0) { %>
      <div class="subsection">
        <div class="subsection-header">
          <h3 class="subsection-title">Key Findings</h3>
        </div>
        <ul class="ai-findings-list">
          <% aiSummaries.keyFindings.forEach(function(finding) { %>
          <li><%= finding %></li>
          <% }); %>
        </ul>
      </div>
      <% } %>
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/templates/reports/report-pdf.ejs \
        Servers/services/reporting/__tests__/reportPdfTemplate.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): render finding severity, basis and counterfactual in the PDF

Findings printed as bare list items, so severity, section attribution, the
provenance label and what_would_close_this existed only in the stored
payload. The flat keyFindings list stays as the fallback path. Page-break
avoidance moves from the whole executive-summary block to the individual
finding, which is what longer prose needs to repaginate sanely.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 74: Stop wrapping whole AI blocks in a single page-break-avoid container

**Files:**
- Modify: `Servers/templates/reports/report-pdf.ejs:223,252,293`
- Test: `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

Append this case inside `describe("report-pdf.ejs template", ...)` in `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`, directly before the final `it("the template compiles at all", ...)` case:

```ts
  it("does not wrap a whole AI block in one page-break-avoid container", () => {
    // FULL leaves every report section falsy, so the only avoid-break markup
    // that could appear here is the three AI wrappers — the per-topic
    // avoid-break at line 587 is inside the sections.assessment guard and is
    // deliberately kept.
    const html = render(FULL);
    const body = html.slice(html.indexOf("</style>"));
    expect(body).not.toContain("avoid-break");
    // The blocks themselves must still render.
    expect(body).toContain("Recommended actions");
    expect(body).toContain("Compliance Gap Analysis");
    expect(body).toContain("Third-party risk analysis");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts`

Expected: FAIL — `expect(body).not.toContain("avoid-break")` fails: the recommended-actions wrapper (line 223), the compliance-gap wrapper (line 252) and the vendor-risk wrapper (line 293) all still carry `class="... avoid-break"`.

- [ ] **Step 3: Implement**

In `Servers/templates/reports/report-pdf.ejs` make three single-line edits. Line 223 (recommended actions), `<div class="subsection avoid-break">` becomes:

```
      <div class="subsection">
```

Line 252 (compliance gap wrapper), `<div class="avoid-break">` becomes:

```
    <div>
```

Line 293 (vendor risk wrapper), `<div class="subsection avoid-break">` becomes:

```
    <div class="subsection">
```

Nothing else changes: `.data-table tr { page-break-inside: avoid; }` already exists in `templates/reports/styles/pdf.css` (lines 466-469, inside the `@media print` block), so table rows keep their own protection, and `.ai-finding` from Task 73 covers findings.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/templates/reports/report-pdf.ejs \
        Servers/services/reporting/__tests__/reportPdfTemplate.test.ts
git commit -m "$(cat <<'EOF'
fix(reporting): drop block-level page-break avoidance from the long AI blocks

A 2500-character narrative plus a ten-row gap table does not fit on one
page, so page-break-inside: avoid on the wrapper buys nothing and costs a
near-blank page before it. Rows and findings keep their own finer-grained
avoidance.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 75: PDF recommended-actions table shows rationale and basis

**Files:**
- Modify: `Servers/templates/reports/report-pdf.ejs:227-244`
- Test: `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

Append this case inside `describe("report-pdf.ejs template", ...)` in `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`, directly before the final `it("the template compiles at all", ...)` case:

```ts
  it("renders the action rationale and basis label", () => {
    const html = render({
      sectionSummaries: {},
      recommendedActions: [
        {
          action: "Assign owners to the 22 ownerless models",
          priority: "high",
          sourceSignal: "22 of 25 model rows have no owner",
          basis: "observed",
        },
      ],
    });

    expect(html).toContain("<th>Why</th>");
    expect(html).toContain("<th>Basis</th>");
    expect(html).toContain("22 of 25 model rows have no owner");
    expect(html).toContain(">observed<");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts`

Expected: FAIL on `<th>Why</th>` — the actions table has exactly three columns (Action, Priority, Suggested owner) and never reads `sourceSignal` or `basis`.

- [ ] **Step 3: Implement**

In `Servers/templates/reports/report-pdf.ejs`, replace lines 227-244 (the recommended-actions table) with:

```
        <table class="data-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Why</th>
              <th>Priority</th>
              <th>Basis</th>
              <th>Suggested owner</th>
            </tr>
          </thead>
          <tbody>
            <% aiSummaries.recommendedActions.forEach(function(a) { %>
            <tr>
              <td><%= a.action %></td>
              <td><%= a.sourceSignal || '—' %></td>
              <td><%= a.priority || '—' %></td>
              <td><%= a.basis || '—' %></td>
              <td><%= a.suggestedOwner || 'Unassigned' %></td>
            </tr>
            <% }); %>
          </tbody>
        </table>
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts`

Expected: PASS — including the existing `"recommendedActions renders without executiveSummary"` case, whose `expect(html).toContain("—")` is still satisfied by the new empty cells.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/templates/reports/report-pdf.ejs \
        Servers/services/reporting/__tests__/reportPdfTemplate.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): show action rationale and basis in the PDF actions table

The analyzer has always produced a rationale per action; the table printed
only action, priority and owner, so the one sentence tying the action to a
signal in the data was discarded at render time.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 76: PDF renders the top_risks table

**Files:**
- Modify: `Servers/templates/reports/report-pdf.ejs:472-478`
- Modify: `Servers/templates/reports/styles/pdf.css:339`
- Test: `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

Append these two cases inside `describe("report-pdf.ejs template", ...)` in `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`, directly before the final `it("the template compiles at all", ...)` case:

```ts
  it("renders the top_risks table the riskAnalysis analyzer has always produced", () => {
    const html = render({
      sectionSummaries: {},
      riskHighlights: "Concentration risk dominates.",
      riskAnalysis: {
        narrative: "Concentration risk dominates.",
        top_risks: [
          { name: "Single model owner", level: "Very high", why: "25 of 25 models share one owner" },
        ],
      },
    });

    expect(html).toContain("Most material risks");
    expect(html).toContain("Single model owner");
    expect(html).toContain("chip chip-very-high");
    expect(html).toContain("25 of 25 models share one owner");
  });

  it("prints no top-risk table when the analyzer named no risks", () => {
    const html = render({
      sectionSummaries: {},
      riskAnalysis: { narrative: "Nothing material.", top_risks: [] },
    });
    expect(html).not.toContain("Most material risks");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts`

Expected: FAIL on `expect(html).toContain("Most material risks")` — `aiSummaries.riskAnalysis.top_risks` is rendered nowhere in the template; only `riskHighlights` (the narrative) reaches the page.

- [ ] **Step 3: Implement**

In `Servers/templates/reports/report-pdf.ejs`, replace lines 472-478 (the Risk Highlights block) with:

```
    <!-- Risk Highlights (AI-Generated) -->
    <% if (typeof aiSummaries !== 'undefined' && aiSummaries && aiSummaries.riskHighlights) { %>
    <div class="ai-risk-highlights-box">
      <div class="ai-analysis-label" style="color: #DC6803;">Risk Highlights</div>
      <div class="ai-analysis-content"><%= aiSummaries.riskHighlights %></div>
    </div>
    <% } %>

    <!-- Most material risks (AI-Generated) -->
    <% if (typeof aiSummaries !== 'undefined' && aiSummaries && aiSummaries.riskAnalysis && aiSummaries.riskAnalysis.top_risks && aiSummaries.riskAnalysis.top_risks.length > 0) { %>
    <div class="subsection">
      <div class="subsection-header">
        <h3 class="subsection-title">Most material risks</h3>
      </div>
      <table class="data-table">
        <thead>
          <tr><th>Risk</th><th>Level</th><th>Why it ranks here</th></tr>
        </thead>
        <tbody>
          <% aiSummaries.riskAnalysis.top_risks.forEach(function(r) { %>
          <tr>
            <td><strong><%= r.name %></strong></td>
            <td><span class="chip chip-<%= String(r.level).toLowerCase().replace(/\s+/g, '-') %>"><%= r.level %></span></td>
            <td><%= r.why %></td>
          </tr>
          <% }); %>
        </tbody>
      </table>
    </div>
    <% } %>
```

Then in `Servers/templates/reports/styles/pdf.css`, insert this rule immediately after `.chip-low` (which ends at line 337) and before `.chip-very-low` (line 339):

```css
/* "Very high" is a level the risk collectors emit and the risk-level chips
   never had a colour for; without this the top_risks chips print uncoloured
   next to coloured ones. */
.chip-very-high {
  background: #FEF3F2;
  color: #B42318;
}

```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts`

Expected: PASS. (The CSS rule is not asserted: the test harness stubs `include()` to `""`, so `pdf.css` is not in the rendered `<style>` block at all.)

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/templates/reports/report-pdf.ejs \
        Servers/templates/reports/styles/pdf.css \
        Servers/services/reporting/__tests__/reportPdfTemplate.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): render the top_risks table in the PDF

mapAnalysesToSummaries has always forwarded riskAnalysis whole, including
up to six named risks with their level and their justification. The
template read only the narrative, so the named risks reached the database
and stopped there. Adds the missing .chip-very-high colour, which is a level
the risk collectors emit and the chip palette never covered.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 77: PDF gaps carry basis and counterfactual, concerns carry basis

**Files:**
- Modify: `Servers/templates/reports/report-pdf.ejs:273-286,301-307`
- Test: `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

Append this case inside `describe("report-pdf.ejs template", ...)` in `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`, directly before the final `it("the template compiles at all", ...)` case:

```ts
  it("renders gap basis and counterfactual, and the concern basis label", () => {
    const html = render({
      sectionSummaries: {},
      complianceGap: {
        narrative: "Two controls lack evidence.",
        scores_caveat: null,
        gaps: [
          {
            control: "Art. 9 Risk management",
            gap: "No documented review cadence",
            priority: "high",
            basis: "absent",
            what_would_close_this: "A dated review record against Art. 9",
          },
        ],
      },
      vendorRisk: {
        narrative: "One processor lacks a DPA.",
        concerns: [
          { vendor: "DataCorp", concern: "No DPA on file", severity: "high", basis: "inferred" },
        ],
      },
    });

    expect(html).toContain("<th>Basis</th>");
    expect(html).toContain(">absent<");
    expect(html).toContain("Closes when: A dated review record against Art. 9");
    expect(html).toContain("(high, inferred)");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts`

Expected: FAIL on `<th>Basis</th>` — the gaps table has three columns (Control, Gap, Priority) and the concern list item prints only `(severity)`. (If Task 75 has already landed, the actions table supplies `<th>Basis</th>`, so this case then fails on `">absent<"` instead — either way it is red before the edit below.)

- [ ] **Step 3: Implement**

In `Servers/templates/reports/report-pdf.ejs`, replace lines 273-286 (the gaps table) with:

```
        <table class="data-table">
          <thead>
            <tr><th>Control</th><th>Gap</th><th>Basis</th><th>Priority</th></tr>
          </thead>
          <tbody>
            <% aiSummaries.complianceGap.gaps.forEach(function(g) { %>
            <tr>
              <td><strong><%= g.control %></strong></td>
              <td>
                <%= g.gap %>
                <% if (g.what_would_close_this) { %>
                <div class="ai-finding-meta">Closes when: <%= g.what_would_close_this %></div>
                <% } %>
              </td>
              <td><%= g.basis || '—' %></td>
              <td><span class="chip chip-<%= String(g.priority).toLowerCase() %>"><%= g.priority %></span></td>
            </tr>
            <% }); %>
          </tbody>
        </table>
```

Then replace lines 301-307 (the vendor concerns list) with:

```
      <% if (aiSummaries.vendorRisk.concerns && aiSummaries.vendorRisk.concerns.length > 0) { %>
      <ul class="ai-findings-list">
        <% aiSummaries.vendorRisk.concerns.forEach(function(c) { %>
        <li><strong><%= c.vendor %>:</strong> <%= c.concern %> (<%= c.severity %><%= c.basis ? ', ' + c.basis : '' %>)</li>
        <% }); %>
      </ul>
      <% } %>
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts`

Expected: PASS — the existing `"complianceGap renders narrative, caveat and gap rows"` case still holds; its `FULL` fixture carries no `basis`, so the new cell prints `—`.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/templates/reports/report-pdf.ejs \
        Servers/services/reporting/__tests__/reportPdfTemplate.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): surface gap and concern provenance labels in the PDF

A regulator-facing artifact has to say whether a claim is observed in the
data, inferred from it, or an assertion that something required is absent.
The counterfactual on each gap says what would have to be true for the gap
to close. Both stayed in the payload until now.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 78: PDF prints abstention reasons instead of a silent hole

**Files:**
- Modify: `Servers/templates/reports/report-pdf.ejs:309-311`
- Modify: `Servers/services/reporting/pdfGenerator.ts:11-14,63-72`
- Test: `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts:11,22-45`

The template gets the analyzer display names as EJS render data rather than
declaring its own copy — the one map lives in `mapToSummaries.ts` (Task 72).

- [ ] **Step 1: Write the failing test**

In `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`, add this import directly below the existing import on line 11:

```ts
import { ANALYSIS_LABELS } from "../analyzers/mapToSummaries";
```

Then in the `render` helper, add `analysisLabels` to the data object and to the `satisfies` type — replace the two lines

```ts
    aiSummaries,
    include: () => "",
  } satisfies Omit<ReportData, "aiSummaries"> & { aiSummaries?: AISummaries; include: (p: string) => string };
```

with:

```ts
    aiSummaries,
    // The renderer supplies these; the template must not declare its own copy.
    analysisLabels: ANALYSIS_LABELS,
    include: () => "",
  } satisfies Omit<ReportData, "aiSummaries"> & {
    aiSummaries?: AISummaries;
    analysisLabels: Record<string, string>;
    include: (p: string) => string;
  };
```

Append these two cases inside `describe("report-pdf.ejs template", ...)`, directly before the final `it("the template compiles at all", ...)` case:

```ts
  it("prints abstention reasons instead of leaving a silent hole", () => {
    const html = render({
      sectionSummaries: {},
      abstentions: {
        vendorRisk: "No vendors were in scope for this report.",
        riskAnalysis: "No risk rows were supplied.",
      },
    });

    expect(html).toContain("Analyses not produced");
    // Labels come from ANALYSIS_LABELS via render data, not from the template.
    expect(html).toContain("Third-party risk analysis");
    expect(html).toContain("No vendors were in scope for this report.");
    expect(html).toContain("Risk analysis");
    expect(html).toContain("No risk rows were supplied.");
  });

  it("prints no abstention block when every enabled analyzer produced output", () => {
    expect(render(FULL)).not.toContain("Analyses not produced");
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts`

Expected: FAIL on `expect(html).toContain("Analyses not produced")` — the template has no markup for `aiSummaries.abstentions`; an abstention renders as nothing at all.

- [ ] **Step 3: Implement**

In `Servers/templates/reports/report-pdf.ejs`, insert this block immediately after line 309 (the `<% } %>` that closes the vendor-risk block) and before the `<!-- ============================================ -->` comment that opens the risk-analysis group on line 311:

```

    <!-- ============================================ -->
    <!-- ANALYSES NOT PRODUCED (AI abstentions) -->
    <!-- ============================================ -->
    <% if (typeof aiSummaries !== 'undefined' && aiSummaries && aiSummaries.abstentions && Object.keys(aiSummaries.abstentions).length > 0) { %>
    <div class="subsection">
      <div class="subsection-header">
        <h3 class="subsection-title">Analyses not produced</h3>
      </div>
      <ul class="ai-findings-list">
        <% Object.keys(aiSummaries.abstentions).forEach(function(k) { %>
        <li><strong><%= (typeof analysisLabels !== 'undefined' && analysisLabels[k]) || k %>:</strong> <%= aiSummaries.abstentions[k] %></li>
        <% }); %>
      </ul>
    </div>
    <% } %>
```

The reasons are already presentation-filtered by `mapAnalysesToSummaries` (Task 72), so the template prints them verbatim and makes no judgement of its own.

In `Servers/services/reporting/pdfGenerator.ts`, add the import below the existing interface import (line 14):

```ts
import { ANALYSIS_LABELS } from "./analyzers/mapToSummaries";
```

and add one line to the `ejs.render` data object (currently lines 63-72), directly after `...reportData,`:

```ts
    // One analyzer-label map, shared with docxGenerator.
    analysisLabels: ANALYSIS_LABELS,
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportPdfTemplate.test.ts && npm run build`

Expected: PASS, and the TypeScript build succeeds (the `satisfies` clause now admits `analysisLabels`).

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/templates/reports/report-pdf.ejs \
        Servers/services/reporting/pdfGenerator.ts \
        Servers/services/reporting/__tests__/reportPdfTemplate.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): give abstentions a surface in the PDF

Honest abstention is the design's answer to thin data, but a reader could
not tell an abstained block from a block that was never enabled. The
reasons the analyzers state now print in an "Analyses not produced" list,
already filtered for presentation by mapAnalysesToSummaries.

The analyzer display names come in as render data from the one
ANALYSIS_LABELS map rather than being redeclared in the template.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 79: DOCX renders structured findings

**Files:**
- Modify: `Servers/services/reporting/docxGenerator.ts:578-597`
- Test: `Servers/services/reporting/tests/docxGenerator.spec.ts`

- [ ] **Step 1: Write the failing test**

Append these two cases inside the existing `describe("AI analysis sections", ...)` block in `Servers/services/reporting/tests/docxGenerator.spec.ts`, directly after the `"stays silent when every analyzer abstained"` case (before that describe's closing `});`):

```ts
    it("renders structured findings with severity, basis, counterfactual and related sections", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          executiveSummary: "Posture is uneven.",
          keyFindings: ["flat fallback text"],
          keyFindingsDetailed: [
            {
              text: "Only 3 of 25 models name an owner",
              section: "models",
              severity: "high",
              basis: "observed",
              related_sections: ["modelRisks", "policyManager"],
              what_would_close_this: "An owner recorded on every model inventory row",
            },
          ],
        }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("Key Findings");
      expect(text).toContain("[high] ");
      expect(text).toContain("Only 3 of 25 models name an owner");
      expect(text).toContain("Section: models · Basis: observed · Related: modelRisks, policyManager");
      expect(text).toContain("Closes when: An owner recorded on every model inventory row");
      // The structured list replaces the flat one rather than printing both.
      expect(text).not.toContain("flat fallback text");
    });

    it("falls back to the flat keyFindings list when no structured findings exist", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          executiveSummary: "Posture is uneven.",
          keyFindings: ["flat fallback text"],
        }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("flat fallback text");
    });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/docxGenerator.spec.ts`

Expected: FAIL on `expect(text).toContain("[high] ")` — `createExecutiveSummarySection` reads only `aiSummaries.keyFindings` and emits one bullet of bare text per finding; `keyFindingsDetailed` is never read, so the flat fallback text is still present too.

- [ ] **Step 3: Implement**

In `Servers/services/reporting/docxGenerator.ts`, replace lines 578-597 (the `// Key Findings` block inside `createExecutiveSummarySection`) with:

```ts
  // Key Findings. Prefer the structured list; the flat strings remain the
  // fallback for a payload that carries no detail.
  const detailed = aiSummaries.keyFindingsDetailed;
  if (detailed && detailed.length > 0) {
    elements.push(createSubsectionHeader("Key Findings"));
    detailed.forEach((f) => {
      elements.push(
        new Paragraph({
          spacing: { before: 60, after: 20 },
          indent: { left: convertInchesToTwip(0.3) },
          bullet: { level: 0 },
          children: [
            new TextRun({
              text: `[${f.severity}] `,
              bold: true,
              size: 20,
              color: COLORS.textPrimary,
            }),
            new TextRun({ text: f.text, size: 20, color: COLORS.textPrimary }),
          ],
        }),
      );

      // basis is optional: an older stored payload predates it and the schema
      // field is nullable. An absent label prints nothing rather than a
      // fabricated provenance claim.
      const meta = [
        `Section: ${f.section}`,
        f.basis ? `Basis: ${f.basis}` : null,
        f.related_sections?.length ? `Related: ${f.related_sections.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      elements.push(
        new Paragraph({
          spacing: { after: 20 },
          indent: { left: convertInchesToTwip(0.6) },
          children: [new TextRun({ text: meta, size: 18, color: COLORS.textSecondary })],
        }),
      );

      if (f.what_would_close_this) {
        elements.push(
          new Paragraph({
            spacing: { after: 60 },
            indent: { left: convertInchesToTwip(0.6) },
            children: [
              new TextRun({
                text: `Closes when: ${f.what_would_close_this}`,
                size: 18,
                color: COLORS.textSecondary,
              }),
            ],
          }),
        );
      }
    });
  } else if (aiSummaries.keyFindings && aiSummaries.keyFindings.length > 0) {
    elements.push(createSubsectionHeader("Key Findings"));
    aiSummaries.keyFindings.forEach((finding) => {
      elements.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: convertInchesToTwip(0.3) },
          bullet: { level: 0 },
          children: [
            new TextRun({
              text: finding,
              size: 20,
              color: COLORS.textPrimary,
            }),
          ],
        }),
      );
    });
  }
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/docxGenerator.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/docxGenerator.ts \
        Servers/services/reporting/tests/docxGenerator.spec.ts
git commit -m "$(cat <<'EOF'
feat(reporting): render finding severity, basis and counterfactual in the DOCX

Mirrors the PDF change so the two output formats do not diverge: severity
prefix, section attribution, provenance label, related sections and the
counterfactual, with the flat string list kept as the fallback path.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 80: DOCX recommended actions show rationale and basis

**Files:**
- Modify: `Servers/services/reporting/docxGenerator.ts:638-654`
- Test: `Servers/services/reporting/tests/docxGenerator.spec.ts`

- [ ] **Step 1: Write the failing test**

Append this case inside `describe("AI analysis sections", ...)` in `Servers/services/reporting/tests/docxGenerator.spec.ts`, directly after the two cases added in Task 79:

```ts
    it("renders the action rationale and basis label", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          recommendedActions: [
            {
              action: "Assign owners to the 22 ownerless models",
              priority: "high",
              suggestedOwner: "Jane Ops",
              sourceSignal: "22 of 25 model rows have no owner",
              basis: "observed",
            },
          ],
        }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("[high · Jane Ops · observed]");
      expect(text).toContain("Why: 22 of 25 model rows have no owner");
    });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/docxGenerator.spec.ts`

Expected: FAIL on `[high · Jane Ops · observed]` — the bracket run is built from priority and owner only (`docxGenerator.ts:647`), and `sourceSignal` is not rendered anywhere.

- [ ] **Step 3: Implement**

In `Servers/services/reporting/docxGenerator.ts`, replace lines 638-654 (the `recommendedActions.forEach` inside `createRecommendedActionsSection`) with:

```ts
  recommendedActions.forEach((a) => {
    elements.push(
      new Paragraph({
        spacing: { before: 60, after: 20 },
        indent: { left: convertInchesToTwip(0.3) },
        bullet: { level: 0 },
        children: [
          new TextRun({ text: a.action, size: 20, color: COLORS.textPrimary }),
          new TextRun({
            text: `  [${a.priority ?? "—"} · ${a.suggestedOwner ?? "Unassigned"}${a.basis ? ` · ${a.basis}` : ""}]`,
            size: 18,
            color: COLORS.textSecondary,
          }),
        ],
      }),
    );

    // The analyzer's one sentence tying this action to a signal in the input.
    if (a.sourceSignal) {
      elements.push(
        new Paragraph({
          spacing: { after: 60 },
          indent: { left: convertInchesToTwip(0.6) },
          children: [
            new TextRun({
              text: `Why: ${a.sourceSignal}`,
              size: 18,
              color: COLORS.textSecondary,
            }),
          ],
        }),
      );
    }
  });
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/docxGenerator.spec.ts`

Expected: PASS — including the existing `"[high · Jane Ops]"` and `"[— · Unassigned]"` assertions, which are byte-identical when no basis is present.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/docxGenerator.ts \
        Servers/services/reporting/tests/docxGenerator.spec.ts
git commit -m "$(cat <<'EOF'
feat(reporting): show action rationale and basis in the DOCX

Parity with the PDF actions table. The bracket stamp stays byte-identical
when no basis is present, so existing output is unchanged for payloads
that predate the label.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 81: DOCX renders the top_risks table

**Files:**
- Modify: `Servers/services/reporting/docxGenerator.ts:835-845`
- Test: `Servers/services/reporting/tests/docxGenerator.spec.ts`

- [ ] **Step 1: Write the failing test**

Append this case inside `describe("AI analysis sections", ...)` in `Servers/services/reporting/tests/docxGenerator.spec.ts`, directly after the case added in Task 80:

```ts
    it("renders the top_risks table alongside the risk highlights box", async () => {
      // riskAnalysis only ever produces output when a risk section was
      // collected, so the table lives with the highlights box inside the
      // risk-analysis section — the same place the PDF prints it.
      const result = await generateDOCX({
        ...mockReportData,
        sections: {
          modelRisks: {
            totalRisks: 1,
            risks: [
              {
                id: 1,
                modelName: "GPT-4",
                riskName: "Bias Risk",
                riskLevel: "High",
                mitigationStatus: "Open",
              },
            ],
          },
        },
        aiSummaries: {
          sectionSummaries: {},
          riskHighlights: "Concentration risk dominates.",
          riskAnalysis: {
            narrative: "Concentration risk dominates.",
            top_risks: [
              {
                name: "Single model owner",
                level: "Very high",
                why: "25 of 25 models share one owner",
              },
            ],
          },
        },
      });
      const text = await docxText(result.content);

      expect(text).toContain("Most material risks");
      expect(text).toContain("Single model owner");
      expect(text).toContain("Very high");
      expect(text).toContain("25 of 25 models share one owner");
      expect(text).toContain("Why it ranks here");
    });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/docxGenerator.spec.ts`

Expected: FAIL on `expect(text).toContain("Most material risks")` — `createRiskAnalysisSection` renders `riskHighlights` only; `riskAnalysis.top_risks` reaches no DOCX element.

- [ ] **Step 3: Implement**

In `Servers/services/reporting/docxGenerator.ts`, replace lines 835-845 (the `// Risk Highlights (AI-generated)` block inside `createRiskAnalysisSection`) with:

```ts
  // Risk Highlights (AI-generated)
  if (reportData.aiSummaries?.riskHighlights) {
    elements.push(
      ...createAIAnalysisBox(
        reportData.aiSummaries.riskHighlights,
        "Risk Highlights",
        COLORS.aiWarning,
        COLORS.aiWarningBg,
      ),
    );
  }

  // Most material risks. The analyzer has always produced top_risks; until now
  // nothing rendered them in either format.
  const topRisks = reportData.aiSummaries?.riskAnalysis?.top_risks;
  if (topRisks && topRisks.length > 0) {
    elements.push(createSubsectionHeader("Most material risks"));
    elements.push(
      createTable(
        ["Risk", "Level", "Why it ranks here"],
        topRisks.map((r) => [r.name, r.level || "-", r.why]),
      ),
    );
    elements.push(createTableSpacing());
  }
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/docxGenerator.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/docxGenerator.ts \
        Servers/services/reporting/tests/docxGenerator.spec.ts
git commit -m "$(cat <<'EOF'
feat(reporting): render the top_risks table in the DOCX

Same content and same position as the PDF: the named risks, their verbatim
level and the justification for ranking them, printed under the risk
highlights box.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 82: DOCX gaps carry basis and counterfactual, concerns carry basis

**Files:**
- Modify: `Servers/services/reporting/docxGenerator.ts:678-693,710-722`
- Test: `Servers/services/reporting/tests/docxGenerator.spec.ts`

- [ ] **Step 1: Write the failing test**

Append this case inside `describe("AI analysis sections", ...)` in `Servers/services/reporting/tests/docxGenerator.spec.ts`, directly after the case added in Task 81:

```ts
    it("renders gap basis and counterfactual, and the concern basis label", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          complianceGap: {
            narrative: "Two clauses lack evidence.",
            scores_caveat: null,
            gaps: [
              {
                control: "Clause 6.1",
                gap: "No documented risk criteria",
                priority: "high",
                basis: "absent",
                what_would_close_this: "A dated risk-criteria record against Clause 6.1",
              },
            ],
          },
          vendorRisk: {
            narrative: "One processor has no independent assurance report.",
            concerns: [
              {
                vendor: "Acme Cloud",
                concern: "No SOC 2 Type II",
                severity: "high",
                basis: "inferred",
              },
            ],
          },
        }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("No documented risk criteria (high, absent)");
      expect(text).toContain("Closes when: A dated risk-criteria record against Clause 6.1");
      expect(text).toContain("No SOC 2 Type II (high, inferred)");
    });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/docxGenerator.spec.ts`

Expected: FAIL on `"No documented risk criteria (high, absent)"` — the gap run prints `${g.gap} (${g.priority})` (`docxGenerator.ts:688`) with no basis, the counterfactual is not rendered at all, and the concern run prints `(${c.severity})` (`docxGenerator.ts:718`).

- [ ] **Step 3: Implement**

In `Servers/services/reporting/docxGenerator.ts`, replace lines 678-693 (the `if (gap.gaps && gap.gaps.length > 0)` block inside `createComplianceGapSection`) with:

```ts
  if (gap.gaps && gap.gaps.length > 0) {
    elements.push(createSubsectionHeader("Prioritised gaps"));
    gap.gaps.forEach((g) => {
      elements.push(
        new Paragraph({
          spacing: { before: 60, after: 20 },
          indent: { left: convertInchesToTwip(0.3) },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: `${g.control}: `, bold: true, size: 20, color: COLORS.textPrimary }),
            new TextRun({
              text: `${g.gap} (${g.priority}${g.basis ? `, ${g.basis}` : ""})`,
              size: 20,
              color: COLORS.textPrimary,
            }),
          ],
        }),
      );

      if (g.what_would_close_this) {
        elements.push(
          new Paragraph({
            spacing: { after: 60 },
            indent: { left: convertInchesToTwip(0.6) },
            children: [
              new TextRun({
                text: `Closes when: ${g.what_would_close_this}`,
                size: 18,
                color: COLORS.textSecondary,
              }),
            ],
          }),
        );
      }
    });
  }
```

Then replace lines 710-722 (the `(vendorRisk.concerns ?? []).forEach` inside `createVendorRiskSection`) with:

```ts
  (vendorRisk.concerns ?? []).forEach((c) => {
    elements.push(
      new Paragraph({
        spacing: { before: 60, after: 60 },
        indent: { left: convertInchesToTwip(0.3) },
        bullet: { level: 0 },
        children: [
          new TextRun({ text: `${c.vendor}: `, bold: true, size: 20, color: COLORS.textPrimary }),
          new TextRun({
            text: `${c.concern} (${c.severity}${c.basis ? `, ${c.basis}` : ""})`,
            size: 20,
            color: COLORS.textPrimary,
          }),
        ],
      }),
    );
  });
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/docxGenerator.spec.ts`

Expected: PASS — the existing `"No documented risk criteria (high)"` and `"No SOC 2 Type II (high)"` assertions still hold, since the fixtures at lines 265-273 carry no basis.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/docxGenerator.ts \
        Servers/services/reporting/tests/docxGenerator.spec.ts
git commit -m "$(cat <<'EOF'
feat(reporting): surface gap and concern provenance labels in the DOCX

Parity with the PDF: observed / inferred / absent on each gap and concern,
plus the counterfactual on gaps. Output for payloads without the labels is
byte-identical to before.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 83: DOCX prints abstention reasons instead of a silent hole

**Files:**
- Modify: `Servers/services/reporting/docxGenerator.ts:26-30,726-728,1304-1315`
- Test: `Servers/services/reporting/tests/docxGenerator.spec.ts`

- [ ] **Step 1: Write the failing test**

Append this case inside `describe("AI analysis sections", ...)` in `Servers/services/reporting/tests/docxGenerator.spec.ts`, directly after the case added in Task 82:

```ts
    it("prints why an analyzer abstained instead of leaving a silent hole", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          abstentions: {
            vendorRisk: "No vendors were in scope for this report.",
            riskAnalysis: "No risk rows were supplied.",
          },
        }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("Analyses not produced");
      // Same label strings as the PDF: both read ANALYSIS_LABELS.
      expect(text).toContain("Third-party risk analysis: ");
      expect(text).toContain("No vendors were in scope for this report.");
      expect(text).toContain("Risk analysis: ");
      expect(text).toContain("No risk rows were supplied.");
    });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/docxGenerator.spec.ts`

Expected: FAIL on `expect(text).toContain("Analyses not produced")` — `generateDOCX` composes six section builders and none of them reads `aiSummaries.abstentions`.

- [ ] **Step 3: Implement**

In `Servers/services/reporting/docxGenerator.ts`, add this import directly below the interface import block that ends on line 30:

```ts
import { ANALYSIS_LABELS } from "./analyzers/mapToSummaries";
```

(`mapToSummaries` imports only types from `runAnalyzers`, so this pulls no analyzer runtime into the DOCX path.)

Then insert this after `createVendorRiskSection` ends (immediately after the closing brace on line 726, before the `/** Create Risk Analysis section */` comment on line 728):

```ts
/**
 * Analyzer abstentions. Until now an abstention was completely silent in the
 * document: a missing block with no explanation, indistinguishable from a
 * block that was never enabled.
 *
 * The reasons arrive already filtered for presentation by
 * mapAnalysesToSummaries — an operational failure has been replaced there, in
 * one place, so this renderer and the PDF cannot disagree about what a reader
 * is told. Headings come from the shared ANALYSIS_LABELS map for the same
 * reason.
 */
function createAbstentionsSection(reportData: ReportData): (Paragraph | Table)[] {
  const abstentions = reportData.aiSummaries?.abstentions;
  if (!abstentions || Object.keys(abstentions).length === 0) return [];

  const elements: (Paragraph | Table)[] = [];
  elements.push(createSubsectionHeader("Analyses not produced"));
  Object.entries(abstentions).forEach(([key, reason]) => {
    elements.push(
      new Paragraph({
        spacing: { before: 60, after: 60 },
        indent: { left: convertInchesToTwip(0.3) },
        bullet: { level: 0 },
        children: [
          new TextRun({
            text: `${ANALYSIS_LABELS[key] ?? key}: `,
            bold: true,
            size: 20,
            color: COLORS.textPrimary,
          }),
          new TextRun({ text: reason, size: 20, color: COLORS.textPrimary }),
        ],
      }),
    );
  });

  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}

```

Then replace the `allChildren` array in `generateDOCX` (lines 1304-1315) with:

```ts
    // Combine all sections
    const allChildren = [
      ...coverPage,
      ...toc,
      ...aiExecutiveSummary,
      ...createRecommendedActionsSection(reportData),
      ...createComplianceGapSection(reportData),
      ...createVendorRiskSection(reportData),
      ...createAbstentionsSection(reportData),
      ...riskSection,
      ...complianceSection,
      ...organizationSection,
    ];
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/docxGenerator.spec.ts`

Expected: PASS — including the existing `"stays silent when every analyzer abstained"` case, whose fixture carries no `abstentions` map, so `createAbstentionsSection` returns `[]` and emits no stray page break.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/docxGenerator.ts \
        Servers/services/reporting/tests/docxGenerator.spec.ts
git commit -m "$(cat <<'EOF'
feat(reporting): give abstentions a surface in the DOCX

Same list, same position and same wording as the PDF, placed after the
third-party risk block and before the risk-analysis group. Headings come
from the shared ANALYSIS_LABELS map rather than a second hand-kept copy.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 84: Document the render surface and the abstention rules

**Files:**
- Modify: `docs/technical/domains/reporting.md:3,198,227,235-239`

`ANALYZER_VERSION` itself is bumped by Phase 2 Task 28; this task only records
the resulting value in the domain doc. Land Task 28 first or the doc will
disagree with `prompts.ts`.

- [ ] **Step 1: Define the check**

Documentation has no unit test. The check is a grep for the new content, plus
the backend build (the doc names symbols that must exist):

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
grep -c "report-analyzer-v2\|### Render\|ANALYSIS_LABELS" docs/technical/domains/reporting.md
```

- [ ] **Step 2: Run the check and watch it fail**

Run: `cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler && grep -c "report-analyzer-v2\|### Render\|ANALYSIS_LABELS" docs/technical/domains/reporting.md`

Expected: FAIL — prints `0`. The document describes neither the current version string nor what the renderers put on the page, and its "Last Updated" still reads 2026-07-20.

- [ ] **Step 3: Implement**

In `docs/technical/domains/reporting.md`, replace line 3:

```markdown
> **Last Updated:** 2026-07-22
```

Replace line 198 (the paragraph under `## AI Analysis`) with:

```markdown
Report AI output is produced by schema-validated analyzers in `services/reporting/analyzers/`. Each analyzer returns a zod-validated object (`schemas.ts`), never free text, so the renderers can lay it out as a formal compliance artifact instead of a prose blob.

Every row-level claim carries a `basis` label — `observed` (stated directly by the supplied data), `inferred` (follows from it by reasoning the data does not state) or `absent` (the claim is that something required is missing). Findings and gaps additionally carry `what_would_close_this`, the counterfactual that says what would have to be true for the item to stop being a finding. Both fields are **nullable**: a model that omits one must not turn a produced analysis into a lost one. Nothing defaults `basis` — an unstated basis renders no label, because a defaulted `observed` is a fabricated provenance claim. The label describes the *claim*; it does not relax `sanitizeProvenance`, which still drops any `gaps[].control`, `concerns[].vendor` or `top_risks[].name` that is not a verbatim substring of that analyzer's own prompt.
```

Replace line 227 (the paragraph under `### Abstention`) with:

```markdown
An analyzer that cannot produce grounded output **abstains** rather than inventing one. The report still generates. `mapAnalysesToSummaries` collects every stated reason onto `aiSummaries.abstentions`, keyed by analyzer key, and both renderers print them in an *Analyses not produced* list — an abstention with no stated reason contributes nothing rather than an empty line. Two of the reasons below describe the *service* rather than the data ("no LLM key…", "the AI service call failed"); `isOperationalAbstention` (`analyzers/mapToSummaries.ts`) replaces those with the neutral sentence "This analysis was not produced." before either renderer sees them, because our infrastructure is not a governance finding. Every other reason prints verbatim, because it is one. Abstention causes:
```

Insert a new `### Render` subsection between line 235 (`Absence of scores is never presented as absence of gaps.`) and line 237 (`### Versioning`):

```markdown
### Render

`mapAnalysesToSummaries` (`analyzers/mapToSummaries.ts`) flattens analyzer payloads onto `AISummaries`, which both renderers consume. Everything below renders identically in `templates/reports/report-pdf.ejs` and `services/reporting/docxGenerator.ts` — **change the two together or the formats diverge**:

| Payload | Rendered as |
|---------|-------------|
| `keyFindingsDetailed[]` | Severity chip, section, `basis`, the finding text, `Closes when:` and related section keys. Falls back to the flat `keyFindings` string list when absent. |
| `recommendedActions[]` | Action, `Why:` (the analyzer's `rationale`), priority, `basis`, suggested owner. |
| `riskAnalysis.top_risks[]` | *Most material risks* table: name, verbatim level, why it ranks there. |
| `complianceGap.gaps[]` | Control, gap, `basis`, priority, `Closes when:`. |
| `vendorRisk.concerns[]` | Vendor, concern, severity and `basis`. |
| `abstentions` | *Analyses not produced* list, one line per abstained analyzer. |

Three standing rendering constraints:

- **One analyzer-label map.** `ANALYSIS_LABELS` is exported from `analyzers/mapToSummaries.ts`. `docxGenerator.ts` imports it; `pdfGenerator.ts` passes it into the EJS render data as `analysisLabels`. Neither renderer declares its own copy — a second copy drifts the first time a block is added, and the mismatch only shows up when someone diffs a PDF against a DOCX of the same run.
- **No markdown renderer exists on any surface.** Asterisks and backticks print literally in both formats. Prompts must keep prose plain.
- **Page-break avoidance is per finding and per table row, never per block.** `page-break-inside: avoid` on an AI block taller than a page cannot be honoured and only pushes a blank page ahead of it, which is what longer prose produces.
```

Replace line 239 (the `### Versioning` paragraph) with:

```markdown
`ANALYZER_VERSION` (`analyzers/prompts.ts`) is stamped into `report_run_analyses.audit_metadata`; it currently reads `report-analyzer-v2`. **Bump it on any prompt or schema change** — it is how a stored analysis is traced back to the prompt and schema that produced it.
```

No `CLAUDE.md` is touched by this phase: no cross-cutting convention, migration rule or multi-tenancy rule changed, so no "Last Updated" bump is due on either `CLAUDE.md`.

- [ ] **Step 4: Run the check and watch it pass**

Run: `cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler && grep -c "report-analyzer-v2\|### Render\|ANALYSIS_LABELS" docs/technical/domains/reporting.md && cd Servers && npm run build`

Expected: PASS — grep prints `3` or more, and the TypeScript build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add docs/technical/domains/reporting.md
git commit -m "$(cat <<'EOF'
docs(reporting): document the render surface, provenance labels and abstention filtering

The abstention section claimed the document showed abstention reasons
before any renderer did; that is now true, the mechanism is named, and the
operational/analytical split is written down so nobody "fixes" it back into
printing infrastructure errors at a regulator.

Adds the render table both formats must satisfy together, plus the three
standing render constraints: one shared ANALYSIS_LABELS map, no markdown
renderer anywhere, and page-break avoidance per finding rather than per
block.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Prior-run comparison

> Independent, and the only phase whose value cannot be observed on a single run.

### Task 88: Read the most recent prior facts snapshot for a schedule

**Files:**
- Modify: `Servers/utils/reportRunAnalysis.utils.ts` (append a third export after `getRunAnalysesQuery`, which ends at line 71 — no earlier phase touches this file, so the number is current)
- Test: `Servers/utils/__tests__/reportRunAnalysis.utils.test.ts:1` (import) and `:94` (append cases inside the existing `describe`, whose closing `});` is line 95)

- [ ] **Step 1: Write the failing test**

Change line 1 of `Servers/utils/__tests__/reportRunAnalysis.utils.test.ts` to:

```ts
import {
  upsertRunAnalysisQuery,
  getRunAnalysesQuery,
  getPriorFactsSnapshotQuery,
} from "../reportRunAnalysis.utils";
```

Then insert these three cases immediately after the `"get filters by organization_id"` case (i.e. after line 94, before the closing `});` of the `describe` on line 95):

```ts
  it("prior facts lookup scopes to the schedule and filters organization_id on BOTH tables", async () => {
    const stored = {
      generatedAt: "2026-06-01T00:00:00.000Z",
      framework: "EU AI Act",
      subject: "Test Project",
      sections: { projectRisks: { totalRisks: 41 } },
    };
    mockQuery.mockResolvedValue([[{ facts: stored }], 1]);

    const facts = await getPriorFactsSnapshotQuery(12, 5);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("FROM report_run_analyses ra");
    expect(sql).toContain("JOIN report_runs r ON r.id = ra.report_run_id");
    expect(sql).toContain("r.scheduled_report_id = :scheduled_report_id");
    // Both sides. A filter on only the joined table is the shape that leaks
    // the moment somebody rewrites the join.
    expect(sql).toContain("r.organization_id = :organization_id");
    expect(sql).toContain("ra.organization_id = :organization_id");
    expect(sql).toContain("ORDER BY ra.analyzed_at DESC");
    expect(sql).toContain("LIMIT 1");
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({
      scheduled_report_id: 12,
      organization_id: 5,
    });
    expect(facts).toEqual(stored);
  });

  it("prior facts lookup returns null when no earlier run stored one", async () => {
    mockQuery.mockResolvedValue([[], 0]);
    expect(await getPriorFactsSnapshotQuery(12, 5)).toBeNull();
  });

  it("prior facts lookup skips rows whose audit_metadata carries no facts key", async () => {
    mockQuery.mockResolvedValue([[{ facts: null }], 1]);
    expect(await getPriorFactsSnapshotQuery(12, 5)).toBeNull();
    expect(mockQuery.mock.calls[0][0] as string).toContain(
      "ra.audit_metadata -> 'facts' IS NOT NULL",
    );
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- utils/__tests__/reportRunAnalysis.utils.test.ts`
Expected: FAIL — all three new cases die with `TypeError: (0 , _reportRunAnalysis.getPriorFactsSnapshotQuery) is not a function`, because the module exports only `upsertRunAnalysisQuery` and `getRunAnalysesQuery`. (ts-jest runs with `diagnostics: false` — see `Servers/jest.config.js` — so the missing export surfaces at runtime, not as TS2305.)

- [ ] **Step 3: Implement**

Append to `Servers/utils/reportRunAnalysis.utils.ts`, after `getRunAnalysesQuery` (which ends at line 71):

```ts
/**
 * The most recent facts snapshot stored for a schedule — the input to
 * prior-run comparison (design §10). One extra read, no LLM call.
 *
 * persistAnalyses writes the same snapshot onto every section row of a run, so
 * any row answers "what did the last run see"; newest-first plus LIMIT 1 picks
 * one without caring which section's write succeeded.
 *
 * Tenant isolation: organization_id is filtered on report_runs AND on
 * report_run_analyses. report_runs alone would be enough today — the sidecar
 * cannot outlive its run — but a guard on only one side of a join is the shape
 * that leaks when the join is later rewritten.
 *
 * The caller's own run cannot match itself: analyses are persisted after
 * generation, so at read time the current run has no rows. If an
 * analyse-in-place path is ever added, pass the run id and exclude it here.
 *
 * `-> 'facts'` (not `->>`) returns JSONB, which pg hands back as a parsed
 * object. `IS NOT NULL` is SQL NULL only, so a row that stored a JSON `null`
 * would slip through — persistAnalyses therefore omits the key entirely rather
 * than writing null.
 *
 * No explicit return type, matching the two exports above.
 */
export const getPriorFactsSnapshotQuery = async (
  scheduledReportId: number,
  organizationId: number,
) => {
  const result = (await sequelize.query(
    `SELECT ra.audit_metadata -> 'facts' AS facts
       FROM report_run_analyses ra
       JOIN report_runs r ON r.id = ra.report_run_id
      WHERE r.scheduled_report_id = :scheduled_report_id
        AND r.organization_id = :organization_id
        AND ra.organization_id = :organization_id
        AND ra.audit_metadata -> 'facts' IS NOT NULL
      ORDER BY ra.analyzed_at DESC
      LIMIT 1;`,
    {
      replacements: {
        scheduled_report_id: scheduledReportId,
        organization_id: organizationId,
      },
    },
  )) as [any[], number];
  return result[0][0]?.facts ?? null;
};
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- utils/__tests__/reportRunAnalysis.utils.test.ts`
Expected: PASS (8 cases — 5 existing plus 3 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/utils/reportRunAnalysis.utils.ts Servers/utils/__tests__/reportRunAnalysis.utils.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): read the prior run's stored facts snapshot

Design §10. One tenant-scoped query against report_run_analyses.audit_metadata,
joined to report_runs for the schedule. organization_id is filtered on both
tables so a later rewrite of the join cannot leak across tenants.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 89: Degrade-safe prior facts lookup for the analyzers

**Files:**
- Modify: `Servers/services/reporting/analyzers/collectAnalyzerInputs.ts` — one import line, and one function appended at the end of the file. Anchor on quoted text: Phase 2 Task 26 added an import and appended `collectFactsInput`, so today's line numbers (imports at 1-12, file ends at 193) no longer hold when this task is reached.
- Test: `Servers/services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts` — the `mockGaps` block, the `../collectAnalyzerInputs` import list, the `beforeEach`, and four appended cases. Same reason: Phase 2 Task 26 grew the import list and added two cases.

- [ ] **Step 1: Write the failing test**

In `Servers/services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`, insert this immediately after the `mockGaps` `jest.mock` block (the one ending `}));` after `getEvidenceGapsQuery: (...a: any[]) => mockGaps(...a),`) and before the `import { ... } from "../collectAnalyzerInputs";` statement:

```ts
// Same reason: reportRunAnalysis.utils imports the real sequelize instance at
// module load (reportRunAnalysis.utils.ts:1).
const mockPriorFacts = jest.fn();
jest.mock("../../../../utils/reportRunAnalysis.utils", () => ({
  getPriorFactsSnapshotQuery: (...a: any[]) => mockPriorFacts(...a),
}));
```

Then add `collectPriorFacts,` to the import list from `../collectAnalyzerInputs` — as Phase 2 Task 26 left it, that list is `collectReadinessInput`, `collectEvidenceGapsInput`, `collectAllowedOwners`, `collectFactsInput`, `resolveBlocks`; it becomes:

```ts
import {
  collectReadinessInput,
  collectEvidenceGapsInput,
  collectAllowedOwners,
  collectFactsInput,
  collectPriorFacts,
  resolveBlocks,
} from "../collectAnalyzerInputs";
```

Add one line to the existing `beforeEach`, after the `mockGaps.mockReset()...` line:

```ts
    mockPriorFacts.mockReset().mockResolvedValue(null);
```

Then append these four cases before the closing `});` of the `describe("collectAnalyzerInputs")` block:

```ts
  it("does not query for a prior snapshot when the run belongs to no schedule", async () => {
    // A manual run has no predecessor by construction. Skipping the query is
    // the whole of "degrade to prior = null silently".
    expect(await collectPriorFacts(undefined, 5)).toBeNull();
    expect(mockPriorFacts).not.toHaveBeenCalled();
  });

  it("returns the stored snapshot for the schedule, scoped to the organization", async () => {
    const stored = {
      generatedAt: "2026-06-01T00:00:00.000Z",
      framework: "EU AI Act",
      subject: "Test Project",
      sections: { projectRisks: { totalRisks: 41 } },
    };
    mockPriorFacts.mockResolvedValue(stored);

    expect(await collectPriorFacts(12, 5)).toEqual(stored);
    expect(mockPriorFacts).toHaveBeenCalledWith(12, 5);
  });

  it("degrades to no comparison when the lookup throws", async () => {
    // One extra read on the report path must never cost the report.
    mockPriorFacts.mockRejectedValue(new Error("db down"));
    expect(await collectPriorFacts(12, 5)).toBeNull();
  });

  it("rejects a stored value that is not a facts snapshot", async () => {
    // audit_metadata is unconstrained JSONB written by an earlier analyzer
    // version. A malformed prior must read as "no prior", never reach
    // renderFacts and throw inside the analysis path.
    mockPriorFacts.mockResolvedValue({ foo: 1 });
    expect(await collectPriorFacts(12, 5)).toBeNull();

    mockPriorFacts.mockResolvedValue("report-analyzer-v1");
    expect(await collectPriorFacts(12, 5)).toBeNull();

    mockPriorFacts.mockResolvedValue({ generatedAt: "2026-06-01T00:00:00.000Z" });
    expect(await collectPriorFacts(12, 5)).toBeNull();
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`
Expected: FAIL — the four new cases throw `TypeError: (0 , _collectAnalyzerInputs.collectPriorFacts) is not a function`; the 14 existing cases (12 in the file today plus the two Phase 2 Task 26 added) still pass.

- [ ] **Step 3: Implement**

In `Servers/services/reporting/analyzers/collectAnalyzerInputs.ts`, add one import immediately after the existing `import { getEvidenceGapsQuery } from "../../../utils/evidenceAi.utils";` line:

```ts
import { getPriorFactsSnapshotQuery } from "../../../utils/reportRunAnalysis.utils";
```

`FactsSnapshot` is already in scope — Phase 2 Task 26 added `import { collectFacts, renderFacts, type FactsSnapshot } from "./facts";` to this file. Do not import it a second time.

Then append at the end of the file, after `collectFactsInput` (the last export, added by Phase 2 Task 26):

```ts
/**
 * audit_metadata is unconstrained JSONB, written by whatever analyzer version
 * produced that run. Check the shape before handing it to renderFacts — an
 * older or partial object must read as "no prior", not blow up inside the
 * analysis path.
 */
function isFactsSnapshot(value: any): value is FactsSnapshot {
  return (
    !!value &&
    typeof value === "object" &&
    typeof value.generatedAt === "string" &&
    !!value.sections &&
    typeof value.sections === "object"
  );
}

/**
 * The previous run's facts snapshot for this schedule (design §10), or null.
 *
 * Null, never a throw. This is one extra read on the report path, and the
 * standing invariant is that analysis must not become a way to lose a report —
 * generateReport's catch would otherwise drop every analysis because a
 * comparison could not be made.
 *
 * A run with no schedule (a manual report) has no predecessor, so the query is
 * skipped entirely and the caller renders exactly what it renders today.
 */
export async function collectPriorFacts(
  scheduledReportId: number | undefined,
  organizationId: number,
): Promise<FactsSnapshot | null> {
  if (!scheduledReportId) return null;

  try {
    const stored = await getPriorFactsSnapshotQuery(scheduledReportId, organizationId);
    return isFactsSnapshot(stored) ? stored : null;
  } catch (error) {
    logger.warn("Report analyzers: prior facts lookup failed, degrading to no comparison", error);
    return null;
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`
Expected: PASS (18 cases — 12 in the file today, 2 from Phase 2 Task 26, 4 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/analyzers/collectAnalyzerInputs.ts Servers/services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): degrade-safe prior facts lookup for analyzers

collectPriorFacts returns null for a run with no schedule, for a lookup that
throws, and for a stored value whose shape is not a FactsSnapshot. Never
throws: generateReport's catch would drop every analysis, and a missing
comparison is not worth a lost report.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 90: Persist the facts snapshot and the gate result into audit_metadata

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.reportGeneration.ts:73-79` (the `analyses` row shape on `ReportGenerationResult`; no earlier phase edits this range — Phase 1 edits lines 218-230 and 292-301, Phase 5 edits 119-148, all below it)
- Modify: `Servers/services/reporting/analyzers/persistAnalyses.ts:7-41` (the JSDoc, the signature, and the `audit_metadata` literal, up to and including the `        });` on line 41)
- Test: `Servers/services/reporting/analyzers/__tests__/persistAnalyses.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/analyzers/__tests__/persistAnalyses.test.ts`:

```ts
const mockUpsert = jest.fn();
jest.mock("../../../../utils/reportRunAnalysis.utils", () => ({
  upsertRunAnalysisQuery: (...a: any[]) => mockUpsert(...a),
}));
jest.mock("../../../../middleware/aiContentTracker.middleware", () => ({
  trackAIContent: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { persistAnalyses } from "../persistAnalyses";

const analyses: any = {
  executiveSummary: {
    payload: { summary: "s" },
    abstained: false,
    abstain_reason: null,
    model: "gpt-4o-mini",
    attempts: 2,
    restatementRetried: true,
  },
  keyFindings: {
    payload: null,
    abstained: true,
    abstain_reason: "insufficient data for this section",
    model: "gpt-4o-mini",
    attempts: 0,
  },
};

const snapshot = {
  generatedAt: "2026-07-01T00:00:00.000Z",
  framework: "EU AI Act",
  subject: "Test Project",
  sections: { projectRisks: { totalRisks: 5 } },
};

describe("persistAnalyses audit_metadata", () => {
  beforeEach(() => {
    mockUpsert.mockReset().mockResolvedValue({ id: 1 });
  });

  it("stores the run's facts snapshot on every section row", async () => {
    // Every row is a valid answer to "what did the last run see", so the read
    // path never has to care which section's write happened to succeed.
    await persistAnalyses(77, 5, 3, analyses, snapshot);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    mockUpsert.mock.calls.forEach(([input]: any[]) => {
      expect(input.audit_metadata.facts).toEqual(snapshot);
    });
  });

  it("keeps the existing fields and records whether the shallowness gate re-issued", async () => {
    await persistAnalyses(77, 5, 3, analyses, snapshot);

    const rows = mockUpsert.mock.calls.map(([i]: any[]) => i);
    const keyFindings = rows.find((i: any) => i.section_key === "keyFindings");
    expect(keyFindings.audit_metadata).toEqual(
      expect.objectContaining({
        analyzer_version: expect.any(String),
        abstained: true,
        abstain_reason: "insufficient data for this section",
        attempts: 0,
        // §6 / success criterion 4: the gate's firing has to survive the run,
        // not live only in logger.warn.
        restatement_retried: false,
      }),
    );

    const exec = rows.find((i: any) => i.section_key === "executiveSummary");
    expect(exec.audit_metadata.restatement_retried).toBe(true);
  });

  it("omits the facts key entirely when no snapshot is supplied", async () => {
    // Not `facts: null`: the read query filters on SQL NULL, and a stored JSON
    // null would pass that filter and be read back as a prior.
    await persistAnalyses(77, 5, 3, analyses);

    mockUpsert.mock.calls.forEach(([input]: any[]) => {
      expect(Object.keys(input.audit_metadata)).not.toContain("facts");
    });
  });

  it("still reports per-section ai_status with a snapshot present", async () => {
    const status = await persistAnalyses(77, 5, 3, analyses, snapshot);
    expect(status).toEqual({ executiveSummary: "ok", keyFindings: "abstained" });
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/persistAnalyses.test.ts`
Expected: FAIL — 2 of 4. The first case fails with `received: undefined` on `input.audit_metadata.facts` (`persistAnalyses` takes four parameters); the second fails on `restatement_retried` being absent from the `objectContaining` match. The third and fourth cases pass already.

- [ ] **Step 3: Implement**

3a. In `Servers/domain.layer/interfaces/i.reportGeneration.ts`, replace lines 73-79 — the `analyses` row shape:

```ts
  analyses?: Record<string, {
    payload: any;
    abstained: boolean;
    abstain_reason: string | null;
    model: string | null;
    attempts: number;
  }>;
```

with:

```ts
  analyses?: Record<string, {
    payload: any;
    abstained: boolean;
    abstain_reason: string | null;
    model: string | null;
    attempts: number;
    /**
     * True when the §6 shallowness gate fired and the call was re-issued.
     * Optional, mirroring AnalyzerRunResult in analyzers/runAnalyzers.ts:
     * sectionSummaries never runs the gate.
     */
    restatementRetried?: boolean;
  }>;
```

3b. In `Servers/services/reporting/analyzers/persistAnalyses.ts`, replace lines 7-41 (the JSDoc through the `        });` that closes the `upsertRunAnalysisQuery` call) with:

```ts
/**
 * Persist one row per analyzed section and return a compact per-section status
 * map for report_runs.ai_status.
 *
 * `facts` is this run's deterministic facts snapshot. Only the scheduled runner
 * passes one: prior-run comparison is scoped to a schedule, so a manual run's
 * snapshot could never be read back and is not worth the bytes.
 *
 * Never throws: a report that generated successfully must not be marked failed
 * because its audit sidecar could not be written.
 */
export async function persistAnalyses(
  runId: number,
  organizationId: number,
  userId: number | null,
  analyses: ReportGenerationResult["analyses"],
  facts?: unknown,
): Promise<Record<string, string> | null> {
  if (!analyses || Object.keys(analyses).length === 0) return null;

  const aiStatus: Record<string, string> = {};

  await Promise.allSettled(
    Object.entries(analyses).map(async ([sectionKey, result]) => {
      aiStatus[sectionKey] = result?.abstained ? "abstained" : "ok";
      try {
        const written = await upsertRunAnalysisQuery({
          report_run_id: runId,
          section_key: sectionKey,
          organization_id: organizationId,
          payload: result?.payload ?? { abstain_reason: result?.abstain_reason ?? null },
          analysis_model: result?.model ?? null,
          analyzed_by: userId,
          audit_metadata: {
            analyzer_version: ANALYZER_VERSION,
            abstained: !!result?.abstained,
            abstain_reason: result?.abstain_reason ?? null,
            attempts: result?.attempts ?? 0,
            // Design §6, success criterion 4: whether the shallowness gate
            // re-issued the call. Coerced rather than conditional — an analyzer
            // that never runs the gate (sectionSummaries) genuinely did not
            // re-issue, and `false` says so.
            restatement_retried: !!result?.restatementRetried,
            // Design §10: the snapshot this run was built from, so the NEXT run
            // of this schedule can diff against it with no second LLM call.
            // Spread, not `facts: facts ?? null` — getPriorFactsSnapshotQuery
            // filters on SQL NULL, which a stored JSON null would survive.
            //
            // ponytail: written on every section row rather than picking one.
            // ~1-2 KB duplicated per run buys a read that does not depend on a
            // particular section's write succeeding. Narrow it if row size ever
            // matters.
            ...(facts ? { facts } : {}),
          },
        });
```

Everything from line 42 onward — the `// undefined means the WHERE EXISTS tenant guard rejected the pair` comment, the `if (!written)` block, the `catch`, the `trackAIContent` block and the `return aiStatus;` — stays exactly as it is.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/analyzers/__tests__/persistAnalyses.test.ts services/reporting/__tests__/manualReportRunner.test.ts`
Expected: PASS — 4 new cases, and the 8 manualReportRunner cases still pass. They assert `audit_metadata` with `expect.objectContaining` (`manualReportRunner.test.ts:95-97`), so the two added keys do not break them, and that runner passes no snapshot.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/domain.layer/interfaces/i.reportGeneration.ts \
        Servers/services/reporting/analyzers/persistAnalyses.ts \
        Servers/services/reporting/analyzers/__tests__/persistAnalyses.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): persist the facts snapshot and the gate result to audit_metadata

Design §10 write side, plus §6's success criterion. audit_metadata is
unconstrained JSONB, so no migration. The facts key is omitted rather than
nulled when no snapshot is passed, because the read path filters on SQL NULL
and a JSON null would read back as a prior. restatement_retried makes the
shallowness gate's firing observable after the run instead of only in the log.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 91: Hand the prior run's facts to the analyzers

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.reportGeneration.ts` — the `llmKeyId?: number;` line on `ReportGenerationRequest` (line 59 today; unshifted by Phases 1-5), and the tail of `ReportGenerationResult` as Task 90 left it
- Modify: `Servers/services/reporting/index.ts` — the `collectAnalyzerInputs` import list, the `let analyses` declaration, the `extras.facts = ...` line, and the `return { ...result, analyses };`. Anchor on the quoted text below, not on line numbers: Phase 2 Task 26 rewrote the import block and the extras assembly and shifted everything after them.
- Test: `Servers/services/reporting/tests/index.priorFacts.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/tests/index.priorFacts.spec.ts`:

```ts
const mockRunAnalyzers = jest.fn();
const mockPriorFacts = jest.fn();

jest.mock("../dataCollector", () => ({ createDataCollector: jest.fn() }));
jest.mock("../pdfGenerator", () => ({ generatePDF: jest.fn(), closeBrowser: jest.fn() }));
jest.mock("../docxGenerator", () => ({ generateDOCX: jest.fn() }));
jest.mock("../analyzers/runAnalyzers", () => ({
  runAnalyzers: (...a: any[]) => mockRunAnalyzers(...a),
}));
jest.mock("../../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn().mockResolvedValue([{ id: 1, model: "deepseek-v4-flash" }]),
}));
// collectAnalyzerInputs stays REAL — collectPriorFacts and collectFactsInput
// are what is under test. Its three DB-touching dependencies are mocked so the
// suite never loads database/db.ts.
jest.mock("../../../utils/reportRunAnalysis.utils", () => ({
  getPriorFactsSnapshotQuery: (...a: any[]) => mockPriorFacts(...a),
}));
jest.mock("../../../utils/readiness.utils", () => ({
  getControlScoresQuery: jest.fn(),
  getWeakestControlsQuery: jest.fn(),
  getFrameworkScoreByTypeQuery: jest.fn(),
}));
jest.mock("../../../utils/evidenceAi.utils", () => ({ getEvidenceGapsQuery: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { generateReport } from "../index";
import { createDataCollector } from "../dataCollector";
import { generatePDF } from "../pdfGenerator";

// Fresh per call: generateReport mutates reportData (branding, aiSummaries).
// The fixed generatedAt keeps 41 and 36 out of the rendered reference date, so
// the delta assertions below cannot pass or fail by coincidence.
const makeReportData = (): any => ({
  metadata: {
    projectId: 1,
    projectTitle: "Test Project",
    projectOwner: "John Doe",
    frameworkId: 1,
    frameworkName: "EU AI Act",
    projectFrameworkId: 1,
    generatedAt: new Date("2026-07-01T00:00:00.000Z"),
    generatedBy: "Test User",
    organizationId: 5,
    isOrganizational: false,
  },
  branding: { organizationName: "Test Org" },
  charts: {},
  renderedCharts: {},
  sections: { projectRisks: { totalRisks: 5, risksByLevel: [], risks: [] } },
});

const request: any = {
  projectId: 1,
  frameworkId: 1,
  projectFrameworkId: 1,
  reportType: "projectRisks",
  format: "pdf",
  aiEnhanced: true,
  aiBlocks: {
    sectionSummaries: false,
    executiveSummary: true,
    keyFindings: false,
    recommendedActions: false,
    riskAnalysis: false,
    complianceGap: false,
    vendorRisk: false,
  },
};

const priorSnapshot = {
  generatedAt: "2026-06-01T00:00:00.000Z",
  framework: "EU AI Act",
  subject: "Test Project",
  sections: { projectRisks: { totalRisks: 41 } },
};

const factsHandedToAnalyzers = (): string => mockRunAnalyzers.mock.calls[0][0].extras.facts;

describe("generateReport prior-run comparison", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createDataCollector as jest.Mock).mockReturnValue({
      collectAllData: jest.fn().mockImplementation(() => Promise.resolve(makeReportData())),
    });
    (generatePDF as jest.Mock).mockResolvedValue({
      success: true,
      filename: "r.pdf",
      content: Buffer.from("x"),
      mimeType: "application/pdf",
    });
    mockRunAnalyzers.mockResolvedValue({});
    mockPriorFacts.mockResolvedValue(null);
  });

  it("queries the prior snapshot for the schedule, in this organization", async () => {
    mockPriorFacts.mockResolvedValue(priorSnapshot);

    await generateReport({ ...request, scheduledReportId: 12 }, 3, 5);

    expect(mockPriorFacts).toHaveBeenCalledWith(12, 5);
  });

  it("renders delta lines from two snapshots, and none at all without a prior", async () => {
    mockPriorFacts.mockResolvedValue(priorSnapshot);
    await generateReport({ ...request, scheduledReportId: 12 }, 3, 5);
    const withPrior = factsHandedToAnalyzers();

    mockRunAnalyzers.mockClear();
    mockPriorFacts.mockResolvedValue(null);
    await generateReport({ ...request, scheduledReportId: 12 }, 3, 5);
    const withoutPrior = factsHandedToAnalyzers();

    expect(withPrior).not.toEqual(withoutPrior);
    expect(withPrior.split("\n").length).toBeGreaterThan(withoutPrior.split("\n").length);
    // renderFacts emits "Use Case Risks totalRisks: 5 (was 41, -36)". 41 is the
    // prior value, 36 the change against this run's 5; a run with no prior
    // carries neither number anywhere in the block.
    expect(withPrior).toMatch(/41|36/);
    expect(withoutPrior).not.toMatch(/41|36/);
  });

  it("never queries for a prior on a manual run, and still renders the facts block", async () => {
    await generateReport(request, 3, 5);

    expect(mockPriorFacts).not.toHaveBeenCalled();
    expect(factsHandedToAnalyzers().length).toBeGreaterThan(0);
  });

  it("keeps the analyses when the prior lookup fails", async () => {
    // One extra query must not become a way to lose a report's analysis.
    mockPriorFacts.mockRejectedValue(new Error("db down"));

    const result = await generateReport({ ...request, scheduledReportId: 12 }, 3, 5);

    expect(mockRunAnalyzers).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it("returns this run's snapshot so the runner can persist it", async () => {
    const result = await generateReport({ ...request, scheduledReportId: 12 }, 3, 5);

    expect(result.factsSnapshot).toEqual(
      expect.objectContaining({
        generatedAt: expect.any(String),
        sections: expect.any(Object),
      }),
    );
  });

  it("carries no snapshot when AI is off", async () => {
    const result = await generateReport({ ...request, aiEnhanced: false }, 3, 5);

    expect(result.factsSnapshot).toBeUndefined();
    expect(mockPriorFacts).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/index.priorFacts.spec.ts`
Expected: FAIL — `expect(mockPriorFacts).toHaveBeenCalledWith(12, 5)` reports `Number of calls: 0` (nothing in `generateReport` looks up a prior), the delta case fails on `expect(withPrior).not.toEqual(withoutPrior)`, and `result.factsSnapshot` is `undefined` in the fifth case.

- [ ] **Step 3: Implement**

3a. In `Servers/domain.layer/interfaces/i.reportGeneration.ts`, replace line 59 (`  llmKeyId?: number;`, the last field of `ReportGenerationRequest`) with:

```ts
  llmKeyId?: number;
  /**
   * The schedule this run belongs to, when it has one. Used only to find the
   * previous run's stored facts snapshot; a manual run leaves it undefined and
   * gets no prior-run comparison.
   */
  scheduledReportId?: number;
```

3b. In the same file, replace the tail of `ReportGenerationResult` as Task 90 left it:

```ts
    restatementRetried?: boolean;
  }>;
}
```

with:

```ts
    restatementRetried?: boolean;
  }>;
  /**
   * The deterministic facts snapshot this run's analyzers were built from. The
   * runner persists it to report_run_analyses.audit_metadata so the next run of
   * the same schedule can diff against it.
   *
   * Deliberately untyped here: nothing between this field and the JSONB column
   * reads it, and this file has no imports — the domain layer should not start
   * depending on a service module for a shape it never inspects. The real type
   * is FactsSnapshot in services/reporting/analyzers/facts.ts.
   */
  factsSnapshot?: unknown;
}
```

3c. In `Servers/services/reporting/index.ts`, add `collectPriorFacts,` to the `./analyzers/collectAnalyzerInputs` import list. As Phase 2 Task 26 left it, that import becomes:

```ts
import {
  collectAllowedOwners,
  collectEvidenceGapsInput,
  collectFactsInput,
  collectPriorFacts,
  collectReadinessInput,
  resolveBlocks,
} from "./analyzers/collectAnalyzerInputs";
```

Change nothing else in the import block — `import type { AnalyzerExtras } from "./analyzers/registry";` and `import { mapAnalysesToSummaries } from "./analyzers/mapToSummaries";` are both required and both already there.

3d. Replace the declaration line:

```ts
    let analyses: Record<string, any> | undefined;
```

with:

```ts
    let analyses: Record<string, any> | undefined;
    // `unknown`, matching ReportGenerationResult.factsSnapshot: nothing between
    // here and the JSONB column inspects it, so importing FactsSnapshot into
    // this file would buy nothing.
    let factsSnapshot: unknown;
```

3e. Replace the comment and the single `collectFactsInput` line that Phase 2 Task 26 put ABOVE the `const extras =` ternary:

```ts
        // Deterministic whole-estate aggregates, for every analyzer and every
        // block combination. No LLM call, no query — computed from the
        // ReportData already in hand.
        const { facts } = collectFactsInput(reportData);
```

with:

```ts
        // Deterministic whole-estate aggregates, for every analyzer and every
        // block combination. Still no LLM call; the one query is the prior
        // snapshot.
        //
        // Design §10: a scheduled run diffs against the last run of the same
        // schedule. A manual run has no schedule, priorFacts stays null, and
        // renderFacts emits no change block — exactly what renders today.
        const priorFacts = await collectPriorFacts(
          request.scheduledReportId,
          reportData.metadata.organizationId,
        );
        const { facts, snapshot } = collectFactsInput(reportData, priorFacts);
        factsSnapshot = snapshot;
```

This is the one line Phase 2 Task 26 said §10 would change. `facts` keeps flowing into BOTH branches of the `const extras =` ternary exactly as Task 26 wrote it — do not add an `extras.facts = …` assignment afterwards. Task 26's own note explains why: `strict` is on, and a post-hoc property assignment on a `{…} | {}` union does not compile without an added type annotation.

The rest of the AI block — `resolveBlocks`, the LLM key lookup, the `extras` ternary itself, the `runAnalyzers` call, `mapAnalysesToSummaries`, and the `catch` that keeps a failed analysis from losing the report — is untouched.

3f. Replace the return:

```ts
    return { ...result, analyses };
```

with:

```ts
    return { ...result, analyses, factsSnapshot };
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/tests/index.priorFacts.spec.ts services/reporting/tests/index.spec.ts`
Expected: PASS — 6 new cases, and the 9 existing `index.spec.ts` cases still pass (`factsSnapshot` is `undefined` on every path they exercise).

Then confirm the interface change compiles everywhere: `cd Servers && npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/domain.layer/interfaces/i.reportGeneration.ts Servers/services/reporting/index.ts Servers/services/reporting/tests/index.priorFacts.spec.ts
git commit -m "$(cat <<'EOF'
feat(reporting): hand the prior run's facts to the analyzers

Design §10 read side. generateReport looks up the last snapshot stored for the
same schedule and passes it to collectFactsInput, which was built to take one;
the analyzers see the delta and the caller gets this run's snapshot back.
Manual runs pass no schedule id, skip the query, and render exactly what they
render today. A failed lookup degrades to no comparison and never costs the
analyses.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 92: Carry the schedule id and the snapshot through the scheduled runner

**Files:**
- Modify: `Servers/services/reporting/reportRunOrchestrator.ts:23` (the `resolveReportRequest` call) and `:33-38` (the `persistAnalyses` call). No earlier phase touches this file.
- Test: `Servers/services/reporting/__tests__/reportRunOrchestrator.test.ts:70` (append cases before the closing `});` on line 71)

- [ ] **Step 1: Write the failing test**

Append these two cases to `Servers/services/reporting/__tests__/reportRunOrchestrator.test.ts`, after line 70 and before the closing `});` on line 71:

```ts
  it("tells the generator which schedule this run belongs to", async () => {
    // Without it generateReport cannot find the previous run, and every
    // scheduled report is written as if it were the first.
    generateReport.mockResolvedValue({ success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf" });
    deliverReport.mockResolvedValue({ storage: { status: "success", fileId: 5 }, emailLink: { status: "skipped" }, attachment: { status: "skipped" }, fileId: 5 });

    await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });

    expect(generateReport).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledReportId: 3 }),
      sched.owner_id,
      sched.organization_id,
    );
  });

  it("persists this run's facts snapshot so the next run can diff against it", async () => {
    const snapshot = {
      generatedAt: "2026-07-01T00:00:00.000Z",
      framework: "EU AI Act",
      subject: "Test Project",
      sections: { projectRisks: { totalRisks: 5 } },
    };
    generateReport.mockResolvedValue({
      success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf",
      factsSnapshot: snapshot,
      analyses: {
        executiveSummary: { payload: { summary: "s" }, abstained: false, abstain_reason: null, model: "gpt-4o-mini", attempts: 1 },
      },
    });
    deliverReport.mockResolvedValue({ storage: { status: "success", fileId: 5 }, emailLink: { status: "skipped" }, attachment: { status: "skipped" }, fileId: 5 });

    await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });

    expect(upsertRunAnalysisQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        audit_metadata: expect.objectContaining({ facts: snapshot }),
      }),
    );
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportRunOrchestrator.test.ts`
Expected: FAIL — the first new case fails because `generateReport` is called with a request that has no `scheduledReportId` key; the second fails because `audit_metadata` has no `facts` key (the orchestrator passes four arguments to `persistAnalyses`). The 4 existing cases pass.

- [ ] **Step 3: Implement**

In `Servers/services/reporting/reportRunOrchestrator.ts`, replace line 23:

```ts
    const request = resolveReportRequest(sched, sched.llm_key_id);
```

with:

```ts
    // The schedule id is what makes a prior-run comparison possible: this run's
    // predecessor is the last run of the same schedule. Attached here rather
    // than in resolveReportRequest, which maps template config and knows
    // nothing about runs.
    const request = {
      ...resolveReportRequest(sched, sched.llm_key_id),
      scheduledReportId: sched.id ?? undefined,
    };
```

Then replace lines 33-38 (the `persistAnalyses` call) with:

```ts
    const aiStatus = await persistAnalyses(
      run.id,
      sched.organization_id,
      sched.owner_id ?? sched.created_by ?? null,
      result.analyses,
      result.factsSnapshot,
    );
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd Servers && npm run test:unit -- services/reporting/__tests__/reportRunOrchestrator.test.ts services/reporting/__tests__/reportTemplateResolver.test.ts`
Expected: PASS — 6 orchestrator cases and the 5 untouched resolver cases. The resolver is unchanged; the schedule id is attached in the orchestrator, so the file pinning the seven blocks is neither edited nor broken.

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/services/reporting/reportRunOrchestrator.ts Servers/services/reporting/__tests__/reportRunOrchestrator.test.ts
git commit -m "$(cat <<'EOF'
feat(reporting): carry schedule id and facts snapshot through the runner

Closes the design §10 loop: the scheduled runner tells generateReport which
schedule the run belongs to, and hands the resulting snapshot to
persistAnalyses so the next run of that schedule has something to diff against.
The manual runner is left alone — its runs have no schedule, so a stored
snapshot could never be read back.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7 — End-to-end verification

> Runs the detector the rest of the plan built, against the success criteria in the spec.

> Phase 3 Task 51 already followed the payload change into
> `Clients/src/domain/interfaces/i.reporting.ts`. This phase does not repeat that
> edit — it only verifies the design's success criteria end to end.

### Task 100: Run a real report against the development database and check success criteria 3-6

**Files:**
- Create: `Servers/scripts/_depthCheck.ts`

Success criteria 3, 4, 5 and 6 are the only ones no earlier task touches. Every prior phase
verified itself with unit tests against fixtures; this task is the one that puts the pipeline
in front of the live 47-risk / 31-vendor / 26-model development estate and reads what came
back.

**Before/after, measured on the corpus that motivated the design.** These probes were run
against the existing 17 rows (3 report runs, `report-analyzer-v1`, model `deepseek-v4-flash`)
before any phase landed. Every one of them returned nothing:

| Probe | Result on the pre-change corpus |
|---|---|
| A percentage or a `n/m` ratio anywhere in a payload | 0 rows |
| An ISO date anywhere in a payload | 0 rows |
| A vendor name from `verifywise.vendors` quoted verbatim | 0 rows |
| A control title from `verifywise.controls_struct_eu` quoted verbatim | 0 rows |
| `audit_metadata.facts` present | `false` on all 7 rows of the newest run |
| `riskAnalysis` / `vendorRisk` produced prose | both abstained, `insufficient data for this section` |

So each probe below is a genuine red-to-green, not a tautology.

**Read-only against the database, except through the product's own write path.** The script
writes exactly what a real report run writes: one `report_runs` row and one
`report_run_analyses` row per section, through `createRunQuery`, `persistAnalyses` and
`updateRunStatusQuery`. Every `psql` invocation in this task is a `SELECT`. Do not run
`UPDATE`, `DELETE`, `TRUNCATE` or `INSERT` by hand against `verifywise` — it is the live
development database, not `verifywise_test`.

- [ ] **Step 1: Write the verification harness**

Create `Servers/scripts/_depthCheck.ts` (the `_` prefix matches the existing throwaway harnesses
`_verifyai.ts` / `_denemecheck.ts` that already live in this directory):

```ts
/**
 * Design success criteria 3-6, against the development database.
 *
 * Runs one real AI-enhanced report through the same three calls the scheduled
 * runner makes — createRunQuery, generateReport, persistAnalyses — and writes
 * both output formats to /tmp so criterion 6 can be read.
 *
 * deliverReport and uploadFile are deliberately NOT called: delivery would
 * exercise the email and file-storage channels, which have nothing to do with
 * analyzer depth and one of which sends mail.
 *
 * The run is attached to scheduled report 3, which already has a prior run, so
 * the §10 prior-facts lookup runs for real. On the FIRST invocation there is no
 * stored snapshot to find (the existing rows predate §10) and the facts block
 * carries no delta lines; a SECOND invocation finds this run's snapshot and
 * does. Both are correct.
 */
import { writeFileSync } from "fs";
import { generateReport } from "../services/reporting";
import { persistAnalyses } from "../services/reporting/analyzers/persistAnalyses";
import { createRunQuery, updateRunStatusQuery } from "../utils/reportRun.utils";
import { sequelize } from "../database/db";

const ORG_ID = 1;
const USER_ID = 1;
// Attaching to an existing schedule is what makes §10 reachable. Nothing about
// this schedule's own config is used: the request below is built by hand so the
// risk and vendor sections are present (criterion 5).
const SCHEDULE_ID = 3;

const request: any = {
  projectId: 1,
  frameworkId: 1,
  projectFrameworkId: 1,
  // Every section that carries data on this database. riskAnalysis reads
  // projectRisks/vendorRisks/modelRisks and vendorRisk reads vendors/vendorRisks
  // (registry.ts:63-64) — omit these and both abstain by design, which is what
  // happened on all three stored runs.
  reportType: [
    "projectRisks",
    "vendorRisks",
    "modelRisks",
    "vendors",
    "models",
    "compliance",
    "policyManager",
    "trainingRegistry",
  ],
  format: "pdf",
  aiEnhanced: true,
  scheduledReportId: SCHEDULE_ID,
  aiBlocks: {
    sectionSummaries: true,
    executiveSummary: true,
    keyFindings: true,
    recommendedActions: true,
    riskAnalysis: true,
    complianceGap: true,
    vendorRisk: true,
  },
};

(async () => {
  const run = await createRunQuery({
    organization_id: ORG_ID,
    scheduled_report_id: SCHEDULE_ID,
    triggered_by: "manual",
    triggered_by_user_id: USER_ID,
    config_snapshot: { ai_blocks_config: request.aiBlocks },
  });
  console.log("RUN_ID:", run.id);

  const pdf = await generateReport(request, USER_ID, ORG_ID);
  if (!pdf.success) throw new Error(`pdf generation failed: ${pdf.error}`);
  writeFileSync("/tmp/depth-check.pdf", pdf.content);

  await persistAnalyses(run.id, ORG_ID, USER_ID, pdf.analyses, (pdf as any).factsSnapshot);
  await updateRunStatusQuery(run.id, ORG_ID, {
    status: "success",
    output_filename: "depth-check.pdf",
    output_mime_type: "application/pdf",
  });

  const docx = await generateReport({ ...request, format: "docx" }, USER_ID, ORG_ID);
  if (!docx.success) throw new Error(`docx generation failed: ${docx.error}`);
  writeFileSync("/tmp/depth-check.docx", docx.content);

  console.log("\n=== ANALYZERS (pdf run, persisted to run", run.id, ") ===");
  for (const [key, value] of Object.entries<any>(pdf.analyses ?? {})) {
    console.log(
      key.padEnd(20),
      value.abstained ? `ABSTAIN -> ${value.abstain_reason}` : "OK",
      "attempts:",
      value.attempts,
      "restatementRetried:",
      value.restatementRetried,
    );
  }
  console.log("\nPDF  /tmp/depth-check.pdf");
  console.log("DOCX /tmp/depth-check.docx");
})()
  .then(async () => {
    await sequelize.close();
    // The pdf renderer's browser and the redis client keep handles open; the
    // work is done, so exit rather than hang.
    process.exit(0);
  })
  .catch(async (e: any) => {
    console.error("DEPTH CHECK FAILED:", e?.stack || e?.message || e);
    await sequelize.close();
    process.exit(1);
  });
```

- [ ] **Step 2: Build and run it**

`ts-node` type-checks this whole project and takes minutes; the compiled path is the one that
works. `scripts/**/*.ts` is inside `tsconfig.json`'s `include`, so `npm run build` emits it.

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler/Servers
npm run build
node dist/scripts/_depthCheck.js 2>&1 | tee /tmp/depth-check.log
```

Expected: `RUN_ID: <n>` on the first line (note it — every query below reads the newest run,
but the number is what you check them against), then an `ANALYZERS` block with seven lines, then
the two output paths. Two real LLM rounds against `deepseek-v4-flash`, roughly one to three
minutes; cost is an explicit non-goal of this design.

If it fails: `pdf generation failed` means puppeteer could not launch (the PDF renderer, not the
analyzers); `no LLM key is configured for this organization` on every analyzer line means
`verifywise.llm_keys` has no row for org 1 — there is exactly one there today, id 1,
`deepseek-v4-flash`.

- [ ] **Step 3: Criterion 3 — the analyses cite values, dates and identifiers**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler/Servers
export PGPASSWORD="$(grep -E '^DB_PASSWORD=' .env | cut -d= -f2-)"
psql -h localhost -p 5432 -U postgres -d verifywise -A -F'|' <<'SQL'
-- A. at least one percentage or ratio
WITH r AS (SELECT max(report_run_id) AS id FROM verifywise.report_run_analyses)
SELECT 'A pct/ratio' AS probe, a.section_key,
       substring(a.payload::text from '.{0,80}([0-9]+(\.[0-9]+)?\s*(%|percent)|\y[0-9]+\s*/\s*[0-9]+\y).{0,80}') AS context
FROM verifywise.report_run_analyses a, r
WHERE a.report_run_id = r.id
  AND a.payload::text ~ '[0-9]+(\.[0-9]+)?\s*(%|percent)|\y[0-9]+\s*/\s*[0-9]+\y';

-- B. at least one date, with enough context to see what it is compared against
WITH r AS (SELECT max(report_run_id) AS id FROM verifywise.report_run_analyses)
SELECT 'B iso date' AS probe, a.section_key,
       substring(a.payload::text from '.{0,110}[0-9]{4}-[0-9]{2}-[0-9]{2}.{0,110}') AS context
FROM verifywise.report_run_analyses a, r
WHERE a.report_run_id = r.id AND a.payload::text ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}';

-- B2. the reference date those dates must be compared against
WITH r AS (SELECT max(report_run_id) AS id FROM verifywise.report_run_analyses)
SELECT DISTINCT 'B2 reference date' AS probe,
       a.audit_metadata->'facts'->>'generatedAt' AS reference_date
FROM verifywise.report_run_analyses a, r WHERE a.report_run_id = r.id;

-- C. at least one verbatim vendor or control identifier
WITH r AS (SELECT max(report_run_id) AS id FROM verifywise.report_run_analyses)
SELECT DISTINCT 'C vendor' AS probe, a.section_key, v.vendor_name AS identifier
FROM verifywise.report_run_analyses a, r, verifywise.vendors v
WHERE a.report_run_id = r.id AND v.organization_id = 1
  AND a.payload::text ILIKE '%' || v.vendor_name || '%';

WITH r AS (SELECT max(report_run_id) AS id FROM verifywise.report_run_analyses)
SELECT DISTINCT 'C control' AS probe, a.section_key, c.title AS identifier
FROM verifywise.report_run_analyses a, r, verifywise.controls_struct_eu c
WHERE a.report_run_id = r.id AND length(c.title) > 12
  AND a.payload::text ILIKE '%' || c.title || '%';
SQL
```

PASS requires **all three** of:

- probe A returns at least one row. Read the `context` column: a bare `20 of 22` copied out of
  the input is what the corpus already had and does not count — a percentage, a `n/m` ratio or
  the word `percent` does. (Probe A deliberately does not match `n of m` for that reason.)
- probe B returns at least one row **and** the surrounding context relates the date to probe
  B2's `reference_date`. This half cannot be asserted mechanically: a date that merely appears
  is not a comparison. A pass reads like *"…due 2026-05-14, four months before the 2026-09-14
  reference date…"* or *"…last reviewed 2025-11-02 and therefore overdue…"*. A fail is a date
  printed with no relation to anything.
- probe C returns at least one row from either query.

Also PASS: probe B2 returns exactly one non-null `reference_date`. A null there means
`audit_metadata.facts` was not written and criterion 4 has already failed — see Step 4.

- [ ] **Step 4: Criterion 4 — the facts snapshot and the gate result are on the record**

```bash
psql -h localhost -p 5432 -U postgres -d verifywise -A -F'|' <<'SQL'
WITH r AS (SELECT max(report_run_id) AS id FROM verifywise.report_run_analyses)
SELECT a.section_key,
       a.audit_metadata->>'analyzer_version' AS version,
       (a.audit_metadata ? 'facts') AS has_facts,
       a.audit_metadata->>'restatement_retried' AS restatement_retried,
       a.audit_metadata->>'attempts' AS attempts
FROM verifywise.report_run_analyses a, r
WHERE a.report_run_id = r.id ORDER BY a.section_key;

-- Whole object for one row, so a key written under a different name is visible
-- rather than silently absent.
WITH r AS (SELECT max(report_run_id) AS id FROM verifywise.report_run_analyses)
SELECT jsonb_pretty(a.audit_metadata)
FROM verifywise.report_run_analyses a, r
WHERE a.report_run_id = r.id AND a.section_key = 'executiveSummary';
SQL
```

PASS requires:

- `version` is `report-analyzer-v2` on every row (Phase 2 Task 28).
- `has_facts` is `t` on every row. It was `f` on all seven rows of the previous run.
- `restatement_retried` is `false` on the `executiveSummary` row, and the full-object query shows
  the key. **`false` is the pass**: criterion 4 is "the gate reports below-threshold overlap for
  the executive summary against its input", which is the gate not firing. `true` means the first
  attempt restated its input and was re-issued — the gate worked, but the prompt work did not,
  and the second attempt's output is what got stored. An empty column means the key is missing
  entirely: Phase 6's `audit_metadata` write did not carry `restatement_retried` through, and
  criterion 4 is unobservable rather than met.

Cross-check against the console output from Step 2: the `restatementRetried:` values printed
there are the in-memory truth, and must match what the column shows.

- [ ] **Step 5: Criterion 5 — riskAnalysis and vendorRisk produced prose**

```bash
psql -h localhost -p 5432 -U postgres -d verifywise -A -F'|' <<'SQL'
WITH r AS (SELECT max(report_run_id) AS id FROM verifywise.report_run_analyses)
SELECT a.section_key,
       (a.audit_metadata->>'abstained')::boolean AS abstained,
       a.audit_metadata->>'abstain_reason' AS reason,
       length(a.payload->>'narrative') AS narrative_chars,
       jsonb_array_length(COALESCE(a.payload->'top_risks', a.payload->'concerns', '[]'::jsonb)) AS rows
FROM verifywise.report_run_analyses a, r
WHERE a.report_run_id = r.id AND a.section_key IN ('riskAnalysis', 'vendorRisk')
ORDER BY a.section_key;
SQL
```

PASS: two rows, both with `abstained` = `f`, a null `reason`, `narrative_chars` well above zero,
and `rows` at least 1. On the stored corpus both were `t` with
`insufficient data for this section` and a null narrative, on both runs that requested them.

If either still abstains with `insufficient data for this section`, its sections carried no data
— re-check that `reportType` in the script still lists `projectRisks`, `vendorRisks`,
`modelRisks` and `vendors`. If either abstains with
`this analysis could not be produced because the AI service call failed`, that is the
produced-analysis-becomes-lost path: the payload failed schema validation twice. Read
`/tmp/depth-check.log` for the validation error before touching anything else.

- [ ] **Step 6: Criterion 6 — both documents show the new surfaces**

```bash
pdftotext -layout /tmp/depth-check.pdf /tmp/depth-check-pdf.txt
unzip -p /tmp/depth-check.docx word/document.xml \
  | sed -e 's/<[^>]*>//g' > /tmp/depth-check-docx.txt

for f in /tmp/depth-check-pdf.txt /tmp/depth-check-docx.txt; do
  echo "=== $f ==="
  grep -c "Most material risks"      "$f"
  grep -c "Why it ranks here"        "$f"
  grep -cE "observed|inferred|absent" "$f"
  grep -c "Closes when:"             "$f"
  grep -c "Analyses not produced"    "$f"
done
```

PASS, mechanically:

- `Most material risks` and `Why it ranks here` each appear at least once in **both** files.
  This is the `top_risks` table, which was rendered nowhere before this work — its absence in
  either file means the two renderers diverged, which §11 exists to prevent.
- `observed|inferred|absent` appears at least once in both. In the PDF a finding's basis prints
  after its section (`compliance · observed`); in the DOCX it prints as `Basis: observed`.
- `Closes when:` appears at least once in both.
- `Analyses not produced` appears **zero** times if Step 5 passed — nothing abstained, so there
  is nothing to list. If Step 5 showed an abstention, it must appear exactly once, in both.

PASS, by eye — open `/tmp/depth-check.pdf` and `/tmp/depth-check.docx` and confirm:

- The **Key Findings** block shows a severity chip (`high` / `medium` / `low` / `critical`) next
  to each finding in the PDF, and a leading `[high]` in the DOCX. A finding with no visible
  severity means the renderer fell back to the flat `keyFindings` string list.
- The **Recommended actions** table has a populated `Why` column. An empty `Why` column means
  `rationale` is not reaching `sourceSignal` in `mapToSummaries`.
- If anything abstained, the *Analyses not produced* list shows a human analyzer label (not a raw
  key like `vendorRisk`), and its reason is either an analytical one printed verbatim
  (`insufficient data for this section`) or the neutral `This analysis was not produced.` — an
  operational reason such as `no LLM key is configured for this organization` must **not** appear
  on the page.
- The findings and the actions table do not straddle a page break mid-item in the PDF. Whole-block
  `page-break-inside: avoid` moved to per-item granularity in Phase 5 Task 74; substantially
  longer prose is exactly what makes that visible.
- No literal `*` or `**` anywhere in the AI prose. Neither renderer parses markdown, so asterisks
  render as asterisks.

- [ ] **Step 7: Commit the harness**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/scripts/_depthCheck.ts
git commit -m "$(cat <<'EOF'
chore(reporting): harness for the design's end-to-end success criteria

Runs one AI-enhanced report against the development database through the same
three calls the scheduled runner makes, and writes both output formats to /tmp
so the rendered surfaces can be checked. Delivery and file upload are skipped
deliberately: neither has anything to do with analyzer depth and one of them
sends mail.

Kept alongside the existing _verifyai.ts / _denemecheck.ts harnesses so the
criteria can be re-run when the prompts are next tuned.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 101: Full-suite gate and working-tree audit

**Files:**
- Test: `Servers/` (whole unit suite)
- Test: `Clients/` (type-check and build)

Success criteria 1 and 2, plus the guard that nothing crept outside the change.

- [ ] **Step 1: Backend build**

Run: `cd Servers && npm run build`

Expected: PASS. This is `tsc` with `strict`, `noUnusedLocals`, `noUnusedParameters`,
`noImplicitReturns` and `noFallthroughCasesInSwitch` on. It is what catches a helper left
behind with no callers after a phase replaced its call sites, and it is what compiles
`scripts/_depthCheck.ts` from Task 100.

- [ ] **Step 2: Backend unit suite**

Run: `cd Servers && npm run test:unit`

Expected: PASS, with no failures against the pre-plan baseline. Every tripwire in the design's
table must be green *because a task updated it deliberately*, not because it was silenced:

| Tripwire | Owner |
|---|---|
| `analyzers/__tests__/payloadShape.test.ts` | Phase 3 Task 45 (`EXPECTED_ROW_KEYS`; the top-level key set is genuinely unchanged) |
| `analyzers/__tests__/registry.test.ts` | Phase 1 Task 3, Phase 2 Tasks 22, 23, 25, 27, 28 |
| `analyzers/__tests__/sectionSummaries.test.ts` | Phase 2 Task 24, Phase 3 Task 50 |
| `analyzers/__tests__/runAnalyzers.test.ts` | Phase 1 Task 5, Phase 3 Tasks 45 and 49, Phase 4 Task 63 |
| `analyzers/__tests__/schemas.test.ts` | Phase 3 Tasks 45, 46, 47 |

Never run `npx jest` against a path under `Servers/tests/integration/`: those suites call
`cleanupDatabase()`, which `TRUNCATE`s `organizations ... CASCADE`, and a bare `jest` invocation
skips the `--globalSetup` that points them at `verifywise_test` — it would wipe the same
development database Task 100 just wrote a run into. `npm run test:unit` excludes
`tests/integration/` by construction.

- [ ] **Step 3: Frontend type-check and build**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler/Clients
npm run typecheck
npm run build
```

Expected: both PASS. Both are needed and neither substitutes for the other: `npm run build` is
`node scripts/build.js` → `vite build`, which transpiles without type-checking, so only
`npm run typecheck` (`tsc -b`, including `tsconfig.test.json`) proves Phase 3 Task 51's interface
change agrees with every consumer and fixture.

- [ ] **Step 4: The three seven-block files are untouched**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git diff --name-only 8ac55e1b1..HEAD -- \
  Clients/src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx \
  Clients/src/presentation/pages/Reporting/__tests__/TemplateBuilder.test.tsx \
  Servers/services/reporting/__tests__/reportTemplateResolver.test.ts
```

(`8ac55e1b1` is `docs(reporting): design for deeper AI insights`, the commit this plan starts
from. Re-derive it with `git log --oneline --grep="design for deeper AI insights"` if the branch
has moved.)

Expected: **empty output**. Any file listed means an eighth `ai_block` crept in and the change
is out of scope — the design's non-goals name the seven-block template contract explicitly.

Then prove they still pass:

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler/Clients
npx vitest run \
  src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx \
  src/presentation/pages/Reporting/__tests__/TemplateBuilder.test.tsx
```

Expected: PASS, including `expect(Object.keys(body.ai_blocks_config)).toHaveLength(7)`.

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler/Servers
npm run test:unit -- services/reporting/__tests__/reportTemplateResolver.test.ts
```

Expected: PASS.

- [ ] **Step 5: Nothing unrelated was committed, and nothing is left behind**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git status --porcelain
```

Expected: **empty output**. Every file each task touched was named explicitly in that task's
`git add`; no task in any phase uses `git add -A`. A stray `dist/` or `.tsbuildinfo` entry means
the repo's ignore rules changed and should be investigated rather than committed. The two
generated documents live in `/tmp`, not in the repo, so they cannot appear here.

```bash
git diff --stat 8ac55e1b1..HEAD -- Clients/
```

Expected: exactly two files — `Clients/src/domain/interfaces/i.reporting.ts` and
`Clients/src/presentation/components/ReportAnalysisPanel/__tests__/ReportAnalysisPanel.test.tsx`,
both from Phase 3 Task 51. Anything else on the frontend is outside this design.

```bash
git log --oneline 8ac55e1b1..HEAD
```

Expected: one commit per task that had a Step 5, in phase order, each with a `type(scope):`
subject and a `Co-Authored-By: Claude Opus 4.8` trailer. Read the list once: a commit whose
subject does not name work in this design is the thing this step exists to catch.
