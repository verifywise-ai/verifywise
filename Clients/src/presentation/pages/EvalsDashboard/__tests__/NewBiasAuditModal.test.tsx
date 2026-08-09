// NOTE: deepEval.mocks MUST be the first import — it exports vi.hoisted
// handles, so Vitest requires it to be imported before any other module (its
// vi.mock registrations also need to run before the component module graph
// loads).
import { deepEvalMocks, installBrowserStubs, makeCsvFile, resetDeepEvalMocks } from "./deepEval.mocks";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import NewBiasAuditModal from "../NewBiasAuditModal";

// Query by full textContent — the StepperModal header renders
// `<span>Step</span> 1 <span>of</span> 4`, which getByText can't match.
function getByTextContent(text: string) {
  return screen.getByText(
    (_content: string, node: Element | null) => node !== null && node.textContent === text,
  );
}

function renderModal(
  props: Partial<Parameters<typeof NewBiasAuditModal>[0]> = {},
) {
  const onClose = vi.fn();
  const onAuditCreated = vi.fn();
  const utils = renderWithProviders(
    <NewBiasAuditModal isOpen onClose={onClose} orgId="org-1" onAuditCreated={onAuditCreated} {...props} />,
  );
  return { ...utils, onClose, onAuditCreated };
}

/** Click a preset card and wait for its full definition to be fetched. */
async function selectPreset(presetName: string) {
  fireEvent.click(await screen.findByText(presetName));
  await waitFor(() => expect(deepEvalMocks.getBiasAuditPreset).toHaveBeenCalled());
}

/** Click the footer Next button once it becomes enabled. */
async function clickNext() {
  const next = screen.getByRole("button", { name: "Next" });
  await waitFor(() => expect(next).toBeEnabled());
  fireEvent.click(next);
}

/** Walk the wizard to step 3 (demographic data) without uploading a CSV. */
async function reachStep3(opts: { presetName?: string; systemName?: string } = {}) {
  const { presetName = "NYC Local Law 144", systemName = "Hiring bot" } = opts;
  await selectPreset(presetName);
  await clickNext();

  await screen.findByText(/information/);
  fireEvent.change(screen.getByLabelText(/(AEDT|Tool|System) name/), {
    target: { value: systemName },
  });
  await clickNext();

  await screen.findByText("Upload applicant data");
}

/** Fire a CSV change event on the hidden upload input and wait for parsing. */
async function uploadCsv(content?: string, name = "applicants.csv") {
  fireEvent.change(document.getElementById("csv-upload-input") as HTMLInputElement, {
    target: { files: [makeCsvFile(content, name)] },
  });
  // The file name renders as soon as `csvFile` is set, but the FileReader
  // parses asynchronously — wait for the column-mapping section (headers)
  // before mapping columns.
  await screen.findByText(name);
  await screen.findByText("Column mapping");
}

/**
 * Open a Select: MUI listens for the pointer event on the `role="combobox"`
 * display div, which is a SIBLING of the hidden input that carries the id.
 * Find it via the shared `.MuiInputBase-root` wrapper.
 */
function openSelect(target: string | HTMLElement) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  if (!el) throw new Error(`Select not found: ${target}`);
  const combobox = el.closest(".MuiInputBase-root")?.querySelector('[role="combobox"]');
  fireEvent.mouseDown((combobox ?? el) as HTMLElement);
}

/** Open a Select and pick an option by its rendered menu-item text. */
function mapColumn(selectId: string, optionName: string) {
  openSelect(selectId);
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

/** Complete the wizard to step 4 (review & run) with a selection-rate CSV. */
async function reachStep4(opts: { csv?: string; csvName?: string } = {}) {
  const { csv, csvName = "applicants.csv" } = opts;
  await reachStep3();
  await uploadCsv(csv, csvName);
  mapColumn("mapping-gender", "gender");
  mapColumn("outcome-column", "outcome");
  await clickNext();
  await screen.findByRole("button", { name: "Run audit" });
}

function submitAudit() {
  fireEvent.click(screen.getByRole("button", { name: "Run audit" }));
}

describe("NewBiasAuditModal", () => {
  beforeEach(() => {
    installBrowserStubs();
    resetDeepEvalMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("mount & preset loading", () => {
    it("loads presets and model inventories on open", async () => {
      renderModal();

      await waitFor(() => expect(deepEvalMocks.listBiasAuditPresets).toHaveBeenCalled());
      expect(deepEvalMocks.getAllEntities).toHaveBeenCalledWith({ routeUrl: "/modelInventory" });
      expect(await screen.findByText("NYC Local Law 144")).toBeInTheDocument();
    });

    it("does not load presets when the modal is closed", () => {
      renderWithProviders(
        <NewBiasAuditModal isOpen={false} onClose={vi.fn()} orgId="org-1" onAuditCreated={vi.fn()} />,
      );

      expect(deepEvalMocks.listBiasAuditPresets).not.toHaveBeenCalled();
      expect(deepEvalMocks.getAllEntities).not.toHaveBeenCalled();
      expect(screen.queryByText("New bias audit")).not.toBeInTheDocument();
    });

    it("shows a spinner while presets load", async () => {
      deepEvalMocks.listBiasAuditPresets.mockReturnValue(new Promise(() => {}));
      renderModal();

      expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    });

    it("renders preset cards with mode chips, moving custom first", async () => {
      renderModal();

      expect(await screen.findByText("NYC Local Law 144")).toBeInTheDocument();
      expect(screen.getByText("Custom audit")).toBeInTheDocument();
      expect(screen.getByText("EEOC Guidelines")).toBeInTheDocument();
      expect(screen.getByText("Custom")).toBeInTheDocument();
      expect(screen.getByText("Quantitative")).toBeInTheDocument();
      expect(screen.getByText("Framework")).toBeInTheDocument();

      const custom = screen.getByText("Custom audit");
      const nyc = screen.getByText("NYC Local Law 144");
      expect(custom.compareDocumentPosition(nyc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("shows an error alert and keeps Next disabled when presets fail to load", async () => {
      deepEvalMocks.listBiasAuditPresets.mockRejectedValue(new Error("boom"));
      renderModal();

      expect(
        await screen.findByText("Failed to load compliance frameworks. Please try again."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });
  });

  describe("preset selection & step navigation", () => {
    it("fetches the full preset on selection and enables Next", async () => {
      renderModal();
      await selectPreset("NYC Local Law 144");
      await clickNext();
      expect(await screen.findByText("AEDT information")).toBeInTheDocument();
    });

    it("keeps Next disabled when the preset definition fails to load", async () => {
      deepEvalMocks.getBiasAuditPreset.mockRejectedValue(new Error("boom"));
      renderModal();
      await selectPreset("NYC Local Law 144");

      await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeDisabled());
    });

    it("uses AEDT naming for the NYC Local Law 144 preset", async () => {
      renderModal();
      await selectPreset("NYC Local Law 144");
      await clickNext();

      expect(await screen.findByText("AEDT information")).toBeInTheDocument();
      expect(screen.getByLabelText(/AEDT name/)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Tool name/)).not.toBeInTheDocument();
    });

    it("uses Tool naming for the EEOC preset", async () => {
      renderModal();
      await selectPreset("EEOC Guidelines");
      await clickNext();

      expect(await screen.findByText("AI hiring tool information")).toBeInTheDocument();
      expect(screen.getByLabelText(/Tool name/)).toBeInTheDocument();
      expect(screen.queryByLabelText(/System name/)).not.toBeInTheDocument();
    });

    it("uses System naming for a custom audit", async () => {
      renderModal();
      await selectPreset("Custom audit");
      await clickNext();

      expect(await screen.findByText("AI system information")).toBeInTheDocument();
      expect(screen.getByLabelText(/System name/)).toBeInTheDocument();
    });

    it("shows the current step indicator", async () => {
      renderModal();
      expect(getByTextContent("Step 1 of 4")).toBeInTheDocument();

      await selectPreset("NYC Local Law 144");
      await clickNext();
      await screen.findByText("AEDT information");
      expect(getByTextContent("Step 2 of 4")).toBeInTheDocument();
    });

    it("goes back to the previous step and cancels the modal", async () => {
      const { onClose } = renderModal();
      await selectPreset("NYC Local Law 144");
      await clickNext();
      await screen.findByText("AEDT information");

      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(await screen.findByText("Select a compliance framework")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onClose).toHaveBeenCalled();
    });

    it("closes via the header close button", async () => {
      const { onClose } = renderModal();

      const closeBox = document
        .querySelector("[role='button'] svg.lucide-x")
        ?.closest("[role='button']") as HTMLElement;
      fireEvent.click(closeBox);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("step 2 — system metadata", () => {
    it("requires a system name before advancing", async () => {
      renderModal();
      await selectPreset("NYC Local Law 144");
      await clickNext();
      await screen.findByText("AEDT information");

      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
      fireEvent.change(screen.getByLabelText(/AEDT name/), { target: { value: "Hiring bot" } });
      await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    });

    it("links a model inventory entry in the submitted config", async () => {
      deepEvalMocks.getAllEntities.mockResolvedValue({
        data: [{ id: 7, provider: "openai", model: "gpt-4o", version: "1.0", status: "active" }],
      });
      renderModal();
      await selectPreset("NYC Local Law 144");
      await clickNext();
      await screen.findByText("AEDT information");

      openSelect(screen.getByLabelText("Link to model inventory (optional)"));
      fireEvent.click(screen.getByRole("option", { name: "openai — gpt-4o (v1.0)" }));

      fireEvent.change(screen.getByLabelText(/AEDT name/), { target: { value: "Hiring bot" } });
      await clickNext();
      await screen.findByText("Upload applicant data");
      await uploadCsv();
      mapColumn("mapping-gender", "gender");
      mapColumn("outcome-column", "outcome");
      await clickNext();
      await screen.findByRole("button", { name: "Run audit" });

      submitAudit();
      await waitFor(() => expect(deepEvalMocks.runBiasAudit).toHaveBeenCalled());
      expect(deepEvalMocks.runBiasAudit.mock.calls[0][1]).toMatchObject({ modelInventoryId: 7 });
    });
  });

  describe("step 3 — CSV upload & column mapping", () => {
    it("uploads and parses a CSV, showing detected columns and a preview", async () => {
      renderModal();
      await reachStep3();
      await uploadCsv();

      expect(screen.getByText("applicants.csv")).toBeInTheDocument();
      expect(screen.getByText("3 columns detected")).toBeInTheDocument();
      expect(screen.getByText("Data preview")).toBeInTheDocument();
      expect(screen.getAllByText("female")).toHaveLength(2);
    });

    it("parses quoted CSV fields and escapes HTML in preview cells", async () => {
      renderModal();
      await reachStep3();
      await uploadCsv(
        '"full name",outcome\n"Doe, Jane","1"\n"Smith ""Sam""","a & b"',
        "quoted.csv",
      );

      expect(screen.getByText("2 columns detected")).toBeInTheDocument();
      expect(screen.getByText("full name")).toBeInTheDocument();
      expect(screen.getByText("Doe, Jane")).toBeInTheDocument();
      expect(screen.getByText('Smith &quot;Sam&quot;')).toBeInTheDocument();
      expect(screen.getByText("a &amp; b")).toBeInTheDocument();
    });

    it("rejects files larger than 50 MB", async () => {
      renderModal();
      await reachStep3();

      const big = new File([new ArrayBuffer(50 * 1024 * 1024 + 1)], "big.csv", {
        type: "text/csv",
      });
      fireEvent.change(document.getElementById("csv-upload-input") as HTMLInputElement, {
        target: { files: [big] },
      });

      expect(screen.getByText("Click to upload CSV file")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("clears the selected file when the FileReader errors", async () => {
      class FailingFileReader {
        onerror: (() => void) | null = null;
        onload: ((event: unknown) => void) | null = null;
        readAsText = () => {
          this.onerror?.();
        };
      }
      vi.stubGlobal("FileReader", FailingFileReader);

      renderModal();
      await reachStep3();
      fireEvent.change(document.getElementById("csv-upload-input") as HTMLInputElement, {
        target: { files: [makeCsvFile()] },
      });

      expect(await screen.findByText("Click to upload CSV file")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("does nothing when the file input change has no file", async () => {
      renderModal();
      await reachStep3();

      fireEvent.change(document.getElementById("csv-upload-input") as HTMLInputElement, {
        target: { files: [] },
      });

      expect(screen.getByText("Click to upload CSV file")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("blocks Next when a column is mapped to both a category and the outcome", async () => {
      renderModal();
      await reachStep3();
      await uploadCsv();

      mapColumn("mapping-gender", "outcome");
      mapColumn("outcome-column", "outcome");

      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("submits a scoring_rate audit with a score column", async () => {
      renderModal();
      await reachStep3();

      openSelect("metric-mode");
      fireEvent.click(
        screen.getByRole("option", { name: "Scoring rate (continuous score, LL144 compliant)" }),
      );
      await uploadCsv("gender,score\nfemale,0.8\nmale,0.6", "scores.csv");
      mapColumn("mapping-gender", "gender");
      mapColumn("score-column", "score");
      await clickNext();
      await screen.findByRole("button", { name: "Run audit" });

      submitAudit();
      await waitFor(() => expect(deepEvalMocks.runBiasAudit).toHaveBeenCalled());
      expect(deepEvalMocks.runBiasAudit.mock.calls[0][1]).toMatchObject({
        metric: "scoring_rate",
        scoreColumn: "score",
        outcomeColumn: "",
        columnMapping: { gender: "gender" },
      });
    });

    it("submits a fairness_metrics audit with prediction and ground truth columns", async () => {
      renderModal();
      await reachStep3();

      openSelect("metric-mode");
      fireEvent.click(
        screen.getByRole("option", { name: "Fairness metrics (prediction + ground truth)" }),
      );
      await uploadCsv("gender,prediction,ground_truth\nfemale,1,1\nmale,0,0", "fairness.csv");
      mapColumn("mapping-gender", "gender");
      mapColumn("prediction-column", "prediction");
      mapColumn("ground-truth-column", "ground_truth");
      await clickNext();
      await screen.findByRole("button", { name: "Run audit" });

      submitAudit();
      await waitFor(() => expect(deepEvalMocks.runBiasAudit).toHaveBeenCalled());
      expect(deepEvalMocks.runBiasAudit.mock.calls[0][1]).toMatchObject({
        metric: "fairness_metrics",
        predictionColumn: "prediction",
        groundTruthColumn: "ground_truth",
        outcomeColumn: "",
      });
    });
  });

  describe("step 4 — review & run", () => {
    it("shows a summary with preset, system name, dataset and categories", async () => {
      renderModal();
      await reachStep4();

      expect(screen.getByText("Framework")).toBeInTheDocument();
      expect(screen.getByText("NYC Local Law 144")).toBeInTheDocument();
      expect(screen.getByText("AEDT name")).toBeInTheDocument();
      expect(screen.getByText("Hiring bot")).toBeInTheDocument();
      expect(screen.getByText("Dataset")).toBeInTheDocument();
      expect(screen.getByText("applicants.csv")).toBeInTheDocument();
      expect(screen.getByText("Categories")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("submits a selection_rate audit and notifies the parent", async () => {
      const { onClose, onAuditCreated } = renderModal();
      await reachStep4();

      submitAudit();
      await waitFor(() => expect(deepEvalMocks.runBiasAudit).toHaveBeenCalledTimes(1));
      expect(deepEvalMocks.runBiasAudit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "applicants.csv" }),
        expect.objectContaining({
          presetId: "nyc_ll144",
          presetName: "NYC Local Law 144",
          mode: "quantitative_audit",
          metric: "selection_rate",
          orgId: "org-1",
          outcomeColumn: "outcome",
          columnMapping: { gender: "gender" },
          systemName: "Hiring bot",
          threshold: 0.8,
          smallSampleExclusion: 2,
          intersectional: { required: false, cross: ["gender"] },
        }),
      );
      await waitFor(() => expect(onAuditCreated).toHaveBeenCalledWith("audit-1"));
      expect(onClose).toHaveBeenCalled();

      expect(await screen.findByText("Bias audit started")).toBeInTheDocument();
      expect(screen.getByText(/now processing \(3 columns\)/)).toBeInTheDocument();
    });

    it("sends intersectional config when the checkbox is enabled", async () => {
      renderModal();
      await reachStep4();

      fireEvent.click(screen.getByLabelText(/Enable intersectional analysis/));
      submitAudit();

      await waitFor(() => expect(deepEvalMocks.runBiasAudit).toHaveBeenCalled());
      expect(deepEvalMocks.runBiasAudit.mock.calls[0][1]).toMatchObject({
        intersectional: { required: true, cross: ["gender"] },
      });
    });

    it("clamps threshold and small-sample values to valid ranges", async () => {
      renderModal();
      await reachStep4();

      const threshold = document.getElementById("threshold") as HTMLInputElement;
      fireEvent.change(threshold, { target: { value: "1.5" } });
      expect((document.getElementById("threshold") as HTMLInputElement).value).toBe("1");
      fireEvent.change(threshold, { target: { value: "-0.5" } });
      expect((document.getElementById("threshold") as HTMLInputElement).value).toBe("0");

      const small = document.getElementById("small-sample-exclusion") as HTMLInputElement;
      fireEvent.change(small, { target: { value: "150" } });
      expect((document.getElementById("small-sample-exclusion") as HTMLInputElement).value).toBe(
        "100",
      );
    });

    it("shows the backend detail when the audit fails to start", async () => {
      deepEvalMocks.runBiasAudit.mockRejectedValue({
        response: { data: { detail: "Rate limit exceeded" } },
      });
      const { onClose, onAuditCreated } = renderModal();
      await reachStep4();

      submitAudit();
      expect(await screen.findByText("Rate limit exceeded")).toBeInTheDocument();
      expect(onAuditCreated).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("shows a fallback message when the audit failure has no detail", async () => {
      deepEvalMocks.runBiasAudit.mockRejectedValue(new Error("boom"));
      renderModal();
      await reachStep4();

      submitAudit();
      expect(
        await screen.findByText("Failed to create audit. Please try again."),
      ).toBeInTheDocument();
    });
  });

  describe("reset on close", () => {
    it("resets all wizard state when closed and reopened", async () => {
      const onAuditCreated = vi.fn();
      function ReopenHarness() {
        const [open, setOpen] = useState(true);
        return (
          <>
            <button onClick={() => setOpen(true)}>open</button>
            <NewBiasAuditModal
              isOpen={open}
              onClose={() => setOpen(false)}
              orgId="org-1"
              onAuditCreated={onAuditCreated}
            />
          </>
        );
      }
      renderWithProviders(<ReopenHarness />);

      await reachStep3();
      await uploadCsv();
      expect(screen.getByText("applicants.csv")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("New bias audit")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "open" }));
      expect(await screen.findByText("Select a compliance framework")).toBeInTheDocument();
      expect(screen.queryByText("applicants.csv")).not.toBeInTheDocument();
    });
  });
});
