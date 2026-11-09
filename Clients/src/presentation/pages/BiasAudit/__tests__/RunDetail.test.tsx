import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RunDetail from "../RunDetail";

const hooks = vi.hoisted(() => ({
  useAedtRun: vi.fn(),
  useConfirmAedtDerivedBasis: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useGenerateAedtRunStance: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
}));

vi.mock("../../../../application/hooks/useAedtBiasAudit", () => hooks);
vi.mock("../EducationPanel", () => ({ default: () => null }));
vi.mock("../StancePanel", () => ({ default: () => null }));
vi.mock("../PersonLabel", () => ({ default: () => null }));

const table = (noComparison: string | null) => ({
  title: "Sex",
  categoryKey: "sex",
  rows: [
    {
      categoryType: "sex",
      categoryName: "Male",
      applicantCount: 985,
      selectedCount: 100,
      selectionRate: 0.1,
      impactRatio: null,
      excluded: false,
      flagged: false,
    },
  ],
  highestGroup: null,
  highestRate: null,
  noComparison,
});

const renderRun = (noComparison: string | null) => {
  hooks.useAedtRun.mockReturnValue({
    isLoading: false,
    error: null,
    data: {
      mayExportPdf: true,
      stances: [],
      run: {
        id: 1,
        metric: "selection_rate",
        profile_version: 1,
        created_at: "2026-11-09T10:00:00.000Z",
        gate_findings_json: [],
        result_json: {
          metric: "selection_rate",
          tables: [table(noComparison)],
          totalApplicants: 1000,
          unknownCount: 0,
          overallMedian: null,
        },
      },
    },
  });
  renderWithProviders(<RunDetail runId={1} canEdit canAttest onBack={vi.fn()} />);
};

describe("RunDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says why a table has no comparison, and does not read as a clean result", () => {
    renderRun("single_group");

    expect(screen.getByTestId("no-comparison-sex").textContent).toContain(
      "only one group is left in the calculation",
    );
    expect(screen.getByTestId("aedt-run-no-comparison")).toBeTruthy();
    expect(screen.queryByText("The data checks raised nothing for this run.")).toBeNull();
  });

  it("keeps the clean message when every table has a comparison", () => {
    renderRun(null);

    expect(screen.queryByTestId("no-comparison-sex")).toBeNull();
    expect(screen.queryByTestId("aedt-run-no-comparison")).toBeNull();
    expect(screen.getByText("The data checks raised nothing for this run.")).toBeTruthy();
  });
});
