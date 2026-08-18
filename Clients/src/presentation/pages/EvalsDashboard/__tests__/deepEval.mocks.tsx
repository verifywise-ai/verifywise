/**
 * Shared mocks for the EvalsDashboard test suite.
 *
 * Registers the module mocks used by EvalsDashboard components — the deepEval
 * repository, entity repository, evalModelsService, useModelPreferences hook
 * and the SVG `ReactComponent` imports — and exposes mutable vi.fn() handles
 * plus default resolvers and browser stubs.
 *
 * IMPORTANT:
 * - Import this module FIRST in a test file, before importing the component
 *   under test, so the mocks are registered before the component module graph
 *   loads.
 * - Call `resetDeepEvalMocks()` in `beforeEach`.
 * - Call `installBrowserStubs()` once per suite.
 *
 * Override the default resolvers per test by calling e.g.
 * `deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts })`.
 */
import { vi } from "vitest";

// NOTE: Vitest 4 forbids `export const x = vi.hoisted(...)` ("Cannot export
// hoisted variable"), so the hoisted handles are declared as a plain `const`
// and exported via a separate `export {}` statement. The declaration is hoisted
// above the vi.mock calls; the export statement references it from the body.
const deepEvalMocks = vi.hoisted(() => ({
  createExperiment: vi.fn(),
  listDatasets: vi.fn(),
  readDataset: vi.fn(),
  listMyDatasets: vi.fn(),
  uploadDataset: vi.fn(),
  deleteDatasets: vi.fn(),
  listScorers: vi.fn(),
  getAllLlmApiKeys: vi.fn(),
  addLlmApiKey: vi.fn(),
  validateModel: vi.fn(),
  getAllEntities: vi.fn(),
  listModels: vi.fn(),
  getGatewayModelsForProvider: vi.fn(),
  createModel: vi.fn(),
  savePreferences: vi.fn(),
  getExperiment: vi.fn(),
  getLogs: vi.fn(),
  updateExperiment: vi.fn(),
  listBiasAuditPresets: vi.fn(),
  getBiasAuditPreset: vi.fn(),
  runBiasAudit: vi.fn(),
  getAllExperiments: vi.fn(),
  deleteExperiment: vi.fn(),
  createArenaComparison: vi.fn(),
  listArenaComparisons: vi.fn(),
  deleteArenaComparison: vi.fn(),
  getArenaComparisonResults: vi.fn(),
}));

export { deepEvalMocks };

// The `isSingleTurnPrompt` / `isMultiTurnConversation` type guards are kept
// real (they mirror the implementations in deepEvalDatasetsService) so
// components that branch on them keep correct behavior.
vi.mock("../../../../application/repository/deepEval.repository", () => ({
  createExperiment: deepEvalMocks.createExperiment,
  listDatasets: deepEvalMocks.listDatasets,
  readDataset: deepEvalMocks.readDataset,
  listMyDatasets: deepEvalMocks.listMyDatasets,
  uploadDataset: deepEvalMocks.uploadDataset,
  deleteDatasets: deepEvalMocks.deleteDatasets,
  listScorers: deepEvalMocks.listScorers,
  getAllLlmApiKeys: deepEvalMocks.getAllLlmApiKeys,
  addLlmApiKey: deepEvalMocks.addLlmApiKey,
  validateModel: deepEvalMocks.validateModel,
  getExperiment: deepEvalMocks.getExperiment,
  getLogs: deepEvalMocks.getLogs,
  updateExperiment: deepEvalMocks.updateExperiment,
  listBiasAuditPresets: deepEvalMocks.listBiasAuditPresets,
  getBiasAuditPreset: deepEvalMocks.getBiasAuditPreset,
  runBiasAudit: deepEvalMocks.runBiasAudit,
  getAllExperiments: deepEvalMocks.getAllExperiments,
  deleteExperiment: deepEvalMocks.deleteExperiment,
  createArenaComparison: deepEvalMocks.createArenaComparison,
  listArenaComparisons: deepEvalMocks.listArenaComparisons,
  deleteArenaComparison: deepEvalMocks.deleteArenaComparison,
  getArenaComparisonResults: deepEvalMocks.getArenaComparisonResults,
  isSingleTurnPrompt: (record: unknown) =>
    typeof record === "object" &&
    record !== null &&
    "prompt" in record &&
    typeof (record as { prompt?: unknown }).prompt === "string",
  isMultiTurnConversation: (record: unknown) =>
    typeof record === "object" &&
    record !== null &&
    "turns" in record &&
    Array.isArray((record as { turns?: unknown }).turns),
}));

vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: deepEvalMocks.getAllEntities,
}));

vi.mock("../../../../infrastructure/api/evalModelsService", () => ({
  evalModelsService: {
    listModels: deepEvalMocks.listModels,
    getGatewayModelsForProvider: deepEvalMocks.getGatewayModelsForProvider,
    createModel: deepEvalMocks.createModel,
  },
}));

vi.mock("../../../../application/hooks/useModelPreferences", () => ({
  useModelPreferences: () => ({
    preferences: null,
    loading: false,
    savePreferences: deepEvalMocks.savePreferences,
  }),
}));

// SVG `ReactComponent` imports used by NewExperimentModal / EvalsDashboard.
vi.mock("../../../assets/icons/openai_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="openai-logo" />,
}));
vi.mock("../../../assets/icons/anthropic_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="anthropic-logo" />,
}));
vi.mock("../../../assets/icons/ollama_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="ollama-logo" />,
}));
vi.mock("../../../assets/icons/gemini_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="gemini-logo" />,
}));
vi.mock("../../../assets/icons/mistral_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="mistral-logo" />,
}));
vi.mock("../../../assets/icons/xai_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="xai-logo" />,
}));
vi.mock("../../../assets/icons/openrouter_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="openrouter-logo" />,
}));
vi.mock("../../../assets/icons/folder_filled.svg", () => ({
  ReactComponent: () => <svg data-testid="folder-icon" />,
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Single-turn dataset prompts shaped like the modal's `DatasetPrompt`. */
export const samplePrompts = [
  {
    id: "p1",
    category: "general",
    prompt: "Hello there",
    expected_output: "Hello!",
    expected_keywords: ["hello"],
    difficulty: "easy",
  },
  {
    id: "p2",
    category: "coding",
    prompt: "Write a sum function",
    expected_output: "function sum(a, b) { return a + b; }",
    expected_keywords: ["sum"],
    difficulty: "medium",
  },
];

/** Make `listDatasets` resolve a preset list for a given task type. */
export function mockListDatasetsWith(taskType: string, paths: string[]): void {
  deepEvalMocks.listDatasets.mockResolvedValue({
    [taskType]: paths.map((path) => ({ path })),
  });
}

/**
 * Default experiment resolved by `getExperiment` after `resetDeepEvalMocks`.
 * Tests can override with their own `getExperiment.mockResolvedValue(...)`.
 * `created_at` is date-only so `displayFormattedDate` renders the same value
 * in every timezone.
 */
export const mockExperiment = {
  id: "exp-1",
  project_id: "proj-1",
  name: "Test Experiment",
  description: "A test run",
  config: {
    model: { name: "gpt-4o", accessMethod: "openai" },
    judgeLlm: { model: "gpt-4o" },
  },
  status: "completed",
  created_at: "2025-06-01",
  updated_at: "2025-06-01",
  tenant: "t1",
};

/**
 * Preset summaries returned by `listBiasAuditPresets` after
 * `resetDeepEvalMocks`. `custom` is included so the modal can move it to the
 * front of the list (mirrors the component's sort).
 */
export const mockPresetSummaries: Array<{
  id: string;
  name: string;
  jurisdiction: string;
  effective_date: string;
  mode: string;
  description: string;
}> = [
  {
    id: "custom",
    name: "Custom audit",
    jurisdiction: "Custom",
    effective_date: "2025-01-01",
    mode: "custom",
    description: "Build your own bias audit from scratch",
  },
  {
    id: "nyc_ll144",
    name: "NYC Local Law 144",
    jurisdiction: "New York City",
    effective_date: "2025-01-01",
    mode: "quantitative_audit",
    description: "Automated employment decision tool audit",
  },
  {
    id: "eeoc_guidelines",
    name: "EEOC Guidelines",
    jurisdiction: "United States",
    effective_date: "2025-01-01",
    mode: "framework_assessment",
    description: "EEOC employment discrimination guidance",
  },
];

/**
 * Full preset resolved by `getBiasAuditPreset` for `nyc_ll144` after
 * `resetDeepEvalMocks`. Has one required category (`gender`), one optional
 * category (`age`), an intersectional config and a non-null threshold so step
 * 3 gating and the step 4 settings render. `intersectional.required` is false
 * so the step 4 checkbox starts unchecked and tests can enable it.
 */
export const mockFullPreset = {
  id: "nyc_ll144",
  name: "NYC Local Law 144",
  jurisdiction: "New York City",
  effective_date: "2025-01-01",
  mode: "quantitative_audit",
  description: "Automated employment decision tool audit",
  categories: {
    gender: { label: "Gender", groups: ["female", "male"] },
    age: { label: "Age", groups: [] },
  },
  intersectional: { required: false, cross: ["gender"] },
  metrics: ["selection_rate", "scoring_rate", "fairness_metrics"],
  threshold: 0.8,
  small_sample_exclusion: 2,
  required_metadata: ["systemName"],
};

/** A valid applicant CSV the modal parses in step 3. */
export const mockCsvContent = [
  "gender,race,outcome",
  "female,white,1",
  "male,asian,0",
  "female,asian,1",
  "male,white,0",
].join("\n");

/** Build a File whose content the jsdom FileReader can read as text. */
export function makeCsvFile(content = mockCsvContent, name = "applicants.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

/** Arena comparisons resolved by `listArenaComparisons` after reset. */
export const mockArenaComparisons: Array<{
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  contestants: string[];
  winner?: string;
  dataset?: string;
  createdAt: string;
}> = [
  {
    id: "battle-1",
    name: "GPT-4 vs Claude",
    status: "completed",
    contestants: ["gpt-4o", "claude-sonnet-4"],
    winner: "gpt-4o",
    dataset: "chatbot.json",
    createdAt: "2025-06-01T10:00:00Z",
  },
  {
    id: "battle-2",
    name: "Running battle",
    status: "running",
    contestants: ["gemini-pro", "llama-3"],
    createdAt: "2025-06-01T11:00:00Z",
  },
];

/** Results resolved by `getArenaComparisonResults` after reset. */
export const mockArenaResults = {
  id: "battle-1",
  name: "GPT-4 vs Claude",
  status: "completed",
  winCounts: { "gpt-4o": 8, "claude-sonnet-4": 2 },
  detailedResults: [],
};

// ── Lifecycle helpers ───────────────────────────────────────────────────────

/** Stub browser APIs that jsdom does not provide / that components open. */
export function installBrowserStubs(): void {
  Object.defineProperty(window, "open", {
    writable: true,
    configurable: true,
    value: vi.fn(),
  });
  if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
  if (typeof URL !== "undefined") {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:mock"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  }
}

/** Reset every mock handle to a safe default (call in `beforeEach`). */
export function resetDeepEvalMocks(): void {
  deepEvalMocks.createExperiment.mockReset().mockResolvedValue({ experiment: { id: "exp-123" } });
  deepEvalMocks.listDatasets.mockReset().mockResolvedValue({});
  deepEvalMocks.readDataset.mockReset().mockResolvedValue({ prompts: [] });
  deepEvalMocks.listMyDatasets.mockReset().mockResolvedValue({ datasets: [] });
  deepEvalMocks.uploadDataset.mockReset().mockResolvedValue({ path: "uploads/uploaded.json" });
  deepEvalMocks.deleteDatasets.mockReset().mockResolvedValue({ success: true });
  deepEvalMocks.listScorers.mockReset().mockResolvedValue({ scorers: [] });
  deepEvalMocks.getAllLlmApiKeys.mockReset().mockResolvedValue([]);
  deepEvalMocks.addLlmApiKey
    .mockReset()
    .mockResolvedValue({ id: 1, provider: "openai", apiKey: "sk-test" });
  deepEvalMocks.validateModel.mockReset().mockResolvedValue({ valid: true });
  deepEvalMocks.getAllEntities.mockReset().mockResolvedValue({ data: [] });
  deepEvalMocks.listModels.mockReset().mockResolvedValue([]);
  deepEvalMocks.getGatewayModelsForProvider.mockReset().mockResolvedValue([]);
  deepEvalMocks.createModel
    .mockReset()
    .mockResolvedValue({ id: 1, name: "test-model", provider: "openai" });
  deepEvalMocks.savePreferences.mockReset().mockResolvedValue(true);
  deepEvalMocks.getExperiment.mockReset().mockResolvedValue({ experiment: mockExperiment });
  deepEvalMocks.getLogs.mockReset().mockResolvedValue({ logs: [] });
  deepEvalMocks.updateExperiment.mockReset().mockResolvedValue({ experiment: mockExperiment });
  deepEvalMocks.listBiasAuditPresets.mockReset().mockResolvedValue(mockPresetSummaries);
  deepEvalMocks.getBiasAuditPreset.mockReset().mockResolvedValue(mockFullPreset);
  deepEvalMocks.runBiasAudit
    .mockReset()
    .mockResolvedValue({ auditId: "audit-1", status: "running" });
  deepEvalMocks.getAllExperiments.mockReset().mockResolvedValue({ experiments: [] });
  deepEvalMocks.deleteExperiment.mockReset().mockResolvedValue({ success: true });
  deepEvalMocks.createArenaComparison
    .mockReset()
    .mockResolvedValue({ id: "new-1", status: "running", message: "ok", contestants: [] });
  deepEvalMocks.listArenaComparisons.mockReset().mockResolvedValue({ comparisons: [] });
  deepEvalMocks.deleteArenaComparison.mockReset().mockResolvedValue({ success: true });
  deepEvalMocks.getArenaComparisonResults.mockReset().mockResolvedValue(mockArenaResults);
}
