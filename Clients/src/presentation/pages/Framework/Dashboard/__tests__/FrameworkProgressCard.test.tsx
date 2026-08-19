import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import FrameworkProgressCard from "../FrameworkProgressCard";

const iso27001Framework = {
  frameworkId: 3,
  frameworkName: "ISO 27001",
  projectFrameworkId: 20,
  clauseProgress: { totalSubclauses: 10, doneSubclauses: 5 },
  annexProgress: { totalAnnexControls: 8, doneAnnexControls: 8 },
};

const iso42001Framework = {
  frameworkId: 2,
  frameworkName: "ISO 42001",
  projectFrameworkId: 10,
  clauseProgress: { totalSubclauses: 4, doneSubclauses: 0 },
  annexProgress: { totalAnnexcategories: 0, doneAnnexcategories: 0 },
};

const nistFramework = {
  frameworkId: 4,
  frameworkName: "NIST AI RMF",
  projectFrameworkId: 30,
  nistProgressByFunction: {
    govern: { total: 10, done: 9 },
    map: { total: 5, done: 1 },
    measure: { total: 4, done: 4 },
    manage: { total: 0, done: 0 },
  },
};

describe("FrameworkProgressCard", () => {
  it("renders the header and description with no frameworks", () => {
    renderWithProviders(<FrameworkProgressCard frameworksData={[]} />);
    expect(screen.getByText("Framework progress")).toBeInTheDocument();
    expect(screen.getByText(/Track implementation progress/)).toBeInTheDocument();
  });

  it("renders ISO 27001 clause and annex progress percentages", () => {
    renderWithProviders(<FrameworkProgressCard frameworksData={[iso27001Framework]} />);
    expect(screen.getByText("ISO 27001")).toBeInTheDocument();
    expect(screen.getByText("Clauses")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Annexes")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("renders ISO 42001 progress with 0% when nothing done", () => {
    renderWithProviders(<FrameworkProgressCard frameworksData={[iso42001Framework]} />);
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
  });

  it("renders NIST AI RMF progress broken down by function", () => {
    renderWithProviders(<FrameworkProgressCard frameworksData={[nistFramework]} />);
    expect(screen.getByText("NIST AI RMF")).toBeInTheDocument();
    expect(screen.getByText("Govern")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("Map")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("Measure")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
  });

  it("renders multiple frameworks with a divider", () => {
    renderWithProviders(
      <FrameworkProgressCard frameworksData={[iso27001Framework, nistFramework]} />,
    );
    expect(screen.getByText("ISO 27001")).toBeInTheDocument();
    expect(screen.getByText("NIST AI RMF")).toBeInTheDocument();
  });
});
