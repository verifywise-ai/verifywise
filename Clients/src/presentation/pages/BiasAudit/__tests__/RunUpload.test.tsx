import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const { readHeaders, mutate, corpora } = vi.hoisted(() => ({
  readHeaders: vi.fn(),
  mutate: vi.fn(),
  corpora: { list: [] as unknown[] },
}));

vi.mock("../csvHeaders", () => ({ readCsvHeaders: readHeaders }));

vi.mock("../../../../application/hooks/useAedtBiasAudit", () => ({
  useCreateAedtRun: () => ({ mutate, reset: vi.fn(), isPending: false, error: null }),
  useAedtCorpora: () => ({ data: corpora.list, isLoading: false, error: null }),
  useAedtJobDescriptions: () => ({
    data: {
      generationAvailable: true,
      jobDescriptions: [
        { key: "commercial-ae", roleTitle: "Account Executive", body: "", expectedCriteria: [] },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

import RunUpload from "../RunUpload";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const csv = (name: string) => new File(["a,b\n1,2\n"], name, { type: "text/csv" });

function renderUpload(metric: "selection_rate" | "scoring_rate" | null = "selection_rate") {
  renderWithProviders(
    <RunUpload projectId={7} metric={metric} canEdit blockedReason={null} onCreated={vi.fn()} />,
  );
}

describe("RunUpload", () => {
  beforeEach(() => {
    readHeaders.mockReset();
    mutate.mockReset();
    corpora.list = [];
  });

  async function pickAndMapOutcome() {
    readHeaders.mockResolvedValueOnce(["gender", "outcome"]);
    fireEvent.change(screen.getByTestId("aedt-dataset-input"), {
      target: { files: [csv("d.csv")] },
    });
    await screen.findByText("d.csv");
    // MUI Select opens on mouse down; the outcome select is the last of the mapping selects.
    const selects = screen.getAllByRole("combobox");
    fireEvent.mouseDown(selects[selects.length - 1]);
    fireEvent.click(await screen.findByRole("option", { name: "outcome" }));
  }

  it("sends the job description tested with the run", async () => {
    renderUpload();
    await pickAndMapOutcome();
    fireEvent.change(screen.getByLabelText(/job description tested/i), {
      target: { value: "Account executive" },
    });
    fireEvent.click(screen.getByRole("button", { name: /calculate results/i }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        mapping: { selected: "outcome" },
        jobDescription: "Account executive",
      }),
      expect.anything(),
    );
  });

  it("withholds the run while the job description is over the server's limit", async () => {
    renderUpload();
    await pickAndMapOutcome();
    fireEvent.change(screen.getByLabelText(/job description tested/i), {
      target: { value: "x".repeat(65) },
    });
    expect(screen.getByText("Use at most 64 characters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /calculate results/i })).toBeDisabled();
  });

  it("withholds the run for a job description with no letter or digit, before any upload", async () => {
    renderUpload();
    await pickAndMapOutcome();
    fireEvent.change(screen.getByLabelText(/job description tested/i), {
      target: { value: "— ?!" },
    });
    expect(screen.getByText("Include at least one letter or digit.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /calculate results/i })).toBeDisabled();
  });

  it("keeps the later file when an earlier file's header read finishes last", async () => {
    const slow = deferred<string[]>();
    const fast = deferred<string[]>();
    readHeaders.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    renderUpload();
    const input = screen.getByTestId("aedt-dataset-input");

    fireEvent.change(input, { target: { files: [csv("first.csv")] } });
    fireEvent.change(input, { target: { files: [csv("second.csv")] } });
    await act(async () => fast.resolve(["sex", "race", "picked"]));
    await act(async () => slow.resolve(["old_col"]));

    expect(screen.getByText("second.csv")).toBeInTheDocument();
    expect(screen.queryByText("first.csv")).not.toBeInTheDocument();
  });

  it("states the rate the attested profile forces", () => {
    renderUpload("scoring_rate");
    expect(screen.getByText(/This run calculates scoring rates/)).toBeInTheDocument();
  });

  it("explains a missing rate and withholds the run", () => {
    renderUpload(null);
    expect(screen.getByText(/does not say who applies the cutoff/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose csv file/i })).toBeDisabled();
  });

  describe("a file scored from a generated corpus", () => {
    const complete = { id: 3, status: "complete", job_description_key: "commercial-ae" };

    async function chooseCorpusAndMap() {
      corpora.list = [complete, { id: 4, status: "running", job_description_key: "commercial-ae" }];
      renderUpload();
      fireEvent.mouseDown(
        screen.getByTestId("aedt-run-corpus").querySelector('[role="combobox"]')!,
      );
      fireEvent.click(
        await screen.findByRole("option", { name: "Scored test candidates (set 3)" }),
      );
      expect(screen.queryByRole("option", { name: /\(set 4\)/ })).toBeNull();
      readHeaders.mockResolvedValueOnce(["id", "outcome"]);
      fireEvent.change(screen.getByTestId("aedt-dataset-input"), {
        target: { files: [csv("scored.csv")] },
      });
      await screen.findByText("scored.csv");
    }

    it("maps only the candidate ID and the outcome, and shows the fixed job description", async () => {
      await chooseCorpusAndMap();
      expect(screen.getByLabelText(/candidate id column/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/^sex column/i)).toBeNull();
      expect(screen.queryByLabelText(/race or ethnicity column/i)).toBeNull();
      expect(screen.queryByLabelText(/job description tested/i)).toBeNull();
      expect(screen.getByTestId("aedt-run-corpus-job-description")).toHaveTextContent(
        "Job description: Account Executive (fixed)",
      );
    });

    it("sends the corpus id and the two mapped columns, and no job description", async () => {
      await chooseCorpusAndMap();
      const selects = screen.getAllByRole("combobox");
      fireEvent.mouseDown(selects[selects.length - 2]);
      fireEvent.click(await screen.findByRole("option", { name: "id" }));
      expect(screen.getByRole("button", { name: /calculate results/i })).toBeDisabled();
      fireEvent.mouseDown(selects[selects.length - 1]);
      fireEvent.click(await screen.findByRole("option", { name: "outcome" }));
      fireEvent.click(screen.getByRole("button", { name: /calculate results/i }));
      expect(mutate).toHaveBeenCalledWith(
        {
          file: expect.any(File),
          mapping: { candidate_id: "id", selected: "outcome" },
          jobDescription: "",
          corpusId: 3,
        },
        expect.anything(),
      );
    });

    it("offers no data source choice without a complete corpus", () => {
      corpora.list = [{ id: 4, status: "running", job_description_key: "commercial-ae" }];
      renderUpload();
      expect(screen.queryByTestId("aedt-run-corpus")).toBeNull();
    });
  });
});
