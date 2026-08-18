import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../test/renderWithProviders";
import ModelEvaluationsTab from "./ModelEvaluationsTab";
import type { ModelEvaluation } from "../../../application/repository/modelEvaluations.repository";

const mockGetAllModelEvaluations = vi.fn();

vi.mock("../../../application/repository/modelEvaluations.repository", () => ({
  getAllModelEvaluations: () => mockGetAllModelEvaluations(),
}));

const passingExperiment: ModelEvaluation = {
  id: "exp-1",
  name: "Accuracy check",
  status: "completed",
  eval_type: "experiment",
  config: { thresholds: { accuracy: 0.8 } },
  results: { metric_results: { accuracy: { average: 0.95 } } },
  created_at: "2026-08-01T00:00:00Z",
  model_provider: "OpenAI",
  model_name: "GPT-4",
};

const failingExperiment: ModelEvaluation = {
  id: "exp-2",
  name: "Latency check",
  status: "completed",
  eval_type: "experiment",
  config: { thresholds: { accuracy: 0.9 } },
  results: { metric_results: { accuracy: { average: 0.5 } } },
  created_at: "2026-08-02T00:00:00Z",
};

const flaggedBiasAudit: ModelEvaluation = {
  id: "audit-1",
  name: "Gender bias audit",
  status: "completed",
  eval_type: "bias_audit",
  config: {},
  results: {
    categories: {
      gender: { groups: [{ flagged: true }, { flagged: false }] },
    },
  },
  created_at: "2026-08-03T00:00:00Z",
};

describe("ModelEvaluationsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a skeleton while loading", () => {
    mockGetAllModelEvaluations.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ModelEvaluationsTab />);
    expect(document.querySelector(".MuiSkeleton-root")).toBeTruthy();
  });

  it("shows an empty state when there are no evaluations", async () => {
    mockGetAllModelEvaluations.mockResolvedValue({ experiments: [], biasAudits: [] });
    renderWithProviders(<ModelEvaluationsTab />);

    await waitFor(() => {
      expect(screen.getByText("No evaluations linked to any model yet")).toBeInTheDocument();
    });
  });

  it("falls back to an empty response when the fetch fails", async () => {
    mockGetAllModelEvaluations.mockRejectedValue(new Error("network error"));
    renderWithProviders(<ModelEvaluationsTab />);

    await waitFor(() => {
      expect(screen.getByText("No evaluations linked to any model yet")).toBeInTheDocument();
    });
  });

  it("renders evaluations sorted newest first with model/provider columns", async () => {
    mockGetAllModelEvaluations.mockResolvedValue({
      experiments: [passingExperiment, failingExperiment],
      biasAudits: [],
    });
    renderWithProviders(<ModelEvaluationsTab />);

    await waitFor(() => {
      expect(screen.getByText("Latency check")).toBeInTheDocument();
    });

    const rows = screen.getAllByRole("row");
    // header + 2 data rows, newest (Latency check, 08-02) before Accuracy check (08-01)
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("Latency check");
    expect(rows[2]).toHaveTextContent("Accuracy check");
    expect(screen.getByText("OpenAI — GPT-4")).toBeInTheDocument();
  });

  it("flags an evaluation whose metric falls below its threshold", async () => {
    mockGetAllModelEvaluations.mockResolvedValue({
      experiments: [failingExperiment],
      biasAudits: [],
    });
    renderWithProviders(<ModelEvaluationsTab />);

    await waitFor(() => {
      expect(
        screen.getByText("1 evaluation flagged a potential risk. Consider adding this to the risk register."),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("accuracy: 0.50")).toBeInTheDocument();
  });

  it("flags a bias audit with a flagged group and pluralises the banner for multiple flags", async () => {
    mockGetAllModelEvaluations.mockResolvedValue({
      experiments: [failingExperiment],
      biasAudits: [flaggedBiasAudit],
    });
    renderWithProviders(<ModelEvaluationsTab />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "2 evaluations flagged a potential risk. Consider adding these to the risk register.",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("1/2 flagged")).toBeInTheDocument();
    expect(screen.getByText("Bias audit")).toBeInTheDocument();
  });

  it("shows an em dash for a bias audit key result with no flagged groups", async () => {
    mockGetAllModelEvaluations.mockResolvedValue({
      experiments: [],
      biasAudits: [
        {
          ...flaggedBiasAudit,
          results: { categories: { gender: { groups: [{ flagged: false }] } } },
        },
      ],
    });
    renderWithProviders(<ModelEvaluationsTab />);

    await waitFor(() => {
      expect(screen.getByText("1 groups passed")).toBeInTheDocument();
    });
  });
});
