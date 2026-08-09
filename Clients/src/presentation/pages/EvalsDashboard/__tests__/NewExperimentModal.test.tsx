// NOTE: deepEval.mocks MUST be the first import — it exports vi.hoisted
// handles, so Vitest requires it to be imported before any other module (its
// vi.mock registrations also need to run before the component module graph
// loads).
import {
  deepEvalMocks,
  installBrowserStubs,
  mockListDatasetsWith,
  resetDeepEvalMocks,
  samplePrompts,
} from "./deepEval.mocks";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import NewExperimentModal from "../NewExperimentModal";

const DEFAULT_TEMPLATE_PATH = "chatbot/chatbot_basic.json";

function renderModal(
  overrides: {
    isOpen?: boolean;
    useCase?: "chatbot" | "rag" | "agent";
    existingExperimentNames?: string[];
  } = {},
) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const onStarted = vi.fn();
  renderWithProviders(
    <NewExperimentModal
      isOpen={overrides.isOpen ?? true}
      onClose={onClose}
      projectId="proj-1"
      orgId="org-1"
      onSuccess={onSuccess}
      onStarted={onStarted}
      useCase={overrides.useCase ?? "chatbot"}
      existingExperimentNames={overrides.existingExperimentNames ?? []}
    />,
  );
  return { onClose, onSuccess, onStarted };
}

/** Select the Ollama model provider and type a model name (step 0). */
async function selectLocalModel(modelName = "llama2") {
  fireEvent.click(await screen.findByText("Ollama"));
  const input = await screen.findByLabelText("Model name");
  fireEvent.change(input, { target: { value: modelName } });
}

/** Advance from step 0 to the dataset step (step 1). */
async function goToDatasetStep() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Option 1: Use custom dataset");
}

/** Advance from the dataset step to the scorer/judge step (step 2). */
async function goToScorerStep() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Standard judge only");
}

/** Select the Ollama judge provider and type a model name (step 2). */
async function selectLocalJudge(judgeModelName = "judge-llama") {
  fireEvent.click(screen.getByText("Ollama"));
  const input = await screen.findByLabelText("Model name");
  fireEvent.change(input, { target: { value: judgeModelName } });
}

/** Advance from the scorer/judge step to the metrics step (step 3). */
async function goToMetricsStep() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByLabelText("Experiment name");
}

describe("NewExperimentModal", () => {
  beforeEach(() => {
    installBrowserStubs();
    resetDeepEvalMocks();
  });

  describe("render states (3.3.1)", () => {
    it("renders nothing when closed", () => {
      renderModal({ isOpen: false });

      expect(screen.queryByText("Create new experiment")).not.toBeInTheDocument();
      expect(deepEvalMocks.getAllLlmApiKeys).not.toHaveBeenCalled();
    });

    it("renders the wizard with every provider option once loaded", async () => {
      renderModal();

      expect(screen.getByText("Create new experiment")).toBeInTheDocument();
      expect(await screen.findByText("Model provider")).toBeInTheDocument();

      for (const name of [
        "OpenAI",
        "Anthropic",
        "Gemini",
        "xAI",
        "Mistral",
        "OpenRouter",
        "HuggingFace",
        "Ollama",
        "Custom / Self-hosted",
        "Local",
      ]) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }

      // No saved models in the org yet → the "Saved Models" section stays hidden.
      expect(screen.queryByText("Saved Models")).not.toBeInTheDocument();
    });
  });

  describe("wizard progression & gating (3.3.2)", () => {
    it("gates the Next button per step and supports back navigation", async () => {
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });

      renderModal();

      // Step 0: nothing selected → Next disabled
      expect(await screen.findByRole("button", { name: "Next" })).toBeDisabled();
      expect(screen.getByText("Select the model you want to evaluate.")).toBeInTheDocument();

      await selectLocalModel();
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

      await goToDatasetStep();

      // Step 1: no prompts loaded yet → Next disabled
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

      // Select a template → dataset prompts load → Next enabled
      fireEvent.click(screen.getByText("Basic Chatbot"));
      await waitFor(() =>
        expect(deepEvalMocks.readDataset).toHaveBeenCalledWith(DEFAULT_TEMPLATE_PATH),
      );
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

      await goToScorerStep();

      // Step 2: no judge configured → Next disabled
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

      await selectLocalJudge();
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

      // Back navigation returns to the dataset step
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(await screen.findByText("Option 1: Use custom dataset")).toBeInTheDocument();
      expect(screen.queryByText("Select the model you want to evaluate.")).not.toBeInTheDocument();
    });

    it("gates step 2 in both mode until scorers and a judge are configured", async () => {
      deepEvalMocks.getAllLlmApiKeys.mockResolvedValue([
        { id: 1, provider: "openai", apiKey: "sk-test" },
      ]);
      deepEvalMocks.listScorers.mockResolvedValue({
        scorers: [
          {
            id: "s1",
            name: "My Scorer",
            metricKey: "accuracy",
            enabled: true,
            config: { judgeModel: { provider: "OpenAI" } },
          },
        ],
      });
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });
      mockListDatasetsWith("chatbot", [DEFAULT_TEMPLATE_PATH]);

      renderModal();
      await selectLocalModel();
      await goToDatasetStep();
      await waitFor(() =>
        expect(deepEvalMocks.readDataset).toHaveBeenCalledWith(DEFAULT_TEMPLATE_PATH),
      );
      await goToScorerStep();

      // Switch to "Judge + scorer" mode → divider + scorers + judge config render
      fireEvent.click(screen.getByText("Judge + scorer"));
      expect(await screen.findByText("Standard Judge Configuration")).toBeInTheDocument();

      // Judge not configured yet → Next disabled
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

      await selectLocalJudge();
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    });
  });

  describe("provider selection & API keys (3.3.3)", () => {
    it("shows the API key input for a cloud provider without a saved key", async () => {
      renderModal();
      await screen.findByText("Model provider");

      fireEvent.click(screen.getByText("OpenAI"));

      // Cloud provider renders a model Select + API key field
      expect(await screen.findByText("Select a model")).toBeInTheDocument();
      expect(screen.getByLabelText("API key")).toBeInTheDocument();
    });

    it("shows the configured status instead of the API key input when a key exists", async () => {
      deepEvalMocks.getAllLlmApiKeys.mockResolvedValue([
        { id: 1, provider: "openai", apiKey: "sk-test" },
      ]);

      renderModal();
      await screen.findByText("Model provider");

      fireEvent.click(screen.getByText("OpenAI"));

      expect(
        await screen.findByText("API key configured — will be saved for future experiments"),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
    });
  });

  describe("dataset selection (3.3.3)", () => {
    it("lists and selects a saved user dataset", async () => {
      deepEvalMocks.listMyDatasets.mockResolvedValue({
        datasets: [
          {
            id: "d1",
            name: "My Multi Dataset",
            path: "uploads/mine.json",
            promptCount: 5,
            turnType: "multi-turn",
          },
        ],
      });
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });

      renderModal();
      await selectLocalModel();
      await goToDatasetStep();

      expect(await screen.findByText("Option 2: Your datasets")).toBeInTheDocument();
      fireEvent.click(screen.getByText("My Multi Dataset"));
      await waitFor(() =>
        expect(deepEvalMocks.readDataset).toHaveBeenCalledWith("uploads/mine.json"),
      );

      // Selected dataset chip reflects the loaded prompt count
      expect(screen.getByText("2 prompts")).toBeInTheDocument();
    });

    it("uploads a valid dataset file", async () => {
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });

      renderModal();
      await selectLocalModel();
      await goToDatasetStep();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(
        [JSON.stringify([{ prompt: "hi", expected_output: "yo" }])],
        "my-dataset.json",
        { type: "application/json" },
      );
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => expect(deepEvalMocks.uploadDataset).toHaveBeenCalled());
      expect(deepEvalMocks.readDataset).toHaveBeenCalledWith("uploads/uploaded.json");
      expect(await screen.findByText("Uploaded!")).toBeInTheDocument();
      expect(screen.getByText("my-dataset")).toBeInTheDocument();
    });

    it("shows an Invalid JSON alert for a malformed upload", async () => {
      renderModal();
      await selectLocalModel();
      await goToDatasetStep();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["not valid json"], "bad.json", { type: "application/json" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(await screen.findByText("Invalid JSON")).toBeInTheDocument();
      expect(screen.getByText("The file does not contain valid JSON")).toBeInTheDocument();
      expect(deepEvalMocks.uploadDataset).not.toHaveBeenCalled();
    });
  });

  describe("metrics step (3.3.2 / 3.3.3)", () => {
    it("renders multi-turn metrics for a multi-turn template and toggles a metric", async () => {
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });

      renderModal();
      await selectLocalModel();
      await goToDatasetStep();

      fireEvent.click(screen.getByText("General Assistant Multi-Turn"));
      await waitFor(() =>
        expect(deepEvalMocks.readDataset).toHaveBeenCalledWith(
          "chatbot/chatbot_general_assistant_multiturn.json",
        ),
      );
      await goToScorerStep();
      await selectLocalJudge();
      await goToMetricsStep();

      expect(screen.getByText("Conversational Metrics")).toBeInTheDocument();
      expect(screen.getByText("Per-Turn Safety Metrics")).toBeInTheDocument();
      expect(screen.getByText("Multi-turn dataset detected")).toBeInTheDocument();

      const turnRelevancy = screen.getByRole("checkbox", { name: "Turn Relevancy" });
      expect(turnRelevancy).toBeChecked();
      fireEvent.click(turnRelevancy);
      expect(turnRelevancy).not.toBeChecked();
    });

    it("shows the scorer-only no-metrics panel and an estimated time", async () => {
      deepEvalMocks.getAllLlmApiKeys.mockResolvedValue([
        { id: 1, provider: "openai", apiKey: "sk-test" },
      ]);
      deepEvalMocks.listScorers.mockResolvedValue({
        scorers: [
          {
            id: "s1",
            name: "My Scorer",
            metricKey: "accuracy",
            enabled: true,
            config: { judgeModel: { provider: "OpenAI" } },
          },
        ],
      });
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });
      mockListDatasetsWith("chatbot", [DEFAULT_TEMPLATE_PATH]);

      renderModal();
      await selectLocalModel();
      await goToDatasetStep();
      await waitFor(() =>
        expect(deepEvalMocks.readDataset).toHaveBeenCalledWith(DEFAULT_TEMPLATE_PATH),
      );
      await goToScorerStep();

      // Enabled scorer exists → mode auto-switches to scorer-only
      expect(await screen.findByText("Your Scorers")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

      await goToMetricsStep();
      expect(screen.getByText("No metrics available")).toBeInTheDocument();
      expect(screen.getByText(/Estimated time:/)).toBeInTheDocument();
    });
  });

  describe("missing API key warning (3.3.5)", () => {
    it("warns when the API key may not be configured and proceeds on second submit", async () => {
      deepEvalMocks.listModels.mockResolvedValue([
        {
          id: 1,
          name: "gpt-4o",
          provider: "OpenAI",
          endpointUrl: "",
          updatedAt: "2025-01-01T00:00:00Z",
        },
      ]);
      deepEvalMocks.validateModel.mockResolvedValue({
        valid: false,
        error_message: "No API key configured",
        provider: "openai",
      });
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });
      mockListDatasetsWith("chatbot", [DEFAULT_TEMPLATE_PATH]);

      const { onStarted } = renderModal();

      // Select the saved cloud model (no saved API key)
      fireEvent.click(await screen.findByText("gpt-4o"));
      await goToDatasetStep();
      await waitFor(() =>
        expect(deepEvalMocks.readDataset).toHaveBeenCalledWith(DEFAULT_TEMPLATE_PATH),
      );
      await goToScorerStep();
      await selectLocalJudge();
      await goToMetricsStep();

      // First submit triggers model validation → warning
      fireEvent.click(screen.getByRole("button", { name: "Start Experiment" }));
      expect(await screen.findByText("API key may not be configured")).toBeInTheDocument();
      expect(deepEvalMocks.validateModel).toHaveBeenCalledWith("gpt-4o", "openai");
      expect(deepEvalMocks.createExperiment).not.toHaveBeenCalled();

      // Second submit acknowledges the warning and creates the experiment
      fireEvent.click(screen.getByRole("button", { name: "Start Experiment" }));
      await waitFor(() => expect(deepEvalMocks.createExperiment).toHaveBeenCalled());
      expect(onStarted).toHaveBeenCalled();
    });
  });

  describe("submit (3.3.4)", () => {
    it("creates an experiment on submit and notifies the parent", async () => {
      mockListDatasetsWith("chatbot", [DEFAULT_TEMPLATE_PATH]);
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });

      const { onClose, onSuccess, onStarted } = renderModal();

      await selectLocalModel("llama2");
      await goToDatasetStep();
      await waitFor(() =>
        expect(deepEvalMocks.readDataset).toHaveBeenCalledWith(DEFAULT_TEMPLATE_PATH),
      );
      await goToScorerStep();
      await selectLocalJudge();
      await goToMetricsStep();

      fireEvent.click(screen.getByRole("button", { name: "Start Experiment" }));

      await waitFor(() => expect(deepEvalMocks.createExperiment).toHaveBeenCalled());
      const arg = deepEvalMocks.createExperiment.mock.calls[0][0];
      expect(arg.project_id).toBe("proj-1");
      expect(arg.name).toBe("llama2 × Chatbot Basic");
      expect(arg.description).toContain("2 prompts");
      expect(arg.config.model.name).toBe("llama2");
      expect(arg.config.model.accessMethod).toBe("ollama");
      expect(arg.config.dataset.path).toBe(DEFAULT_TEMPLATE_PATH);
      expect(arg.config.dataset.count).toBe(2);
      expect(arg.config.judgeLlm.provider).toBe("ollama");
      expect(arg.config.evaluationMode).toBe("standard");

      expect(await screen.findByText("Experiment Created!")).toBeInTheDocument();
      expect(onStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "exp-123",
          name: "llama2 × Chatbot Basic",
          status: "running",
        }),
      );
      expect(deepEvalMocks.savePreferences).toHaveBeenCalled();
      expect(deepEvalMocks.validateModel).not.toHaveBeenCalled();
      expect(deepEvalMocks.addLlmApiKey).not.toHaveBeenCalled();

      // The modal auto-closes after ~2s
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2100));
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it("uses a custom experiment name when provided", async () => {
      mockListDatasetsWith("chatbot", [DEFAULT_TEMPLATE_PATH]);
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });

      renderModal();
      await selectLocalModel();
      await goToDatasetStep();
      await waitFor(() =>
        expect(deepEvalMocks.readDataset).toHaveBeenCalledWith(DEFAULT_TEMPLATE_PATH),
      );
      await goToScorerStep();
      await selectLocalJudge();
      await goToMetricsStep();

      fireEvent.change(screen.getByLabelText("Experiment name"), {
        target: { value: "My custom run" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Start Experiment" }));

      await waitFor(() => expect(deepEvalMocks.createExperiment).toHaveBeenCalled());
      expect(deepEvalMocks.createExperiment.mock.calls[0][0].name).toBe("My custom run");
    });
  });
});
