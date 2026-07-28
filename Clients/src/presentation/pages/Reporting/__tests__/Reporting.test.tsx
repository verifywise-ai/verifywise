import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Suppress console errors from lazy loading
vi.spyOn(console, "error").mockImplementation(() => {});

// Mock the PageHeaderExtended layout component
vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ title, description, children }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

// Mock lazy-loaded children
vi.mock("../GenerateReport", () => ({
  default: () => <div data-testid="generate-report" />,
}));

vi.mock("../ReportRunsTable", () => ({
  default: ({ variant }: any) => <div data-testid="report-runs-table">{variant}</div>,
}));

// Mock PageTour
vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

// Mock ReportingSteps
vi.mock("../ReportingSteps", () => ({
  default: [],
}));

import Reporting from "../index";

describe("Reporting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    renderWithProviders(<Reporting />);
    expect(screen.getByText("Reporting")).toBeInTheDocument();
  });

  it("displays the page description", () => {
    renderWithProviders(<Reporting />);
    expect(
      screen.getByText(/We'll create one using the info from your Compliance/),
    ).toBeInTheDocument();
  });

  it("renders the Generate tab's runs table in live mode", () => {
    renderWithProviders(<Reporting />);
    expect(screen.getByTestId("report-runs-table")).toHaveTextContent("live");
    expect(screen.getByTestId("generate-report")).toBeInTheDocument();
  });
});
