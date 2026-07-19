# Reporting Phase 2 — Six Report Analyzers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `aiSummarizer` with six schema-validated report analyzers built on the shipped evidence-analyzer pattern — plus a straight port of its per-section summarizer, which 24 existing render blocks depend on — persist each analyzer's structured output to a new `report_run_analyses` sidecar table, and render the new analyses in **both** the PDF and the DOCX.

**Architecture:** The analyzers are pure services: they take already-collected section data plus an LLM key and return a validated object. They run inside `generateReport()` — the only place that holds the `dataCollector` output — under `Promise.allSettled`, gated by the template's `ai_blocks_config`. `generateReport()` flattens their output into the existing `ReportData.aiSummaries` shape so **both renderers keep their current contract** and only gain new blocks, and returns the structured payloads alongside the file. The runner (`executeManualRun` / `runScheduledReport`) owns persistence, upserting one `report_run_analyses` row per section key. Analyzer services never touch the DB, `req`, or `res`.

**Tech Stack:** Node 22, TypeScript, Sequelize 6 (raw SQL), PostgreSQL (`verifywise` schema), zod, Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/anthropic`), `docx` 9.7.0, EJS, Jest (ts-jest).

**This is Phase 2 of 4.** Phase 1 (async pipeline) is merged — every report now runs through `report_runs` with a run id, which is what makes a per-run analysis sidecar possible. Phases 3 (custom templates) and 4 (delivery truthfulness) get their own plans. Spec: `docs/superpowers/specs/2026-07-17-reporting-agent-analysis-design.md`. Issue: `verifywise-ai/verifywise#4280`.

---

## What already exists — DO NOT rebuild

Verified against the tree during planning. Rebuilding any of these is a plan failure:

- **`report_runs` already has `ai_status JSONB`, `ai_tokens_used INTEGER`, `ai_cost NUMERIC(12,4)`** (`20260619190359-create-reporting-domain.js:68-94`). No migration is needed to record analyzer state on the run.
- **`generateObjectWithSelfCorrection<T>(params, generateImpl?)`** — `Servers/advisor/llmSelfCorrect.ts:167`. Returns a **wrapped** `SelfCorrectingResult<T>`; the caller must read `.object`. Defaults: `temperature: 0`, `maxSelfCorrectionAttempts: 2`, `innerMaxRetries: 2`. The optional second arg is the test-injection seam — use it instead of mocking the AI SDK.
- **`getLLMKeysWithKeyQuery(organizationId)`** — `Servers/utils/llmKey.utils.ts:28`. Returns raw `llm_keys` rows: `id, name, url, model, key, custom_headers, created_at`. **There is no `provider` column** — provider is inferred from `name`.
- **`trackAIContent(organizationId, entityType, entityId, options, createdBy)`** — `Servers/middleware/aiContentTracker.middleware.ts:24`. Fire-and-forget with `.catch(() => {})`; it never throws.
- **`createAIAnalysisBox(content, label, borderColor?, bgColor?)`** — `docxGenerator.ts:491`. The single reusable DOCX primitive for AI prose. New DOCX sections call it; they do not hand-roll paragraph borders.
- **`.ai-analysis-box` / `.ai-analysis-label` / `.ai-analysis-content` / `.subsection` / `.group-header`** — CSS lives **inline in the `<style>` block of `report-pdf.ejs`** (lines 10-94), not in `pdf.css`. New PDF blocks reuse these classes and add no new CSS.
- **`ReportData.aiSummaries`** (`i.reportGeneration.ts:92-106`) — the render contract both renderers already read. Phase 2 **extends** it; it does not replace it.
- **`report-pdf.ejs` renders 12 `sectionSummaries[key]` blocks** (lines 219, 283, 328, 388, 455, 521, 581, 645, 688, 733, 776, 821) and `docxGenerator.ts` renders the same 12 (lines 626, 672, 696, 755, 791, 839, 908, 990, 1013, 1040, 1067, 1095). **These 24 blocks have exactly one producer: `aiSummarizer.ts:424`.** Deleting `aiSummarizer` without replacing that producer blanks all 24 — see Locked decision 2 and Task 6a. The render code needs no change; the *producer* does.
- **`aiSummarizer` also produces `riskHighlights` unconditionally** whenever `aiEnhanced` is set (`aiSummarizer.ts:437-449`). Any block mapping that leaves `riskHighlights` unset for a manual run is a regression of shipped behaviour.
- **`Servers/services/reporting/__tests__/reportTemplateResolver.test.ts` already exists** with two passing tests. Task 7 **appends** to it — writing the file fresh would delete existing coverage of section de-duping and the organization-scope path.
- **The `verifywise.` DDL prefix + `queryInterface.sequelize.query()`** house dialect, and `CREATE UNIQUE INDEX` (**not** `ALTER TABLE ADD CONSTRAINT ... UNIQUE`) as the backing for an `ON CONFLICT` upsert — `20260325183928-add-readiness-unique-constraints.js`.

## What Phase 2 changes

| File | Create/Modify | Responsibility |
|---|---|---|
| `Servers/database/migrations/<stamp>-create-report-run-analyses.js` | Create | `report_run_analyses` table + unique index + lookup index |
| `Servers/utils/reportRunAnalysis.utils.ts` | Create | `upsertRunAnalysisQuery` (ON CONFLICT version bump), `getRunAnalysesQuery` — both org-scoped |
| `Servers/utils/__tests__/reportRunAnalysis.utils.test.ts` | Create | Upsert SQL shape + org-scope tests |
| `Servers/advisor/llmModelFactory.ts` | Create | One provider-detecting model factory, with the `openai.chat()` fix |
| `Servers/advisor/__tests__/llmModelFactory.test.ts` | Create | Provider routing + `openai.chat` vs `openai` |
| `Servers/advisor/evidenceAnalyzer/analyzer.service.ts` | Modify (`createModel` L129-142) | Delegate to the shared factory — fixes the OpenRouter bug there too |
| `Servers/services/reporting/analyzers/schemas.ts` | Create | Six zod schemas, `.strict()`, `.describe()` on every field, nullable `abstain_reason` |
| `Servers/services/reporting/analyzers/prompts.ts` | Create | `ANALYZER_VERSION` + per-analyzer system/user prompt builders |
| `Servers/services/reporting/analyzers/registry.ts` | Create | Six `AnalyzerDefinition`s: key, schema, prompts, input selector |
| `Servers/services/reporting/analyzers/runAnalyzers.ts` | Create | Pure fan-out under `Promise.allSettled`, gated, abstains on failure |
| `Servers/services/reporting/analyzers/sectionSummaries.ts` | Create | Ported per-section summarizer — the producer for the 24 existing `sectionSummaries` render blocks |
| `Servers/services/reporting/analyzers/collectAnalyzerInputs.ts` | Create | Block resolution, readiness input, evidence-gap input, allowed-owner harvest |
| `Servers/services/reporting/analyzers/mapToSummaries.ts` | Create | Flatten analyzer output onto the `AISummaries` render contract |
| `Servers/services/reporting/analyzers/persistAnalyses.ts` | Create | Sidecar upsert + `ai_status` + `trackAIContent` |
| `Servers/database/migrations/20260619191640-seed-reporting-system-templates.js` | Modify | Seed the seven-key `ai_blocks_config` shape |
| `Servers/services/reporting/analyzers/__tests__/*.test.ts` | Create | Schema, abstain, partial-failure, gating tests |
| `Servers/domain.layer/interfaces/i.reportTemplate.ts` | Modify (`AiBlocksConfig` L14-18) | Widen three booleans to seven |
| `Servers/domain.layer/interfaces/i.reportGeneration.ts` | Modify (L35-46, L92-106) | `aiBlocks` on the request; three new `AISummaries` fields; `analyses` on the result |
| `Servers/services/reporting/reportTemplateResolver.ts` | Modify (L10-11) | Stop OR-ing; pass the seven blocks through |
| `Servers/database/migrations/<stamp>-widen-report-ai-blocks.js` | Create | Backfill existing `ai_blocks_config` to the seven-key shape, preserving today's behaviour |
| `Servers/services/reporting/index.ts` | Modify (`generateReport` L111-123, L151-155) | Run analyzers, map into `aiSummaries`, return `analyses` |
| `Servers/services/reporting/manualReportRunner.ts` | Modify | Persist analyses + `ai_status` after a successful run |
| `Servers/services/reporting/reportRunOrchestrator.ts` | Modify | Same, for the scheduled path |
| `Servers/templates/reports/report-pdf.ejs` | Modify | Three new analysis blocks |
| `Servers/services/reporting/docxGenerator.ts` | Modify (+ TOC L224-308, assembly L1168-1248) | Three new analysis sections, registered in the TOC |
| `Servers/services/reporting/aiSummarizer.ts` | **Delete** | Superseded |
| `Servers/services/reporting/__tests__/aiSummarizer.actions.test.ts` | **Delete** | Moves to the analyzer tests |
| `docs/technical/domains/reporting.md` | Modify | Analyzer pipeline; fix the stale `report-docx.ejs` claim (L208) |
| `docs/technical/infrastructure/pdf-generation.md` | Modify | Fix the same stale claim (L195) |

---

## Deliberate decisions locked before implementation (do not revisit)

1. **Analyzers run inside `generateReport()`, not in the runners.** `generateReport()` is the only function that holds the `dataCollector` output, and re-collecting in the runner would double every query. It returns the structured analyses in its result; the **runner persists them**. This satisfies spec §5 ("the controller/orchestrator owns persistence; the analyzer services stay pure") — the analyzer *services* do zero DB work.

2. **`ReportData.aiSummaries` stays the render contract, and `sectionSummaries` keeps a producer.** The analyzers produce structured objects; a mapper flattens them into `AISummaries` plus three new optional fields, so both renderers gain blocks instead of being rewritten.

   **This is the trap in the obvious version of this plan.** `aiSummarizer.ts:424` is the *only* producer of `AISummaries.sectionSummaries` repo-wide, and 24 render blocks read it (12 in `report-pdf.ejs`, 12 in `docxGenerator.ts`). Deleting `aiSummarizer` without a replacement leaves all 24 permanently false — the templates still compile, the reports still generate, and twelve AI boxes silently vanish from every report. So `sectionSummaries` is ported as a **seventh analyzer** (Task 6a) rather than dropped. The alternative — dropping per-section summaries and deleting the 24 blocks — is a visible product change that this refactor has no mandate to make.

3. **Manual runs reproduce today's output exactly: five blocks.** A manual request has no template, so `ai_blocks_config` cannot gate it — `generateReportsV2` sends a bare `aiEnhanced: boolean`. `aiEnhanced: true` resolves to `{sectionSummaries, executiveSummary, keyFindings, recommendedActions, riskAnalysis}` — which is precisely what `aiSummarizer` emits today (per-section summaries, an executive summary, findings + recommendations, and risk highlights). `complianceGap` and `vendorRisk` stay **off**: they are the genuinely new, project-scoped analyzers, and they are the two that would add unbudgeted spend to every manual report. Wiring the wizard to pick blocks is Phase 3.

   Cost note: this is **not** all seven blocks per manual report. `sectionSummaries` fans out over present sections at concurrency 3 exactly as `aiSummarizer` does today, and the other four are one call each — the same order of spend as the current code, not an increase.

4. **System-template defaults do not enable the two new project-scoped blocks.** Per spec Risks. The seed sets the five behaviour-preserving blocks `true` (`sectionSummaries`, `executiveSummary`, `keyFindings`, `recommendedActions`, `riskAnalysis`) and the two new project-scoped ones — `complianceGap`, `vendorRisk` — `false`.

5. **`sanitizeRecommendedActions` is ported *and wired*.** It is currently dead code — defined at `aiSummarizer.ts:372`, imported only by its own test, never called by `generateAISummaries`. Its intent (never attribute an action to a person who is not an org member) is exactly spec §3's anti-fabrication rule, so the `recommendedActions` analyzer calls it on its output. Porting it unwired would just relocate the bug.

6. **`AISummaries.recommendedActions` gets rendered.** The field exists on the interface today and is rendered by **neither** renderer — the structured-actions feature was built to the interface and never reached paper. The `recommendedActions` analyzer populates it and Tasks 10-11 render it.

7. **One shared model factory, name-based provider detection.** `llm_keys` has no `provider` column. `aiSummarizer.getModelFromKey` infers it from the key name and — critically — uses `openai.chat(modelId)` whenever a custom `baseURL` is set, without which OpenRouter/vLLM keys break. The evidence analyzer's `createModel` lacks that branch. Phase 2 extracts one factory carrying the correct behaviour and points both at it. This is the "widen `createModel` to a real switch" item from spec §1, resolved as *extract + fix* rather than *duplicate*.

8. **`report_run_analyses.report_run_id` is `ON DELETE CASCADE`** (spec §5). Unlike `file_id`, an analysis has no meaning without its run.

9. **A failed analyzer abstains; the report still generates.** `Promise.allSettled`, never `Promise.all` — spec §8: "Six analyzers must not become six ways to lose a report."

10. **Zero LLM keys is not an error in Phase 2.** Spec §8's "hard 400" applies to an explicit user-triggered analysis request (a Phase 3 endpoint). Here the analyzers are a side-effect of report generation: with no key configured, every gated block abstains with `"no LLM key configured"` and the report generates without AI sections — which is exactly today's behaviour (`getModelFromKey` returns `null` → `generateAISummaries` returns an empty result). Failing report generation outright because nobody configured a key would be a regression.

---

## Task 1: Migration — `report_run_analyses`

**Files:**
- Create: `Servers/database/migrations/<stamp>-create-report-run-analyses.js`

- [ ] **Step 1: Generate the timestamp**

Run: `date +%Y%m%d%H%M%S`

Use that value as `<stamp>`. It **must** sort after `20260719184714` (the Phase 1 migration, currently the newest).

- [ ] **Step 2: Write the migration**

Create `Servers/database/migrations/<stamp>-create-report-run-analyses.js`:

```javascript
"use strict";

/**
 * Phase 2 analyzers: one row per (run, section) holding the analyzer's
 * structured output. Sidecar rather than a JSONB column on report_runs so each
 * section carries its own version, model and analyzed_by — matching the two
 * sidecars the codebase already uses (evidence_ai_analysis,
 * control_readiness_scores).
 *
 * ON DELETE CASCADE: unlike report_runs.file_id, an analysis has no meaning
 * without its run.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.report_run_analyses (
        id SERIAL PRIMARY KEY,
        report_run_id INTEGER NOT NULL REFERENCES verifywise.report_runs(id) ON DELETE CASCADE,
        section_key VARCHAR(50) NOT NULL,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        payload JSONB NOT NULL,
        analysis_model VARCHAR(100),
        analysis_version INTEGER DEFAULT 1,
        analyzed_at TIMESTAMPTZ DEFAULT NOW(),
        analyzed_by INTEGER,
        audit_metadata JSONB
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_report_run_analyses_run_section_org
        ON verifywise.report_run_analyses(report_run_id, section_key, organization_id);
      CREATE INDEX IF NOT EXISTS idx_report_run_analyses_run
        ON verifywise.report_run_analyses(report_run_id, organization_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.report_run_analyses;",
    );
  },
};
```

- [ ] **Step 3: Run it**

Run: `cd Servers && npm run build && npx sequelize db:migrate`
Expected: `== <stamp>-create-report-run-analyses: migrated`

- [ ] **Step 4: Verify the table and the unique index exist**

Run:
```bash
cd Servers && npx sequelize db:migrate:undo && npx sequelize db:migrate
```
Expected: both directions clean, no error. (`DROP TABLE` in `down` also drops the indexes — no separate drop needed.)

- [ ] **Step 5: Commit**

```bash
git add Servers/database/migrations/<stamp>-create-report-run-analyses.js
git commit -m "feat(reporting): add report_run_analyses sidecar table"
```

---

## Task 2: `reportRunAnalysis.utils.ts` — org-scoped upsert with version bump

**Files:**
- Create: `Servers/utils/reportRunAnalysis.utils.ts`
- Test: `Servers/utils/__tests__/reportRunAnalysis.utils.test.ts`

**Why an upsert and not an insert:** re-running a report for the same run must not accumulate duplicate rows. The version bumps in place. Use `ON CONFLICT ... DO UPDATE` — **not** the check-then-write in `evidenceAi.utils.ts:12-107`, which does SELECT → branch → UPDATE/INSERT in three round-trips with no transaction and races under concurrent analyzers. Ours are concurrent by construction.

- [ ] **Step 1: Write the failing test**

Create `Servers/utils/__tests__/reportRunAnalysis.utils.test.ts`:

```typescript
import { upsertRunAnalysisQuery, getRunAnalysesQuery } from "../reportRunAnalysis.utils";
import { sequelize } from "../../database/db";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

const mockQuery = sequelize.query as jest.Mock;

describe("reportRunAnalysis.utils", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([[{ id: 1 }], 1]);
  });

  it("upsert targets the unique index and bumps the version in place", async () => {
    await upsertRunAnalysisQuery({
      report_run_id: 7,
      section_key: "executiveSummary",
      organization_id: 5,
      payload: { summary: "x" },
      analysis_model: "gpt-4o-mini",
      analyzed_by: 3,
      audit_metadata: { analyzer_version: "report-analyzer-v1" },
    });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("ON CONFLICT (report_run_id, section_key, organization_id)");
    expect(sql).toContain("analysis_version = report_run_analyses.analysis_version + 1");
    expect(sql).toContain("analyzed_at = NOW()");
  });

  it("upsert passes organization_id through as a replacement", async () => {
    await upsertRunAnalysisQuery({
      report_run_id: 7,
      section_key: "keyFindings",
      organization_id: 5,
      payload: {},
      analysis_model: null,
      analyzed_by: null,
      audit_metadata: null,
    });

    expect(mockQuery.mock.calls[0][1].replacements.organization_id).toBe(5);
  });

  it("get filters by organization_id", async () => {
    mockQuery.mockResolvedValue([[{ id: 1, section_key: "executiveSummary" }], 1]);
    await getRunAnalysesQuery(7, 5);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("organization_id = :organization_id");
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({
      report_run_id: 7,
      organization_id: 5,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest utils/__tests__/reportRunAnalysis.utils.test.ts`
Expected: FAIL — `Cannot find module '../reportRunAnalysis.utils'`

- [ ] **Step 3: Write the implementation**

Create `Servers/utils/reportRunAnalysis.utils.ts`:

```typescript
import { sequelize } from "../database/db";

export interface RunAnalysisInput {
  report_run_id: number;
  section_key: string;
  organization_id: number;
  payload: any;
  analysis_model: string | null;
  analyzed_by: number | null;
  audit_metadata: any | null;
}

/**
 * Upsert one analysis row per (run, section, org). Re-analysis bumps the
 * version in place rather than inserting a duplicate. ON CONFLICT (not
 * check-then-write) because the six analyzers write concurrently.
 *
 * The `WHERE EXISTS` guard is a tenant-isolation control, not an optimisation.
 * Both FKs only check existence — neither proves the run belongs to the given
 * org — and the unique index would happily give an inconsistent
 * (orgA's run, orgB) pair its own row. Without the guard, one caller that pairs
 * a run id with the wrong organization_id makes getRunAnalysesQuery serve org
 * A's analysis to org B.
 *
 * Returns `undefined` when the run does not belong to `organization_id`. The
 * caller MUST treat that as a failed write, not a silent success.
 */
export const upsertRunAnalysisQuery = async (input: RunAnalysisInput) => {
  const result = (await sequelize.query(
    `INSERT INTO report_run_analyses
       (report_run_id, section_key, organization_id, payload,
        analysis_model, analysis_version, analyzed_at, analyzed_by, audit_metadata)
     SELECT :report_run_id, :section_key, :organization_id, :payload,
            :analysis_model, 1, NOW(), :analyzed_by, :audit_metadata
      WHERE EXISTS (
        SELECT 1 FROM report_runs
         WHERE id = :report_run_id AND organization_id = :organization_id
      )
     ON CONFLICT (report_run_id, section_key, organization_id)
     DO UPDATE SET
       payload = EXCLUDED.payload,
       analysis_model = EXCLUDED.analysis_model,
       analysis_version = report_run_analyses.analysis_version + 1,
       analyzed_at = NOW(),
       analyzed_by = EXCLUDED.analyzed_by,
       audit_metadata = EXCLUDED.audit_metadata
     RETURNING *;`,
    {
      replacements: {
        report_run_id: input.report_run_id,
        section_key: input.section_key,
        organization_id: input.organization_id,
        payload: JSON.stringify(input.payload ?? {}),
        analysis_model: input.analysis_model,
        analyzed_by: input.analyzed_by,
        audit_metadata: input.audit_metadata ? JSON.stringify(input.audit_metadata) : null,
      },
    },
  )) as [any[], number];
  return result[0][0];
};

export const getRunAnalysesQuery = async (reportRunId: number, organizationId: number) => {
  const result = (await sequelize.query(
    `SELECT * FROM report_run_analyses
      WHERE report_run_id = :report_run_id
        AND organization_id = :organization_id
      ORDER BY section_key;`,
    { replacements: { report_run_id: reportRunId, organization_id: organizationId } },
  )) as [any[], number];
  return result[0];
};
```

Note the table name is **unqualified** here — application SQL resolves via `search_path`. Only migration DDL carries the `verifywise.` prefix.

- [ ] **Step 4: Run the test**

Run: `cd Servers && npx jest utils/__tests__/reportRunAnalysis.utils.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/reportRunAnalysis.utils.ts Servers/utils/__tests__/reportRunAnalysis.utils.test.ts
git commit -m "feat(reporting): add org-scoped report_run_analyses upsert with version bump"
```

---

## Task 3: Shared LLM model factory (fixes the OpenRouter bug)

**Files:**
- Create: `Servers/advisor/llmModelFactory.ts`
- Test: `Servers/advisor/__tests__/llmModelFactory.test.ts`
- Modify: `Servers/advisor/evidenceAnalyzer/analyzer.service.ts:129-142`

**The bug being fixed:** `evidenceAnalyzer/createModel` calls `createOpenAI({...})(key.model)`, which uses the **Responses API**. Only native OpenAI implements that. Any custom `baseURL` — OpenRouter, vLLM, Together — must use Chat Completions via `openai.chat(modelId)`. `aiSummarizer.getModelFromKey:60-62` has the correct branch; the evidence analyzer does not. One factory, correct once.

- [ ] **Step 1: Write the failing test**

Create `Servers/advisor/__tests__/llmModelFactory.test.ts`:

```typescript
const mockChat = jest.fn(() => "chat-model");
const mockOpenAIFactory = jest.fn(() => {
  const f: any = jest.fn(() => "responses-model");
  f.chat = mockChat;
  return f;
});
const mockAnthropicFactory = jest.fn(() => jest.fn(() => "anthropic-model"));

jest.mock("@ai-sdk/openai", () => ({ createOpenAI: (...a: any[]) => mockOpenAIFactory(...a) }));
jest.mock("@ai-sdk/anthropic", () => ({ createAnthropic: (...a: any[]) => mockAnthropicFactory(...a) }));

import { createModelFromKey, detectProvider } from "../llmModelFactory";

describe("llmModelFactory", () => {
  beforeEach(() => {
    mockChat.mockClear();
    mockOpenAIFactory.mockClear();
    mockAnthropicFactory.mockClear();
  });

  it("detects Anthropic from the key name", () => {
    expect(detectProvider("My Claude key")).toBe("Anthropic");
    expect(detectProvider("anthropic-prod")).toBe("Anthropic");
    expect(detectProvider("OpenAI prod")).toBe("OpenAI");
  });

  it("uses openai.chat() when a custom baseURL is set", () => {
    const model = createModelFromKey({
      name: "openrouter",
      key: "sk-x",
      url: "https://openrouter.ai/api/v1",
      model: "meta-llama/llama-3-70b",
      custom_headers: null,
    });
    expect(mockChat).toHaveBeenCalledWith("meta-llama/llama-3-70b");
    expect(model).toBe("chat-model");
  });

  it("uses the plain callable when there is no custom baseURL", () => {
    const model = createModelFromKey({
      name: "openai",
      key: "sk-x",
      url: null,
      model: "gpt-4o-mini",
      custom_headers: null,
    });
    expect(mockChat).not.toHaveBeenCalled();
    expect(model).toBe("responses-model");
  });

  it("routes Anthropic keys to createAnthropic", () => {
    const model = createModelFromKey({
      name: "claude",
      key: "sk-ant",
      url: null,
      model: "claude-sonnet-4-20250514",
      custom_headers: null,
    });
    expect(mockAnthropicFactory).toHaveBeenCalled();
    expect(model).toBe("anthropic-model");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest advisor/__tests__/llmModelFactory.test.ts`
Expected: FAIL — `Cannot find module '../llmModelFactory'`

- [ ] **Step 3: Write the implementation**

Create `Servers/advisor/llmModelFactory.ts`:

```typescript
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

export type LLMProvider = "Anthropic" | "OpenAI";

/** Raw `llm_keys` row shape. There is no `provider` column — it is inferred. */
export interface LLMKeyRow {
  name?: string | null;
  key: string;
  url?: string | null;
  model?: string | null;
  custom_headers?: Record<string, string> | null;
}

export function detectProvider(name: string | null | undefined): LLMProvider {
  const n = (name || "").toLowerCase();
  return n.includes("anthropic") || n.includes("claude") ? "Anthropic" : "OpenAI";
}

/**
 * Build an AI SDK model from a raw llm_keys row.
 *
 * The openai.chat() branch is load-bearing: only native OpenAI implements the
 * Responses API, so any custom baseURL (OpenRouter, vLLM, Together) must go
 * through Chat Completions or every call fails.
 */
export function createModelFromKey(row: LLMKeyRow) {
  const headers = row.custom_headers || undefined;
  const baseURL = row.url || undefined;

  if (detectProvider(row.name) === "Anthropic") {
    return createAnthropic({
      apiKey: row.key,
      baseURL,
      headers,
    })(row.model || "claude-sonnet-4-20250514");
  }

  const openai = createOpenAI({ apiKey: row.key, baseURL, headers });
  const modelId = row.model || "gpt-4o-mini";
  return baseURL ? openai.chat(modelId) : openai(modelId);
}
```

- [ ] **Step 4: Run the test**

Run: `cd Servers && npx jest advisor/__tests__/llmModelFactory.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Point the evidence analyzer at the shared factory**

In `Servers/advisor/evidenceAnalyzer/analyzer.service.ts`, replace the whole `createModel` function (lines 129-142) with:

```typescript
function createModel(key: AnalyzerInput["llmKey"]) {
  return createModelFromKey({
    // The analyzer's own input type carries an explicit provider; map it back
    // onto the name-detection contract the shared factory uses.
    name: key.provider === "Anthropic" ? "anthropic" : "openai",
    key: key.apiKey,
    url: key.baseURL,
    model: key.model,
    custom_headers: key.headers ?? null,
  });
}
```

Add the import alongside the existing ones near line 20:

```typescript
import { createModelFromKey } from "../llmModelFactory";
```

Then remove the now-unused `createAnthropic` / `createOpenAI` imports at the top of `analyzer.service.ts` (lines 16-17) **only if** no other function in that file uses them — check with `grep -n "createAnthropic\|createOpenAI" Servers/advisor/evidenceAnalyzer/analyzer.service.ts` before deleting.

- [ ] **Step 6: Verify the evidence analyzer still passes**

Run: `cd Servers && npx jest advisor/ && npm run build`
Expected: existing evidence-analyzer tests green; build clean.

- [ ] **Step 7: Commit**

```bash
git add Servers/advisor/llmModelFactory.ts Servers/advisor/__tests__/llmModelFactory.test.ts Servers/advisor/evidenceAnalyzer/analyzer.service.ts
git commit -m "fix(advisor): route custom-baseURL keys through openai.chat via a shared model factory"
```

---

## Task 4: Analyzer schemas

**Files:**
- Create: `Servers/services/reporting/analyzers/schemas.ts`
- Test: `Servers/services/reporting/analyzers/__tests__/schemas.test.ts`

Follows `Servers/advisor/evidenceAnalyzer/schema.ts`: `.strict()` on **every** object including nested ones, `.describe()` on every field (the descriptions *are* the prompt), and a **nullable** — not optional — `abstain_reason`.

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/analyzers/__tests__/schemas.test.ts`:

```typescript
import {
  executiveSummarySchema,
  keyFindingsSchema,
  recommendedActionsSchema,
  riskAnalysisSchema,
  complianceGapSchema,
  vendorRiskSchema,
} from "../schemas";

describe("analyzer schemas", () => {
  it("executiveSummary accepts a valid payload", () => {
    const parsed = executiveSummarySchema.parse({
      summary: "The programme demonstrates partial coverage of the required controls across all assessed domains.",
      abstain_reason: null,
    });
    expect(parsed.abstain_reason).toBeNull();
  });

  it("executiveSummary accepts the abstain path", () => {
    const parsed = executiveSummarySchema.parse({
      summary: "There is insufficient data in this report to support an executive summary.",
      abstain_reason: "No sections contained any records.",
    });
    expect(parsed.abstain_reason).toBe("No sections contained any records.");
  });

  it("rejects unknown keys (strict)", () => {
    expect(() =>
      executiveSummarySchema.parse({
        summary: "The programme demonstrates partial coverage of the required controls.",
        abstain_reason: null,
        hallucinated_field: true,
      }),
    ).toThrow();
  });

  it("keyFindings caps the array and requires a section key", () => {
    const parsed = keyFindingsSchema.parse({
      findings: [{ text: "Twelve controls have no evidence attached.", section: "compliance", severity: "high" }],
      abstain_reason: null,
    });
    expect(parsed.findings[0].severity).toBe("high");
    expect(() => keyFindingsSchema.parse({ findings: [{ text: "x", section: "compliance", severity: "high" }], abstain_reason: null })).toThrow();
  });

  it("recommendedActions allows a null owner but not an unknown priority", () => {
    const parsed = recommendedActionsSchema.parse({
      actions: [{ action: "Attach evidence to the twelve uncovered controls.", suggestedOwner: null, priority: "high", rationale: "These controls are unevidenced." }],
      abstain_reason: null,
    });
    expect(parsed.actions[0].suggestedOwner).toBeNull();
    expect(() =>
      recommendedActionsSchema.parse({
        actions: [{ action: "Do the thing properly.", suggestedOwner: null, priority: "urgent", rationale: "Because it matters." }],
        abstain_reason: null,
      }),
    ).toThrow();
  });

  it("riskAnalysis, complianceGap and vendorRisk each accept an abstaining payload", () => {
    // Prose fields keep their .min(40) floor even when abstaining — an abstention
    // still has to say something a reader can act on, and these strings are what
    // actually renders in the report.
    expect(riskAnalysisSchema.parse({ narrative: "No risks are recorded for this project, so no risk posture can be assessed.", top_risks: [], abstain_reason: "Empty risk register." }).top_risks).toEqual([]);
    expect(complianceGapSchema.parse({ narrative: "No readiness scores are stored for this project, so no gap analysis is possible.", gaps: [], scores_caveat: "Readiness has never been calculated for this project.", abstain_reason: "No stored readiness rows." }).gaps).toEqual([]);
    expect(vendorRiskSchema.parse({ narrative: "No vendors are registered against this project, so there is no exposure to assess.", concerns: [], abstain_reason: "Empty vendor list." }).concerns).toEqual([]);
  });

  it("rejects a prose field too short to be a usable sentence", () => {
    expect(() => executiveSummarySchema.parse({ summary: "ok", abstain_reason: "no data" })).toThrow();
  });
});
```

**On the `.min(40)` floor and the abstain path:** the floor is deliberate and stays. Two reasons it does not fight the abstention design. First, the data-starved case never reaches the schema at all — `runAnalyzers` (Task 6) short-circuits before any LLM call when `buildUserPrompt` returns `""`, synthesising the abstention itself. Second, when a model *does* run against thin data, 40 characters is one sentence, well inside `GROUNDING_RULES`' "keep the rest of your output minimal"; and if it still under-writes, self-correction retries and a final failure abstains through the catch. Dropping the floor to `.min(0)` would let `summary: "ok"` validate straight into a compliance artifact, which is strictly worse than a wasted retry. Add this line to `GROUNDING_RULES` in Task 5 so the model knows: `- Even when you abstain, write at least one complete sentence in the prose field explaining what is missing.`

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest services/reporting/analyzers/__tests__/schemas.test.ts`
Expected: FAIL — `Cannot find module '../schemas'`

- [ ] **Step 3: Write the implementation**

Create `Servers/services/reporting/analyzers/schemas.ts`:

```typescript
/**
 * Report analyzers — zod schemas for LLM structured output.
 *
 * Every object is .strict() so a hallucinated field fails validation instead of
 * reaching a compliance artifact. Every field carries .describe() — those
 * descriptions are the real prompt. abstain_reason is nullable (not optional):
 * the model must make an explicit statement either way.
 */

import { z } from "zod";

const abstainReason = z
  .string()
  .nullable()
  .describe(
    "If the supplied data is empty, trivial, or insufficient to support a grounded analysis, set this to a one-sentence reason and keep the rest of the output minimal and factual. Otherwise null. NEVER invent findings to fill space.",
  );

const severity = z
  .enum(["low", "medium", "high", "critical"])
  .describe(
    "Severity judged only from the supplied data. The input's risk vocabulary is wider than this enum: map 'Very High' to critical, 'Very Low' to low. Never invent a level for an item whose severity the input does not state.",
  );

export const executiveSummarySchema = z
  .object({
    summary: z
      .string()
      .min(40)
      .max(3500)
      .describe(
        "Three to five paragraphs, professional third-person, flowing prose. No markdown, no bullet points, no headers. Cover: overall compliance and governance posture; critical findings needing immediate attention; top areas needing improvement; recommended next steps.",
      ),
    abstain_reason: abstainReason,
  })
  .strict();

export const keyFindingsSchema = z
  .object({
    findings: z
      .array(
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
          })
          .strict(),
      )
      .min(0)
      .max(8)
      .describe("Five to eight findings when the data supports them. May be empty."),
    abstain_reason: abstainReason,
  })
  .strict();

export const recommendedActionsSchema = z
  .object({
    actions: z
      .array(
        z
          .object({
            action: z
              .string()
              .min(15)
              .max(300)
              .describe("A specific, actionable step. Not a restatement of the problem."),
            suggestedOwner: z
              .string()
              .max(120)
              .nullable()
              .describe(
                "The name or role of an owner ONLY if that exact name/role appears in the supplied data. If it does not appear verbatim in the input, this MUST be null. Never infer or invent an owner.",
              ),
            priority: z
              .enum(["low", "medium", "high", "critical"])
              .describe(
                "Priority judged only from the supplied data. The input's vocabulary is wider than this enum: map 'Very High' to critical, 'Very Low' to low. Never invent a priority the input does not support.",
              ),
            rationale: z
              .string()
              .min(10)
              .max(300)
              .describe("One sentence tying this action to a specific signal in the input."),
          })
          .strict(),
      )
      .min(0)
      .max(5)
      .describe("Three to five actions when the data supports them. May be empty."),
    abstain_reason: abstainReason,
  })
  .strict();

export const riskAnalysisSchema = z
  .object({
    narrative: z
      .string()
      .min(40)
      .max(2500)
      .describe("Two to four paragraphs on the risk posture across use-case, vendor and model risks. Flowing prose, no markdown."),
    top_risks: z
      .array(
        z
          .object({
            name: z.string().min(2).max(200).describe("Risk name, copied verbatim from the input."),
            level: z.string().min(2).max(40).describe("Risk level, copied verbatim from the input."),
            why: z.string().min(10).max(300).describe("Why this risk ranks among the most material."),
          })
          .strict(),
      )
      .min(0)
      .max(6)
      .describe("Up to six most material risks, drawn ONLY from risks present in the input."),
    abstain_reason: abstainReason,
  })
  .strict();

export const complianceGapSchema = z
  .object({
    narrative: z
      .string()
      .min(40)
      .max(2500)
      .describe(
        "Two to four paragraphs explaining and prioritising the supplied readiness scores. Explain the stored scores; do NOT recompute or re-score them.",
      ),
    gaps: z
      .array(
        z
          .object({
            control: z.string().min(1).max(200).describe("Control identifier or title, copied verbatim from the input."),
            gap: z.string().min(10).max(300).describe("What is missing, grounded in the supplied score fields."),
            priority: severity,
          })
          .strict(),
      )
      .min(0)
      .max(10)
      .describe("Prioritised gaps drawn ONLY from controls present in the input."),
    scores_caveat: z
      .string()
      .max(400)
      .nullable()
      .describe(
        "Set this when the readiness input is missing, stale, or partially zeroed, stating plainly that the absence of scores is NOT evidence of an absence of gaps. Otherwise null.",
      ),
    abstain_reason: abstainReason,
  })
  .strict();

export const vendorRiskSchema = z
  .object({
    narrative: z
      .string()
      .min(40)
      .max(2500)
      .describe("Two to four paragraphs on third-party risk exposure. Flowing prose, no markdown."),
    concerns: z
      .array(
        z
          .object({
            vendor: z.string().min(1).max(200).describe("Vendor name, copied verbatim from the input."),
            concern: z.string().min(10).max(300).describe("The specific concern, grounded in the input."),
            severity,
          })
          .strict(),
      )
      .min(0)
      .max(8)
      .describe("Up to eight concerns, drawn ONLY from vendors present in the input."),
    abstain_reason: abstainReason,
  })
  .strict();

export type ExecutiveSummaryOutput = z.infer<typeof executiveSummarySchema>;
export type KeyFindingsOutput = z.infer<typeof keyFindingsSchema>;
export type RecommendedActionsOutput = z.infer<typeof recommendedActionsSchema>;
export type RiskAnalysisOutput = z.infer<typeof riskAnalysisSchema>;
export type ComplianceGapOutput = z.infer<typeof complianceGapSchema>;
export type VendorRiskOutput = z.infer<typeof vendorRiskSchema>;
```

- [ ] **Step 4: Run the test**

Run: `cd Servers && npx jest services/reporting/analyzers/__tests__/schemas.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/reporting/analyzers/schemas.ts Servers/services/reporting/analyzers/__tests__/schemas.test.ts
git commit -m "feat(reporting): add strict zod schemas for the six report analyzers"
```

---

## Task 5: Prompts + analyzer registry

**Files:**
- Create: `Servers/services/reporting/analyzers/prompts.ts`
- Create: `Servers/services/reporting/analyzers/registry.ts`
- Test: `Servers/services/reporting/analyzers/__tests__/registry.test.ts`

The three legacy prompts are ported from `aiSummarizer` (lines 215-254 and 260-310) with their wording preserved — that text is the asset. Two changes on the way over: the JSON-contract block is dropped (zod now enforces the shape), and the orphaned `"Do not invent owners... otherwise omit suggestedOwner"` line — which referred to a `suggestedOwner` field the old JSON contract did not even have — becomes a real constraint on a real field in `recommendedActionsSchema`.

Also ported verbatim: `SECTION_LABELS` and the per-section array caps from `prepareSectionData` (`aiSummarizer.ts:69-125`). Those caps are what keep a large tenant's report from blowing the context window; dropping them is a silent production failure.

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/analyzers/__tests__/registry.test.ts`:

```typescript
import { ANALYZERS, ANALYZER_VERSION, ANALYSIS_SECTION_KEYS } from "../registry";
import { prepareSectionData, SECTION_LABELS } from "../prompts";

describe("analyzer registry", () => {
  it("exposes exactly the six analyzers", () => {
    expect(Object.keys(ANALYZERS).sort()).toEqual(
      ["complianceGap", "executiveSummary", "keyFindings", "recommendedActions", "riskAnalysis", "vendorRisk"].sort(),
    );
    expect(ANALYSIS_SECTION_KEYS).toHaveLength(6);
  });

  it("carries a version string", () => {
    expect(ANALYZER_VERSION).toMatch(/^report-analyzer-v\d+$/);
  });

  it("every analyzer builds a non-empty system and user prompt when its own sections are present", () => {
    // The fixture must satisfy EVERY analyzer's section selector: riskAnalysis
    // reads projectRisks/vendorRisks/modelRisks, vendorRisk reads vendors/
    // vendorRisks, complianceGap reads compliance + the readiness extra.
    const reportData: any = {
      metadata: { frameworkName: "EU AI Act", projectTitle: "Acme", organizationId: 5 },
      sections: {
        projectRisks: { totalRisks: 1, risks: [{ name: "R1" }] },
        vendorRisks: { risks: [{ riskName: "VR1" }] },
        vendors: { vendors: [{ name: "Acme Corp" }] },
        compliance: { controls: [{ id: 1 }] },
      },
    };
    const extras = { readiness: { controlScores: [{ control_id: 1, overall_score: 25 }], weakestControls: [], frameworkScore: null, stale: true } };
    for (const def of Object.values(ANALYZERS)) {
      expect(def.buildSystemPrompt().length).toBeGreaterThan(50);
      expect(def.buildUserPrompt(reportData, extras).length).toBeGreaterThan(20);
    }
  });

  it("returns an empty prompt — not a wasted LLM call — when an analyzer has no input", () => {
    const empty: any = { metadata: { frameworkName: "EU AI Act", projectTitle: "Acme", organizationId: 5 }, sections: {} };
    for (const def of Object.values(ANALYZERS)) {
      expect(def.buildUserPrompt(empty, {})).toBe("");
    }
  });

  it("truncates long section arrays to protect the context window", () => {
    const risks = Array.from({ length: 200 }, (_, i) => ({ name: `R${i}` }));
    const out = prepareSectionData("projectRisks", { risks });
    expect(JSON.parse(out).risks).toHaveLength(50);
  });

  it("keeps the twelve human-readable section labels", () => {
    expect(SECTION_LABELS.projectRisks).toBe("Use Case Risks");
    expect(Object.keys(SECTION_LABELS)).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest services/reporting/analyzers/__tests__/registry.test.ts`
Expected: FAIL — `Cannot find module '../registry'`

- [ ] **Step 3: Write `prompts.ts`**

Create `Servers/services/reporting/analyzers/prompts.ts`:

```typescript
/**
 * Report analyzers — prompt builders.
 *
 * ANALYZER_VERSION is stamped into report_run_analyses.audit_metadata and MUST
 * be bumped on any prompt or schema change, so stored analyses stay traceable
 * to the prompt that produced them.
 */

export const ANALYZER_VERSION = "report-analyzer-v1";

const MAX_DATA_ITEMS = 50;

/** Ported verbatim from aiSummarizer.ts:131-144. */
export const SECTION_LABELS: Record<string, string> = {
  projectRisks: "Use Case Risks",
  vendorRisks: "Vendor Risks",
  modelRisks: "Model Risks",
  compliance: "Compliance Controls",
  assessment: "Assessment Tracker",
  clausesAndAnnexes: "Clauses & Annexes",
  nistSubcategories: "NIST AI RMF Subcategories",
  vendors: "Vendors",
  models: "AI Models",
  trainingRegistry: "Training Registry",
  policyManager: "Policy Manager",
  incidentManagement: "Incident Management",
};

function truncateArray<T>(arr: T[] | undefined, max: number = MAX_DATA_ITEMS): T[] {
  if (!arr) return [];
  return arr.slice(0, max);
}

/**
 * Ported from aiSummarizer.ts:74-125. The per-section caps are load-bearing:
 * without them a large tenant's report exceeds the model context window and
 * every analyzer fails at once.
 */
export function prepareSectionData(key: string, data: any): string {
  if (!data) return "No data available for this section.";

  const clone = { ...data };

  switch (key) {
    case "projectRisks":
    case "vendorRisks":
    case "modelRisks":
      clone.risks = truncateArray(clone.risks);
      break;
    case "compliance":
      clone.controls = truncateArray(clone.controls);
      break;
    case "assessment":
      if (clone.topics) clone.topics = truncateArray(clone.topics, 10);
      break;
    case "clausesAndAnnexes":
      clone.clauses = truncateArray(clone.clauses, 30);
      clone.annexes = truncateArray(clone.annexes, 30);
      break;
    case "nistSubcategories":
      if (clone.functions) clone.functions = truncateArray(clone.functions, 10);
      break;
    case "vendors":
      clone.vendors = truncateArray(clone.vendors);
      break;
    case "models":
      clone.models = truncateArray(clone.models);
      break;
    case "trainingRegistry":
      clone.records = truncateArray(clone.records);
      break;
    case "policyManager":
      clone.policies = truncateArray(clone.policies);
      break;
    case "incidentManagement":
      clone.incidents = truncateArray(clone.incidents);
      break;
  }

  return JSON.stringify(clone, null, 2);
}

/** Render the selected sections as a single labelled block for the user prompt. */
export function renderSections(sections: Record<string, any>, keys: string[]): string {
  return keys
    .filter((k) => sections?.[k])
    .map((k) => `[${SECTION_LABELS[k] || k}]\n${prepareSectionData(k, sections[k])}`)
    .join("\n\n");
}

/** Shared anti-fabrication preamble applied to every analyzer. */
export const GROUNDING_RULES = `You are an AI governance analyst producing a section of a formal compliance report.

Absolute rules:
- Use ONLY the data supplied below. Never introduce a fact, name, number, control, vendor or risk that does not appear in it.
- If the supplied data is empty or too thin to support a grounded analysis, set abstain_reason and keep the rest of your output minimal and factual. An honest abstention is correct; an invented finding in a compliance artifact is a serious defect.
- Do not use markdown, bullet characters or headers inside prose fields. Write flowing paragraphs.
- Even when you abstain, write at least one complete sentence in the prose field explaining what is missing.
- Write in professional third-person tone.`;
```

- [ ] **Step 4: Write `registry.ts`**

Create `Servers/services/reporting/analyzers/registry.ts`:

```typescript
import type { z } from "zod";
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import {
  complianceGapSchema,
  executiveSummarySchema,
  keyFindingsSchema,
  recommendedActionsSchema,
  riskAnalysisSchema,
  vendorRiskSchema,
} from "./schemas";
import { GROUNDING_RULES, renderSections, SECTION_LABELS } from "./prompts";

export { ANALYZER_VERSION } from "./prompts";

export type AnalysisSectionKey =
  | "executiveSummary"
  | "keyFindings"
  | "recommendedActions"
  | "riskAnalysis"
  | "complianceGap"
  | "vendorRisk";

export const ANALYSIS_SECTION_KEYS: AnalysisSectionKey[] = [
  "executiveSummary",
  "keyFindings",
  "recommendedActions",
  "riskAnalysis",
  "complianceGap",
  "vendorRisk",
];

/**
 * Extra inputs an analyzer may need beyond ReportData.
 *
 * readiness and evidenceGaps are TWO INDEPENDENT INPUTS and must never be
 * joined (spec §4). They disagree on framework coverage, project scoping and
 * key space, so any join silently mislabels rows.
 */
export interface AnalyzerExtras {
  readiness?: {
    controlScores?: any[];
    weakestControls?: any[];
    frameworkScore?: any | null;
    stale?: boolean;
  };
  evidenceGaps?: {
    gaps: any[];
    /** True when the requested framework is outside what the gaps query covers. */
    frameworkUnsupported: boolean;
  };
}

export interface AnalyzerDefinition {
  key: AnalysisSectionKey;
  schema: z.ZodTypeAny;
  buildSystemPrompt: () => string;
  /** Returns "" when there is nothing worth spending an LLM call on. */
  buildUserPrompt: (reportData: ReportData, extras: AnalyzerExtras) => string;
}

const ALL_SECTIONS = Object.keys(SECTION_LABELS);
const RISK_SECTIONS = ["projectRisks", "vendorRisks", "modelRisks"];
const VENDOR_SECTIONS = ["vendors", "vendorRisks"];

function header(reportData: ReportData): string {
  const fw = reportData.metadata?.frameworkName ?? "AI governance";
  const project = reportData.metadata?.projectTitle ?? "the organization";
  return `Framework: ${fw}\nSubject: ${project}`;
}

export const ANALYZERS: Record<AnalysisSectionKey, AnalyzerDefinition> = {
  executiveSummary: {
    key: "executiveSummary",
    schema: executiveSummarySchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are writing the Executive Summary. Write three to five paragraphs covering: overall compliance and governance posture; critical findings requiring immediate attention; top areas needing improvement; recommended next steps.`,
    buildUserPrompt: (rd) => {
      const body = renderSections(rd.sections as any, ALL_SECTIONS);
      return body ? `${header(rd)}\n\nSection data:\n${body}` : "";
    },
  },

  keyFindings: {
    key: "keyFindings",
    schema: keyFindingsSchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are extracting Key Findings: five to eight of the most important observations across the supplied sections. Attribute each finding to the section key it came from.`,
    buildUserPrompt: (rd) => {
      const body = renderSections(rd.sections as any, ALL_SECTIONS);
      return body ? `${header(rd)}\n\nSection data:\n${body}` : "";
    },
  },

  recommendedActions: {
    key: "recommendedActions",
    schema: recommendedActionsSchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are producing three to five prioritised, actionable recommendations.\n\nOwner rule: set suggestedOwner ONLY when that exact person or role name appears verbatim in the supplied data. Otherwise it MUST be null. Never infer an owner from context and never invent one.`,
    buildUserPrompt: (rd) => {
      const body = renderSections(rd.sections as any, ALL_SECTIONS);
      return body ? `${header(rd)}\n\nSection data:\n${body}` : "";
    },
  },

  riskAnalysis: {
    key: "riskAnalysis",
    schema: riskAnalysisSchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are writing the Risk Analysis narrative across use-case, vendor and model risks, and naming up to six of the most material risks. Every named risk must appear verbatim in the supplied data.`,
    buildUserPrompt: (rd) => {
      const body = renderSections(rd.sections as any, RISK_SECTIONS);
      return body ? `${header(rd)}\n\nRisk data:\n${body}` : "";
    },
  },

  complianceGap: {
    key: "complianceGap",
    schema: complianceGapSchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are explaining and prioritising STORED readiness scores. You do not compute or re-score anything — the scores are given.\n\nTwo hard constraints:\n- If the readiness input is empty or stale, say so plainly in scores_caveat. The absence of scores is NOT evidence of an absence of gaps, and must never be presented as such.\n- Some stored score dimensions are known to be recorded as zero for every control and carry no signal. Where a caveat notes this, do not interpret those zeros as findings or turn them into prose.`,
    buildUserPrompt: (rd, extras) => {
      const readiness = extras.readiness;
      const evidenceGaps = extras.evidenceGaps;
      const compliance = renderSections(rd.sections as any, ["compliance", "clausesAndAnnexes"]);
      if (!readiness?.controlScores?.length && !evidenceGaps?.gaps?.length && !compliance) return "";
      const scores = readiness?.controlScores?.length
        ? JSON.stringify(
            {
              frameworkScore: readiness.frameworkScore ?? null,
              weakestControls: (readiness.weakestControls ?? []).slice(0, 20),
              controlScores: (readiness.controlScores ?? []).slice(0, 50),
              caveats: [
                "evidence_quality_score, evidence_recency_score and risk_mitigation_score are stored as 0 for every control by the current calculator and carry no signal.",
                readiness.stale ? "These scores may be stale — nothing recalculates them at report time." : null,
              ].filter(Boolean),
            },
            null,
            2,
          )
        : "No stored readiness scores were found for this project.";

      // Presented as a SEPARATE input, never merged with readiness: the two use
      // different key spaces (gaps emit struct ids, readiness stores per-item
      // ids discriminated by item_type), gaps is org+framework scoped rather
      // than project scoped, and it covers only eu_ai_act and iso_42001.
      const gapsBlock = evidenceGaps?.frameworkUnsupported
        ? "Evidence-gap analysis does not cover this framework, so none was retrieved. This is not evidence that no gaps exist."
        : evidenceGaps?.gaps?.length
          ? JSON.stringify(evidenceGaps.gaps.slice(0, 30), null, 2)
          : "No evidence gaps were returned for this organization.";

      return `${header(rd)}\n\nStored readiness scores (project-scoped):\n${scores}\n\nEvidence-gap analysis (organization + framework scoped — a SEPARATE dataset; do not assume a row here corresponds to a row above):\n${gapsBlock}\n\nCompliance section data:\n${compliance || "None."}`;
    },
  },

  vendorRisk: {
    key: "vendorRisk",
    schema: vendorRiskSchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are writing the third-party risk narrative and naming specific vendor concerns. Every vendor you name must appear verbatim in the supplied data.`,
    buildUserPrompt: (rd) => {
      const body = renderSections(rd.sections as any, VENDOR_SECTIONS);
      return body ? `${header(rd)}\n\nVendor data:\n${body}` : "";
    },
  },
};
```

- [ ] **Step 5: Run the test**

Run: `cd Servers && npx jest services/reporting/analyzers/__tests__/registry.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add Servers/services/reporting/analyzers/prompts.ts Servers/services/reporting/analyzers/registry.ts Servers/services/reporting/analyzers/__tests__/registry.test.ts
git commit -m "feat(reporting): port analyzer prompts and add the six-analyzer registry"
```

---

## Task 6: `runAnalyzers()` — gated, parallel, abstain-on-failure

**Files:**
- Create: `Servers/services/reporting/analyzers/runAnalyzers.ts`
- Test: `Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts`

This is the pure fan-out. It performs **zero DB writes** — it takes an already-resolved LLM key row and returns results. `Promise.allSettled`, never `Promise.all`: spec §8 requires that one analyzer failing does not lose the report.

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts`:

```typescript
const mockGenerate = jest.fn();
jest.mock("../../../../advisor/llmSelfCorrect", () => ({
  generateObjectWithSelfCorrection: (...a: any[]) => mockGenerate(...a),
}));
jest.mock("../../../../advisor/llmModelFactory", () => ({
  createModelFromKey: jest.fn(() => "model"),
}));

import { runAnalyzers } from "../runAnalyzers";

const reportData: any = {
  metadata: { frameworkName: "EU AI Act", projectTitle: "Acme", organizationId: 5 },
  sections: { projectRisks: { totalRisks: 1, risks: [{ name: "R1" }] }, compliance: { controls: [{ id: 1 }] } },
};
const llmKey: any = { id: 9, name: "openai", key: "sk", url: null, model: "gpt-4o-mini" };

describe("runAnalyzers", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockGenerate.mockResolvedValue({ object: { summary: "ok", abstain_reason: null }, attempts: 1, selfCorrected: false });
  });

  it("runs only the blocks the config enables", async () => {
    const out = await runAnalyzers({
      reportData,
      llmKey,
      blocks: { sectionSummaries: false, executiveSummary: true, keyFindings: false, recommendedActions: false, riskAnalysis: false, complianceGap: false, vendorRisk: false },
    });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(Object.keys(out)).toEqual(["executiveSummary"]);
  });

  it("one analyzer failing does not lose the others", async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error("llm exploded"))
      .mockResolvedValue({ object: { summary: "ok", abstain_reason: null }, attempts: 1, selfCorrected: false });

    const out = await runAnalyzers({
      reportData,
      llmKey,
      blocks: { sectionSummaries: false, executiveSummary: true, keyFindings: true, recommendedActions: false, riskAnalysis: false, complianceGap: false, vendorRisk: false },
    });

    expect(out.executiveSummary.abstained).toBe(true);
    expect(out.executiveSummary.abstain_reason).toContain("llm exploded");
    expect(out.keyFindings.abstained).toBe(false);
  });

  it("abstains without calling the LLM when a block has no input data", async () => {
    const empty: any = { metadata: reportData.metadata, sections: {} };
    const out = await runAnalyzers({
      reportData: empty,
      llmKey,
      blocks: { sectionSummaries: false, executiveSummary: true, keyFindings: false, recommendedActions: false, riskAnalysis: false, complianceGap: false, vendorRisk: false },
    });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(out.executiveSummary.abstained).toBe(true);
  });

  it("abstains every enabled block when there is no LLM key", async () => {
    const out = await runAnalyzers({
      reportData,
      llmKey: null,
      blocks: { sectionSummaries: false, executiveSummary: true, keyFindings: true, recommendedActions: false, riskAnalysis: false, complianceGap: false, vendorRisk: false },
    });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(out.executiveSummary.abstain_reason).toContain("no LLM key");
    expect(out.keyFindings.abstain_reason).toContain("no LLM key");
  });

  it("nulls a suggestedOwner that is not an allowed org member", async () => {
    mockGenerate.mockResolvedValue({
      object: {
        actions: [
          { action: "Assign the unevidenced controls.", suggestedOwner: "ghost@nowhere.com", priority: "high", rationale: "Unevidenced." },
          { action: "Review the risk register.", suggestedOwner: "alice@acme.com", priority: "medium", rationale: "Stale entries." },
        ],
        abstain_reason: null,
      },
      attempts: 1,
      selfCorrected: false,
    });

    const out = await runAnalyzers({
      reportData,
      llmKey,
      blocks: { sectionSummaries: false, executiveSummary: false, keyFindings: false, recommendedActions: true, riskAnalysis: false, complianceGap: false, vendorRisk: false },
      allowedOwners: ["alice@acme.com"],
    });

    expect(out.recommendedActions.payload.actions[0].suggestedOwner).toBeNull();
    expect(out.recommendedActions.payload.actions[1].suggestedOwner).toBe("alice@acme.com");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest services/reporting/analyzers/__tests__/runAnalyzers.test.ts`
Expected: FAIL — `Cannot find module '../runAnalyzers'`

- [ ] **Step 3: Write the implementation**

Create `Servers/services/reporting/analyzers/runAnalyzers.ts`:

```typescript
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import { createModelFromKey, type LLMKeyRow } from "../../../advisor/llmModelFactory";
import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import logger from "../../../utils/logger/fileLogger";
import { ANALYZERS, ANALYZER_VERSION, type AnalysisSectionKey, type AnalyzerExtras } from "./registry";

/**
 * Every key that can be gated or produce a result.
 *
 * `sectionSummaries` is deliberately NOT in the ANALYZERS registry — its output
 * is Record<string,string> rather than a schema-validated object, so it does not
 * fit AnalyzerDefinition. But it IS a gateable block and it DOES produce a
 * result, so both types below must admit it. Task 6a fills in the runtime side;
 * the types are declared here, once, so the two never drift.
 */
export type AnalyzedKey = AnalysisSectionKey | "sectionSummaries";

export type AiBlocks = Record<AnalyzedKey, boolean>;

export interface AnalyzerRunResult {
  payload: any;
  abstained: boolean;
  abstain_reason: string | null;
  model: string | null;
  attempts: number;
}

export type AnalyzerResults = Partial<Record<AnalyzedKey, AnalyzerRunResult>>;

export interface RunAnalyzersInput {
  reportData: ReportData;
  llmKey: (LLMKeyRow & { id?: number }) | null;
  blocks: AiBlocks;
  extras?: AnalyzerExtras;
  /**
   * Names/emails/roles that may legitimately appear as a suggestedOwner.
   * Anything else the model produces is nulled — never attribute an action to
   * somebody who is not in the organization.
   */
  allowedOwners?: string[];
}

function abstain(reason: string, model: string | null = null): AnalyzerRunResult {
  return { payload: null, abstained: true, abstain_reason: reason, model, attempts: 0 };
}

/**
 * Ported from aiSummarizer.sanitizeRecommendedActions (which was never wired
 * into anything). Drops any suggestedOwner that is not a known org member.
 */
export function sanitizeOwners(actions: any[] | undefined, allowedOwners: string[]): any[] {
  const allow = new Set(allowedOwners.map((s) => String(s).toLowerCase()));
  return (actions ?? []).map((a) => ({
    ...a,
    suggestedOwner:
      a.suggestedOwner && allow.has(String(a.suggestedOwner).toLowerCase()) ? a.suggestedOwner : null,
  }));
}

/** Analyzers that consume per-section summaries rather than raw section data. */
const SUMMARY_CONSUMERS: AnalysisSectionKey[] = [
  "executiveSummary",
  "keyFindings",
  "recommendedActions",
];

/**
 * Run every enabled analyzer. Pure: no DB, no req/res.
 *
 * TWO STAGES, and the ordering is load-bearing. `aiSummarizer` (the shipped
 * code this replaces) fed the executive summary, key findings and recommended
 * actions from already-compressed per-section summaries, not from raw section
 * JSON — see aiSummarizer.ts:215-254 and :260-310. Feeding them raw sections
 * instead measured ~38k tokens per prompt against ~6k, sent three times per
 * report, which can exceed a tenant's context window and lose all three
 * sections at once. So:
 *
 *   Stage 1 — sectionSummaries (fans out per section, concurrency 3) plus
 *             riskAnalysis / complianceGap / vendorRisk, which read raw
 *             sections and readiness and have no such dependency.
 *   Stage 2 — the three summary consumers, fed Stage 1's summaries.
 *
 * Promise.allSettled within each stage, never Promise.all — analyzers must not
 * become ways to lose a report. A failure abstains that one section.
 */
export async function runAnalyzers(input: RunAnalyzersInput): Promise<AnalyzerResults> {
  const { reportData, llmKey, blocks, extras = {}, allowedOwners = [] } = input;
  const enabled = (Object.keys(ANALYZERS) as AnalysisSectionKey[]).filter((k) => blocks?.[k]);
  if (enabled.length === 0 && !blocks?.sectionSummaries) return {};

  const results: AnalyzerResults = {};

  if (!llmKey) {
    const allEnabled: AnalyzedKey[] = blocks?.sectionSummaries
      ? [...enabled, "sectionSummaries"]
      : enabled;
    for (const key of allEnabled) {
      results[key] = abstain("no LLM key is configured for this organization");
    }
    return results;
  }

  const model = createModelFromKey(llmKey);
  const modelLabel = llmKey.model ?? null;

  const runOne = async (key: AnalysisSectionKey, stageExtras: AnalyzerExtras) => {
    const def = ANALYZERS[key];
    const userPrompt = def.buildUserPrompt(reportData, stageExtras);
    if (!userPrompt) {
      return [key, abstain("insufficient data for this section", modelLabel)] as const;
    }

    const result = await generateObjectWithSelfCorrection({
      model,
      schema: def.schema,
      system: def.buildSystemPrompt(),
      prompt: userPrompt,
    });

    let payload: any = result.object;
    if (key === "recommendedActions") {
      payload = { ...payload, actions: sanitizeOwners(payload.actions, allowedOwners) };
    }

    return [
      key,
      {
        payload,
        abstained: !!payload?.abstain_reason,
        abstain_reason: payload?.abstain_reason ?? null,
        model: modelLabel,
        attempts: result.attempts,
      },
    ] as const;
  };

  const collect = (settled: PromiseSettledResult<any>[], keys: AnalysisSectionKey[]) => {
    settled.forEach((outcome, i) => {
      const key = keys[i];
      if (outcome.status === "fulfilled") {
        results[outcome.value[0]] = outcome.value[1];
        return;
      }
      const message = outcome.reason instanceof Error ? outcome.reason.message : "unknown error";
      logger.warn(`Report analyzer "${key}" failed (${ANALYZER_VERSION}): ${message}`);
      results[key] = abstain(`analyzer failed: ${message}`, modelLabel);
    });
  };

  // ---- Stage 1: section summaries + the raw-section analyzers -------------
  const stage1Keys = enabled.filter((k) => !SUMMARY_CONSUMERS.includes(k));

  const [summaries, stage1] = await Promise.all([
    blocks.sectionSummaries
      ? runSectionSummaries(model, reportData).catch((e) => {
          logger.warn("Section summaries failed wholesale", e);
          return {} as Record<string, string>;
        })
      : Promise.resolve({} as Record<string, string>),
    Promise.allSettled(stage1Keys.map((k) => runOne(k, extras))),
  ]);

  collect(stage1, stage1Keys);

  if (blocks.sectionSummaries) {
    const count = Object.keys(summaries).length;
    // Always record a result when the block was enabled, even if it produced
    // nothing — ai_status silently missing a key it was asked to run reads as
    // "never requested" rather than "produced nothing".
    results.sectionSummaries = {
      payload: count > 0 ? { summaries } : null,
      abstained: count === 0,
      abstain_reason: count === 0 ? "no section produced a summary" : null,
      model: modelLabel,
      attempts: count,
    };
  }

  // ---- Stage 2: the summary consumers ------------------------------------
  // They read extras.sectionSummaries. With no summaries their buildUserPrompt
  // returns "" and they abstain without spending a call — which is exactly the
  // behaviour of the code being replaced (aiSummarizer.ts:227 returns "" when
  // summariesText is empty).
  const stage2Keys = enabled.filter((k) => SUMMARY_CONSUMERS.includes(k));
  if (stage2Keys.length > 0) {
    const stage2Extras: AnalyzerExtras = { ...extras, sectionSummaries: summaries };
    collect(
      await Promise.allSettled(stage2Keys.map((k) => runOne(k, stage2Extras))),
      stage2Keys,
    );
  }

  return results;
}
```

Add these imports at the top of the file alongside the existing ones:

```typescript
import { runSectionSummaries } from "./sectionSummaries";
import type { AnalyzerExtras } from "./registry";
```

- [ ] **Step 4: Run the test**

Run: `cd Servers && npx jest services/reporting/analyzers/__tests__/runAnalyzers.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/reporting/analyzers/runAnalyzers.ts Servers/services/reporting/analyzers/__tests__/runAnalyzers.test.ts
git commit -m "feat(reporting): add gated parallel analyzer runner with abstain-on-failure"
```

---

## Task 6a: Port the per-section summarizer (prevents a 24-block regression)

> **EXECUTE THIS BEFORE TASK 6.** Task 6's `runAnalyzers` imports `runSectionSummaries` from the module this task creates, and stages its two-phase flow around it. Running Task 6 first leaves an unresolvable import. The task is numbered 6a only because it was added after the plan's first draft.

**Files:**
- Create: `Servers/services/reporting/analyzers/sectionSummaries.ts`
- Test: `Servers/services/reporting/analyzers/__tests__/sectionSummaries.test.ts`

This task creates the module only. Task 6 does all the wiring.

**Why this task exists.** `aiSummarizer.ts:424` is the **only** producer of `AISummaries.sectionSummaries` in the repo. Twenty-four render blocks read it — 12 in `report-pdf.ejs` (lines 219, 283, 328, 388, 455, 521, 581, 645, 688, 733, 776, 821) and 12 in `docxGenerator.ts` (lines 626, 672, 696, 755, 791, 839, 908, 990, 1013, 1040, 1067, 1095). Delete `aiSummarizer` (Task 12) without this task and all 24 go permanently dark: the templates still compile, reports still generate, and twelve AI boxes vanish from every report with nothing failing. That is the single most dangerous change in this phase.

This is a **port, not a redesign**: same per-section fan-out, same concurrency limit of 3, same output shape (`Record<string, string>`). It does not use `generateObjectWithSelfCorrection` — its output is free prose keyed by section, not a structured object, so it stays on `generateText` exactly as today.

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/analyzers/__tests__/sectionSummaries.test.ts`:

```typescript
const mockGenerateText = jest.fn();
jest.mock("ai", () => ({ generateText: (...a: any[]) => mockGenerateText(...a) }));

import { runSectionSummaries, MAX_CONCURRENT } from "../sectionSummaries";

const sections = {
  projectRisks: { totalRisks: 2, risks: [{ name: "R1" }] },
  compliance: { controls: [{ id: 1 }] },
  vendors: { vendors: [{ name: "V1" }] },
};

describe("runSectionSummaries", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
    mockGenerateText.mockResolvedValue({ text: "  A summary.  " });
  });

  it("produces one trimmed summary per present section", async () => {
    const out = await runSectionSummaries("model" as any, { sections } as any);
    expect(Object.keys(out).sort()).toEqual(["compliance", "projectRisks", "vendors"]);
    expect(out.projectRisks).toBe("A summary.");
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });

  it("skips sections with no data instead of calling the model", async () => {
    const out = await runSectionSummaries("model" as any, { sections: { projectRisks: null, compliance: undefined } } as any);
    expect(out).toEqual({});
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("one section failing does not lose the others", async () => {
    mockGenerateText
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ text: "ok" });
    const out = await runSectionSummaries("model" as any, { sections } as any);
    expect(Object.keys(out)).toHaveLength(2);
  });

  it("omits empty model output rather than rendering a blank AI box", async () => {
    mockGenerateText.mockResolvedValue({ text: "   " });
    const out = await runSectionSummaries("model" as any, { sections } as any);
    expect(out).toEqual({});
  });

  it("never runs more than MAX_CONCURRENT calls at once", async () => {
    let inFlight = 0;
    let peak = 0;
    mockGenerateText.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { text: "ok" };
    });
    const many: any = {};
    for (let i = 0; i < 12; i++) many[`s${i}`] = { rows: [1] };
    await runSectionSummaries("model" as any, { sections: many } as any);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest services/reporting/analyzers/__tests__/sectionSummaries.test.ts`
Expected: FAIL — `Cannot find module '../sectionSummaries'`

- [ ] **Step 3: Write the implementation**

Create `Servers/services/reporting/analyzers/sectionSummaries.ts`. The prompt body and the concurrency limiter are ported from `aiSummarizer.ts:150-213`:

```typescript
import { generateText } from "ai";
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import logger from "../../../utils/logger/fileLogger";
import { prepareSectionData, SECTION_LABELS } from "./prompts";

const LLM_TIMEOUT_MS = 30_000;
export const MAX_CONCURRENT = 3;

/** Ported from aiSummarizer.ts:150-167. No third-party dependency. */
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

async function summariseSection(
  key: string,
  data: any,
  frameworkName: string,
  projectTitle: string,
  model: any,
): Promise<string> {
  try {
    const label = SECTION_LABELS[key] || key;
    const prompt = `You are an AI governance analyst reviewing the "${label}" section of a ${frameworkName} compliance report for the project "${projectTitle}".

Write a concise analytical summary (2-4 sentences) of what this data shows. Focus on posture, notable gaps and anything requiring attention. Use only the data provided — never introduce a fact that does not appear in it. Do not use markdown formatting or bullet points.

Section data:
${prepareSectionData(key, data)}`;

    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 400,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    return result.text.trim();
  } catch (error) {
    logger.warn(`Section summary failed for "${key}":`, error);
    return "";
  }
}

/**
 * Per-section AI summaries, keyed by section key — the producer for the 24
 * `sectionSummaries[...]` render blocks across the PDF and DOCX templates.
 *
 * Ported from aiSummarizer.generateAISummaries. Free prose rather than a
 * structured object, so it stays on generateText; an empty string is dropped so
 * a failed section renders as no box rather than an empty one.
 */
export async function runSectionSummaries(
  model: any,
  reportData: ReportData,
): Promise<Record<string, string>> {
  const entries = Object.entries((reportData?.sections ?? {}) as Record<string, any>).filter(
    ([, data]) => data !== undefined && data !== null,
  );
  if (entries.length === 0) return {};

  const frameworkName = reportData.metadata?.frameworkName ?? "AI governance";
  const projectTitle = reportData.metadata?.projectTitle ?? "the organization";

  const summaries = await runWithConcurrency(
    entries.map(([key, data]) => () => summariseSection(key, data, frameworkName, projectTitle, model)),
    MAX_CONCURRENT,
  );

  const out: Record<string, string> = {};
  entries.forEach(([key], i) => {
    if (summaries[i]) out[key] = summaries[i];
  });
  return out;
}
```

- [ ] **Step 4: Confirm the module stands alone**

`sectionSummaries` is deliberately **not** in the `ANALYZERS` registry — its output is `Record<string, string>` rather than a schema-validated object, so it does not fit `AnalyzerDefinition`.

There is **no wiring in this task.** Task 6 imports `runSectionSummaries` and stages the whole flow around it. If you find yourself editing `runAnalyzers.ts` here, stop — that file does not exist yet, because this task runs first.

Verify the module is self-contained: it must import only from `./prompts`, `../../../domain.layer/interfaces/i.reportGeneration`, `../../../utils/logger/fileLogger` and the `ai` package. It must NOT import from `./registry` or `./runAnalyzers`.

- [ ] **Step 5: Run both suites**

Run: `cd Servers && npx jest services/reporting/analyzers/`
Expected: the new `sectionSummaries` tests green, alongside the already-passing `schemas` and `registry` suites. `runAnalyzers` does not exist yet — Task 6 creates it.

- [ ] **Step 6: Commit**

```bash
git add Servers/services/reporting/analyzers/sectionSummaries.ts Servers/services/reporting/analyzers/__tests__/sectionSummaries.test.ts
git commit -m "feat(reporting): port the per-section summarizer so the 24 sectionSummaries blocks keep rendering"
```

---

## Task 7: Widen `ai_blocks_config` from three blocks to seven

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.reportTemplate.ts:14-18`
- Modify: `Servers/domain.layer/interfaces/i.reportGeneration.ts` (request type)
- Modify: `Servers/services/reporting/reportTemplateResolver.ts:10-11`
- Create: `Servers/database/migrations/<stamp>-widen-report-ai-blocks.js`
- Modify: `Servers/database/migrations/20260619191640-seed-reporting-system-templates.js` (Step 6a)
- Modify (**append — the file exists**): `Servers/services/reporting/__tests__/reportTemplateResolver.test.ts`

No column migration is needed — `ai_blocks_config` is an unconstrained `JSONB NOT NULL DEFAULT '{}'` on `report_template_versions` and `scheduled_reports`. Only the interface, the resolver, and the seeded values change.

**The backfill is not a blanket `false`.** `sectionSummaries` and `riskAnalysis` reproduce output `aiSummarizer` already emits whenever `aiEnhanced` was on, so on any existing row that has *any* legacy block enabled they must backfill to `true` — otherwise every existing schedule silently loses its per-section summaries and risk highlights on its next run. Only `complianceGap` and `vendorRisk` — genuinely new work — backfill to `false`.

- [ ] **Step 1: Append the failing tests**

`Servers/services/reporting/__tests__/reportTemplateResolver.test.ts` **already exists** and holds two passing tests (`"maps enabled sections to reportType array + sets aiEnhanced"` and `"organization scope sets projectId 0/undefined and aiEnhanced false when all ai off"`). **Keep both, and keep the existing fixture.** Append these cases to the existing `describe("resolveReportRequest", ...)` block:

```typescript
  it("passes the seven blocks through instead of collapsing them", () => {
    const req = resolveReportRequest(
      {
        project_id: 3, framework_id: 1, project_framework_id: 2, name: "Quarterly", format: "pdf",
        sections_config: { sections: [{ reportSectionKey: "compliance" }] },
        ai_blocks_config: { executiveSummary: true, keyFindings: false, recommendedActions: false, riskAnalysis: true, complianceGap: false, vendorRisk: false, sectionSummaries: true },
      },
      9,
    );
    expect(req.aiBlocks).toEqual({
      sectionSummaries: true,
      executiveSummary: true,
      keyFindings: false,
      recommendedActions: false,
      riskAnalysis: true,
      complianceGap: false,
      vendorRisk: false,
    });
  });

  it("keeps aiEnhanced true when only a new block is on", () => {
    const req = resolveReportRequest(
      {
        project_id: 3, framework_id: 1, project_framework_id: 2, name: "Q", format: "pdf",
        sections_config: { sections: [{ reportSectionKey: "compliance" }] },
        ai_blocks_config: { complianceGap: true },
      },
      9,
    );
    expect(req.aiEnhanced).toBe(true);
    expect(req.aiBlocks!.complianceGap).toBe(true);
    expect(req.aiBlocks!.executiveSummary).toBe(false);
  });

  it("reads an un-backfilled legacy three-key config without inventing new blocks", () => {
    const req = resolveReportRequest(
      {
        project_id: 3, framework_id: 1, project_framework_id: 2, name: "Q", format: "pdf",
        sections_config: { sections: [{ reportSectionKey: "compliance" }] },
        ai_blocks_config: { executiveSummary: true, keyFindings: true, recommendedActions: true },
      },
      9,
    );
    // The resolver reports exactly what is stored. Turning the legacy shape into
    // the seven-key shape is the migration's job, not the resolver's — so a row
    // that somehow escaped the backfill degrades to fewer blocks, never to
    // unexpected LLM spend.
    expect(req.aiBlocks).toEqual({
      sectionSummaries: false,
      executiveSummary: true,
      keyFindings: true,
      recommendedActions: true,
      riskAnalysis: false,
      complianceGap: false,
      vendorRisk: false,
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest services/reporting/__tests__/reportTemplateResolver.test.ts`
Expected: FAIL — `req.aiBlocks` is undefined.

- [ ] **Step 3: Widen `AiBlocksConfig`**

In `Servers/domain.layer/interfaces/i.reportTemplate.ts`, replace the `AiBlocksConfig` interface (lines 14-18) with:

```typescript
export interface AiBlocksConfig {
  /** Per-section AI prose. Ported from aiSummarizer; feeds the 24 sectionSummaries render blocks. */
  sectionSummaries?: boolean;
  executiveSummary?: boolean;
  keyFindings?: boolean;
  recommendedActions?: boolean;
  riskAnalysis?: boolean;
  complianceGap?: boolean;
  vendorRisk?: boolean;
}
```

- [ ] **Step 4: Add `aiBlocks` to the generation request**

In `Servers/domain.layer/interfaces/i.reportGeneration.ts`, add this field to `ReportGenerationRequest` (the interface at lines 35-46), directly after the existing `aiEnhanced` field:

```typescript
  /**
   * Per-block gating for the seven AI blocks. When omitted (manual runs, which
   * have no template) `aiEnhanced: true` resolves to the five blocks that
   * reproduce today's aiSummarizer output — see LEGACY_BLOCKS.
   */
  aiBlocks?: {
    sectionSummaries: boolean;
    executiveSummary: boolean;
    keyFindings: boolean;
    recommendedActions: boolean;
    riskAnalysis: boolean;
    complianceGap: boolean;
    vendorRisk: boolean;
  };
```

Then extend `AISummaries` (lines 92-106) with the three new structured fields, leaving every existing field untouched:

```typescript
  /** Structured output of the riskAnalysis analyzer. */
  riskAnalysis?: {
    narrative: string;
    top_risks: Array<{ name: string; level: string; why: string }>;
  };
  /** Structured output of the complianceGap analyzer. */
  complianceGap?: {
    narrative: string;
    gaps: Array<{ control: string; gap: string; priority: string }>;
    scores_caveat?: string | null;
  };
  /** Structured output of the vendorRisk analyzer. */
  vendorRisk?: {
    narrative: string;
    concerns: Array<{ vendor: string; concern: string; severity: string }>;
  };
```

- [ ] **Step 5: Stop the resolver from OR-ing**

In `Servers/services/reporting/reportTemplateResolver.ts`, replace lines 10-11:

```typescript
  const ai = sched.ai_blocks_config ?? {};
  const aiEnhanced = !!(ai.executiveSummary || ai.keyFindings || ai.recommendedActions);
```

with:

```typescript
  const ai = sched.ai_blocks_config ?? {};
  const aiBlocks = {
    sectionSummaries: !!ai.sectionSummaries,
    executiveSummary: !!ai.executiveSummary,
    keyFindings: !!ai.keyFindings,
    recommendedActions: !!ai.recommendedActions,
    riskAnalysis: !!ai.riskAnalysis,
    complianceGap: !!ai.complianceGap,
    vendorRisk: !!ai.vendorRisk,
  };
  // aiEnhanced stays as the coarse "did the user want any AI at all" flag that
  // the renderers and the filename marker already key off. aiBlocks carries the
  // per-analyzer detail that used to be lost here.
  const aiEnhanced = Object.values(aiBlocks).some(Boolean);
```

and add `aiBlocks,` to the returned object, directly after `aiEnhanced,`.

- [ ] **Step 6: Write the backfill migration**

Run `date +%Y%m%d%H%M%S` for a fresh `<stamp>`, then create `Servers/database/migrations/<stamp>-widen-report-ai-blocks.js`:

```javascript
"use strict";

/**
 * Phase 2 widens ai_blocks_config from three booleans to seven.
 *
 * The backfill is NOT a blanket false. sectionSummaries and riskAnalysis
 * reproduce output aiSummarizer already emits whenever ANY legacy block was on
 * (per-section AI boxes and the risk-highlights box), so on those rows they
 * backfill to true — otherwise every existing schedule silently loses shipped
 * output on its next run. complianceGap and vendorRisk are genuinely new work
 * and always backfill to false, so nobody wakes up paying for analysis they
 * never asked for.
 *
 * No column change — ai_blocks_config is unconstrained JSONB.
 */
const NEW_KEYS = `
  jsonb_build_object(
    'sectionSummaries', COALESCE((ai_blocks_config->>'executiveSummary')::boolean, false)
                     OR COALESCE((ai_blocks_config->>'keyFindings')::boolean, false)
                     OR COALESCE((ai_blocks_config->>'recommendedActions')::boolean, false),
    'riskAnalysis',     COALESCE((ai_blocks_config->>'executiveSummary')::boolean, false)
                     OR COALESCE((ai_blocks_config->>'keyFindings')::boolean, false)
                     OR COALESCE((ai_blocks_config->>'recommendedActions')::boolean, false),
    'complianceGap', false,
    'vendorRisk',    false
  )`;

module.exports = {
  async up(queryInterface) {
    for (const table of ["report_template_versions", "scheduled_reports"]) {
      await queryInterface.sequelize.query(`
        UPDATE verifywise.${table}
           SET ai_blocks_config = ${NEW_KEYS} || COALESCE(ai_blocks_config, '{}'::jsonb)
         WHERE jsonb_typeof(COALESCE(ai_blocks_config, '{}'::jsonb)) = 'object';
      `);
    }
  },

  async down(queryInterface) {
    for (const table of ["report_template_versions", "scheduled_reports"]) {
      await queryInterface.sequelize.query(`
        UPDATE verifywise.${table}
           SET ai_blocks_config = ai_blocks_config
                 - 'sectionSummaries' - 'riskAnalysis' - 'complianceGap' - 'vendorRisk'
         WHERE jsonb_typeof(COALESCE(ai_blocks_config, '{}'::jsonb)) = 'object';
      `);
    }
  },
};
```

Three details that each cause a silent failure if changed:
- **`<computed> || ai_blocks_config` operand order.** The **right** operand wins on key collision, so a row that already carries an explicit `riskAnalysis: false` keeps it and only genuinely missing keys take the computed default.
- **`->>` plus `COALESCE(...)::boolean`** rather than `->`. A row whose `ai_blocks_config` is `'{}'` yields SQL `NULL` from `->>`, and `NULL OR NULL` is `NULL`, not `false` — `COALESCE` on each operand is what keeps the result a real boolean.
- **The `jsonb_typeof(...) = 'object'` guard.** The column is `NOT NULL DEFAULT '{}'` but is otherwise unconstrained, so a row could hold a JSON array or scalar; `||` against a non-object would corrupt it. The guard skips those rather than mangling them.

- [ ] **Step 6a: Update the seed migration's system templates**

The seed at `20260619191640-seed-reporting-system-templates.js:23` binds **one** shared AI constant to all three system templates. Update that constant to the seven-key shape, enabling only what Locked decision 4 allows:

```javascript
const AI = JSON.stringify({
  sectionSummaries: true,
  executiveSummary: true,
  keyFindings: true,
  recommendedActions: true,
  riskAnalysis: true,
  complianceGap: false,
  vendorRisk: false,
});
```

Edit the seed in place rather than adding a new migration — it is idempotent seed data, and the backfill above already covers rows created from the old shape.

- [ ] **Step 7: Run the test and the migration**

Run: `cd Servers && npx jest services/reporting/__tests__/reportTemplateResolver.test.ts && npm run build && npx sequelize db:migrate`
Expected: 5 tests PASS (the two that already existed plus the three appended); build clean; migration applied.

- [ ] **Step 8: Commit**

```bash
git add Servers/domain.layer/interfaces/i.reportTemplate.ts Servers/domain.layer/interfaces/i.reportGeneration.ts Servers/services/reporting/reportTemplateResolver.ts Servers/services/reporting/__tests__/reportTemplateResolver.test.ts Servers/database/migrations/<stamp>-widen-report-ai-blocks.js Servers/database/migrations/20260619191640-seed-reporting-system-templates.js
git commit -m "feat(reporting): widen ai_blocks_config to seven independently gated analyzer blocks"
```

---

## Task 8: Wire the analyzers into `generateReport()`

**Files:**
- Create: `Servers/services/reporting/analyzers/collectAnalyzerInputs.ts`
- Create: `Servers/services/reporting/analyzers/mapToSummaries.ts` (Step 7)
- Modify: `Servers/services/reporting/index.ts:111-123` and `:151-155`
- Modify: `Servers/domain.layer/interfaces/i.reportGeneration.ts` (`ReportGenerationResult`)
- Test: `Servers/services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`

`generateReport()` is the only function holding the `dataCollector` output, so the analyzers run there. It returns the structured payloads; **Task 9's runners persist them**.

**The readiness trap (spec §4) — this is the one that silently produces a wrong report.** All three readiness queries default to `AND project_id IS NULL` when `projectId` is null, but `readiness.ctrl.ts:83-88` never writes a row with a null `project_id`. A project-less call therefore returns `[]` unconditionally, which renders as "no scores" — exactly the "absence of scores read as absence of gaps" failure the spec forbids. So: **when `projectId` is falsy, do not call the readiness queries at all** — hand the analyzer an explicit "not project-scoped" caveat instead.

Note also that the three signatures differ. `getWeakestControlsQuery` takes `organizationId` **first**; the other two take `frameworkType` first.

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`:

```typescript
const mockControlScores = jest.fn();
const mockWeakest = jest.fn();
const mockFrameworkScore = jest.fn();

jest.mock("../../../../utils/readiness.utils", () => ({
  READINESS_FRAMEWORK_IDS: { eu_ai_act: 1, iso_42001: 2, iso_27001: 3, nist_ai_rmf: 4 },
  getControlScoresQuery: (...a: any[]) => mockControlScores(...a),
  getWeakestControlsQuery: (...a: any[]) => mockWeakest(...a),
  getFrameworkScoreByTypeQuery: (...a: any[]) => mockFrameworkScore(...a),
}));

// Must be mocked too: evidenceAi.utils imports the real sequelize instance at
// module load (evidenceAi.utils.ts:1), so leaving it unmocked opens a DB
// connection during the unit test.
const mockGaps = jest.fn();
jest.mock("../../../../utils/evidenceAi.utils", () => ({
  getEvidenceGapsQuery: (...a: any[]) => mockGaps(...a),
}));

import {
  collectReadinessInput,
  collectEvidenceGapsInput,
  collectAllowedOwners,
  resolveBlocks,
} from "../collectAnalyzerInputs";

describe("collectAnalyzerInputs", () => {
  beforeEach(() => {
    mockControlScores.mockReset().mockResolvedValue([{ control_id: 1, overall_score: 25 }]);
    mockWeakest.mockReset().mockResolvedValue([{ control_id: 1 }]);
    mockFrameworkScore.mockReset().mockResolvedValue({ avg_score: 40 });
    mockGaps.mockReset().mockResolvedValue([{ control_id: 1, gap_type: "no_evidence" }]);
  });

  it("skips the evidence-gap query for a framework it does not cover", async () => {
    // iso_27001 is outside GAP_SUPPORTED_FRAMEWORKS. Calling anyway returns EU
    // rows mislabeled with the requested type (evidenceAi.utils.ts:170-172).
    const out = await collectEvidenceGapsInput(3, 5);
    expect(mockGaps).not.toHaveBeenCalled();
    expect(out).toEqual({ gaps: [], frameworkUnsupported: true });
  });

  it("queries evidence gaps for a covered framework", async () => {
    const out = await collectEvidenceGapsInput(1, 5);
    expect(mockGaps).toHaveBeenCalledWith(5, "eu_ai_act");
    expect(out.frameworkUnsupported).toBe(false);
    expect(out.gaps).toHaveLength(1);
  });

  it("does NOT query readiness without a projectId, and says why", async () => {
    const out = await collectReadinessInput(0, 1, 5, null);
    expect(mockControlScores).not.toHaveBeenCalled();
    expect(mockWeakest).not.toHaveBeenCalled();
    expect(out.stale).toBe(true);
    expect(out.controlScores).toEqual([]);
  });

  it("passes frameworkType first to the two scoped queries and orgId first to weakest", async () => {
    await collectReadinessInput(3, 1, 5, 11);
    expect(mockControlScores).toHaveBeenCalledWith("eu_ai_act", 5, 3, 11);
    expect(mockFrameworkScore).toHaveBeenCalledWith("eu_ai_act", 5, 3, 11);
    expect(mockWeakest).toHaveBeenCalledWith(5, 10, 3, 11, undefined, "eu_ai_act");
  });

  it("returns an empty, non-throwing result for an unknown frameworkId", async () => {
    const out = await collectReadinessInput(3, 99, 5, 11);
    expect(mockControlScores).not.toHaveBeenCalled();
    expect(out.controlScores).toEqual([]);
  });

  it("degrades to an empty result when a readiness query throws", async () => {
    mockControlScores.mockRejectedValue(new Error("db down"));
    const out = await collectReadinessInput(3, 1, 5, 11);
    expect(out.controlScores).toEqual([]);
    expect(out.stale).toBe(true);
  });

  it("harvests owner names that actually appear in the report data", () => {
    const owners = collectAllowedOwners({
      sections: {
        projectRisks: { risks: [{ owner: "Alice" }, { owner: "Bob" }] },
        vendors: { vendors: [{ assignee: "Carol" }] },
      },
    } as any);
    expect(owners).toEqual(expect.arrayContaining(["Alice", "Bob", "Carol"]));
  });

  it("resolves manual runs to the blocks that reproduce today's aiSummarizer output", () => {
    expect(resolveBlocks({ aiEnhanced: true } as any)).toEqual({
      sectionSummaries: true,
      executiveSummary: true,
      keyFindings: true,
      recommendedActions: true,
      riskAnalysis: true,
      complianceGap: false,
      vendorRisk: false,
    });
  });

  it("leaves the two new project-scoped analyzers off for manual runs", () => {
    const blocks = resolveBlocks({ aiEnhanced: true } as any);
    expect(blocks.complianceGap).toBe(false);
    expect(blocks.vendorRisk).toBe(false);
  });

  it("prefers an explicit aiBlocks over the legacy default", () => {
    const blocks = resolveBlocks({ aiEnhanced: true, aiBlocks: { sectionSummaries: false, executiveSummary: false, keyFindings: false, recommendedActions: false, riskAnalysis: true, complianceGap: false, vendorRisk: false } } as any);
    expect(blocks.riskAnalysis).toBe(true);
    expect(blocks.executiveSummary).toBe(false);
    expect(blocks.sectionSummaries).toBe(false);
  });

  it("enables nothing when aiEnhanced is false", () => {
    expect(Object.values(resolveBlocks({ aiEnhanced: false } as any)).every((v) => v === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`
Expected: FAIL — `Cannot find module '../collectAnalyzerInputs'`

- [ ] **Step 3: Write the implementation**

Create `Servers/services/reporting/analyzers/collectAnalyzerInputs.ts`:

```typescript
import type {
  ReportData,
  ReportGenerationRequest,
} from "../../../domain.layer/interfaces/i.reportGeneration";
import {
  READINESS_FRAMEWORK_IDS,
  getControlScoresQuery,
  getFrameworkScoreByTypeQuery,
  getWeakestControlsQuery,
} from "../../../utils/readiness.utils";
import { getEvidenceGapsQuery } from "../../../utils/evidenceAi.utils";
import logger from "../../../utils/logger/fileLogger";
import type { AiBlocks } from "./runAnalyzers";

/**
 * Manual runs carry no template, so aiEnhanced maps to the blocks that
 * reproduce today's aiSummarizer output exactly: per-section summaries, an
 * executive summary, findings + recommendations, and risk highlights.
 *
 * complianceGap and vendorRisk stay off — they are the new, project-scoped
 * analyzers, and enabling them here would add unbudgeted spend to every manual
 * report. Phase 3 lets the wizard choose.
 */
const LEGACY_BLOCKS: AiBlocks = {
  sectionSummaries: true,
  executiveSummary: true,
  keyFindings: true,
  recommendedActions: true,
  riskAnalysis: true,
  complianceGap: false,
  vendorRisk: false,
};

const NO_BLOCKS: AiBlocks = {
  sectionSummaries: false,
  executiveSummary: false,
  keyFindings: false,
  recommendedActions: false,
  riskAnalysis: false,
  complianceGap: false,
  vendorRisk: false,
};

export function resolveBlocks(request: ReportGenerationRequest): AiBlocks {
  if (!request.aiEnhanced) return { ...NO_BLOCKS };
  if (request.aiBlocks) return { ...request.aiBlocks };
  return { ...LEGACY_BLOCKS };
}

export interface ReadinessInput {
  controlScores: any[];
  weakestControls: any[];
  frameworkScore: any | null;
  stale: boolean;
}

const EMPTY_READINESS: ReadinessInput = {
  controlScores: [],
  weakestControls: [],
  frameworkScore: null,
  stale: true,
};

/**
 * Read STORED readiness scores for the complianceGap analyzer.
 *
 * Deliberately returns nothing when projectId is falsy. Every readiness query
 * falls back to `AND project_id IS NULL` when projectId is null, and no stored
 * row ever has a null project_id — so a project-less call returns [] while
 * looking like a successful lookup. Better to hand the analyzer an explicit
 * "not project-scoped" signal than a silent empty set it would read as "no gaps".
 */
export async function collectReadinessInput(
  projectId: number | undefined,
  frameworkId: number | undefined,
  organizationId: number,
  userId: number | null,
): Promise<ReadinessInput> {
  if (!projectId) return { ...EMPTY_READINESS };

  const frameworkType = Object.keys(READINESS_FRAMEWORK_IDS).find(
    (k) => READINESS_FRAMEWORK_IDS[k] === frameworkId,
  );
  if (!frameworkType) return { ...EMPTY_READINESS };

  try {
    const [controlScores, weakestControls, frameworkScore] = await Promise.all([
      getControlScoresQuery(frameworkType, organizationId, projectId, userId),
      getWeakestControlsQuery(organizationId, 10, projectId, userId, undefined, frameworkType),
      getFrameworkScoreByTypeQuery(frameworkType, organizationId, projectId, userId),
    ]);
    return {
      controlScores: controlScores ?? [],
      weakestControls: weakestControls ?? [],
      frameworkScore: frameworkScore ?? null,
      // Nothing recalculates readiness at report time, so stored rows may
      // predate the data in this report. Always flag it.
      stale: true,
    };
  } catch (error) {
    logger.warn("Report analyzers: readiness lookup failed, degrading to empty", error);
    return { ...EMPTY_READINESS };
  }
}

/** Frameworks getEvidenceGapsQuery actually covers (evidenceAi.utils.ts:161). */
const GAP_SUPPORTED_FRAMEWORKS = ["eu_ai_act", "iso_42001"];

/**
 * Read the evidence-gap analysis — the SECOND, independent complianceGap input
 * required by spec §3. Never joined with readiness (spec §4).
 *
 * The framework guard is load-bearing: passing an unsupported framework_type
 * makes the query return EU rows mislabeled with the requested type
 * (`evidenceAi.utils.ts:170-172`). Rather than feed the analyzer wrong-framework
 * rows, we skip the call and tell it the framework is uncovered.
 */
export async function collectEvidenceGapsInput(
  frameworkId: number | undefined,
  organizationId: number,
): Promise<{ gaps: any[]; frameworkUnsupported: boolean }> {
  const frameworkType = Object.keys(READINESS_FRAMEWORK_IDS).find(
    (k) => READINESS_FRAMEWORK_IDS[k] === frameworkId,
  );
  if (!frameworkType || !GAP_SUPPORTED_FRAMEWORKS.includes(frameworkType)) {
    return { gaps: [], frameworkUnsupported: true };
  }

  try {
    const gaps = await getEvidenceGapsQuery(organizationId, frameworkType);
    return { gaps: gaps ?? [], frameworkUnsupported: false };
  } catch (error) {
    logger.warn("Report analyzers: evidence-gap lookup failed, degrading to empty", error);
    return { gaps: [], frameworkUnsupported: false };
  }
}

/**
 * Names that may legitimately appear as a suggestedOwner: only people already
 * named in the report's own data. An owner the model produces from anywhere
 * else is invented, and gets nulled.
 */
export function collectAllowedOwners(reportData: ReportData): string[] {
  const owners = new Set<string>();
  const sections: any = reportData?.sections ?? {};

  const harvest = (rows: any[] | undefined, fields: string[]) => {
    (rows ?? []).forEach((row) => {
      fields.forEach((f) => {
        const v = row?.[f];
        if (typeof v === "string" && v.trim() && v.toLowerCase() !== "unassigned") {
          owners.add(v.trim());
        }
      });
    });
  };

  harvest(sections.projectRisks?.risks, ["owner"]);
  harvest(sections.vendorRisks?.risks, ["owner", "actionOwner"]);
  harvest(sections.modelRisks?.risks, ["owner"]);
  harvest(sections.vendors?.vendors, ["assignee", "reviewer"]);
  harvest(sections.compliance?.controls, ["owner", "approver"]);
  harvest(sections.trainingRegistry?.records, ["owner"]);
  harvest(sections.policyManager?.policies, ["owner", "reviewer"]);

  return Array.from(owners);
}
```

- [ ] **Step 4: Run the test**

Run: `cd Servers && npx jest services/reporting/analyzers/__tests__/collectAnalyzerInputs.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Add `analyses` to the result interface**

In `Servers/domain.layer/interfaces/i.reportGeneration.ts`, add this field to `ReportGenerationResult`:

```typescript
  /**
   * Structured analyzer output, keyed by section key. The runner persists this
   * to report_run_analyses; the renderers read the flattened copy on
   * ReportData.aiSummaries instead.
   */
  analyses?: Record<string, {
    payload: any;
    abstained: boolean;
    abstain_reason: string | null;
    model: string | null;
    attempts: number;
  }>;
```

- [ ] **Step 6: Rewrite the AI block in `generateReport()`**

In `Servers/services/reporting/index.ts`, replace the whole AI-enhancement block (lines 111-123):

```typescript
    // AI Enhancement (optional)
    if (request.aiEnhanced) {
      try {
        const { generateAISummaries } = await import("./aiSummarizer");
        reportData.aiSummaries = await generateAISummaries(
          reportData,
          reportData.metadata.organizationId,
          request.llmKeyId,
        );
      } catch (error) {
        logger.warn("AI summarization failed, continuing with standard report:", error);
      }
    }
```

with:

```typescript
    // AI analysis (optional, per-block gated)
    let analyses: Record<string, any> | undefined;
    if (request.aiEnhanced) {
      try {
        const blocks = resolveBlocks(request);
        const keys = await getLLMKeysWithKeyQuery(reportData.metadata.organizationId);
        const llmKey =
          (request.llmKeyId ? keys?.find((k: any) => k.id === request.llmKeyId) : null) ??
          keys?.[0] ??
          null;

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
              return { readiness, evidenceGaps };
            })()
          : {};

        analyses = await runAnalyzers({
          reportData,
          llmKey: llmKey as any,
          blocks,
          extras,
          allowedOwners: collectAllowedOwners(reportData),
        });

        reportData.aiSummaries = mapAnalysesToSummaries(analyses, reportData.aiSummaries);
      } catch (error) {
        // Analysis is never allowed to lose the report.
        logger.warn("Report analysis failed, continuing with standard report:", error);
      }
    }
```

Add these imports to the top of `index.ts`:

```typescript
import { runAnalyzers } from "./analyzers/runAnalyzers";
import {
  collectAllowedOwners,
  collectEvidenceGapsInput,
  collectReadinessInput,
  resolveBlocks,
} from "./analyzers/collectAnalyzerInputs";
import { mapAnalysesToSummaries } from "./analyzers/mapToSummaries";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
```

- [ ] **Step 7: Write the mapper**

Create `Servers/services/reporting/analyzers/mapToSummaries.ts`:

```typescript
import type { AISummaries } from "../../../domain.layer/interfaces/i.reportGeneration";
import type { AnalyzedKey, AnalyzerResults } from "./runAnalyzers";

/**
 * Flatten structured analyzer output onto the AISummaries shape both renderers
 * already consume. Abstained sections contribute nothing, so an abstention
 * renders as an absent block rather than as an empty heading.
 */
export function mapAnalysesToSummaries(
  analyses: AnalyzerResults,
  existing?: AISummaries,
): AISummaries {
  const out: AISummaries = {
    ...existing,
    sectionSummaries: existing?.sectionSummaries ?? {},
  };

  // Per-section prose from the ported summarizer. This is what keeps the 24
  // sectionSummaries render blocks alive after aiSummarizer is deleted — drop
  // it and twelve AI boxes silently vanish from every report.
  // No cast: AnalyzerResults is keyed by AnalyzedKey, which includes this key.
  const sectionResult = analyses?.sectionSummaries;
  if (sectionResult && !sectionResult.abstained && sectionResult.payload?.summaries) {
    out.sectionSummaries = { ...out.sectionSummaries, ...sectionResult.payload.summaries };
  }

  // Returns the payload only when the analyzer actually produced one — an
  // abstained section contributes nothing rather than an empty heading.
  const take = (key: AnalyzedKey): any => {
    const r = analyses?.[key];
    return r && !r.abstained && r.payload ? r.payload : undefined;
  };

  const exec = take("executiveSummary");
  if (exec?.summary) out.executiveSummary = exec.summary;

  const findings = take("keyFindings");
  if (findings?.findings?.length) {
    out.keyFindings = findings.findings.map((f: { text: string }) => f.text);
  }

  const actions = take("recommendedActions");
  if (actions?.actions?.length) {
    out.recommendedActions = actions.actions.map((a: any) => ({
      action: a.action,
      suggestedOwner: a.suggestedOwner ?? undefined,
      priority: a.priority,
      sourceSignal: a.rationale,
    }));
    // Keep the plain-string list the existing renderers already read.
    out.recommendations = actions.actions.map((a: any) => a.action);
  }

  const risk = take("riskAnalysis");
  if (risk) {
    out.riskAnalysis = risk;
    out.riskHighlights = risk.narrative;
  }

  const gap = take("complianceGap");
  if (gap) out.complianceGap = gap;

  const vendor = take("vendorRisk");
  if (vendor) out.vendorRisk = vendor;

  return out;
}
```

- [ ] **Step 7a: Test the mapper**

This module is the single point where a wiring mistake silently blanks 24 render blocks, so it gets its own test. Create `Servers/services/reporting/analyzers/__tests__/mapToSummaries.test.ts`:

```typescript
import { mapAnalysesToSummaries } from "../mapToSummaries";

const ok = (payload: any) => ({ payload, abstained: false, abstain_reason: null, model: "m", attempts: 1 });
const abstained = { payload: null, abstained: true, abstain_reason: "no data", model: "m", attempts: 0 };

describe("mapAnalysesToSummaries", () => {
  it("carries per-section summaries onto the render contract", () => {
    const out = mapAnalysesToSummaries({
      sectionSummaries: ok({ summaries: { projectRisks: "P", compliance: "C" } }),
    } as any);
    expect(out.sectionSummaries).toEqual({ projectRisks: "P", compliance: "C" });
  });

  it("always returns a sectionSummaries object even with no analyses", () => {
    // The renderers index into it unguarded in places; undefined would throw.
    expect(mapAnalysesToSummaries({} as any).sectionSummaries).toEqual({});
  });

  it("drops abstained sections rather than rendering an empty block", () => {
    const out = mapAnalysesToSummaries({
      executiveSummary: abstained,
      sectionSummaries: abstained,
    } as any);
    expect(out.executiveSummary).toBeUndefined();
    expect(out.sectionSummaries).toEqual({});
  });

  it("maps riskAnalysis onto riskHighlights so the existing box keeps rendering", () => {
    const out = mapAnalysesToSummaries({
      riskAnalysis: ok({ narrative: "N", top_risks: [] }),
    } as any);
    expect(out.riskHighlights).toBe("N");
    expect(out.riskAnalysis).toEqual({ narrative: "N", top_risks: [] });
  });

  it("populates both the structured actions and the legacy string list", () => {
    const out = mapAnalysesToSummaries({
      recommendedActions: ok({ actions: [{ action: "Do X", suggestedOwner: null, priority: "high", rationale: "R" }] }),
    } as any);
    expect(out.recommendations).toEqual(["Do X"]);
    expect(out.recommendedActions?.[0].suggestedOwner).toBeUndefined();
  });
});
```

Run: `cd Servers && npx jest services/reporting/analyzers/__tests__/mapToSummaries.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 8: Return the analyses**

In `generateReport()`, the `_AI_` filename marker at lines 151-155 currently tests `reportData.aiSummaries`. Change the return so the analyses travel with the result — replace `return result;` (line 157) with:

```typescript
    return { ...result, analyses };
```

- [ ] **Step 9: Build and run the reporting suite**

Run: `cd Servers && npm run build && npx jest services/reporting/`
Expected: build clean; all reporting tests green.

- [ ] **Step 10: Commit**

```bash
git add Servers/services/reporting/analyzers/ Servers/services/reporting/index.ts Servers/domain.layer/interfaces/i.reportGeneration.ts
git commit -m "feat(reporting): run the six analyzers inside generateReport and map them onto aiSummaries"
```

---

## Task 9: Persist analyses in both runners

**Files:**
- Create: `Servers/services/reporting/analyzers/persistAnalyses.ts` (Step 3)
- Modify: `Servers/services/reporting/manualReportRunner.ts`
- Modify: `Servers/services/reporting/reportRunOrchestrator.ts`
- Test: `Servers/services/reporting/__tests__/manualReportRunner.test.ts` (extend)

Both runners already have the run id and the generation result. Persistence lives here, not in the analyzer services (spec §5).

- [ ] **Step 1: Write the failing test**

Append to `Servers/services/reporting/__tests__/manualReportRunner.test.ts` (keep every existing test and mock; add `upsertRunAnalysisQuery` to the mocked modules):

```typescript
  it("persists one row per analyzed section and records ai_status on the run", async () => {
    (generateReport as jest.Mock).mockResolvedValue({
      success: true,
      filename: "r.pdf",
      content: Buffer.from("x"),
      mimeType: "application/pdf",
      analyses: {
        executiveSummary: { payload: { summary: "s" }, abstained: false, abstain_reason: null, model: "gpt-4o-mini", attempts: 1 },
        keyFindings: { payload: null, abstained: true, abstain_reason: "insufficient data", model: "gpt-4o-mini", attempts: 0 },
      },
    });
    (uploadFile as jest.Mock).mockResolvedValue({ id: 12, filename: "r.pdf" });

    await executeManualRun(77, { projectId: 1 } as any, 3, 5);

    expect(upsertRunAnalysisQuery).toHaveBeenCalledTimes(2);
    expect(upsertRunAnalysisQuery).toHaveBeenCalledWith(
      expect.objectContaining({ report_run_id: 77, section_key: "executiveSummary", organization_id: 5, analyzed_by: 3 }),
    );
    expect(updateRunStatusQuery).toHaveBeenCalledWith(
      77,
      expect.objectContaining({
        status: "success",
        ai_status: expect.objectContaining({ executiveSummary: "ok", keyFindings: "abstained" }),
      }),
    );
  });

  it("a failing analysis write does not fail the run", async () => {
    (generateReport as jest.Mock).mockResolvedValue({
      success: true,
      filename: "r.pdf",
      content: Buffer.from("x"),
      mimeType: "application/pdf",
      analyses: { executiveSummary: { payload: { summary: "s" }, abstained: false, abstain_reason: null, model: null, attempts: 1 } },
    });
    (uploadFile as jest.Mock).mockResolvedValue({ id: 12, filename: "r.pdf" });
    (upsertRunAnalysisQuery as jest.Mock).mockRejectedValue(new Error("db down"));

    await executeManualRun(77, { projectId: 1 } as any, 3, 5);

    expect(updateRunStatusQuery).toHaveBeenCalledWith(77, expect.objectContaining({ status: "success" }));
  });

  it("badges the run as AI-generated only when a section actually produced output", async () => {
    (uploadFile as jest.Mock).mockResolvedValue({ id: 12, filename: "r.pdf" });
    (upsertRunAnalysisQuery as jest.Mock).mockResolvedValue({ id: 1 });

    // All sections abstained -> no AI content was written -> no badge.
    (generateReport as jest.Mock).mockResolvedValue({
      success: true, filename: "r.pdf", content: Buffer.from("x"), mimeType: "application/pdf",
      analyses: { executiveSummary: { payload: null, abstained: true, abstain_reason: "no data", model: null, attempts: 0 } },
    });
    await executeManualRun(77, { projectId: 1 } as any, 3, 5);
    expect(trackAIContent).not.toHaveBeenCalled();

    // One real section -> badge once, as genuine LLM output.
    (generateReport as jest.Mock).mockResolvedValue({
      success: true, filename: "r.pdf", content: Buffer.from("x"), mimeType: "application/pdf",
      analyses: { executiveSummary: { payload: { summary: "s" }, abstained: false, abstain_reason: null, model: "gpt-4o-mini", attempts: 1 } },
    });
    await executeManualRun(78, { projectId: 1 } as any, 3, 5);
    expect(trackAIContent).toHaveBeenCalledTimes(1);
    expect(trackAIContent).toHaveBeenCalledWith(
      5, "report_run", 78,
      expect.objectContaining({ badgeType: "generated", modelProvider: "llm" }),
      3,
    );
  });
```

Add `trackAIContent` to this file's mocked modules alongside `upsertRunAnalysisQuery`:

```typescript
jest.mock("../../../middleware/aiContentTracker.middleware", () => ({
  trackAIContent: jest.fn().mockResolvedValue(null),
}));
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest services/reporting/__tests__/manualReportRunner.test.ts`
Expected: FAIL — `upsertRunAnalysisQuery` is never called.

- [ ] **Step 3: Write the shared persistence helper**

Create `Servers/services/reporting/analyzers/persistAnalyses.ts`:

```typescript
import { upsertRunAnalysisQuery } from "../../../utils/reportRunAnalysis.utils";
import { trackAIContent } from "../../../middleware/aiContentTracker.middleware";
import logger from "../../../utils/logger/fileLogger";
import { ANALYZER_VERSION } from "./registry";

/**
 * Persist one row per analyzed section and return a compact per-section status
 * map for report_runs.ai_status.
 *
 * Never throws: a report that generated successfully must not be marked failed
 * because its audit sidecar could not be written.
 */
export async function persistAnalyses(
  runId: number,
  organizationId: number,
  userId: number | null,
  analyses: Record<string, any> | undefined,
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
          },
        });
        // undefined means the WHERE EXISTS tenant guard rejected the pair —
        // the run does not belong to this org. Never let that read as success.
        if (!written) {
          logger.warn(
            `Analysis "${sectionKey}" rejected: run ${runId} does not belong to org ${organizationId}`,
          );
          aiStatus[sectionKey] = "write_failed";
        }
      } catch (error) {
        logger.warn(`Failed to persist analysis "${sectionKey}" for run ${runId}`, error);
        aiStatus[sectionKey] = "write_failed";
      }
    }),
  );

  // Spec §1: tag genuine LLM output as AI-generated content. Once per run, not
  // once per section — the run is the entity a reviewer sees a badge on.
  // Only when at least one section actually produced LLM output: an all-abstained
  // run wrote no AI content and must not be badged as though it did.
  const produced = Object.entries(analyses).filter(([, r]) => r && !r.abstained);
  if (produced.length > 0) {
    trackAIContent(
      organizationId,
      "report_run",
      runId,
      {
        badgeType: "generated",
        modelUsed: (produced[0][1] as any)?.model ?? null,
        modelProvider: "llm",
        toolName: "report-analysis",
        promptSummary: `Report analysis (${ANALYZER_VERSION}): ${produced
          .map(([k]) => k)
          .join(", ")}`,
      },
      userId,
    ).catch(() => {});
  }

  return aiStatus;
}
```

Note `modelProvider: "llm"` — **not** `"verifywise"`. The readiness batch path tags its non-LLM arithmetic with `modelProvider: "verifywise"` (`readiness.ctrl.ts:149-161`); this is genuine model output and must not be conflated with it (spec §1).

- [ ] **Step 4: Call it from the manual runner**

In `Servers/services/reporting/manualReportRunner.ts`, after the successful `uploadFile` and **before** the final `updateRunStatusQuery`, add:

```typescript
    const aiStatus = await persistAnalyses(runId, organizationId, userId, (result as any).analyses);
```

and add `ai_status: aiStatus ?? undefined,` to the success-branch `updateRunStatusQuery` object. Import at the top:

```typescript
import { persistAnalyses } from "./analyzers/persistAnalyses";
```

- [ ] **Step 5: Call it from the scheduled orchestrator**

In `Servers/services/reporting/reportRunOrchestrator.ts`, after the generation success guard and before the run row is finalised, add the same call — note the scheduled path's user is `sched.owner_id ?? sched.created_by`:

```typescript
    const aiStatus = await persistAnalyses(
      run.id,
      sched.organization_id,
      sched.owner_id ?? sched.created_by ?? null,
      (result as any).analyses,
    );
```

and add `ai_status: aiStatus ?? undefined,` to its `updateRunStatusQuery` call. Same import.

- [ ] **Step 6: Run the tests**

Run: `cd Servers && npx jest services/reporting/ && npm run build`
Expected: all green, including the two new tests; build clean.

- [ ] **Step 7: Commit**

```bash
git add Servers/services/reporting/analyzers/persistAnalyses.ts Servers/services/reporting/manualReportRunner.ts Servers/services/reporting/reportRunOrchestrator.ts Servers/services/reporting/__tests__/manualReportRunner.test.ts
git commit -m "feat(reporting): persist analyzer output to report_run_analyses from both runners"
```

---

## Task 10: Render the three new analyses in the PDF

**Files:**
- Modify: `Servers/templates/reports/report-pdf.ejs`

Reuse the existing classes — `.group-header`, `.group-title`, `.subsection`, `.subsection-header`, `.subsection-title`, `.ai-analysis-box`, `.ai-analysis-label`, `.ai-analysis-content`, `.ai-findings-list`. They are defined **inline in this file's own `<style>` block** (lines 10-94). Add no new CSS.

- [ ] **Step 1: Render `recommendedActions` under its OWN top-level guard**

**Not nested inside the executive-summary block.** `report-pdf.ejs:166` wraps that whole block in `<% if (typeof aiSummaries !== 'undefined' && aiSummaries && aiSummaries.executiveSummary) { %>`. The seven blocks are now *independently* gated and independently abstain, so nesting would mean recommended actions render only when a **different** analyzer happened to succeed — a template can legitimately enable `recommendedActions` with `executiveSummary` off, and the section would silently never appear.

Insert this as a sibling immediately **after** the `<% } %>` that closes the entire `.ai-executive-summary` block (around line 202):

```html
      <% if (typeof aiSummaries !== 'undefined' && aiSummaries && aiSummaries.recommendedActions && aiSummaries.recommendedActions.length > 0) { %>
      <div class="subsection avoid-break">
        <div class="subsection-header">
          <h3 class="subsection-title">Recommended actions</h3>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Priority</th>
              <th>Suggested owner</th>
            </tr>
          </thead>
          <tbody>
            <% aiSummaries.recommendedActions.forEach(function(a) { %>
            <tr>
              <td><%= a.action %></td>
              <td><%= a.priority || '—' %></td>
              <td><%= a.suggestedOwner || 'Unassigned' %></td>
            </tr>
            <% }); %>
          </tbody>
        </table>
      </div>
      <% } %>
```

- [ ] **Step 2: Render the compliance gap analysis**

Immediately **before** the `<!-- RISK ANALYSIS GROUP -->` comment (line 204), insert:

```html
    <!-- ============================================ -->
    <!-- COMPLIANCE GAP ANALYSIS (AI-Generated) -->
    <!-- ============================================ -->
    <% if (typeof aiSummaries !== 'undefined' && aiSummaries && aiSummaries.complianceGap) { %>
    <div class="avoid-break">
      <div class="group-header">
        <h2 class="group-title">Compliance Gap Analysis</h2>
      </div>
      <div class="ai-analysis-box">
        <div class="ai-analysis-label">AI-Generated Analysis</div>
        <div class="ai-analysis-content"><%= aiSummaries.complianceGap.narrative %></div>
      </div>

      <% if (aiSummaries.complianceGap.scores_caveat) { %>
      <div class="ai-risk-highlights-box">
        <div class="ai-analysis-label">Scope note</div>
        <div class="ai-analysis-content"><%= aiSummaries.complianceGap.scores_caveat %></div>
      </div>
      <% } %>

      <% if (aiSummaries.complianceGap.gaps && aiSummaries.complianceGap.gaps.length > 0) { %>
      <div class="subsection">
        <div class="subsection-header">
          <h3 class="subsection-title">Prioritised gaps</h3>
        </div>
        <table class="data-table">
          <thead>
            <tr><th>Control</th><th>Gap</th><th>Priority</th></tr>
          </thead>
          <tbody>
            <% aiSummaries.complianceGap.gaps.forEach(function(g) { %>
            <tr>
              <td><strong><%= g.control %></strong></td>
              <td><%= g.gap %></td>
              <td><span class="chip chip-<%= String(g.priority).toLowerCase() %>"><%= g.priority %></span></td>
            </tr>
            <% }); %>
          </tbody>
        </table>
      </div>
      <% } %>
    </div>
    <% } %>
```

- [ ] **Step 3: Render the vendor risk analysis**

The existing `riskHighlights` block (lines 365-371) already renders the `riskAnalysis` narrative, because Task 8's mapper assigns `riskAnalysis.narrative` to `riskHighlights`. Only `vendorRisk` needs a new block. Insert it directly **after** that `riskHighlights` block:

```html
    <% if (typeof aiSummaries !== 'undefined' && aiSummaries && aiSummaries.vendorRisk) { %>
    <div class="subsection avoid-break">
      <div class="subsection-header">
        <h3 class="subsection-title">Third-party risk analysis</h3>
      </div>
      <div class="ai-analysis-box">
        <div class="ai-analysis-label">AI-Generated Analysis</div>
        <div class="ai-analysis-content"><%= aiSummaries.vendorRisk.narrative %></div>
      </div>
      <% if (aiSummaries.vendorRisk.concerns && aiSummaries.vendorRisk.concerns.length > 0) { %>
      <ul class="ai-findings-list">
        <% aiSummaries.vendorRisk.concerns.forEach(function(c) { %>
        <li><strong><%= c.vendor %>:</strong> <%= c.concern %> (<%= c.severity %>)</li>
        <% }); %>
      </ul>
      <% } %>
    </div>
    <% } %>
```

- [ ] **Step 4: Add all three new sections to the table of contents**

In the TOC block (lines 129-147), after the existing executive-summary entry, insert all three — matching Task 11's DOCX TOC entry-for-entry, so the two formats do not drift apart:

```html
      <% if (typeof aiSummaries !== 'undefined' && aiSummaries && aiSummaries.recommendedActions && aiSummaries.recommendedActions.length > 0) { %>
      <div class="toc-entry"><%= sectionNum++ %>. Recommended actions</div>
      <% } %>
      <% if (typeof aiSummaries !== 'undefined' && aiSummaries && aiSummaries.complianceGap) { %>
      <div class="toc-entry"><%= sectionNum++ %>. Compliance gap analysis</div>
      <% } %>
      <% if (typeof aiSummaries !== 'undefined' && aiSummaries && aiSummaries.vendorRisk) { %>
      <div class="toc-entry"><%= sectionNum++ %>. Third-party risk analysis</div>
      <% } %>
```

Each guard must be the **same condition** that governs whether its section renders, or the TOC lists a section the document does not contain. Match the exact markup of the neighbouring TOC entries — copy the surrounding entry's element and class names rather than the illustrative `div.toc-entry` above if they differ.

Note the vendor-risk section itself is placed inside the risk-analysis group in the PDF (Step 3) but is a top-level section in the DOCX (Task 11 Step 3), because the DOCX risk builder early-returns on a vendors-only report. The TOC entry is correct in both.

- [ ] **Step 5: Verify the template renders**

Run: `cd Servers && npm run build && npx jest services/reporting/`
Expected: green. Then generate one PDF end-to-end (API + worker running) with `aiEnhanced: true` against an org that has an LLM key, and confirm the executive summary and recommended-actions table appear.

- [ ] **Step 6: Commit**

```bash
git add Servers/templates/reports/report-pdf.ejs
git commit -m "feat(reporting): render compliance-gap, vendor-risk and recommended-actions blocks in the PDF"
```

---

## Task 11: Render the same three analyses in the DOCX

**Files:**
- Modify: `Servers/services/reporting/docxGenerator.ts`

**This is the step that is easy to skip and expensive to miss** (spec Risks): `docxGenerator.ts` builds the document programmatically — it does **not** render `report-docx.ejs`, which is dead. Anything added only to the EJS silently vanishes from every DOCX export.

Use `createAIAnalysisBox(content, label, borderColor?, bgColor?)` (line 491) — do not hand-roll paragraph borders. Section and subsection headers come from `createSectionHeader` / `createSubsectionHeader`.

- [ ] **Step 1: Add recommended actions as its own section builder**

**Not inside `createExecutiveSummarySection`.** That function early-returns at line 552 with `if (!aiSummaries.executiveSummary) { return []; }`, so anything added inside it renders only when the executive-summary analyzer also succeeded. The blocks are independently gated, so recommended actions needs its own builder.

Add this alongside `createExecutiveSummarySection`:

```typescript
/**
 * Recommended Actions section. Standalone rather than nested in the executive
 * summary: the two analyzers are gated and abstain independently.
 */
function createRecommendedActionsSection(aiSummaries: AISummaries): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  if (!aiSummaries.recommendedActions || aiSummaries.recommendedActions.length === 0) {
    return [];
  }

  {
    elements.push(createSectionHeader("Recommended Actions"));
    aiSummaries.recommendedActions.forEach((a) => {
      elements.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: convertInchesToTwip(0.3) },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: a.action, size: 20, color: COLORS.textPrimary }),
            new TextRun({
              text: `  [${a.priority ?? "—"} · ${a.suggestedOwner ?? "Unassigned"}]`,
              size: 18,
              color: COLORS.textSecondary,
            }),
          ],
        }),
      );
    });
  }

  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}
```

Check `COLORS` at lines 32-49 before writing: if `textSecondary` is not in the palette, use `COLORS.textPrimary`.

- [ ] **Step 2: Add a compliance-gap section builder**

Add this function next to `createExecutiveSummarySection`:

```typescript
/**
 * Compliance Gap Analysis section (AI-generated). Explains the STORED
 * readiness scores; it never re-scores anything.
 */
function createComplianceGapSection(reportData: ReportData): (Paragraph | Table)[] {
  const gap = reportData.aiSummaries?.complianceGap;
  if (!gap) return [];

  const elements: (Paragraph | Table)[] = [];
  elements.push(createSectionHeader("Compliance Gap Analysis"));
  elements.push(...createAIAnalysisBox(gap.narrative, "AI-Generated Analysis"));

  if (gap.scores_caveat) {
    elements.push(
      ...createAIAnalysisBox(gap.scores_caveat, "Scope note", COLORS.aiWarning, COLORS.aiWarningBg),
    );
  }

  if (gap.gaps && gap.gaps.length > 0) {
    elements.push(createSubsectionHeader("Prioritised gaps"));
    gap.gaps.forEach((g) => {
      elements.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: convertInchesToTwip(0.3) },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: `${g.control}: `, bold: true, size: 20, color: COLORS.textPrimary }),
            new TextRun({ text: `${g.gap} (${g.priority})`, size: 20, color: COLORS.textPrimary }),
          ],
        }),
      );
    });
  }

  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}
```

- [ ] **Step 3: Add the vendor-risk block as a standalone section**

**Not inside `createRiskAnalysisSection`.** That builder early-returns `[]` at lines 614-616 when no risk section is selected, so a vendor-risk block nested there would disappear from any report whose sections are e.g. `vendors` only — precisely the report where third-party analysis matters most. (The PDF's `riskHighlights` block sits outside the risk-section guard, so the two renderers are not symmetric here; follow the PDF's placement, not the DOCX's.)

Add it as its own builder alongside `createComplianceGapSection`:

```typescript
/**
 * Third-party risk analysis. Standalone: createRiskAnalysisSection returns []
 * when no risk section is selected, and a vendors-only report still needs this.
 */
function createVendorRiskSection(reportData: ReportData): (Paragraph | Table)[] {
  const vendorRisk = reportData.aiSummaries?.vendorRisk;
  if (!vendorRisk) return [];

  const elements: (Paragraph | Table)[] = [];
  {
    elements.push(createSectionHeader("Third-Party Risk Analysis"));
    elements.push(
      ...createAIAnalysisBox(vendorRisk.narrative, "AI-Generated Analysis"),
    );
    (vendorRisk.concerns ?? []).forEach((c) => {
      elements.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: convertInchesToTwip(0.3) },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: `${c.vendor}: `, bold: true, size: 20, color: COLORS.textPrimary }),
            new TextRun({ text: `${c.concern} (${c.severity})`, size: 20, color: COLORS.textPrimary }),
          ],
        }),
      );
    });
  }

  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}
```

- [ ] **Step 4: Register the new sections in the TOC**

In `createTableOfContents` (lines 224-308), directly after the executive-summary entry, insert all three — each under the same guard that governs whether its section actually renders, so the TOC can never list a section the document does not contain:

```typescript
  // Recommended Actions (only when the analyzer produced any)
  if (reportData.aiSummaries?.recommendedActions?.length) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Recommended actions`));
  }

  // Compliance Gap Analysis (only when the analyzer produced one)
  if (reportData.aiSummaries?.complianceGap) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Compliance gap analysis`));
  }

  // Third-Party Risk Analysis (only when the analyzer produced one)
  if (reportData.aiSummaries?.vendorRisk) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Third-party risk analysis`));
  }
```

- [ ] **Step 5: Splice the sections into the assembly**

In `generateDOCX` (lines 1168-1248), add all three spreads to `allChildren` immediately after the executive-summary section's spread, in the same order as the TOC entries above:

```typescript
    ...createRecommendedActionsSection(reportData.aiSummaries ?? ({ sectionSummaries: {} } as AISummaries)),
    ...createComplianceGapSection(reportData),
    ...createVendorRiskSection(reportData),
```

`generateDOCXWithCharts` is a pass-through to `generateDOCX`, so it needs no change.

- [ ] **Step 6: Verify**

Run: `cd Servers && npm run build && npx jest services/reporting/`
Expected: green. Then generate one **DOCX** end-to-end with `aiEnhanced: true` and confirm the Executive Summary, Recommended actions and — when the analyzer ran — Compliance Gap Analysis all appear, and that the section appears in the table of contents.

- [ ] **Step 7: Commit**

```bash
git add Servers/services/reporting/docxGenerator.ts
git commit -m "feat(reporting): render the new analysis sections in the DOCX generator"
```

---

## Task 12: Delete `aiSummarizer`

**Files:**
- Delete: `Servers/services/reporting/aiSummarizer.ts`
- Delete: `Servers/services/reporting/__tests__/aiSummarizer.actions.test.ts`

Its only production caller was the dynamic import in `generateReport()`, replaced in Task 8. Its only other importer is its own test. `sanitizeRecommendedActions` lives on as `sanitizeOwners` in `runAnalyzers.ts` — and, unlike the original, is actually called.

- [ ] **Step 1: Prove `sectionSummaries` still has a producer**

**Do this before deleting anything.** `aiSummarizer.ts:424` is the only producer of `AISummaries.sectionSummaries` until Task 6a lands; deleting the file first blanks 24 render blocks with nothing failing.

Run:
```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
grep -rn "sectionSummaries" Servers/services/reporting/analyzers/ --include="*.ts"
```
Expected: hits in `sectionSummaries.ts`, `runAnalyzers.ts` and `mapToSummaries.ts`. If Task 6a is not done, **stop** — do not delete `aiSummarizer` until it is.

- [ ] **Step 2: Prove nothing outside the two doomed files still references them**

The two files being deleted necessarily match their own names, so exclude them — otherwise the stop condition can never clear:

```bash
grep -rn "aiSummarizer\|generateAISummaries\|sanitizeRecommendedActions" Servers/ --include="*.ts" \
  | grep -v megasaver \
  | grep -v "reporting/aiSummarizer.ts" \
  | grep -v "aiSummarizer.actions.test.ts"
```
Expected: **no output.** In particular `services/reporting/index.ts:114` must be gone — Task 8 replaced it. If anything else appears, stop and wire it before deleting.

- [ ] **Step 3: Delete both files**

```bash
git rm Servers/services/reporting/aiSummarizer.ts Servers/services/reporting/__tests__/aiSummarizer.actions.test.ts
```

- [ ] **Step 4: Verify the build and the full backend suite**

Run: `cd Servers && npm run build && npm run test`
Expected: build clean; no suite references the deleted module.

- [ ] **Step 5: Confirm per-section summaries still render**

Generate one PDF with `aiEnhanced: true` against a project that has data in at least three sections. Confirm the per-section AI boxes still appear — this is the specific regression Task 6a exists to prevent, and it is invisible to the test suite.

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(reporting): delete aiSummarizer, superseded by the six analyzers"
```

---

## Task 13: Documentation

**Files:**
- Modify: `docs/technical/domains/reporting.md`
- Modify: `docs/technical/infrastructure/pdf-generation.md:195`

- [ ] **Step 1: Update the reporting domain doc**

In `docs/technical/domains/reporting.md`:
- Bump **Last Updated** to `2026-07-19`.
- Add an "AI analysis" section covering: the six structured analyzers and their section keys, plus the ported `sectionSummaries` producer and why it is not a registry entry; `ai_blocks_config` gating and the manual-run default of five blocks (Locked decision 3); `report_run_analyses` as the per-run sidecar with version-bumping upsert; abstention semantics (a failed or data-starved analyzer abstains, the report still generates); and `ANALYZER_VERSION` being bumped on any prompt or schema change.
- **Fix the stale claim at line 208** that describes `report-docx.ejs` as a live DOCX template. It is dead: 501 lines, zero `aiSummaries` references, zero code references anywhere in `Servers/`, and `docxGenerator.ts` imports no EJS at all. State that DOCX is built programmatically by `docxGenerator.ts`.

- [ ] **Step 2: Fix the same stale claim in the PDF doc**

In `docs/technical/infrastructure/pdf-generation.md`, correct the `report-docx.ejs` description at line 195 the same way, and note that any new report section must be added in **both** `report-pdf.ejs` and `docxGenerator.ts`.

- [ ] **Step 3: Commit**

```bash
git add docs/technical/domains/reporting.md docs/technical/infrastructure/pdf-generation.md
git commit -m "docs(reporting): document the analyzer pipeline and correct the dead report-docx.ejs claim"
```

---

## Final verification

- [ ] **Backend build + full unit suite**

Run: `cd Servers && npm run build && npm run test`
Expected: build clean; the new analyzer, utils and resolver suites green; no suite references `aiSummarizer`.

- [ ] **Migrations round-trip**

Run: `cd Servers && npx sequelize db:migrate:undo && npx sequelize db:migrate`
Expected: both new migrations reverse and re-apply cleanly.

- [ ] **API drift**

Run: `cd Servers && npm run check:api-drift`
Expected: exit 0. (Phase 2 adds no routes, so this should be a no-op — confirm it, don't assume it.)

- [ ] **End-to-end, both formats, with the worker running**

Generate one PDF and one DOCX with `aiEnhanced: true` against an org that has an LLM key. Confirm for each: `report_run_analyses` has one row per enabled block; `report_runs.ai_status` reflects per-section `ok`/`abstained`; the analysis renders in the file.

- [ ] **No-regression check against a pre-Phase-2 report**

The highest-risk failure in this phase is silent removal, not breakage. Generate a report on `develop` (pre-Phase-2) and the same report on this branch, with the same project and `aiEnhanced: true`, and diff the rendered output section by section. Every AI block present in the first must be present in the second — in particular the **per-section AI boxes** and the **risk-highlights box**. Anything that disappeared is a regression, not a simplification.

- [ ] **Independent gating check**

Configure a template with `recommendedActions: true` but `executiveSummary: false` and generate both formats. Confirm the recommended-actions section renders. It sits outside the executive-summary guard precisely so that this works; nesting it was a real defect caught in review.

- [ ] **End-to-end with no LLM key**

Against an org with zero LLM keys, generate a report with `aiEnhanced: true`. Confirm the report still generates, every enabled block records `abstained` with reason `"no LLM key is configured for this organization"`, and no AI section renders as an empty heading.

- [ ] **Partial-failure behaviour**

Temporarily point an org's LLM key at an unreachable base URL and generate with two blocks enabled. Confirm both abstain, `report_runs.status` is still `success`, and the file downloads.

---

## Notes carried forward to later phases (do not implement here)

- **Phase 3** builds the `ReportAnalysisPanel` UI over `report_run_analyses`, the section-catalog endpoint, and template CRUD + RBAC. It also wires the wizard to select individual AI blocks — at which point manual runs stop defaulting to the five behaviour-preserving blocks (Locked decision 3).
- **Phase 4** covers real MJML delivery, the scheduled-report invisibility bug, `listRunsQuery` pagination, and retiring the legacy `scheduled_report` automation trigger (`automationWorker.ts:250-492`). Note that trigger is a **third** caller of `generateReport()` and will therefore start running analyzers once Phase 2 lands — it inherits the behaviour for free, which is harmless but should be verified before that path is retired.
- The dead weighted formula in `Servers/advisor/scoring/readinessCalculator.ts` (`calculateReadinessScore`, zero callers repo-wide) and the three recommendation generators that branch on permanently-zero readiness columns (`readiness.ctrl.ts:396-399`, `readinessFunctions.ts:227-238`, `getWeakestDimension()` at `readinessFunctions.ts:267-285`) remain out of scope. Phase 2 only ensures the `complianceGap` analyzer does not launder those zeros into narrative prose.
- `report_runs.ai_tokens_used` and `ai_cost` exist but stay unpopulated — `generateObjectWithSelfCorrection` does not currently surface token usage. Wiring cost tracking is its own piece of work.
- `updateRunStatusQuery` (`reportRun.utils.ts:19-31`) has **no `organization_id` in its WHERE clause**. Phase 2 writes `ai_status` through it, so it is worth restating: the run id currently comes only from trusted worker context, so this is defence-in-depth rather than a live hole, but it should be tightened when that file is next touched. Carried over from Phase 1.
- `updateRunStatusQuery` also hardcodes `completed_at = NOW()` on every call, so any future intermediate-progress update through it would falsely mark the run complete. Phase 2 only calls it at terminal state, so this is latent, not active.
- **Provenance is prompt-enforced, not code-enforced, for every field except `suggestedOwner`.** zod validates shape, not origin: a fabricated `complianceGap.gaps[].control`, `vendorRisk.concerns[].vendor` or `riskAnalysis.top_risks[].name` passes `.strict()` cleanly even though the prompt says to copy it verbatim from the input. `suggestedOwner` *is* guarded — `sanitizeOwners` (Task 6) nulls any owner not present in the report's own data. The shipped `evidenceAnalyzer` has the identical prompt-only gap on `evidence_quote`, so this matches repo precedent rather than regressing it, but the consequence is worse here: an invented control id or vendor name lands in a formal audit artifact. A cheap generic fix exists — post-parse, substring-search the raw analyzer input for each field marked "verbatim" and null or reject on miss. Belongs next to `sanitizeOwners` in `runAnalyzers.ts`, not in the schemas. Deferred deliberately, not overlooked.
