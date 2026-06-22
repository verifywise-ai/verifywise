import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import StatusBreakdownCard from "../StatusBreakdownCard";

vi.mock("../../../../components/Charts/VWCharts", () => ({
  VWDonutChart: ({ data }: any) => (
    <div data-testid="vw-donut-chart" data-items={data?.length ?? 0}>
      {data?.map((d: any) => (
        <div key={d.name} data-testid={`chart-item-${d.name}`}>
          {d.name}: {d.value}
        </div>
      ))}
    </div>
  ),
}));

const isoFramework = {
  frameworkId: 1,
  frameworkName: "ISO 27001",
  projectFrameworkId: 10,
  clauseProgress: { totalSubclauses: 20, doneSubclauses: 8 },
  annexProgress: { totalAnnexControls: 15, doneAnnexControls: 5 },
};

const nistFramework = {
  frameworkId: 2,
  frameworkName: "NIST AI RMF",
  projectFrameworkId: 20,
  nistStatusBreakdown: {
    notStarted: 5,
    draft: 3,
    inProgress: 4,
    awaitingReview: 2,
    awaitingApproval: 1,
    implemented: 3,
    needsRework: 1,
  },
};

const emptyFramework = {
  frameworkId: 3,
  frameworkName: "ISO 42001",
  projectFrameworkId: 30,
  clauseProgress: { totalSubclauses: 0, doneSubclauses: 0 },
};

describe("StatusBreakdownCard", () => {
  it("renders ISO framework with clause data after loading", () => {
    renderWithProviders(<StatusBreakdownCard frameworksData={[isoFramework]} />);
    expect(screen.getByText("ISO 27001 clauses")).toBeInTheDocument();
    expect(screen.getByTestId("vw-donut-chart")).toBeInTheDocument();
    expect(screen.getByText("Not started: 12")).toBeInTheDocument();
    expect(screen.getByText("Implemented: 4")).toBeInTheDocument();
  });

  it('shows "No status data available" when total is zero', () => {
    renderWithProviders(<StatusBreakdownCard frameworksData={[emptyFramework]} />);
    expect(screen.getByText("ISO 42001 clauses")).toBeInTheDocument();
    expect(screen.getByText("No status data available")).toBeInTheDocument();
  });

  it("renders NIST AI RMF framework data", () => {
    renderWithProviders(<StatusBreakdownCard frameworksData={[nistFramework]} />);
    expect(screen.getByText("NIST AI RMF")).toBeInTheDocument();
    expect(screen.getByText("Not started: 5")).toBeInTheDocument();
    expect(screen.getByText("Implemented: 3")).toBeInTheDocument();
  });

  it("toggles between clauses and annexes view for ISO framework", () => {
    renderWithProviders(<StatusBreakdownCard frameworksData={[isoFramework]} />);
    expect(screen.getByText("ISO 27001 clauses")).toBeInTheDocument();

    const rightButton = screen.getAllByRole("button")[1];
    fireEvent.click(rightButton);
    expect(screen.getByText("ISO 27001 annexes")).toBeInTheDocument();

    const leftButton = screen.getAllByRole("button")[0];
    fireEvent.click(leftButton);
    expect(screen.getByText("ISO 27001 clauses")).toBeInTheDocument();
  });

  it("renders multiple frameworks with dividers", () => {
    renderWithProviders(
      <StatusBreakdownCard
        frameworksData={[
          { ...isoFramework, frameworkId: 1 },
          { ...nistFramework, frameworkId: 2 },
        ]}
      />,
    );
    expect(screen.getByText("ISO 27001 clauses")).toBeInTheDocument();
    expect(screen.getByText("NIST AI RMF")).toBeInTheDocument();
  });
});
