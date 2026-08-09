// NOTE: deepEval.mocks MUST be the first import — it exports vi.hoisted
// handles, so Vitest requires it to be imported before any other module (its
// vi.mock registrations also need to run before the component module graph
// loads).
import { deepEvalMocks, installBrowserStubs, resetDeepEvalMocks } from "./deepEval.mocks";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ProjectExperiments from "../ProjectExperiments";

// ── Module mocks ─────────────────────────────────────────────────────────────
// ExperimentTable is a shared table component (not a coverage target). A stub
// lets the suite drive ProjectExperiments' own row-action handlers directly
// (rerun/download/copy/delete) and assert the derived table-row data.
vi.mock("../../../components/Table/ExperimentTable", () => ({
  default: ({ rows, onRowClick, onRerun, onDownload, onCopy, onDelete }: any) => (
    <div data-testid="experiment-table">
      {rows.map((row: any) => (
        <div key={row.id} data-testid={`experiment-row-${row.id}`}>
          <span data-testid={`name-${row.id}`}>{row.name}</span>
          <span data-testid={`model-${row.id}`}>{row.model}</span>
          <span data-testid={`judge-${row.id}`}>{row.judge}</span>
          <span data-testid={`dataset-${row.id}`}>{row.dataset}</span>
          <span data-testid={`status-${row.id}`}>{row.status}</span>
          <span data-testid={`date-${row.id}`}>{row.date}</span>
          <span data-testid={`prompts-${row.id}`}>{row.prompts}</span>
          <span data-testid={`linked-${row.id}`}>{row.linkedModel ? "Linked" : "Unlinked"}</span>
          <button onClick={() => onRowClick?.(row)}>row-click-{row.id}</button>
          {onRerun && <button onClick={() => onRerun(row)}>rerun-{row.id}</button>}
          {onDownload && <button onClick={() => onDownload(row)}>download-{row.id}</button>}
          {onCopy && <button onClick={() => onCopy(row)}>copy-{row.id}</button>}
          {onDelete && <button onClick={() => onDelete(String(row.id))}>delete-{row.id}</button>}
        </div>
      ))}
    </div>
  ),
}));

// HelperIcon requires the UserGuide sidebar provider; TipBox fetches tips via
// useTipManager. Both are shared chrome, not coverage targets.
vi.mock("../../../components/HelperIcon", () => ({
  default: () => <div data-testid="helper-icon" />,
}));
vi.mock("../../../components/TipBox", () => ({
  default: () => <div data-testid="tip-box" />,
}));

// PerformanceChart is a recharts component (heavy, calls getAllExperiments
// itself). The stub renders its props so tests can observe the time range.
vi.mock("../components/PerformanceChart", () => ({
  default: ({ timeRange }: { timeRange: string }) => (
    <div data-testid="performance-chart">{timeRange}</div>
  ),
  TIME_RANGE_OPTIONS: [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "100d", label: "Last 100 days" },
    { value: "all", label: "All time" },
  ],
}));

// NewExperimentModal has its own suite; expose its onSuccess/onStarted props
// so the optimistic-row and reload-on-success paths are reachable. The stub
// respects isOpen so the close-on-success behaviour stays observable.
vi.mock("../NewExperimentModal", () => ({
  default: (props: any) =>
    props.isOpen ? (
      <div data-testid="new-experiment-modal">
        <button onClick={() => props.onSuccess?.()}>simulate-success</button>
        <button
          onClick={() =>
            props.onStarted?.({
              id: "exp-opt",
              name: "Optimistic Run",
              config: { model: { name: "gpt-4o" }, dataset: { count: 5 } },
              status: "running",
            })
          }
        >
          simulate-started
        </button>
      </div>
    ) : null,
}));

// ── Helpers & fixtures ──────────────────────────────────────────────────────

/** Build a base64 JWT whose payload carries the given role name. */
function makeToken(roleName: string): string {
  const payload = { id: "1", roleName, organizationId: "1", tenantId: "t1" };
  return `header.${btoa(JSON.stringify(payload))}.sig`;
}

const baseConfig = {
  model: { name: "claude-sonnet-4-20250514", accessMethod: "anthropic" },
  judgeLlm: { model: "gpt-4o", provider: "openai" },
  evaluationMode: "standard",
  dataset: { name: "chatbot", count: 3 },
};

function makeExperiment(overrides: Record<string, unknown> = {}) {
  return {
    id: "exp-1",
    project_id: "proj-1",
    name: "Chat bot eval",
    description: "First run",
    config: { ...baseConfig },
    status: "completed",
    results: { avg_scores: { answerRelevancy: 0.9 }, total_prompts: 3 },
    created_at: "2025-06-01T10:00:00Z",
    updated_at: "2025-06-01T10:00:00Z",
    tenant: "t1",
    model_inventory_id: 5,
    ...overrides,
  };
}

function mockExperiments(...exps: Array<Record<string, unknown>>) {
  deepEvalMocks.getAllExperiments.mockResolvedValue({ experiments: exps });
}

function renderExperiments(
  props: Partial<Parameters<typeof ProjectExperiments>[0]> = {},
  role: string = "Admin",
) {
  return renderWithProviders(
    <ProjectExperiments projectId="proj-1" orgId="org-1" useCase="chatbot" {...props} />,
    { preloadedAuth: { authToken: makeToken(role) } },
  );
}

describe("ProjectExperiments", () => {
  beforeEach(() => {
    installBrowserStubs();
    resetDeepEvalMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (Object.prototype.hasOwnProperty.call(navigator, "clipboard")) {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  describe("data loading & table rows", () => {
    it("loads experiments on mount and renders derived table rows", async () => {
      mockExperiments(makeExperiment());
      renderExperiments();

      await waitFor(() => expect(deepEvalMocks.getAllExperiments).toHaveBeenCalledWith({ project_id: "proj-1" }));

      expect(await screen.findByTestId("experiment-row-exp-1")).toBeInTheDocument();
      expect(screen.getByTestId("name-exp-1")).toHaveTextContent("Chat bot eval");
      expect(screen.getByTestId("model-exp-1")).toHaveTextContent("claude-sonnet-4-20250514");
      expect(screen.getByTestId("judge-exp-1")).toHaveTextContent("gpt-4o");
      expect(screen.getByTestId("dataset-exp-1")).toHaveTextContent("chatbot");
      expect(screen.getByTestId("status-exp-1")).toHaveTextContent("Completed");
      expect(screen.getByTestId("prompts-exp-1")).toHaveTextContent("3");
      expect(screen.getByTestId("linked-exp-1")).toHaveTextContent("Linked");
      expect(screen.getByTestId("date-exp-1")).toHaveTextContent(/^\d{2}-\d{2}-\d{4}/);
    });

    it("shows the chart empty-state overlay when there are no experiments", async () => {
      mockExperiments();
      renderExperiments();

      expect(
        await screen.findByText("You can start tracking metrics once you define your experiments"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("performance-chart")).toBeInTheDocument();
    });

    it("derives dataset labels from name, path, datasetId, categories, useBuiltin and default", async () => {
      mockExperiments(
        makeExperiment({
          id: "by-name",
          name: "By name",
          config: { ...baseConfig, dataset: { name: "chatbot" } },
        }),
        makeExperiment({
          id: "by-path",
          name: "By path",
          config: { ...baseConfig, dataset: { path: "chatbot/chatbot_coding_helper.json" } },
        }),
        makeExperiment({
          id: "by-dsid",
          name: "By datasetId",
          config: { ...baseConfig, dataset: { datasetId: "ds-123" } },
        }),
        makeExperiment({
          id: "by-cat",
          name: "By categories",
          config: { ...baseConfig, dataset: { categories: ["General"] } },
        }),
        makeExperiment({
          id: "by-builtin",
          name: "By useBuiltin",
          config: { ...baseConfig, dataset: { useBuiltin: true } },
        }),
        makeExperiment({
          id: "no-dataset",
          name: "No dataset",
          config: { model: baseConfig.model, judgeLlm: baseConfig.judgeLlm },
        }),
      );
      renderExperiments();

      expect((await screen.findByTestId("dataset-by-name")).textContent).toBe("chatbot");
      expect(screen.getByTestId("dataset-by-path").textContent).toBe("Chatbot Coding Helper");
      expect(screen.getByTestId("dataset-by-dsid").textContent).toBe("ds-123");
      expect(screen.getByTestId("dataset-by-cat").textContent).toBe("General");
      expect(screen.getByTestId("dataset-by-builtin").textContent).toBe("Template");
      expect(screen.getByTestId("dataset-no-dataset").textContent).toBe("Dataset");
    });

    it("shortens judge model names and resolves scorer / both evaluation modes", async () => {
      mockExperiments(
        makeExperiment({
          id: "std",
          name: "Standard",
          config: {
            ...baseConfig,
            judgeLlm: { model: "claude-sonnet-4-20250514", provider: "anthropic" },
          },
        }),
        makeExperiment({
          id: "scorer",
          name: "Scorer only",
          config: { ...baseConfig, evaluationMode: "scorer", scorerName: "quality scorer" },
        }),
        makeExperiment({
          id: "both",
          name: "Both modes",
          config: { ...baseConfig, evaluationMode: "both", scorerName: "quality scorer" },
        }),
        makeExperiment({
          id: "no-judge",
          name: "No judge",
          config: { model: baseConfig.model, dataset: baseConfig.dataset },
        }),
      );
      renderExperiments();

      expect((await screen.findByTestId("judge-std")).textContent).toBe("claude-sonnet-4");
      expect(screen.getByTestId("judge-scorer").textContent).toBe("quality scorer");
      expect(screen.getByTestId("judge-both").textContent).toBe("gpt-4o + quality scorer");
      expect(screen.getByTestId("judge-no-judge").textContent).toBe("-");
    });

    it("maps statuses to display labels and falls back to Unknown for missing models", async () => {
      mockExperiments(
        makeExperiment({ id: "done", name: "Done", status: "completed" }),
        makeExperiment({ id: "run", name: "Run", status: "running", results: undefined }),
        makeExperiment({ id: "fail", name: "Fail", status: "failed", results: undefined }),
        makeExperiment({ id: "pend", name: "Pend", status: "pending", results: undefined }),
        makeExperiment({
          id: "no-model",
          name: "No model",
          config: { judgeLlm: baseConfig.judgeLlm, dataset: baseConfig.dataset },
          model_inventory_id: undefined,
        }),
      );
      renderExperiments();

      expect((await screen.findByTestId("status-done")).textContent).toBe("Completed");
      expect(screen.getByTestId("status-run").textContent).toBe("Running");
      expect(screen.getByTestId("status-fail").textContent).toBe("Failed");
      expect(screen.getByTestId("status-pend").textContent).toBe("Pending");
      expect(screen.getByTestId("model-no-model").textContent).toBe("Unknown");
      expect(screen.getByTestId("linked-no-model").textContent).toBe("Unlinked");
    });

    it("computes prompt counts from results, config count, prompts array, or zero", async () => {
      mockExperiments(
        makeExperiment({ id: "from-results", name: "From results" }),
        makeExperiment({
          id: "from-count",
          name: "From count",
          results: undefined,
          config: { ...baseConfig, dataset: { count: 10 } },
        }),
        makeExperiment({
          id: "from-prompts",
          name: "From prompts",
          results: undefined,
          config: { ...baseConfig, dataset: { prompts: [1, 2, 3, 4] } },
        }),
        makeExperiment({
          id: "from-nothing",
          name: "From nothing",
          results: undefined,
          config: { ...baseConfig, dataset: {} },
        }),
      );
      renderExperiments();

      expect((await screen.findByTestId("prompts-from-results")).textContent).toBe("3");
      expect(screen.getByTestId("prompts-from-count").textContent).toBe("10");
      expect(screen.getByTestId("prompts-from-prompts").textContent).toBe("4");
      expect(screen.getByTestId("prompts-from-nothing").textContent).toBe("0");
    });
  });

  describe("row actions", () => {
    it("calls onViewExperiment when a row is clicked", async () => {
      const onViewExperiment = vi.fn();
      mockExperiments(makeExperiment());
      renderExperiments({ onViewExperiment });

      fireEvent.click(await screen.findByText("row-click-exp-1"));
      expect(onViewExperiment).toHaveBeenCalledWith("exp-1");
    });

    it("navigates to the experiment detail route when onViewExperiment is absent", async () => {
      function LocationProbe() {
        const location = useLocation();
        return <div data-testid="location">{location.pathname}</div>;
      }
      mockExperiments(makeExperiment());
      renderWithProviders(
        <>
          <LocationProbe />
          <ProjectExperiments projectId="proj-1" orgId="org-1" useCase="chatbot" />
        </>,
        { preloadedAuth: { authToken: makeToken("Admin") } },
      );

      fireEvent.click(await screen.findByText("row-click-exp-1"));
      await waitFor(() =>
        expect(screen.getByTestId("location")).toHaveTextContent("/evals/proj-1/experiment/exp-1"),
      );
    });

    it("opens the rerun confirmation with an estimated time based on prompt count", async () => {
      mockExperiments(
        makeExperiment({ id: "few", name: "Few prompts", results: { avg_scores: {}, total_prompts: 3 } }),
        makeExperiment({ id: "none", name: "No prompts", results: undefined, config: { ...baseConfig, dataset: {} } }),
        makeExperiment({
          id: "many",
          name: "Many prompts",
          results: undefined,
          config: { ...baseConfig, dataset: { count: 60 } },
        }),
      );
      renderExperiments();

      fireEvent.click(await screen.findByText("rerun-few"));
      expect(screen.getByText("Rerun experiment")).toBeInTheDocument();
      expect(screen.getByText(/Estimated time: ~1-2 minutes/)).toBeInTheDocument();
      expect(screen.getByText(/Based on 3 prompts/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByText("Rerun experiment")).not.toBeInTheDocument());

      fireEvent.click(screen.getByText("rerun-none"));
      expect(screen.getByText("Rerun experiment")).toBeInTheDocument();
      expect(screen.queryByText(/Estimated time/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      fireEvent.click(screen.getByText("rerun-many"));
      expect(screen.getByText(/Estimated time: ~30\+ minutes/)).toBeInTheDocument();
      expect(screen.getByText(/Based on 60 prompts/)).toBeInTheDocument();
    });

    it("rerun cancel does not create a new experiment", async () => {
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("rerun-exp-1"));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByText("Rerun experiment")).not.toBeInTheDocument());
      expect(deepEvalMocks.createExperiment).not.toHaveBeenCalled();
    });

    it("reruns when model validation passes and adds an optimistic row", async () => {
      deepEvalMocks.validateModel.mockResolvedValue({ valid: true });
      deepEvalMocks.createExperiment.mockResolvedValue({ experiment: { id: "exp-new" } });
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("rerun-exp-1"));
      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));

      await waitFor(() => expect(deepEvalMocks.validateModel).toHaveBeenCalledWith("claude-sonnet-4-20250514", "anthropic"));
      await waitFor(() => expect(deepEvalMocks.createExperiment).toHaveBeenCalled());

      const payload = deepEvalMocks.createExperiment.mock.calls[0][0];
      expect(payload.project_id).toBe("proj-1");
      expect(payload.name).toMatch(/^Chat bot eval \(rerun /);
      expect(payload.config.project_id).toBe("proj-1");

      expect(await screen.findByTestId("experiment-row-exp-new")).toBeInTheDocument();
      expect(screen.getByTestId("name-exp-new")).toHaveTextContent(/Chat bot eval \(rerun /);
      expect(screen.getByTestId("status-exp-new")).toHaveTextContent("Running");
      expect(screen.getByTestId("prompts-exp-new")).toHaveTextContent("3");
      expect(screen.getByText(/Rerun started:/)).toBeInTheDocument();
    });

    it("shows the API key warning and reruns anyway when validation fails", async () => {
      deepEvalMocks.validateModel.mockResolvedValue({
        valid: false,
        provider: "openai",
        error_message: "API key for openai is not configured.",
      });
      deepEvalMocks.createExperiment.mockResolvedValue({ experiment: { id: "exp-new" } });
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("rerun-exp-1"));
      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));

      expect(await screen.findByText("API key may not be configured")).toBeInTheDocument();
      expect(screen.getByText(/API key for openai is not configured/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Run anyway" }));
      await waitFor(() => expect(deepEvalMocks.createExperiment).toHaveBeenCalled());
      expect(await screen.findByTestId("experiment-row-exp-new")).toBeInTheDocument();
    });

    it("cancelling the API key warning aborts the rerun", async () => {
      deepEvalMocks.validateModel.mockResolvedValue({ valid: false, error_message: "No key." });
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("rerun-exp-1"));
      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));
      await screen.findByText("API key may not be configured");

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByText("API key may not be configured")).not.toBeInTheDocument());
      expect(deepEvalMocks.createExperiment).not.toHaveBeenCalled();
    });

    it("skips model validation for local providers", async () => {
      deepEvalMocks.createExperiment.mockResolvedValue({ experiment: { id: "exp-new" } });
      mockExperiments(
        makeExperiment({
          config: { ...baseConfig, model: { name: "llama-3", accessMethod: "ollama" } },
        }),
      );
      renderExperiments();

      fireEvent.click(await screen.findByText("rerun-exp-1"));
      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));

      await waitFor(() => expect(deepEvalMocks.createExperiment).toHaveBeenCalled());
      expect(deepEvalMocks.validateModel).not.toHaveBeenCalled();
    });

    it("proceeds with the rerun even when validation throws", async () => {
      deepEvalMocks.validateModel.mockRejectedValue(new Error("boom"));
      deepEvalMocks.createExperiment.mockResolvedValue({ experiment: { id: "exp-new" } });
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("rerun-exp-1"));
      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));

      await waitFor(() => expect(deepEvalMocks.createExperiment).toHaveBeenCalled());
    });

    it("shows an error alert when the rerun fails", async () => {
      deepEvalMocks.createExperiment.mockRejectedValue(new Error("boom"));
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("rerun-exp-1"));
      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));

      expect(await screen.findByText("Failed to start rerun")).toBeInTheDocument();
    });

    it("downloads experiment results as JSON", async () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("download-exp-1"));

      await waitFor(() => expect(deepEvalMocks.getExperiment).toHaveBeenCalledWith("exp-1"));
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalled();
      expect(await screen.findByText("Experiment results downloaded")).toBeInTheDocument();
      clickSpy.mockRestore();
    });

    it("shows an error alert when the download fails", async () => {
      deepEvalMocks.getExperiment.mockRejectedValue(new Error("boom"));
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("download-exp-1"));

      expect(await screen.findByText("Failed to download results")).toBeInTheDocument();
    });

    it("copies experiment results to the clipboard", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("copy-exp-1"));

      await waitFor(() => expect(deepEvalMocks.getExperiment).toHaveBeenCalledWith("exp-1"));
      await waitFor(() => expect(writeText).toHaveBeenCalled());
      expect(writeText.mock.calls[0][0]).toContain('"name": "Test Experiment"');
      expect(await screen.findByText("Results copied to clipboard")).toBeInTheDocument();
    });

    it("shows an error alert when copying fails", async () => {
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("copy-exp-1"));

      expect(await screen.findByText("Failed to copy results")).toBeInTheDocument();
    });

    it("deletes an experiment and reloads the list", async () => {
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("delete-exp-1"));

      await waitFor(() => expect(deepEvalMocks.deleteExperiment).toHaveBeenCalledWith("exp-1"));
      expect(await screen.findByText("Experiment deleted")).toBeInTheDocument();
      await waitFor(() => expect(deepEvalMocks.getAllExperiments).toHaveBeenCalledTimes(2));
    });

    it("shows an error alert when deleting fails", async () => {
      deepEvalMocks.deleteExperiment.mockRejectedValue(new Error("boom"));
      mockExperiments(makeExperiment());
      renderExperiments();

      fireEvent.click(await screen.findByText("delete-exp-1"));

      expect(await screen.findByText("Failed to delete")).toBeInTheDocument();
    });
  });

  describe("search, filter, group & chart", () => {
    it("filters rows by the search term across name, model, judge and status", async () => {
      mockExperiments(
        makeExperiment({ id: "chat", name: "Chat bot eval" }),
        makeExperiment({
          id: "vision",
          name: "Vision eval",
          config: { ...baseConfig, judgeLlm: { model: "claude-3-5", provider: "anthropic" } },
        }),
      );
      renderExperiments();

      await screen.findByTestId("experiment-row-chat");
      expect(screen.getByTestId("experiment-row-vision")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Search experiments"), {
        target: { value: "chat" },
      });

      expect(screen.getByTestId("experiment-row-chat")).toBeInTheDocument();
      expect(screen.queryByTestId("experiment-row-vision")).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Search experiments"), {
        target: { value: "gpt-4o" },
      });
      expect(screen.getByTestId("experiment-row-chat")).toBeInTheDocument();
      expect(screen.queryByTestId("experiment-row-vision")).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Search experiments"), {
        target: { value: "vision" },
      });
      expect(screen.getByTestId("experiment-row-vision")).toBeInTheDocument();
      expect(screen.queryByTestId("experiment-row-chat")).not.toBeInTheDocument();
    });

    it("filters rows by status through the Filter popover", async () => {
      mockExperiments(
        makeExperiment({ id: "done", name: "Done", status: "completed" }),
        makeExperiment({ id: "run", name: "Run", status: "running", results: undefined }),
      );
      renderExperiments();

      await screen.findByTestId("experiment-row-done");
      fireEvent.click(screen.getByRole("button", { name: /Filter/ }));

      const popover = document.querySelector(".MuiPopover-paper") as HTMLElement;
      // Default column is "name" (text type) so the value is a plain input:
      // only column + operator selects render as comboboxes initially.
      const initialComboboxes = within(popover).getAllByRole("combobox");
      expect(initialComboboxes).toHaveLength(2);

      fireEvent.mouseDown(initialComboboxes[0]);
      fireEvent.click(screen.getByRole("option", { name: "Status" }));

      const comboboxes = within(popover).getAllByRole("combobox");
      expect(comboboxes).toHaveLength(3);
      fireEvent.mouseDown(comboboxes[1]);
      fireEvent.click(screen.getByRole("option", { name: "is" }));
      fireEvent.mouseDown(comboboxes[2]);
      fireEvent.click(screen.getByRole("option", { name: "Completed" }));

      await waitFor(() => expect(screen.getByTestId("experiment-row-done")).toBeInTheDocument());
      expect(screen.queryByTestId("experiment-row-run")).not.toBeInTheDocument();
    });

    it("groups rows by status", async () => {
      mockExperiments(
        makeExperiment({ id: "done", name: "Done", status: "completed" }),
        makeExperiment({ id: "run", name: "Run", status: "running", results: undefined }),
      );
      renderExperiments();

      await screen.findByTestId("experiment-row-done");
      fireEvent.click(screen.getByRole("button", { name: /Group/ }));

      const popover = document.querySelector(".MuiPopover-paper") as HTMLElement;
      const combobox = within(popover).getByRole("combobox");
      fireEvent.mouseDown(combobox);
      fireEvent.click(screen.getByRole("option", { name: "Status" }));

      await waitFor(() => expect(screen.getAllByTestId("experiment-table")).toHaveLength(2));
      const tables = screen.getAllByTestId("experiment-table");
      expect(within(tables[0]).getByTestId("experiment-row-done")).toBeInTheDocument();
      expect(within(tables[0]).queryByTestId("experiment-row-run")).not.toBeInTheDocument();
      expect(within(tables[1]).getByTestId("experiment-row-run")).toBeInTheDocument();
      expect(within(tables[1]).queryByTestId("experiment-row-done")).not.toBeInTheDocument();
    });

    it("passes the selected time range to the performance chart", async () => {
      mockExperiments(makeExperiment());
      renderExperiments();

      await screen.findByTestId("performance-chart");
      expect(screen.getByTestId("performance-chart").textContent).toBe("all");

      fireEvent.mouseDown(screen.getByRole("combobox"));
      fireEvent.click(screen.getByRole("option", { name: "Last 7 days" }));

      await waitFor(() => expect(screen.getByTestId("performance-chart")).toHaveTextContent("7d"));
    });
  });

  describe("new experiment & RBAC", () => {
    it("opens the New Experiment modal", async () => {
      mockExperiments();
      renderExperiments();

      fireEvent.click(await screen.findByRole("button", { name: "New experiment" }));
      expect(screen.getByTestId("new-experiment-modal")).toBeInTheDocument();
    });

    it("reloads experiments when the modal reports success", async () => {
      mockExperiments();
      renderExperiments();

      fireEvent.click(await screen.findByRole("button", { name: "New experiment" }));
      fireEvent.click(screen.getByText("simulate-success"));

      await waitFor(() => expect(screen.queryByTestId("new-experiment-modal")).not.toBeInTheDocument());
      await waitFor(() => expect(deepEvalMocks.getAllExperiments).toHaveBeenCalledTimes(2));
    });

    it("adds an optimistic row when the modal reports a started experiment", async () => {
      mockExperiments();
      renderExperiments();

      fireEvent.click(await screen.findByRole("button", { name: "New experiment" }));
      fireEvent.click(screen.getByText("simulate-started"));

      expect(await screen.findByTestId("experiment-row-exp-opt")).toBeInTheDocument();
      expect(screen.getByTestId("name-exp-opt")).toHaveTextContent("Optimistic Run");
      expect(screen.getByTestId("status-exp-opt")).toHaveTextContent("Running");
      expect(screen.getByTestId("prompts-exp-opt")).toHaveTextContent("5");
    });

    it("disables create and delete actions for read-only roles", async () => {
      mockExperiments(makeExperiment());
      renderExperiments({}, "Auditor");

      await screen.findByTestId("experiment-row-exp-1");
      expect(screen.getByRole("button", { name: "New experiment" })).toBeDisabled();
      expect(screen.queryByText("rerun-exp-1")).not.toBeInTheDocument();
      expect(screen.queryByText("delete-exp-1")).not.toBeInTheDocument();
    });
  });

  describe("polling & completion alerts", () => {
    it("polls running experiments and alerts when one completes", async () => {
      const running = makeExperiment({ status: "running", results: undefined });
      mockExperiments(running);

      vi.useFakeTimers();
      try {
        renderExperiments();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByTestId("experiment-row-exp-1")).toBeInTheDocument();

        mockExperiments({ ...running, status: "completed" });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });

        expect(
          screen.getByText('Experiment "Chat bot eval" completed successfully'),
        ).toBeInTheDocument();

        // success alerts auto-dismiss after 5s
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(
          screen.queryByText('Experiment "Chat bot eval" completed successfully'),
        ).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("alerts when a running experiment fails", async () => {
      const running = makeExperiment({ status: "running", results: undefined });
      mockExperiments(running);

      vi.useFakeTimers();
      try {
        renderExperiments();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });

        mockExperiments({ ...running, status: "failed" });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });

        expect(
          screen.getByText('Experiment "Chat bot eval" failed. Check logs for details.'),
        ).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
