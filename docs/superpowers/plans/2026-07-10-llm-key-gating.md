# LLM Key Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock AI Advisor sending and Evidence Analyzer triggering when an organization has no LLM key configured, while keeping all reading of previously-generated data (past conversations, past evidence analyses) unaffected.

**Architecture:** Reuse the existing `useLLMKeyStatus` hook (frontend) and the existing `getLLMKeysWithKeyQuery`/`STATUS_CODE[400]` pattern (backend, already used by `advisor.ctrl.ts`) — no new Context/Provider, no new backend utility. Four independent, separately-committable changes: (1) backend guard on Evidence Analyzer, (2) frontend gate on Evidence Analyzer's trigger buttons, (3) frontend gate on the Evidence Analyzer's empty-state button, (4) frontend fix so AI Advisor's existing gate only blocks composing, not reading history.

**Tech Stack:** TypeScript, Express, Jest (backend), React, Vitest + Testing Library (frontend), MUI, `@assistant-ui/react`.

---

## Task 1: Backend — reject `analyzeFile` with 400 when no LLM key

**Files:**
- Modify: `Servers/controllers/evidenceAi.ctrl.ts:120-223` (the `analyzeFile` function)
- Test: `Servers/controllers/__tests__/evidenceAi.ctrl.test.ts` (new file)

Currently, `analyzeFile` fetches file metadata and content, parses the document,
*then* checks for an LLM key — and if none exists, silently falls through to
`buildHeuristicResult()` and returns `200`. We're moving the key check to the
top (before any DB/file work) and making it a hard `400` instead of a silent
fallback. The `catch` block around the actual `analyzeEvidence()` LLM call
(a *different* failure mode — key exists but the call itself errors) keeps
its existing heuristic-fallback behavior untouched.

- [ ] **Step 1: Write the failing test**

Create `Servers/controllers/__tests__/evidenceAi.ctrl.test.ts`:

```ts
import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";

jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
  },
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));

jest.mock("../../utils/evidenceAi.utils", () => ({
  upsertAnalysisQuery: jest.fn(),
  getAnalysisByFileIdQuery: jest.fn(),
  getQualityScoresQuery: jest.fn(),
  getEvidenceGapsQuery: jest.fn(),
  getSuggestionsQuery: jest.fn(),
  applySuggestionsQuery: jest.fn(),
}));

jest.mock("../../advisor/parsers", () => ({
  parseDocument: jest.fn(),
  isSupportedMimeType: jest.fn().mockReturnValue(true),
}));

jest.mock("../../middleware/aiContentTracker.middleware", () => ({
  trackAIContent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../advisor/evidenceAnalyzer/analyzer.service", () => ({
  analyzeEvidence: jest.fn(),
}));

jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
  getLLMProviderUrl: jest.fn(),
}));

import { analyzeFile } from "../evidenceAi.ctrl";
import { sequelize } from "../../database/db";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
import { upsertAnalysisQuery } from "../../utils/evidenceAi.utils";

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    organizationId: 1,
    params: { fileId: "42" },
    body: {},
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("analyzeFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 and never queries file content when no LLM key is configured", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([]);

    const req = createReq();
    const res = createRes();

    await analyzeFile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      STATUS_CODE[400]("No LLM keys configured for this organization."),
    );
    expect(sequelize.query).not.toHaveBeenCalled();
    expect(upsertAnalysisQuery).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Servers && npx jest controllers/__tests__/evidenceAi.ctrl.test.ts`
Expected: FAIL — `res.status` was called with `200` (or whatever the current
heuristic-fallback path returns), not `400`; `sequelize.query` WAS called
(current code queries file metadata before checking the key).

- [ ] **Step 3: Implement the guard**

Read the current full function first (`Servers/controllers/evidenceAi.ctrl.ts:120-223`)
to confirm line numbers haven't drifted, then apply this change. Replace:

```ts
  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : null;

    // ---- File metadata + content ---------------------------------
    const [fileRows] = await sequelize.query(
```

with:

```ts
  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : null;

    // ---- LLM key required ------------------------------------------
    const clients = await getLLMKeysWithKeyQuery(organizationId);
    if (clients.length === 0) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("No LLM keys configured for this organization."));
    }

    // ---- File metadata + content ---------------------------------
    const [fileRows] = await sequelize.query(
```

Then replace the now-redundant later block (originally lines ~189-223):

```ts
    // ---- Pick LLM key for the org --------------------------------
    let analyzerResult: AnalyzerResult | null = null;
    let usedFallback = false;
    let fallbackReason = "";

    try {
      const clients = await getLLMKeysWithKeyQuery(organizationId);
      if (clients.length === 0) {
        usedFallback = true;
        fallbackReason = "no LLM key configured";
      } else {
        const apiKey = clients[0];
        const baseURL = apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider);
        analyzerResult = await analyzeEvidence({
          documentText,
          filename: file.filename,
          fileType: file.type,
          fileSizeBytes: contentRow?.size_bytes ?? null,
          uploadDate: contentRow?.upload_date ?? null,
          expiryDate,
          parseFidelity: inferParseFidelity(file.type),
          llmKey: {
            apiKey: apiKey.key || "",
            baseURL,
            model: apiKey.model,
            provider: apiKey.name as "Anthropic" | "OpenAI" | "OpenRouter" | "Custom",
            headers: apiKey.custom_headers || undefined,
          },
        });
      }
    } catch (llmErr) {
      logger.warn("[evidenceAnalyzer] LLM analysis failed, falling back to heuristic-v1", llmErr);
      usedFallback = true;
      fallbackReason = (llmErr as Error).message || "LLM error";
    }
```

with (the `else` branch removed — `clients` is guaranteed non-empty here
since we returned already; only the genuine-LLM-failure fallback remains):

```ts
    // ---- Run the analyzer ------------------------------------------
    let analyzerResult: AnalyzerResult | null = null;
    let usedFallback = false;
    let fallbackReason = "";

    try {
      const apiKey = clients[0];
      const baseURL = apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider);
      analyzerResult = await analyzeEvidence({
        documentText,
        filename: file.filename,
        fileType: file.type,
        fileSizeBytes: contentRow?.size_bytes ?? null,
        uploadDate: contentRow?.upload_date ?? null,
        expiryDate,
        parseFidelity: inferParseFidelity(file.type),
        llmKey: {
          apiKey: apiKey.key || "",
          baseURL,
          model: apiKey.model,
          provider: apiKey.name as "Anthropic" | "OpenAI" | "OpenRouter" | "Custom",
          headers: apiKey.custom_headers || undefined,
        },
      });
    } catch (llmErr) {
      logger.warn("[evidenceAnalyzer] LLM analysis failed, falling back to heuristic-v1", llmErr);
      usedFallback = true;
      fallbackReason = (llmErr as Error).message || "LLM error";
    }
```

Also update the function's doc comment (lines 114-119) — replace:

```ts
/**
 * POST /api/evidence-ai/analyze/:fileId
 * Trigger AI analysis for a file. Uses the v2 evidence-analyzer
 * (LLM-rubric + deterministic recency/reliability) when an LLM key is
 * configured. Falls back to heuristic-v1 if no key or the LLM call fails.
 */
```

with:

```ts
/**
 * POST /api/evidence-ai/analyze/:fileId
 * Trigger AI analysis for a file. Requires an LLM key — returns 400 if
 * none is configured for the organization. Uses the v2 evidence-analyzer
 * (LLM-rubric + deterministic recency/reliability); falls back to
 * heuristic-v1 only if the LLM call itself fails after a key was found.
 */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Servers && npx jest controllers/__tests__/evidenceAi.ctrl.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full backend test suite to check for regressions**

Run: `cd Servers && npm run test:unit`
Expected: PASS (no other test references `analyzeFile` today — confirmed no
existing test file for this controller prior to this task)

- [ ] **Step 6: Commit**

```bash
git add Servers/controllers/evidenceAi.ctrl.ts Servers/controllers/__tests__/evidenceAi.ctrl.test.ts
git commit -m "$(cat <<'EOF'
fix(evidence-ai): reject analyze requests with 400 when no LLM key exists

Previously silently fell back to a heuristic (no-grade) result and
returned 200, giving no clear signal that AI grading was unavailable.
Now checks for a key before doing any file/DB work and returns the same
400 shape advisor.ctrl.ts already uses for its own no-key checks. The
LLM-call-failure fallback (key exists, but the call itself errors) is
unchanged.
EOF
)"
```

---

## Task 2: Frontend — gate Evidence Analyzer trigger buttons in FileBasicTable

**Files:**
- Modify: `Clients/src/presentation/components/Table/FilesBasicTable/FileBasicTable.tsx`
- Test: `Clients/src/presentation/components/Table/FilesBasicTable/__tests__/FileBasicTable.test.tsx`

- [ ] **Step 1: Write the failing tests**

Read the current test file first to find where the existing `mockTrigger`
hoisted mock and other `vi.mock` calls live (near the top, per the existing
`vi.mock("../../../../../application/hooks/useEvidenceAi", ...)` block),
then add a new hoisted mock and two new tests. Add this mock block near the
existing `useEvidenceAi` mock:

```ts
const mockLLMKeyStatus = vi.hoisted(() => ({
  data: { hasKeys: true, keyCount: 1, providers: ["Anthropic"] } as any,
  loading: false,
  error: null as string | null,
}));

vi.mock("../../../../../application/hooks/useLLMKeyStatus", () => ({
  useLLMKeyStatus: () => mockLLMKeyStatus,
}));
```

Confirmed exact conventions from the current file: components render via
`renderWithProviders(<FileBasicTable {...defaultProps} />)` (line 324,
`defaultProps` defined at line 295); resets between tests happen in the
existing `beforeEach` at line 309-317, not in a new `afterEach`; the bulk
analyze test at line 786-790 uses `screen.getByTestId("bulk-action-analyze_ai")`;
the per-row tests at line 761-771 use
`screen.getAllByRole("button", { name: /analyze with ai/i })`.

Add `mockLLMKeyStatus.data = { hasKeys: true, keyCount: 1, providers: ["Anthropic"] };`
as a new line inside the existing `beforeEach` block (line 309-317, alongside
the existing `mockQuality.data = []` and `mockTrigger.isPending = false`
resets), so every test starts with keys present unless it overrides.

Add these two tests near the existing analyze-related tests (around line
761-790):

```tsx
it("disables the per-row analyze button when no LLM key is configured", () => {
  mockLLMKeyStatus.data = { hasKeys: false, keyCount: 0, providers: [] };
  renderWithProviders(<FileBasicTable {...defaultProps} />);
  const analyzeButtons = screen.getAllByRole("button", { name: /analyze with ai/i });
  analyzeButtons.forEach((btn) => expect(btn).toBeDisabled());
});

it("disables the bulk analyze action when no LLM key is configured", () => {
  mockLLMKeyStatus.data = { hasKeys: false, keyCount: 0, providers: [] };
  renderWithProviders(<FileBasicTable {...defaultProps} />);
  const bulkAction = screen.getByTestId("bulk-action-analyze_ai");
  expect(bulkAction).toBeDisabled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Clients && npx vitest run src/presentation/components/Table/FilesBasicTable`
Expected: FAIL on the two new tests — `useLLMKeyStatus` doesn't exist as an
import in `FileBasicTable.tsx` yet, so the mock has nothing to intercept and
the buttons are enabled regardless of `hasKeys`.

- [ ] **Step 3: Wire the hook into FileBasicTable.tsx**

Add the import next to the existing `useEvidenceAi` import
(`Clients/src/presentation/components/Table/FilesBasicTable/FileBasicTable.tsx:54`):

```tsx
import { useTriggerAnalysis, useQualityScores } from "../../../../application/hooks/useEvidenceAi";
import { useLLMKeyStatus } from "../../../../application/hooks/useLLMKeyStatus";
```

Next to the `triggerAnalysis`/`qualityScores` declarations
(`FileBasicTable.tsx:397-400`), add:

```tsx
  // Evidence AI analysis (relocated here from the Model Inventory evidence hub).
  // Keyed by files.id, which is exactly what FileManager rows carry.
  const triggerAnalysis = useTriggerAnalysis();
  const { data: qualityScores } = useQualityScores();
  const { data: llmKeyStatus } = useLLMKeyStatus();
  const hasLLMKey = llmKeyStatus?.hasKeys ?? false;
```

Find the `bulkActions` `useMemo` (the array containing `move_to_folder`,
`edit_tags`, `analyze_ai` — currently around line 520-552) and change the
`analyze_ai` entry's `disabled` and the deps array:

```tsx
      {
        id: "analyze_ai",
        label: "Analyze with AI",
        icon: <Sparkles size={16} />,
        disabled: triggerAnalysis.isPending || !hasLLMKey,
        onClick: async () => {
          await Promise.all(selectedIds.map((id) => triggerAnalysis.mutateAsync(id)));
        },
      },
    ],
    [
      handleOpenFolderDialog,
      handleOpenTagsDialog,
      bulkMutation.isPending,
      triggerAnalysis,
      selectedIds,
      hasLLMKey,
    ],
  );
```

Find the per-row Tooltip + `MUIIconButton` block (currently around line
896-914, inside the table-cell render for the quality-badge column) and
change it from:

```tsx
                              <Tooltip
                                title={entry?.grade ? "Re-analyze with AI" : "Analyze with AI"}
                                arrow
                              >
                                <span>
                                  <MUIIconButton
                                    aria-label={
                                      entry?.grade ? "Re-analyze with AI" : "Analyze with AI"
                                    }
                                    size="small"
                                    disabled={triggerAnalysis.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (fid) triggerAnalysis.mutate(fid);
                                    }}
                                  >
                                    <Sparkles size={14} />
                                  </MUIIconButton>
                                </span>
                              </Tooltip>
```

to:

```tsx
                              <Tooltip
                                title={
                                  !hasLLMKey
                                    ? "Configure an LLM key to enable AI analysis"
                                    : entry?.grade
                                      ? "Re-analyze with AI"
                                      : "Analyze with AI"
                                }
                                arrow
                              >
                                <span>
                                  <MUIIconButton
                                    aria-label={
                                      entry?.grade ? "Re-analyze with AI" : "Analyze with AI"
                                    }
                                    size="small"
                                    disabled={triggerAnalysis.isPending || !hasLLMKey}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (fid) triggerAnalysis.mutate(fid);
                                    }}
                                  >
                                    <Sparkles size={14} />
                                  </MUIIconButton>
                                </span>
                              </Tooltip>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Clients && npx vitest run src/presentation/components/Table/FilesBasicTable`
Expected: PASS, including the two new tests and all pre-existing ones
(pre-existing tests don't set `mockLLMKeyStatus.data.hasKeys = false`, so
they get the default `hasKeys: true` and buttons stay enabled as before).

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/components/Table/FilesBasicTable/FileBasicTable.tsx Clients/src/presentation/components/Table/FilesBasicTable/__tests__/FileBasicTable.test.tsx
git commit -m "$(cat <<'EOF'
feat(evidence): disable AI analyze buttons when no LLM key is configured

Per-row and bulk "Analyze with AI" actions now check useLLMKeyStatus and
disable themselves (with an explanatory tooltip on the per-row button)
when the org has no LLM key, instead of letting the click through to a
backend that now rejects it with 400 (see evidenceAi.ctrl.ts change).
Viewing already-analyzed rows is unaffected — that's a pure read of
already-fetched analysisByFileId data, no gate needed.
EOF
)"
```

---

## Task 3: Frontend — gate EvidenceAnalysisPanel's empty-state button

**Files:**
- Modify: `Clients/src/presentation/components/EvidenceAnalysisPanel/index.tsx`
- Test: `Clients/src/presentation/components/EvidenceAnalysisPanel/__tests__/EvidenceAnalysisPanel.test.tsx`

Note: `FileBasicTable.tsx` currently renders `<EvidenceAnalysisPanel
analysis={selectedAnalysis} />` without `onTriggerAnalysis` at all (confirmed
by grep — it's the only consumer of this component, and the modal only opens
once `selectedAnalysis` is non-null, so the empty-state branch containing
this button is currently unreachable through the real UI). This task still
adds the gate at the component level, matching the approved spec and keeping
the component correct/tested for its documented prop contract — it just has
no visible effect in the current app until/unless a future caller wires
`onTriggerAnalysis` through. Default the new prop so it doesn't lock by
omission (`hasLLMKey === false`, not `!hasLLMKey`) — otherwise the existing
"calls onTriggerAnalysis when button is clicked" test (which doesn't pass
this prop) would start failing.

- [ ] **Step 1: Write the failing test**

Add to `EvidenceAnalysisPanel/__tests__/EvidenceAnalysisPanel.test.tsx`, near
the existing "calls onTriggerAnalysis when button is clicked" test:

```tsx
it("disables the empty-state button and shows a tooltip when hasLLMKey is false", () => {
  const onTriggerAnalysis = vi.fn();
  renderWithProviders(
    <EvidenceAnalysisPanel
      analysis={null}
      onTriggerAnalysis={onTriggerAnalysis}
      hasLLMKey={false}
    />,
  );
  const button = screen.getByText("Run AI analysis").closest("button");
  expect(button).toBeDisabled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Clients && npx vitest run src/presentation/components/EvidenceAnalysisPanel`
Expected: FAIL — TypeScript error (`hasLLMKey` doesn't exist on
`EvidenceAnalysisPanelProps`) or, if TS isn't checked by vitest directly,
a runtime assertion failure since the button isn't disabled yet.

- [ ] **Step 3: Add the prop**

In `EvidenceAnalysisPanel/index.tsx`, add `hasLLMKey` to the props interface
(currently lines 99-105):

```tsx
interface EvidenceAnalysisPanelProps {
  analysis: AnalysisData | null;
  isLoading?: boolean;
  onTriggerAnalysis?: () => void;
  onApplySuggestions?: (suggestions: Array<{ control_id: number; framework_type: string }>) => void;
  isAnalyzing?: boolean;
  hasLLMKey?: boolean;
}
```

Destructure it in the component signature (currently lines 210-216):

```tsx
export default function EvidenceAnalysisPanel({
  analysis,
  isLoading,
  onTriggerAnalysis,
  onApplySuggestions,
  isAnalyzing,
  hasLLMKey,
}: EvidenceAnalysisPanelProps) {
```

Change the empty-state block (currently lines 236-252) from:

```tsx
  if (!analysis) {
    return (
      <EmptyState icon={Sparkles} message="No AI analysis available for this evidence yet." showBorder>
        {onTriggerAnalysis && (
          <CustomizableButton
            variant="outlined"
            color="primary"
            text={isAnalyzing ? "Analyzing..." : "Run AI analysis"}
            icon={<Sparkles size={16} />}
            loading={isAnalyzing}
            isDisabled={isAnalyzing}
            onClick={onTriggerAnalysis}
          />
        )}
      </EmptyState>
    );
  }
```

to:

```tsx
  if (!analysis) {
    const locked = hasLLMKey === false;
    return (
      <EmptyState icon={Sparkles} message="No AI analysis available for this evidence yet." showBorder>
        {onTriggerAnalysis && (
          <Tooltip title={locked ? "Configure an LLM key to enable AI analysis" : ""} arrow>
            <span>
              <CustomizableButton
                variant="outlined"
                color="primary"
                text={isAnalyzing ? "Analyzing..." : "Run AI analysis"}
                icon={<Sparkles size={16} />}
                loading={isAnalyzing}
                isDisabled={isAnalyzing || locked}
                onClick={onTriggerAnalysis}
              />
            </span>
          </Tooltip>
        )}
      </EmptyState>
    );
  }
```

`Tooltip` is already imported in this file (used elsewhere for the rationale
chevron), so no new import is needed. The `<span>` wrapper is required
because MUI `Tooltip` can't attach directly to a `disabled` button (it
wouldn't receive pointer events) — same pattern already used for the
per-row analyze button in `FileBasicTable.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Clients && npx vitest run src/presentation/components/EvidenceAnalysisPanel`
Expected: PASS, including the pre-existing "calls onTriggerAnalysis when
button is clicked" test (it doesn't pass `hasLLMKey`, so `locked` is `false`
and the button stays enabled).

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/components/EvidenceAnalysisPanel/index.tsx Clients/src/presentation/components/EvidenceAnalysisPanel/__tests__/EvidenceAnalysisPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(evidence): add hasLLMKey gate to EvidenceAnalysisPanel empty state

Optional prop, defaults to not-locked (only `=== false` disables) so
existing callers/tests that don't pass it are unaffected. No current
consumer wires onTriggerAnalysis through FileBasicTable yet, so this has
no visible effect today — it keeps the component's documented contract
consistent with the same gating now applied everywhere else AI analysis
can be triggered.
EOF
)"
```

---

## Task 4: Frontend — AI Advisor: lock only the composer, not history

**Files:**
- Modify: `Clients/src/presentation/components/AdvisorChat/index.tsx`
- Modify: `Clients/src/presentation/components/AdvisorChat/CustomThread.tsx`
- Test: `Clients/src/presentation/components/AdvisorChat/__tests__/AdvisorChat.test.tsx`
- Test: `Clients/src/presentation/components/AdvisorChat/__tests__/CustomThread.test.tsx` (new file)

### Step 1: Write the failing AdvisorChat test

Add to `AdvisorChat/__tests__/AdvisorChat.test.tsx`, after the existing three
tests:

```tsx
it("still renders the header and thread when no LLM key is configured", () => {
  renderWithProviders(<AdvisorChat hasLLMKeys={false} isLoadingLLMKeys={false} />);
  expect(screen.queryByTestId("advisor-header")).toBeInTheDocument();
  expect(screen.queryByTestId("custom-thread")).toBeInTheDocument();
});
```

This needs `screen` imported — add `import { screen } from "@testing-library/react";`
at the top of the test file if it isn't already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Clients && npx vitest run src/presentation/components/AdvisorChat/__tests__/AdvisorChat.test.tsx`
Expected: FAIL — `advisor-header` and `custom-thread` testids are not found,
because the current `hasLLMKeys === false` branch (`AdvisorChat/index.tsx:154`)
returns the "AI advisor not configured" `Paper` instead of ever reaching
`AdvisorHeader`/`AdvisorChatInner`.

- [ ] **Step 3: Remove the whole-panel gate in AdvisorChat/index.tsx**

Read the current file first to confirm line numbers, then delete this block
(currently lines 153-218) entirely:

```tsx
  // Show message when no LLM keys are configured (only after loading completes)
  if (!isLoadingLLMKeys && hasLLMKeys === false) {
    return (
      <Paper elevation={0} sx={paperStyles}>
        <Box sx={centeredBoxStyles}>
          <Box sx={{ textAlign: "center", maxWidth: 320, px: 3 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                bgcolor: theme.palette.background.fill ?? theme.palette.grey[100],
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <Settings size={24} color={theme.palette.text.secondary} />
            </Box>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                color: "text.primary",
                mb: 1,
              }}
            >
              AI advisor not configured
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontSize: theme.typography.body2.fontSize,
                color: "text.secondary",
                lineHeight: 1.5,
              }}
            >
              {isAdmin ? (
                <>
                  To use the AI advisor, you need to configure an LLM API key.{" "}
                  <Box
                    component="span"
                    onClick={() => navigate("/settings/apikeys")}
                    sx={{
                      "color": "primary.main",
                      "cursor": "pointer",
                      "textDecoration": "underline",
                      "&:hover": {
                        textDecoration: "none",
                      },
                    }}
                  >
                    Go to settings
                  </Box>{" "}
                  to add your API key.
                </>
              ) : (
                "The AI advisor requires an LLM API key to be configured. Please contact your administrator to set this up."
              )}
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  }
```

(This copy — icon, title, admin/non-admin body text with settings link —
gets moved into `CustomThread.tsx` in Step 5, don't lose it.)

`Settings` (icon), `useAuth`, and `useNavigate` are only used inside this
deleted block — remove all three, now-dead:

- Import at line 20: `import { Settings } from "lucide-react";` — delete
  this whole line.
- Import at line 19: `import { useAuth } from "../../../application/hooks/useAuth";`
  — delete this whole line.
- Import at line 21: `import { useNavigate } from "react-router";` — delete
  this whole line.
- Declaration at line 121: `const navigate = useNavigate();` — delete.
- Declaration at line 122: `const { userRoleName } = useAuth();` — delete.
- Declaration at line 126: `const isAdmin = userRoleName?.toLowerCase() === "admin";`
  — delete.

(Line numbers are as of this plan being written — confirm each is still
unused-after-deletion by searching the file for the identifier before
removing it, in case something shifted.)

- [ ] **Step 4: Thread `hasLLMKeys` down through AdvisorChatInner into CustomThread**

`AdvisorChatInner`'s prop type and destructuring (currently lines 53-59):

```tsx
const AdvisorChatInner = ({
  selectedLLMKeyId,
  pageContext,
}: {
  selectedLLMKeyId?: number;
  pageContext?: AdvisorDomain;
}) => {
```

becomes:

```tsx
const AdvisorChatInner = ({
  selectedLLMKeyId,
  pageContext,
  hasLLMKeys,
}: {
  selectedLLMKeyId?: number;
  pageContext?: AdvisorDomain;
  hasLLMKeys?: boolean | null;
}) => {
```

Its `<CustomThread pageContext={pageContext} />` call (currently line 95)
becomes:

```tsx
          <CustomThread pageContext={pageContext} hasLLMKeys={hasLLMKeys} />
```

The final render inside `AdvisorChat` (currently lines 245-254):

```tsx
  return (
    <Paper elevation={0} sx={paperStyles}>
      <AdvisorHeader pageContext={pageContext} />
      <AdvisorChatInner
        key={innerKey}
        selectedLLMKeyId={selectedLLMKeyId}
        pageContext={pageContext}
      />
    </Paper>
  );
```

becomes:

```tsx
  return (
    <Paper elevation={0} sx={paperStyles}>
      <AdvisorHeader pageContext={pageContext} />
      <AdvisorChatInner
        key={innerKey}
        selectedLLMKeyId={selectedLLMKeyId}
        pageContext={pageContext}
        hasLLMKeys={hasLLMKeys}
      />
    </Paper>
  );
```

- [ ] **Step 5: Run the AdvisorChat test to verify it passes**

Run: `cd Clients && npx vitest run src/presentation/components/AdvisorChat/__tests__/AdvisorChat.test.tsx`
Expected: PASS (header and thread render now; `CustomThread` is still fully
mocked in this test file so it doesn't matter yet that `CustomThread` hasn't
been updated to use `hasLLMKeys`).

### Step 6: Write the failing CustomThread test

Create `Clients/src/presentation/components/AdvisorChat/__tests__/CustomThread.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@assistant-ui/react", () => ({
  ThreadPrimitive: {
    Root: ({ children }: any) => <div>{children}</div>,
    Viewport: ({ children }: any) => <div>{children}</div>,
    Messages: () => null,
    Suggestion: ({ children }: any) => <div>{children}</div>,
  },
}));

vi.mock("../CustomMessage", () => ({ CustomMessage: () => null }));
vi.mock("../CustomComposer", () => ({
  CustomComposer: () => <div data-testid="custom-composer" />,
}));
vi.mock("../advisorConfig", () => ({ getSuggestions: () => [] }));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin" }),
}));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import { CustomThread } from "../CustomThread";

describe("CustomThread", () => {
  it("renders the composer when hasLLMKeys is true or undefined", () => {
    renderWithProviders(<CustomThread hasLLMKeys={true} />);
    expect(screen.getByTestId("custom-composer")).toBeInTheDocument();
  });

  it("renders a locked message instead of the composer when hasLLMKeys is false", () => {
    renderWithProviders(<CustomThread hasLLMKeys={false} />);
    expect(screen.queryByTestId("custom-composer")).not.toBeInTheDocument();
    expect(
      screen.getByText(/configure an llm api key to send messages/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd Clients && npx vitest run src/presentation/components/AdvisorChat/__tests__/CustomThread.test.tsx`
Expected: FAIL — `CustomThread` doesn't accept a `hasLLMKeys` prop yet and
always renders `CustomComposer` unconditionally, so the second test's
"locked message" assertion fails and the composer is never absent.

- [ ] **Step 8: Add the locked-composer state to CustomThread.tsx**

Read the current full file first to confirm nothing has drifted, then apply
this diff. Change the imports (currently lines 1-6):

```tsx
import { useEffect, useRef, memo, useCallback } from "react";
import { Stack, Box, useTheme, Chip } from "@mui/material";
import { ThreadPrimitive } from "@assistant-ui/react";
import { CustomMessage } from "./CustomMessage";
import { CustomComposer } from "./CustomComposer";
import { AdvisorDomain, AdvisorSuggestion, getSuggestions } from "./advisorConfig";
```

to:

```tsx
import { useEffect, useRef, memo, useCallback } from "react";
import { Stack, Box, useTheme, Chip, Typography } from "@mui/material";
import { ThreadPrimitive } from "@assistant-ui/react";
import { Settings } from "lucide-react";
import { useNavigate } from "react-router";
import { CustomMessage } from "./CustomMessage";
import { CustomComposer } from "./CustomComposer";
import { AdvisorDomain, AdvisorSuggestion, getSuggestions } from "./advisorConfig";
import { useAuth } from "../../../application/hooks/useAuth";
```

Change the props interface (currently lines 8-10):

```tsx
interface CustomThreadProps {
  pageContext?: AdvisorDomain;
}
```

to:

```tsx
interface CustomThreadProps {
  pageContext?: AdvisorDomain;
  hasLLMKeys?: boolean | null;
}
```

Add a new `ComposerLocked` component right after the `SuggestionChips`
definition (currently ends around line 77, right before
`const CustomThreadComponent = ...`):

```tsx
const ComposerLocked = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { userRoleName } = useAuth();
  const isAdmin = userRoleName?.toLowerCase() === "admin";

  return (
    <Box
      sx={{
        borderTop: `1px solid ${theme.palette.border?.light ?? theme.palette.divider}`,
        backgroundColor: theme.palette.background.main ?? theme.palette.background.default,
        padding: "12px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          bgcolor: theme.palette.background.fill ?? theme.palette.grey[100],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Settings size={16} color={theme.palette.text.secondary as string} />
      </Box>
      <Typography sx={{ fontSize: theme.typography.body2.fontSize, color: "text.secondary" }}>
        {isAdmin ? (
          <>
            Configure an LLM API key to send messages.{" "}
            <Box
              component="span"
              onClick={() => navigate("/settings/apikeys")}
              sx={{
                "color": "primary.main",
                "cursor": "pointer",
                "textDecoration": "underline",
                "&:hover": { textDecoration: "none" },
              }}
            >
              Go to settings
            </Box>
            .
          </>
        ) : (
          "Sending messages requires an LLM API key. Contact your administrator."
        )}
      </Typography>
    </Box>
  );
};
```

Change `CustomThreadComponent`'s signature and its input-area render
(currently):

```tsx
const CustomThreadComponent = ({ pageContext }: CustomThreadProps) => {
```

to:

```tsx
const CustomThreadComponent = ({ pageContext, hasLLMKeys }: CustomThreadProps) => {
```

and (currently the last lines before the closing `</ThreadPrimitive.Root>`):

```tsx
      {/* Input Area */}
      <CustomComposer pageContext={pageContext} />
    </ThreadPrimitive.Root>
  );
};
```

to:

```tsx
      {/* Input Area */}
      {hasLLMKeys === false ? <ComposerLocked /> : <CustomComposer pageContext={pageContext} />}
    </ThreadPrimitive.Root>
  );
};
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd Clients && npx vitest run src/presentation/components/AdvisorChat`
Expected: PASS — all `CustomThread.test.tsx` and `AdvisorChat.test.tsx`
tests, including the two new ones from steps 1 and 6.

- [ ] **Step 10: Run the full frontend test suite to check for regressions**

Run: `cd Clients && npx vitest run src/presentation/components/AdvisorChat src/presentation/components/EvidenceAnalysisPanel src/presentation/components/Table/FilesBasicTable`
Expected: PASS, all files.

- [ ] **Step 11: Run tsc to check for type errors**

Run: `cd Clients && npx tsc -b`
Expected: 0 errors.

- [ ] **Step 12: Commit**

```bash
git add Clients/src/presentation/components/AdvisorChat/index.tsx Clients/src/presentation/components/AdvisorChat/CustomThread.tsx Clients/src/presentation/components/AdvisorChat/__tests__/AdvisorChat.test.tsx Clients/src/presentation/components/AdvisorChat/__tests__/CustomThread.test.tsx
git commit -m "$(cat <<'EOF'
fix(advisor): only lock the composer when no LLM key, not the whole panel

AdvisorChat previously replaced its ENTIRE render (header + conversation
history) with an "AI advisor not configured" empty state whenever
hasLLMKeys was false — hiding past conversations the user could otherwise
still read (the backend's listConversations/getConversationById have
never required a key; only runAdvisor/streamAdvisor do, for sending).
The lock now lives in CustomThread's composer slot only: AdvisorHeader
and conversation history render unconditionally, and the compose area
shows a "configure a key to send messages" message with a settings link
in place of the input when hasLLMKeys is false.
EOF
)"
```

---

## Plan-level verification

After all four tasks are committed:

- [ ] `cd Servers && npm run build && npm run test:unit`
- [ ] `cd Clients && npx tsc -b && npx vitest run`
- [ ] Manual/live check via browser preview (per this project's
      `verification-before-completion` practice): with no LLM key
      configured for the dev org, confirm (a) the Evidence page's per-row
      and bulk "Analyze with AI" are disabled with the tooltip, (b) a
      previously-graded row's modal still opens and shows its stored
      analysis, (c) the AI Advisor panel shows past conversation history
      with the compose box locked, not an empty panel.
