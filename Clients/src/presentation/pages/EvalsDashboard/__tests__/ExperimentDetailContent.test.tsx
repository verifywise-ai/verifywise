// NOTE: deepEval.mocks MUST be the first import — it exports vi.hoisted
// handles, so Vitest requires it to be imported before any other module (its
// vi.mock registrations also need to run before the component module graph
// loads).
import {
  deepEvalMocks,
  installBrowserStubs,
  mockExperiment,
  resetDeepEvalMocks,
} from "./deepEval.mocks";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ExperimentDetailContent from "../ExperimentDetailContent";

// A single-turn sample with a passing (answerRelevancy) and a numeric
// lower-is-better (bias) metric, plus a parseable JSON reason string.
const LOG = {
  id: "log-1",
  project_id: "proj-1",
  experiment_id: "exp-1",
  input_text: "What is 2+2?",
  output_text: "4",
  model_name: "gpt-4o",
  latency_ms: 120,
  token_count: 40,
  timestamp: "2025-06-01T00:00:00.000Z",
  tenant: "t1",
  metadata: {
    metric_scores: {
      answerRelevancy: { score: 0.9, passed: true, reason: '{"reason": "Accurate answer"}' },
      bias: 0.1,
    },
  },
};

function mockLogs(logs: unknown[]) {
  deepEvalMocks.getLogs.mockResolvedValue({ logs });
}

function renderDetail(
  props: Partial<{ experimentId: string; projectId: string; onBack: () => void }> = {},
) {
  return renderWithProviders(
    <ExperimentDetailContent
      experimentId={props.experimentId ?? "exp-1"}
      projectId={props.projectId ?? "proj-1"}
      onBack={props.onBack ?? vi.fn()}
    />,
  );
}

/** Click the n-th edit (pencil) icon button in the header/summary. */
function clickPencil(container: HTMLElement, index = 0) {
  const icon = container.querySelectorAll("svg.lucide-pencil")[index] as HTMLElement;
  fireEvent.click(icon.closest("button") as HTMLButtonElement);
}

/**
 * Query by full textContent — the modal footer renders labels as a <span>
 * followed by a text node (e.g. "Model: gpt-4o"), which getByText can't match.
 */
function getByTextContent(text: string) {
  return screen.getByText(
    (_content: string, node: Element | null) => node !== null && node.textContent === text,
  );
}

describe("ExperimentDetailContent", () => {
  beforeEach(() => {
    installBrowserStubs();
    resetDeepEvalMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  describe("mount & loading", () => {
    it("calls getExperiment and getLogs on mount", async () => {
      renderDetail();

      await waitFor(() => expect(deepEvalMocks.getExperiment).toHaveBeenCalledWith("exp-1"));
      expect(deepEvalMocks.getLogs).toHaveBeenCalledWith({
        experiment_id: "exp-1",
        limit: 1000,
      });
    });

    it("shows a spinner while the experiment data loads", () => {
      deepEvalMocks.getExperiment.mockReturnValue(new Promise(() => {}));
      deepEvalMocks.getLogs.mockReturnValue(new Promise(() => {}));

      renderDetail();

      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("renders 'Experiment not found' when the experiment is missing", async () => {
      deepEvalMocks.getExperiment.mockResolvedValue({ experiment: null });

      renderDetail();

      expect(await screen.findByText("Experiment not found")).toBeInTheDocument();
    });

    it("renders 'Experiment not found' and logs when loading fails", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      deepEvalMocks.getExperiment.mockRejectedValue(new Error("boom"));

      renderDetail();

      expect(await screen.findByText("Experiment not found")).toBeInTheDocument();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe("header, summary & actions", () => {
    it("renders the name, summary fields and action buttons", async () => {
      renderDetail();

      expect(await screen.findByText("Test Experiment")).toBeInTheDocument();
      expect(screen.getByText("A test run")).toBeInTheDocument();
      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(screen.getByText("Model")).toBeInTheDocument();
      expect(screen.getByText("Judge")).toBeInTheDocument();
      expect(screen.getByText("Prompts")).toBeInTheDocument();
      expect(screen.getByText("Created")).toBeInTheDocument();
      expect(screen.getByText("01-06-2025")).toBeInTheDocument();
      expect(screen.getAllByText("gpt-4o")).toHaveLength(2);
      expect(screen.getByRole("button", { name: "Rerun" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    });

    it("falls back to a generated summary when there is no description", async () => {
      deepEvalMocks.getExperiment.mockResolvedValue({
        experiment: { ...mockExperiment, description: undefined },
      });

      renderDetail();

      expect(await screen.findByText("Evaluating gpt-4o with 0 prompts")).toBeInTheDocument();
    });

    it("calls onBack when the back link is clicked", async () => {
      const onBack = vi.fn();
      renderDetail({ onBack });

      await screen.findByText("Test Experiment");
      fireEvent.click(screen.getByText(/Back to experiments/));

      expect(onBack).toHaveBeenCalled();
    });

    it("shows the running status label for running experiments", async () => {
      deepEvalMocks.getExperiment.mockResolvedValue({
        experiment: { ...mockExperiment, status: "running" },
      });

      renderDetail();

      expect(await screen.findByText("Status")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Rerun" })).toBeDisabled();
    });
  });

  describe("inline editing", () => {
    it("saves a renamed experiment when Enter is pressed", async () => {
      const { container } = renderDetail();
      await screen.findByText("Test Experiment");

      clickPencil(container);
      const input = screen.getByDisplayValue("Test Experiment");
      fireEvent.change(input, { target: { value: "Renamed Experiment" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() =>
        expect(deepEvalMocks.updateExperiment).toHaveBeenCalledWith("exp-1", {
          name: "Renamed Experiment",
        }),
      );
      expect(await screen.findByText("Name saved")).toBeInTheDocument();
      expect(screen.getByText("Renamed Experiment")).toBeInTheDocument();
    });

    it("cancels name editing with Escape without saving", async () => {
      const { container } = renderDetail();
      await screen.findByText("Test Experiment");

      clickPencil(container);
      const input = screen.getByDisplayValue("Test Experiment");
      fireEvent.change(input, { target: { value: "Changed" } });
      fireEvent.keyDown(input, { key: "Escape" });

      expect(screen.getByText("Test Experiment")).toBeInTheDocument();
      expect(deepEvalMocks.updateExperiment).not.toHaveBeenCalled();
    });

    it("disables the save check when the name is blank", async () => {
      const { container } = renderDetail();
      await screen.findByText("Test Experiment");

      clickPencil(container);
      const input = screen.getByDisplayValue("Test Experiment");
      fireEvent.change(input, { target: { value: "" } });

      const checkButton = (container.querySelector("svg.lucide-check") as HTMLElement).closest(
        "button",
      );
      expect(checkButton).toBeDisabled();
    });

    it("saves an edited description", async () => {
      const { container } = renderDetail();
      await screen.findByText("Test Experiment");

      clickPencil(container, 1);
      const input = screen.getByPlaceholderText("Add a description...");
      fireEvent.change(input, { target: { value: "New description" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() =>
        expect(deepEvalMocks.updateExperiment).toHaveBeenCalledWith("exp-1", {
          description: "New description",
        }),
      );
      expect(await screen.findByText("Description saved")).toBeInTheDocument();
      expect(screen.getByText("New description")).toBeInTheDocument();
    });

    it("shows an error alert when the name update fails", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      deepEvalMocks.updateExperiment.mockRejectedValue(new Error("boom"));
      const { container } = renderDetail();
      await screen.findByText("Test Experiment");

      clickPencil(container);
      const input = screen.getByDisplayValue("Test Experiment");
      fireEvent.change(input, { target: { value: "Renamed" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(await screen.findByText("Failed to save name")).toBeInTheDocument();
      errorSpy.mockRestore();
    });
  });

  describe("metrics", () => {
    it("renders quality and safety metric cards with averages", async () => {
      mockLogs([LOG]);

      renderDetail();

      expect(await screen.findByText("Quality metrics")).toBeInTheDocument();
      expect(screen.getByText("Safety metrics")).toBeInTheDocument();
      expect(screen.getByText("90.0%")).toBeInTheDocument();
      expect(screen.getByText("10.0%")).toBeInTheDocument();
      expect(screen.getAllByText("Answer Relevancy").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Bias").length).toBeGreaterThan(0);
    });

    it("renders conversational metrics for multi-turn logs", async () => {
      mockLogs([
        {
          ...LOG,
          id: "log-m",
          input_text: "Book a flight",
          metadata: {
            is_conversational: true,
            turn_count: 2,
            scenario: "Booking a flight",
            turns: [
              { role: "user", content: "Book a flight" },
              { role: "assistant", content: "Sure, done!" },
            ],
            metric_scores: { "Turn Relevancy": 0.8 },
          },
        },
      ]);

      renderDetail();

      expect(await screen.findByText("Conversational metrics")).toBeInTheDocument();
      expect(screen.getByText("80.0%")).toBeInTheDocument();
      expect(screen.queryByText("Quality metrics")).not.toBeInTheDocument();
    });

    it("renders custom scorer metrics", async () => {
      mockLogs([{ ...LOG, metadata: { metric_scores: { customer_engagement: 0.75 } } }]);

      renderDetail();

      expect(await screen.findByText("Custom scorers")).toBeInTheDocument();
      expect(screen.getByText("75.0%")).toBeInTheDocument();
      expect(screen.getAllByText("Customer Engagement").length).toBeGreaterThan(0);
    });

    it("skips the metrics header when no log has metric scores", async () => {
      mockLogs([{ ...LOG, metadata: {} }]);

      renderDetail();

      await screen.findByText("Test Experiment");
      expect(screen.queryByText("Quality metrics")).not.toBeInTheDocument();
      expect(screen.queryByText("Safety metrics")).not.toBeInTheDocument();
    });
  });

  describe("samples table & detail modal", () => {
    it("shows the empty state when there are no logs", async () => {
      renderDetail();

      expect(await screen.findByText("No samples found")).toBeInTheDocument();
    });

    it("renders sample rows with per-metric scores", async () => {
      mockLogs([LOG]);

      renderDetail();

      expect(await screen.findByText("What is 2+2?")).toBeInTheDocument();
      expect(screen.getByText("90%")).toBeInTheDocument();
      expect(screen.getByText("10%")).toBeInTheDocument();
    });

    it("opens the detail modal and navigates between samples", async () => {
      mockLogs([
        LOG,
        {
          ...LOG,
          id: "log-2",
          input_text: "Second question",
          output_text: "Second answer",
          metadata: {
            metric_scores: { answerRelevancy: { score: 0.3, passed: false, reason: "Wrong" } },
          },
        },
      ]);

      renderDetail();
      fireEvent.click(await screen.findByText("What is 2+2?"));

      expect(await screen.findByText("Sample 1")).toBeInTheDocument();
      expect(screen.getByText("2/2 metrics passed")).toBeInTheDocument();
      expect(screen.getByText("Accurate answer")).toBeInTheDocument();
      expect(screen.getByText("log-1")).toBeInTheDocument();
      expect(getByTextContent("Model: gpt-4o")).toBeInTheDocument();
      expect(getByTextContent("Latency: 120ms")).toBeInTheDocument();
      expect(getByTextContent("Tokens: 40")).toBeInTheDocument();

      expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      expect(screen.getByText("Sample 2")).toBeInTheDocument();
      expect(screen.getByText("0/1 metrics passed")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("renders the conversation view for a multi-turn sample", async () => {
      mockLogs([
        {
          ...LOG,
          id: "log-c",
          input_text: "Book a flight",
          metadata: {
            is_conversational: true,
            turn_count: 2,
            scenario: "Booking a flight",
            turns: [
              { role: "user", content: "Book a flight to Paris" },
              { role: "assistant", content: "Sure, one moment." },
            ],
            metric_scores: { "Turn Relevancy": 0.8 },
          },
        },
      ]);

      renderDetail();
      fireEvent.click(await screen.findByText("Book a flight"));

      expect(await screen.findByText(/Conversation \(2 turns\)/)).toBeInTheDocument();
      expect(screen.getByText("Scenario: Booking a flight")).toBeInTheDocument();
      expect(screen.getByText("Book a flight to Paris")).toBeInTheDocument();
      expect(screen.getByText("Assistant")).toBeInTheDocument();
    });

    it("shows the error message for a failed sample", async () => {
      mockLogs([
        {
          ...LOG,
          id: "log-f",
          input_text: "Q",
          output_text: "",
          error_message: "Timeout after 30s",
          metadata: { metric_scores: {} },
        },
      ]);

      renderDetail();
      fireEvent.click(await screen.findByText("Q"));

      expect(await screen.findByText("Timeout after 30s")).toBeInTheDocument();
      expect(screen.getByText("Error")).toBeInTheDocument();
      expect(screen.getByText("No metric scores available")).toBeInTheDocument();
    });
  });

  describe("rerun", () => {
    it("reruns the experiment with the same config and navigates back", async () => {
      const onBack = vi.fn();
      deepEvalMocks.createExperiment.mockResolvedValue({ experiment: { id: "exp-2" } });

      renderDetail({ onBack });
      await screen.findByText("Test Experiment");

      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));

      await waitFor(() => expect(deepEvalMocks.createExperiment).toHaveBeenCalled());
      const payload = deepEvalMocks.createExperiment.mock.calls[0][0];
      expect(payload.project_id).toBe("proj-1");
      expect(payload.name).toContain("Test Experiment (rerun");
      expect(payload.config.project_id).toBe("proj-1");
      expect(payload.config.model.name).toBe("gpt-4o");
      expect(await screen.findByText(/Rerun started/)).toBeInTheDocument();
      await waitFor(() => expect(onBack).toHaveBeenCalled(), { timeout: 2000 });
    });

    it("shows the API key warning and lets the user run anyway", async () => {
      deepEvalMocks.validateModel.mockResolvedValue({
        valid: false,
        provider: "openai",
        error_message: "No API key configured for openai.",
      });

      renderDetail();
      await screen.findByText("Test Experiment");

      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));

      expect(await screen.findByText("API key may not be configured")).toBeInTheDocument();
      expect(screen.getByText(/No API key configured/)).toBeInTheDocument();
      expect(deepEvalMocks.createExperiment).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Run anyway" }));

      await waitFor(() => expect(deepEvalMocks.createExperiment).toHaveBeenCalled());
    });

    it("closes the API key warning without rerunning on cancel", async () => {
      deepEvalMocks.validateModel.mockResolvedValue({
        valid: false,
        provider: "openai",
      });

      renderDetail();
      await screen.findByText("Test Experiment");

      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(screen.queryByText("API key may not be configured")).not.toBeInTheDocument();
      expect(deepEvalMocks.createExperiment).not.toHaveBeenCalled();
    });

    it("skips model validation for local providers", async () => {
      deepEvalMocks.getExperiment.mockResolvedValue({
        experiment: {
          ...mockExperiment,
          config: { model: { name: "llama3", accessMethod: "ollama" } },
        },
      });

      renderDetail();
      await screen.findByText("Test Experiment");

      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));

      await waitFor(() => expect(deepEvalMocks.createExperiment).toHaveBeenCalled());
      expect(deepEvalMocks.validateModel).not.toHaveBeenCalled();
    });

    it("proceeds anyway when model validation throws", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      deepEvalMocks.validateModel.mockRejectedValue(new Error("net"));

      renderDetail();
      await screen.findByText("Test Experiment");

      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));

      await waitFor(() => expect(deepEvalMocks.createExperiment).toHaveBeenCalled());
      warnSpy.mockRestore();
    });

    it("shows a failure alert when the rerun request throws", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      deepEvalMocks.createExperiment.mockRejectedValue(new Error("boom"));

      renderDetail();
      await screen.findByText("Test Experiment");

      fireEvent.click(screen.getByRole("button", { name: "Rerun" }));

      expect(await screen.findByText("Failed to start rerun")).toBeInTheDocument();
      errorSpy.mockRestore();
    });
  });

  describe("download & copy", () => {
    it("downloads the results as a JSON file", async () => {
      renderDetail();
      await screen.findByText("Test Experiment");

      fireEvent.click(screen.getByRole("button", { name: "Download" }));

      await waitFor(() =>
        expect(URL.createObjectURL as ReturnType<typeof vi.fn>).toHaveBeenCalled(),
      );
      expect(URL.createObjectURL as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        expect.any(Blob),
      );
      expect(URL.revokeObjectURL as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    });

    it("copies the results JSON to the clipboard", async () => {
      renderDetail();
      await screen.findByText("Test Experiment");

      fireEvent.click(screen.getByRole("button", { name: "Copy" }));

      expect(await screen.findByText("Results copied to clipboard")).toBeInTheDocument();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('"logs": []'),
      );
    });
  });
});
