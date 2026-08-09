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
export function mockListDatasetsWith(
  taskType: string,
  paths: string[],
): void {
  deepEvalMocks.listDatasets.mockResolvedValue({
    [taskType]: paths.map((path) => ({ path })),
  });
}

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
  deepEvalMocks.createExperiment
    .mockReset()
    .mockResolvedValue({ experiment: { id: "exp-123" } });
  deepEvalMocks.listDatasets.mockReset().mockResolvedValue({});
  deepEvalMocks.readDataset.mockReset().mockResolvedValue({ prompts: [] });
  deepEvalMocks.listMyDatasets.mockReset().mockResolvedValue({ datasets: [] });
  deepEvalMocks.uploadDataset
    .mockReset()
    .mockResolvedValue({ path: "uploads/uploaded.json" });
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
}
