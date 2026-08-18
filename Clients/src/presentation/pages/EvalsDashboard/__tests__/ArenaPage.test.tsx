// NOTE: deepEval.mocks MUST be the first import — it exports vi.hoisted
// handles, so Vitest requires it to be imported before any other module (its
// vi.mock registrations also need to run before the component module graph
// loads).
import {
  deepEvalMocks,
  installBrowserStubs,
  resetDeepEvalMocks,
  mockArenaComparisons,
} from "./deepEval.mocks";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ArenaPage from "../ArenaPage";

// ── Module mocks ─────────────────────────────────────────────────────────────
// PageHeader has a named export; HelperIcon needs the UserGuide sidebar
// provider and TipBox fetches tips — all shared chrome, not coverage targets.
vi.mock("../../../components/Layout/PageHeader", () => ({
  PageHeader: ({ title, description }: any) => (
    <div data-testid="page-header">
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
}));
vi.mock("../../../components/HelperIcon", () => ({
  default: () => <div data-testid="helper-icon" />,
}));
vi.mock("../../../components/TipBox", () => ({
  default: () => <div data-testid="tip-box" />,
}));
vi.mock("../../../components/VWTooltip", () => ({
  default: ({ children }: any) => <span data-testid="vw-tooltip">{children}</span>,
}));

// ArenaTable is a shared table component (not a coverage target). A stub lets
// the suite drive ArenaPage's own row-action handlers (row click, view,
// download, copy, delete) and assert the filtered rows passed down.
vi.mock("../../../components/Table/ArenaTable", () => ({
  default: ({ rows, loading, onRowClick, onViewResults, onDownload, onCopy, onDelete }: any) => (
    <div data-testid="arena-table">
      {loading ? (
        <span>Loading battles...</span>
      ) : (
        rows.map((row: any) => (
          <div key={row.id} data-testid={`arena-row-${row.id}`}>
            <span data-testid={`arena-name-${row.id}`}>{row.name}</span>
            <button onClick={() => onRowClick?.(row)}>row-click-{row.id}</button>
            <button onClick={() => onViewResults?.(row)}>view-{row.id}</button>
            <button onClick={() => onDownload?.(row)}>download-{row.id}</button>
            <button onClick={() => onCopy?.(row)}>copy-{row.id}</button>
            <button onClick={() => onDelete?.(row)}>delete-{row.id}</button>
          </div>
        ))
      )}
    </div>
  ),
}));

// ArenaResultsPage has its own suite; expose comparisonId/onBack so the
// view-results and back-reloads paths are reachable.
vi.mock("../ArenaResultsPage", () => ({
  default: ({ comparisonId, onBack }: any) => (
    <div data-testid="arena-results-page">
      <span data-testid="results-comparison-id">{comparisonId}</span>
      <button onClick={onBack}>back-to-arena</button>
    </div>
  ),
}));

// StepperModal is shared chrome. The stub preserves the wizard semantics that
// ArenaPage relies on: children render only when open, the action button is
// disabled when canProceed/isSubmitting is false, the last step submits while
// earlier steps call onNext, and Back/Cancel drive the matching callbacks.
vi.mock("../../../components/Modals/StepperModal", () => ({
  default: ({
    isOpen,
    onClose,
    title,
    steps,
    activeStep,
    onNext,
    onBack,
    onSubmit,
    submitButtonText,
    isSubmitting,
    canProceed,
    children,
  }: any) =>
    isOpen ? (
      <div data-testid="stepper-modal">
        <div>{title}</div>
        <div data-testid="stepper-step">
          {activeStep + 1} of {steps.length}
        </div>
        <div>{children}</div>
        <button onClick={onClose}>Cancel</button>
        {activeStep > 0 && onBack && <button onClick={onBack}>Back</button>}
        <button
          disabled={!canProceed || isSubmitting}
          onClick={activeStep === steps.length - 1 ? onSubmit : onNext}
        >
          {activeStep === steps.length - 1 ? submitButtonText : "Next"}
        </button>
      </div>
    ) : null,
}));

// ModelSelector is a shared input (has its own suite). The stub exposes the
// provider/model props and buttons to drive onProviderChange/onModelChange so
// the judge and per-contestant selectors stay controllable in tests.
vi.mock("../../../components/Inputs/ModelSelector", () => ({
  default: ({ provider, model, onProviderChange, onModelChange, label }: any) => (
    <div
      data-testid={label === "Judge model" ? "judge-model-selector" : "contestant-model-selector"}
    >
      <span data-testid="model-provider">{provider}</span>
      <span data-testid="model-value">{model}</span>
      <button onClick={() => onProviderChange("anthropic")}>set-provider-anthropic</button>
      <button onClick={() => onModelChange("claude-sonnet-4")}>set-model-claude-sonnet-4</button>
      <button onClick={() => onModelChange("gpt-4o")}>set-model-gpt-4o</button>
    </div>
  ),
}));

// GroupedSelect is a shared MUI-based input. The stub renders one button per
// group item so tests can pick a dataset and observe the groups passed down.
vi.mock("../../../components/Inputs/Select/GroupedSelect", () => ({
  default: ({ id, onChange, groups, loading }: any) => (
    <div data-testid="grouped-select" id={id}>
      {loading ? (
        <span>Loading datasets...</span>
      ) : (
        groups?.map((g: any) => (
          <div key={g.label}>
            <span>{g.label}</span>
            {g.items.map((item: any) => (
              <button key={item.value} onClick={() => onChange(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  ),
}));

// Checkbox is a shared MUI-based input; the stub surfaces the checked state so
// criteria toggling stays observable. (Toggling is driven by the wrapping Box
// in ArenaPage, not by the checkbox itself.)
vi.mock("../../../components/Inputs/Checkbox", () => ({
  default: ({ isChecked, value, onClick }: any) => (
    <div data-testid={`checkbox-${value}`} data-checked={isChecked} onClick={onClick} />
  ),
}));

// ── Helpers & fixtures ──────────────────────────────────────────────────────

function mockComparisons(comparisons: typeof mockArenaComparisons) {
  deepEvalMocks.listArenaComparisons.mockResolvedValue({ comparisons });
}

function renderArena(props: Partial<Parameters<typeof ArenaPage>[0]> = {}) {
  return renderWithProviders(<ArenaPage {...props} />);
}

async function openCreateModal() {
  fireEvent.click(await screen.findByRole("button", { name: "New battle" }));
  await screen.findByTestId("stepper-modal");
}

async function goToContestantsStep(name = "My battle") {
  await openCreateModal();
  fireEvent.change(screen.getByLabelText(/Battle name/), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

const mockMyDataset = {
  id: 1,
  name: "Chatbot dataset",
  path: "datasets/chatbot.json",
  promptCount: 5,
  datasetType: "chatbot",
  createdAt: "2025-01-01T00:00:00Z",
};

function mockDatasets() {
  deepEvalMocks.listMyDatasets.mockResolvedValue({ datasets: [mockMyDataset] });
  deepEvalMocks.listDatasets.mockResolvedValue({
    chatbot: [
      { key: "t1", name: "Template bot", path: "templates/template.json", use_case: "chatbot" },
    ],
  });
}

describe("ArenaPage", () => {
  beforeEach(() => {
    installBrowserStubs();
    resetDeepEvalMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    (console.error as unknown as { mockRestore: () => void }).mockRestore?.();
    if (Object.prototype.hasOwnProperty.call(navigator, "clipboard")) {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  describe("data loading & table rendering", () => {
    it("loads comparisons, datasets and configured providers on mount", async () => {
      mockComparisons(mockArenaComparisons);
      mockDatasets();
      deepEvalMocks.getAllLlmApiKeys.mockResolvedValue([
        { id: 1, provider: "openai", apiKey: "sk-test" },
      ]);
      renderArena();

      expect(await screen.findByTestId("arena-row-battle-1")).toBeInTheDocument();
      expect(screen.getByTestId("arena-name-battle-1")).toHaveTextContent("GPT-4 vs Claude");
      expect(screen.getByTestId("arena-name-battle-2")).toHaveTextContent("Running battle");
      expect(screen.getByTestId("page-header")).toHaveTextContent("LLM Arena");

      await waitFor(() => expect(deepEvalMocks.listMyDatasets).toHaveBeenCalled());
      await waitFor(() => expect(deepEvalMocks.listDatasets).toHaveBeenCalled());
      expect(deepEvalMocks.getAllLlmApiKeys).toHaveBeenCalled();
    });

    it("passes org_id to listArenaComparisons when orgId is provided", async () => {
      renderArena({ orgId: "org-1" });
      await waitFor(() =>
        expect(deepEvalMocks.listArenaComparisons).toHaveBeenCalledWith({ org_id: "org-1" }),
      );
    });

    it("calls listArenaComparisons without arguments when orgId is absent", async () => {
      renderArena();
      await waitFor(() =>
        expect(deepEvalMocks.listArenaComparisons).toHaveBeenCalledWith(undefined),
      );
    });

    it("shows a loading spinner while the initial fetch is pending", async () => {
      let resolveFetch: (value: { comparisons: unknown[] }) => void = () => {};
      deepEvalMocks.listArenaComparisons.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      );
      renderArena();

      expect(screen.getByRole("progressbar")).toBeInTheDocument();

      await act(async () => {
        resolveFetch({ comparisons: [] });
      });
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("shows the empty state when there are no battles", async () => {
      renderArena();

      expect(await screen.findByText("No battles yet")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New battle" })).toBeInTheDocument();
    });
  });

  describe("search & filter", () => {
    it("filters rows by search across battle names and contestants", async () => {
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      const search = screen.getByPlaceholderText("Search battles...");
      fireEvent.change(search, { target: { value: "claude" } });
      expect(screen.getByTestId("arena-row-battle-1")).toBeInTheDocument();
      expect(screen.queryByTestId("arena-row-battle-2")).not.toBeInTheDocument();

      fireEvent.change(search, { target: { value: "gemini" } });
      expect(screen.getByTestId("arena-row-battle-2")).toBeInTheDocument();
      expect(screen.queryByTestId("arena-row-battle-1")).not.toBeInTheDocument();

      fireEvent.change(search, { target: { value: "zzz" } });
      expect(screen.queryByTestId("arena-row-battle-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("arena-row-battle-2")).not.toBeInTheDocument();
    });

    it("filters rows by status through the Filter popover", async () => {
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByRole("button", { name: /Filter/ }));
      const popover = document.querySelector(".MuiPopover-paper") as HTMLElement;

      // Default column is "status" (select type): column + operator + value
      // all render as comboboxes.
      expect(within(popover).getAllByRole("combobox")).toHaveLength(3);

      const comboboxes = within(popover).getAllByRole("combobox");
      fireEvent.mouseDown(comboboxes[2]);
      fireEvent.click(screen.getByRole("option", { name: "Completed" }));

      await waitFor(() => expect(screen.getByTestId("arena-row-battle-1")).toBeInTheDocument());
      expect(screen.queryByTestId("arena-row-battle-2")).not.toBeInTheDocument();
    });

    it("filters by battle name using the contains operator", async () => {
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByRole("button", { name: /Filter/ }));
      const popover = document.querySelector(".MuiPopover-paper") as HTMLElement;

      let comboboxes = within(popover).getAllByRole("combobox");
      fireEvent.mouseDown(comboboxes[0]);
      fireEvent.click(screen.getByRole("option", { name: "Battle Name" }));

      comboboxes = within(popover).getAllByRole("combobox");
      fireEvent.mouseDown(comboboxes[1]);
      fireEvent.click(screen.getByRole("option", { name: "contains" }));

      fireEvent.change(within(popover).getByPlaceholderText("Enter text here..."), {
        target: { value: "claude" },
      });

      await waitFor(() => expect(screen.getByTestId("arena-row-battle-1")).toBeInTheDocument());
      expect(screen.queryByTestId("arena-row-battle-2")).not.toBeInTheDocument();
    });

    it("combines multiple filters with OR logic", async () => {
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByRole("button", { name: /Filter/ }));
      let popover = document.querySelector(".MuiPopover-paper") as HTMLElement;

      // condition 1: status is Completed → matches battle-1
      let comboboxes = within(popover).getAllByRole("combobox");
      fireEvent.mouseDown(comboboxes[2]);
      fireEvent.click(screen.getByRole("option", { name: "Completed" }));

      // add a second row and switch the logic to OR
      fireEvent.click(within(popover).getByText("Add filter"));
      fireEvent.click(within(popover).getByText("OR"));

      // condition 2: battle name is "Running battle" → matches battle-2
      popover = document.querySelector(".MuiPopover-paper") as HTMLElement;
      const allComboboxes = within(popover).getAllByRole("combobox");
      fireEvent.mouseDown(allComboboxes[3]);
      fireEvent.click(screen.getByRole("option", { name: "Battle Name" }));
      fireEvent.change(within(popover).getByPlaceholderText("Enter text here..."), {
        target: { value: "Running battle" },
      });

      await waitFor(() => expect(screen.getByTestId("arena-row-battle-2")).toBeInTheDocument());
      expect(screen.getByTestId("arena-row-battle-1")).toBeInTheDocument();
    });

    it("handles group selection without errors", async () => {
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByRole("button", { name: /Group/ }));
      const popover = document.querySelector(".MuiPopover-paper") as HTMLElement;
      fireEvent.mouseDown(within(popover).getByRole("combobox"));
      fireEvent.click(screen.getByRole("option", { name: "Status" }));

      expect(screen.getByTestId("arena-row-battle-1")).toBeInTheDocument();
    });
  });

  describe("row actions", () => {
    it("navigates to the results page when a completed row is clicked", async () => {
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByText("row-click-battle-1"));

      expect(screen.getByTestId("arena-results-page")).toBeInTheDocument();
      expect(screen.getByTestId("results-comparison-id")).toHaveTextContent("battle-1");
    });

    it("does not navigate when a running row is clicked", async () => {
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-2");

      fireEvent.click(screen.getByText("row-click-battle-2"));

      expect(screen.queryByTestId("arena-results-page")).not.toBeInTheDocument();
      expect(screen.getByTestId("arena-table")).toBeInTheDocument();
    });

    it("opens results via the view action and reloads the list when going back", async () => {
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByText("view-battle-1"));
      expect(screen.getByTestId("arena-results-page")).toBeInTheDocument();

      fireEvent.click(screen.getByText("back-to-arena"));

      await waitFor(() => expect(screen.getByTestId("arena-table")).toBeInTheDocument());
      await waitFor(() => expect(deepEvalMocks.listArenaComparisons).toHaveBeenCalledTimes(2));
    });

    it("downloads battle results as JSON", async () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByText("download-battle-1"));

      await waitFor(() =>
        expect(deepEvalMocks.getArenaComparisonResults).toHaveBeenCalledWith("battle-1"),
      );
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalled();
      expect(await screen.findByText("Battle results downloaded")).toBeInTheDocument();
      clickSpy.mockRestore();
    });

    it("shows an error alert when the download fails", async () => {
      deepEvalMocks.getArenaComparisonResults.mockRejectedValue(new Error("boom"));
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByText("download-battle-1"));

      expect(await screen.findByText("Failed to download results")).toBeInTheDocument();
    });

    it("copies battle results to the clipboard", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByText("copy-battle-1"));

      await waitFor(() =>
        expect(deepEvalMocks.getArenaComparisonResults).toHaveBeenCalledWith("battle-1"),
      );
      await waitFor(() => expect(writeText).toHaveBeenCalled());
      expect(writeText.mock.calls[0][0]).toContain('"gpt-4o": 8');
      expect(await screen.findByText("Results copied to clipboard")).toBeInTheDocument();
    });

    it("shows an error alert when copying fails", async () => {
      const writeText = vi.fn().mockRejectedValue(new Error("boom"));
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByText("copy-battle-1"));

      expect(await screen.findByText("Failed to copy results")).toBeInTheDocument();
    });

    it("deletes a comparison and reloads the list", async () => {
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByText("delete-battle-1"));

      await waitFor(() =>
        expect(deepEvalMocks.deleteArenaComparison).toHaveBeenCalledWith("battle-1"),
      );
      expect(await screen.findByText("Arena comparison deleted")).toBeInTheDocument();
      await waitFor(() => expect(deepEvalMocks.listArenaComparisons).toHaveBeenCalledTimes(2));
    });

    it("shows an error alert when deleting fails", async () => {
      deepEvalMocks.deleteArenaComparison.mockRejectedValue(new Error("boom"));
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByText("delete-battle-1"));

      expect(await screen.findByText("Failed to delete comparison")).toBeInTheDocument();
    });

    it("auto-dismisses success alerts after three seconds", async () => {
      mockComparisons([mockArenaComparisons[0]]);
      vi.useFakeTimers();
      try {
        renderArena();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });

        fireEvent.click(screen.getByText("delete-battle-1"));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByText("Arena comparison deleted")).toBeInTheDocument();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });
        expect(screen.queryByText("Arena comparison deleted")).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("create battle wizard — settings step", () => {
    it("opens the create modal from the empty state and renders the settings step", async () => {
      mockDatasets();
      renderArena();

      await openCreateModal();

      expect(screen.getByText("Create arena battle")).toBeInTheDocument();
      expect(screen.getByTestId("stepper-step")).toHaveTextContent("1 of 2");
      expect(screen.getByLabelText(/Battle name/)).toBeInTheDocument();
      expect(screen.getByTestId("judge-model-selector")).toBeInTheDocument();
      expect(screen.getByTestId("grouped-select")).toBeInTheDocument();

      // default judge: openai / gpt-4o
      expect(
        within(screen.getByTestId("judge-model-selector")).getByTestId("model-provider"),
      ).toHaveTextContent("openai");
      expect(
        within(screen.getByTestId("judge-model-selector")).getByTestId("model-value"),
      ).toHaveTextContent("gpt-4o");

      // criteria defaults
      expect(screen.getByTestId("checkbox-helpfulness")).toHaveAttribute("data-checked", "true");
      expect(screen.getByTestId("checkbox-accuracy")).toHaveAttribute("data-checked", "true");

      // datasets groups render from the mocked data
      expect(screen.getByText("My datasets")).toBeInTheDocument();
      expect(screen.getByText("Template datasets")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Chatbot dataset" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Template bot" })).toBeInTheDocument();
    });

    it("opens the create modal from the populated toolbar", async () => {
      mockComparisons(mockArenaComparisons);
      renderArena();
      await screen.findByTestId("arena-row-battle-1");

      fireEvent.click(screen.getByRole("button", { name: "New battle" }));

      expect(screen.getByTestId("stepper-modal")).toBeInTheDocument();
    });

    it("resets the judge model when the judge provider changes", async () => {
      mockDatasets();
      renderArena();
      await openCreateModal();

      fireEvent.click(
        within(screen.getByTestId("judge-model-selector")).getByText("set-model-claude-sonnet-4"),
      );
      expect(
        within(screen.getByTestId("judge-model-selector")).getByTestId("model-value"),
      ).toHaveTextContent("claude-sonnet-4");

      fireEvent.click(
        within(screen.getByTestId("judge-model-selector")).getByText("set-provider-anthropic"),
      );

      expect(
        within(screen.getByTestId("judge-model-selector")).getByTestId("model-provider"),
      ).toHaveTextContent("anthropic");
      expect(
        within(screen.getByTestId("judge-model-selector")).getByTestId("model-value"),
      ).toHaveTextContent("");
    });

    it("disables Next until a battle name is provided", async () => {
      renderArena();
      await openCreateModal();

      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/Battle name/), { target: { value: "My battle" } });
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

      fireEvent.change(screen.getByLabelText(/Battle name/), { target: { value: "" } });
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("toggles criteria and shows an error when none are selected", async () => {
      renderArena();
      await openCreateModal();

      fireEvent.click(screen.getByText("Coherence"));
      expect(screen.getByTestId("checkbox-coherence")).toHaveAttribute("data-checked", "true");

      fireEvent.click(screen.getByText("Helpfulness"));
      expect(screen.getByTestId("checkbox-helpfulness")).toHaveAttribute("data-checked", "false");

      // remove the two remaining selected criteria, then toggle every other
      // criterion twice so nothing stays selected
      fireEvent.click(screen.getByText("Accuracy"));
      fireEvent.click(screen.getByText("Coherence"));
      ["Conciseness", "Relevance", "Safety", "Creativity", "Instruction Following"].forEach(
        (name) => {
          fireEvent.click(screen.getByText(name));
          fireEvent.click(screen.getByText(name));
        },
      );

      expect(
        screen.getByText("Please select at least one evaluation criterion"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("closing the modal resets the form", async () => {
      renderArena();
      await openCreateModal();

      fireEvent.change(screen.getByLabelText(/Battle name/), { target: { value: "My battle" } });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByTestId("stepper-modal")).not.toBeInTheDocument();

      await openCreateModal();
      expect(screen.getByLabelText(/Battle name/)).toHaveValue("");
    });
  });

  describe("create battle wizard — contestants step", () => {
    it("moves to the contestants step and adds and removes players", async () => {
      renderArena();
      await goToContestantsStep();

      expect(screen.getByTestId("stepper-step")).toHaveTextContent("2 of 2");
      expect(screen.getByText("2 players")).toBeInTheDocument();
      // with exactly two contestants there is no remove button
      expect(
        screen.getAllByRole("button").filter((b) => b.querySelector(".lucide-x")),
      ).toHaveLength(0);

      fireEvent.click(screen.getByRole("button", { name: "Add player" }));
      expect(screen.getByText("3 players")).toBeInTheDocument();

      const removeButtons = screen
        .getAllByRole("button")
        .filter((b) => b.querySelector(".lucide-x"));
      expect(removeButtons).toHaveLength(3);
      fireEvent.click(removeButtons[0]);
      expect(screen.getByText("2 players")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByTestId("stepper-step")).toHaveTextContent("1 of 2");
    });

    it("resets the model and name when a contestant provider changes", async () => {
      renderArena();
      await goToContestantsStep();

      let selectors = screen.getAllByTestId("contestant-model-selector");
      fireEvent.click(within(selectors[0]).getByText("set-model-gpt-4o"));

      expect(screen.getByText("Gpt-4o")).toBeInTheDocument();

      fireEvent.click(within(selectors[0]).getByText("set-provider-anthropic"));

      expect(screen.getByText("Contestant 1")).toBeInTheDocument();
      selectors = screen.getAllByTestId("contestant-model-selector");
      expect(within(selectors[0]).getByTestId("model-value")).toHaveTextContent("");
    });

    it("formats contestant names from the selected model", async () => {
      renderArena();
      await goToContestantsStep();

      const selectors = screen.getAllByTestId("contestant-model-selector");
      fireEvent.click(within(selectors[0]).getByText("set-model-gpt-4o"));
      fireEvent.click(within(selectors[1]).getByText("set-model-claude-sonnet-4"));

      expect(screen.getByText("Gpt-4o")).toBeInTheDocument();
      expect(screen.getByText("Claude-Sonnet-4")).toBeInTheDocument();
    });

    it("keeps Start battle disabled until every contestant has a model", async () => {
      renderArena();
      await goToContestantsStep();

      expect(screen.getByRole("button", { name: "Start battle" })).toBeDisabled();

      let selectors = screen.getAllByTestId("contestant-model-selector");
      fireEvent.click(within(selectors[0]).getByText("set-model-gpt-4o"));
      expect(screen.getByRole("button", { name: "Start battle" })).toBeDisabled();

      selectors = screen.getAllByTestId("contestant-model-selector");
      fireEvent.click(within(selectors[1]).getByText("set-model-claude-sonnet-4"));
      expect(screen.getByRole("button", { name: "Start battle" })).toBeEnabled();
    });
  });

  describe("create battle wizard — submission", () => {
    it("creates a comparison with the selected dataset, models and default criteria", async () => {
      mockDatasets();
      renderArena();
      await openCreateModal();

      fireEvent.change(screen.getByLabelText(/Battle name/), { target: { value: "My battle" } });
      fireEvent.click(screen.getByRole("button", { name: "Chatbot dataset" }));
      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      const selectors = screen.getAllByTestId("contestant-model-selector");
      fireEvent.click(within(selectors[0]).getByText("set-model-gpt-4o"));
      fireEvent.click(within(selectors[1]).getByText("set-model-claude-sonnet-4"));

      fireEvent.click(screen.getByRole("button", { name: "Start battle" }));

      await waitFor(() => expect(deepEvalMocks.createArenaComparison).toHaveBeenCalledTimes(1));
      const payload = deepEvalMocks.createArenaComparison.mock.calls[0][0];
      expect(payload.name).toBe("My battle");
      expect(payload.orgId).toBeUndefined();
      expect(payload.datasetPath).toBe("datasets/chatbot.json");
      expect(payload.metric.name).toBe("Helpfulness, Accuracy");
      expect(payload.metric.evaluationParams).toEqual(["input", "actual_output"]);
      expect(payload.metric.criteria).toContain(
        "Evaluate the responses based on the following criteria:",
      );
      expect(payload.metric.criteria).toContain("**Helpfulness**:");
      expect(payload.metric.criteria).toContain("**Accuracy**:");
      expect(payload.judgeModel).toBe("gpt-4o");
      expect(payload.judgeProvider).toBe("openai");
      expect(payload.contestants).toHaveLength(2);
      expect(payload.contestants[0].hyperparameters.model).toBe("gpt-4o");
      expect(payload.contestants[1].hyperparameters.model).toBe("claude-sonnet-4");

      expect(await screen.findByText("Arena battle started!")).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByTestId("stepper-modal")).not.toBeInTheDocument());

      // silent reload happens after creation
      await waitFor(() =>
        expect(deepEvalMocks.listArenaComparisons.mock.calls.length).toBeGreaterThanOrEqual(2),
      );

      // reopening shows a reset form
      fireEvent.click(screen.getByRole("button", { name: "New battle" }));
      expect(screen.getByLabelText(/Battle name/)).toHaveValue("");
    });

    it("builds the metric from custom criteria selection", async () => {
      renderArena();
      await goToContestantsStep();

      // reopen the modal was not needed; step already on contestants, so cancel
      // and redo the settings with custom criteria.
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      fireEvent.click(screen.getByText("Accuracy"));
      fireEvent.click(screen.getByText("Coherence"));
      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      const selectors = screen.getAllByTestId("contestant-model-selector");
      fireEvent.click(within(selectors[0]).getByText("set-model-gpt-4o"));
      fireEvent.click(within(selectors[1]).getByText("set-model-claude-sonnet-4"));

      fireEvent.click(screen.getByRole("button", { name: "Start battle" }));

      await waitFor(() => expect(deepEvalMocks.createArenaComparison).toHaveBeenCalledTimes(1));
      const payload = deepEvalMocks.createArenaComparison.mock.calls[0][0];
      expect(payload.metric.name).toBe("Helpfulness, Coherence");
      expect(payload.metric.criteria).toContain("**Helpfulness**:");
      expect(payload.metric.criteria).toContain("**Coherence**:");
      expect(payload.metric.criteria).not.toContain("**Accuracy**:");
    });

    it("passes orgId through to createArenaComparison", async () => {
      mockDatasets();
      renderArena({ orgId: "org-1" });
      await openCreateModal();

      fireEvent.change(screen.getByLabelText(/Battle name/), { target: { value: "My battle" } });
      fireEvent.click(screen.getByRole("button", { name: "Chatbot dataset" }));
      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      const selectors = screen.getAllByTestId("contestant-model-selector");
      fireEvent.click(within(selectors[0]).getByText("set-model-gpt-4o"));
      fireEvent.click(within(selectors[1]).getByText("set-model-claude-sonnet-4"));
      fireEvent.click(screen.getByRole("button", { name: "Start battle" }));

      await waitFor(() => expect(deepEvalMocks.createArenaComparison).toHaveBeenCalledTimes(1));
      expect(deepEvalMocks.createArenaComparison.mock.calls[0][0].orgId).toBe("org-1");
    });

    it("shows an error alert and keeps the modal open when creation fails", async () => {
      deepEvalMocks.createArenaComparison.mockRejectedValue(new Error("boom"));
      renderArena();
      await goToContestantsStep();

      const selectors = screen.getAllByTestId("contestant-model-selector");
      fireEvent.click(within(selectors[0]).getByText("set-model-gpt-4o"));
      fireEvent.click(within(selectors[1]).getByText("set-model-claude-sonnet-4"));

      fireEvent.click(screen.getByRole("button", { name: "Start battle" }));

      expect(await screen.findByText("Failed to create arena comparison")).toBeInTheDocument();
      expect(screen.getByTestId("stepper-modal")).toBeInTheDocument();
      expect(deepEvalMocks.createArenaComparison).toHaveBeenCalledTimes(1);
    });
  });

  describe("polling", () => {
    it("polls running comparisons every five seconds", async () => {
      mockComparisons([mockArenaComparisons[1]]);
      vi.useFakeTimers();
      try {
        renderArena();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByTestId("arena-row-battle-2")).toBeInTheDocument();
        expect(deepEvalMocks.listArenaComparisons).toHaveBeenCalledTimes(1);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(deepEvalMocks.listArenaComparisons).toHaveBeenCalledTimes(2);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(deepEvalMocks.listArenaComparisons).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it("stops polling once no comparisons are running", async () => {
      mockComparisons([mockArenaComparisons[1]]);
      vi.useFakeTimers();
      try {
        renderArena();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(deepEvalMocks.listArenaComparisons).toHaveBeenCalledTimes(1);

        mockComparisons([mockArenaComparisons[0]]);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(deepEvalMocks.listArenaComparisons).toHaveBeenCalledTimes(2);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(deepEvalMocks.listArenaComparisons).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
