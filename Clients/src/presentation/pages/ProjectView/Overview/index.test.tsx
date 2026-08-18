import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockUseProjectData = vi.fn();
const mockUseProjectStatus = vi.fn();

vi.mock("../../../../application/hooks/useProjectData", () => ({
  default: (...args: any[]) => mockUseProjectData(...args),
}));
vi.mock("../../../../application/hooks/useProjectStatus", () => ({
  default: (...args: any[]) => mockUseProjectStatus(...args),
}));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));
vi.mock("../IntakeSubmissionCard", () => ({
  default: () => <div data-testid="intake-submission-card" />,
}));
vi.mock("../../../components/Risks", () => ({
  default: (props: any) => <div data-testid="risks">{JSON.stringify(props)}</div>,
}));

import Overview from "./index";

const project = {
  last_updated: new Date("2024-05-01T00:00:00Z"),
  last_updated_by: "Jane Doe",
};

const projectRisksSummary = {
  veryHighRisks: 1,
  highRisks: 2,
  mediumRisks: 3,
  lowRisks: 4,
  veryLowRisks: 5,
};

describe("Overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectData.mockReturnValue({
      project,
      projectOwner: "John Smith",
      error: null,
      isLoading: false,
    });
    mockUseProjectStatus.mockReturnValue({
      projectStatus: {
        assessments: { projects: [{ projectId: 1, doneAssessments: 3, totalAssessments: 6 }] },
        controls: { projects: [{ projectId: 1, doneSubControls: 5, totalSubControls: 10 }] },
      },
    });
  });

  it("shows a fallback message when no project is found", () => {
    mockUseProjectData.mockReturnValue({
      project: null,
      projectOwner: null,
      error: null,
      isLoading: false,
    });
    renderWithProviders(<Overview projectRisksSummary={projectRisksSummary} />);
    expect(screen.getByText("No project found")).toBeInTheDocument();
  });

  it("renders owner, last-updated info, and risk summary when project loads", () => {
    renderWithProviders(<Overview projectRisksSummary={projectRisksSummary} />, {
      route: "/project-view?projectId=1",
    });

    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("Last updated by")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Use case risks")).toBeInTheDocument();
    expect(screen.getByTestId("risks")).toBeInTheDocument();
    expect(screen.getByTestId("intake-submission-card")).toBeInTheDocument();
  });

  it("shows the loading message while data is loading", () => {
    mockUseProjectData.mockReturnValue({
      project,
      projectOwner: "John Smith",
      error: null,
      isLoading: true,
    });
    renderWithProviders(<Overview projectRisksSummary={projectRisksSummary} />);
    expect(screen.getByText("Project are loading...")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", () => {
    mockUseProjectData.mockReturnValue({
      project,
      projectOwner: "John Smith",
      error: "Failed to load project",
      isLoading: false,
    });
    renderWithProviders(<Overview projectRisksSummary={projectRisksSummary} />);
    expect(screen.getByText("Failed to load project")).toBeInTheDocument();
  });

  it("renders the control and assessment progress fractions", () => {
    renderWithProviders(<Overview projectRisksSummary={projectRisksSummary} />, {
      route: "/project-view?projectId=1",
    });

    expect(
      screen.getByText((_, el) => el?.tagName === "P" && !!el.textContent?.startsWith("5/10")),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && !!el.textContent?.startsWith("3/6")),
    ).toBeInTheDocument();
  });

  it("defaults to project id '1' when no projectId query param is present", () => {
    renderWithProviders(<Overview projectRisksSummary={projectRisksSummary} />);
    expect(mockUseProjectData).toHaveBeenCalledWith({ projectId: "1" });
  });

  it("extracts the numeric id from plugin-sourced project ids", () => {
    mockUseProjectStatus.mockReturnValue({
      projectStatus: {
        assessments: { projects: [{ projectId: 7, doneAssessments: 2, totalAssessments: 4 }] },
        controls: { projects: [{ projectId: 7, doneSubControls: 1, totalSubControls: 9 }] },
      },
    });
    renderWithProviders(<Overview projectRisksSummary={projectRisksSummary} />, {
      route: "/project-view?projectId=plugin-prefix-7",
    });
    expect(mockUseProjectData).toHaveBeenCalledWith({ projectId: "plugin-prefix-7" });
    // controls/assessments look up projectId 7 (numeric suffix)
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && !!el.textContent?.startsWith("1/9")),
    ).toBeInTheDocument();
  });
});
