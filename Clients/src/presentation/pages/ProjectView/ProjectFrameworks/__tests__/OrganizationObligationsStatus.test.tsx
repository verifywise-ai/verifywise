import { screen } from "@testing-library/react";
import { vi } from "vitest";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockUseProjects = vi.fn();
const mockComplianceProgress = vi.fn();
const mockAssessmentProgress = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => mockUseProjects(),
}));
vi.mock("../../../../../application/repository/control_eu_act.repository", () => ({
  getComplianceProgress: (...args: unknown[]) => mockComplianceProgress(...args),
}));
vi.mock("../../../../../application/repository/assesment.repository", () => ({
  getAssessmentProgress: (...args: unknown[]) => mockAssessmentProgress(...args),
}));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => mockNavigate,
}));

import OrganizationObligationsStatus from "../OrganizationObligationsStatus";

const FALLBACK =
  "Organization-wide obligations (prohibited practices, AI literacy, quality management system) are tracked once for the organization on the Frameworks page by your Admins.";

const orgProject = {
  id: 3,
  is_organizational: true,
  framework: [
    { project_framework_id: 40, framework_id: 2, name: "ISO 42001" },
    { project_framework_id: 41, framework_id: 29, name: "EU AI Act (organization)" },
  ],
};
const useCase = { id: 7, is_organizational: false, framework: [] };

describe("OrganizationObligationsStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the organization's progress and a link when the organizational project is visible", async () => {
    mockUseProjects.mockReturnValue({ data: [useCase, orgProject], isLoading: false });
    mockComplianceProgress.mockResolvedValue({
      data: { allDonesubControls: 4, allsubControls: 17 },
    });
    mockAssessmentProgress.mockResolvedValue({ data: { answeredQuestions: 2, totalQuestions: 9 } });

    renderWithProviders(<OrganizationObligationsStatus />);

    expect(
      await screen.findByText(
        "Organization-wide obligations (prohibited practices, AI literacy, quality management system): 4/17 requirements done, 2/9 questions answered",
      ),
    ).toBeInTheDocument();
    expect(mockComplianceProgress).toHaveBeenCalledWith(
      expect.objectContaining({ projectFrameworkId: 41 }),
    );
    screen.getByTestId("eu-ai-act-organization-open").click();
    expect(mockNavigate).toHaveBeenCalledWith("/framework?framework=eu-ai-act-organization");
    expect(screen.queryByText(FALLBACK)).not.toBeInTheDocument();
  });

  it("falls back to a plain pointer without a link when the organizational project is not visible", () => {
    mockUseProjects.mockReturnValue({ data: [useCase], isLoading: false });

    renderWithProviders(<OrganizationObligationsStatus />);

    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
    expect(screen.queryByTestId("eu-ai-act-organization-open")).not.toBeInTheDocument();
    expect(mockComplianceProgress).not.toHaveBeenCalled();
  });

  it("renders nothing while projects load or when they fail", () => {
    mockUseProjects.mockReturnValue({ data: undefined, isLoading: true });
    const { container, rerender } = renderWithProviders(<OrganizationObligationsStatus />);
    expect(container.querySelector("[data-testid='eu-ai-act-organization-status']")).toBeNull();

    mockUseProjects.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    rerender(<OrganizationObligationsStatus />);
    expect(container.querySelector("[data-testid='eu-ai-act-organization-status']")).toBeNull();
  });

  it("hides the row when the progress request fails", async () => {
    mockUseProjects.mockReturnValue({ data: [orgProject], isLoading: false });
    mockComplianceProgress.mockRejectedValue(new Error("403"));
    mockAssessmentProgress.mockResolvedValue({ data: { answeredQuestions: 0, totalQuestions: 9 } });

    const { container } = renderWithProviders(<OrganizationObligationsStatus />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector("[data-testid='eu-ai-act-organization-status']")).toBeNull();
    expect(screen.queryByText(FALLBACK)).not.toBeInTheDocument();
  });
});
