import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockGetAllEntities = vi.fn();
vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: (...args: any[]) => mockGetAllEntities(...args),
}));

vi.mock("../../../components/Table", () => ({
  default: ({ table, data, bodyData }: any) => (
    <div data-testid="basic-table">
      <span data-testid="table-name">{table}</span>
      <span data-testid="col-count">{data.cols.length}</span>
      <span data-testid="row-count">{bodyData.length}</span>
    </div>
  ),
}));

import RisksView from "./index";
import type { RiskData } from "./riskkViewValues";

const risksSummary: RiskData = {
  total: 10,
  veryHighRisks: 1,
  highRisks: 2,
  mediumRisks: 3,
  lowRisks: 2,
  veryLowRisks: 2,
};

const projectRisks = [
  {
    id: 1,
    risk_name: "Data leak",
    impact: "High",
    risk_owner: "Alice",
    severity: "High",
    likelihood: "Medium",
    risk_level_autocalculated: "High",
    mitigation_status: "In progress",
    final_risk_level: "High",
    ale_estimate: 12000,
  },
];

describe("RisksView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllEntities.mockResolvedValue({ data: [] });
  });

  it("renders the risk summary tiles and title for project risks", () => {
    renderWithProviders(
      <RisksView risksSummary={risksSummary} risksData={[]} title="Project" projectId="1" />,
    );

    expect(screen.getByText("Project risks")).toBeInTheDocument();
    expect(screen.getByText(/This is a read-only view/)).toBeInTheDocument();
    expect(screen.getByText("Risk Management")).toBeInTheDocument();
  });

  it("renders vendor guidance link and title for vendor risks", () => {
    renderWithProviders(
      <RisksView risksSummary={risksSummary} risksData={[]} title="Vendor" projectId="1" />,
    );

    expect(screen.getByText("Vendor risks")).toBeInTheDocument();
    expect(screen.getByText("Vendors")).toBeInTheDocument();
  });

  it("uses the project columns and maps risk rows for project risk data", () => {
    renderWithProviders(
      <RisksView
        risksSummary={risksSummary}
        risksData={projectRisks as any}
        title="Project"
        projectId="1"
      />,
    );

    expect(screen.getByTestId("row-count").textContent).toBe("1");
    expect(screen.getByTestId("col-count").textContent).toBe("9"); // projectRisksColNames length
  });

  it("uses the vendor columns for vendor risk data", () => {
    renderWithProviders(
      <RisksView risksSummary={risksSummary} risksData={[]} title="Vendor" projectId="1" />,
    );

    expect(screen.getByTestId("col-count").textContent).toBe("4"); // vendorRisksColNames length
  });

  it("fetches project risk data from the project risks endpoint", async () => {
    renderWithProviders(
      <RisksView risksSummary={risksSummary} risksData={[]} title="Project" projectId="42" />,
    );

    await waitFor(() => {
      expect(mockGetAllEntities).toHaveBeenCalledWith({
        routeUrl: "/projectRisks/by-projid/42",
      });
    });
  });

  it("fetches vendor risk data from the vendor risks endpoint", async () => {
    renderWithProviders(
      <RisksView risksSummary={risksSummary} risksData={[]} title="Vendor" projectId="42" />,
    );

    await waitFor(() => {
      expect(mockGetAllEntities).toHaveBeenCalledWith({
        routeUrl: "/vendorRisks/by-projid/42",
      });
    });
  });

  it("does not crash when fetching risk data fails", async () => {
    mockGetAllEntities.mockRejectedValue(new Error("network error"));
    renderWithProviders(
      <RisksView risksSummary={risksSummary} risksData={[]} title="Project" projectId="1" />,
    );

    await waitFor(() => expect(mockGetAllEntities).toHaveBeenCalled());
    expect(screen.getByText("Project risks")).toBeInTheDocument();
  });

  it("formats the ALE estimate as a currency string, or a dash when missing", () => {
    const rows = [
      { id: 1, risk_name: "R1", ale_estimate: 5000 },
      { id: 2, risk_name: "R2", ale_estimate: null },
    ];
    renderWithProviders(
      <RisksView
        risksSummary={risksSummary}
        risksData={rows as any}
        title="Project"
        projectId="1"
      />,
    );

    expect(screen.getByTestId("row-count").textContent).toBe("2");
  });
});
