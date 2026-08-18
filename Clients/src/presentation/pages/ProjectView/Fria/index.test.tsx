import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockUseFria = vi.fn();

vi.mock("../../../../application/hooks/useFria", () => ({
  useFria: (...args: any[]) => mockUseFria(...args),
}));

vi.mock("./sections/OrgProfileSection", () => ({
  default: () => <div data-testid="org-profile-section" />,
}));
vi.mock("./sections/ApplicabilityScopeSection", () => ({
  default: () => <div data-testid="applicability-scope-section" />,
}));
vi.mock("./sections/AffectedPersonsSection", () => ({
  default: () => <div data-testid="affected-persons-section" />,
}));
vi.mock("./sections/RightsMatrixSection", () => ({
  default: () => <div data-testid="rights-matrix-section" />,
}));
vi.mock("./sections/SpecificRisksSection", () => ({
  default: () => <div data-testid="specific-risks-section" />,
}));
vi.mock("./sections/OversightSection", () => ({
  default: () => <div data-testid="oversight-section" />,
}));
vi.mock("./sections/ConsultationSection", () => ({
  default: () => <div data-testid="consultation-section" />,
}));
vi.mock("./sections/SummarySection", () => ({
  default: () => <div data-testid="summary-section" />,
}));
vi.mock("./FriaVersionHistory", () => ({
  default: () => <div data-testid="fria-version-history" />,
}));

import FriaAssessment from "./index";

const baseAssessment = {
  id: 1,
  project_id: 5,
  version: 2,
  status: "draft",
  completion_pct: 40,
  risk_score: 20,
  risk_level: "Low",
  rights_flagged: 1,
};

const defaultHookReturn = {
  assessment: baseAssessment,
  rights: [{ id: 1 }, { id: 2 }],
  riskItems: [],
  isLoading: false,
  error: null,
  isSaving: false,
  lastSaveStatus: null,
  updateAssessment: vi.fn(),
  updateRights: vi.fn(),
  addRiskItem: vi.fn(),
  updateRiskItem: vi.fn(),
  deleteRiskItem: vi.fn(),
  submitFria: vi.fn().mockResolvedValue(undefined),
};

describe("FriaAssessment (Fria/index)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFria.mockReturnValue({ ...defaultHookReturn });
  });

  it("shows a loading spinner while FRIA data loads", () => {
    mockUseFria.mockReturnValue({ ...defaultHookReturn, isLoading: true, assessment: null });
    renderWithProviders(<FriaAssessment projectId="5" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", () => {
    mockUseFria.mockReturnValue({
      ...defaultHookReturn,
      isLoading: false,
      error: "Failed to load FRIA",
      assessment: null,
    });
    renderWithProviders(<FriaAssessment projectId="5" />);
    expect(screen.getByText("Failed to load FRIA")).toBeInTheDocument();
  });

  it("renders nothing when there is no assessment and no error", () => {
    mockUseFria.mockReturnValue({ ...defaultHookReturn, assessment: null });
    const { container } = renderWithProviders(<FriaAssessment projectId="5" />);
    expect(container.textContent).toBe("");
  });

  it("renders stat cards and all sections when assessment is loaded", () => {
    renderWithProviders(<FriaAssessment projectId="5" />);

    expect(screen.getByText("Completion")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("Risk score")).toBeInTheDocument();
    expect(screen.getByText("20/100")).toBeInTheDocument();
    expect(screen.getByText("Rights flagged")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();

    expect(screen.getByTestId("org-profile-section")).toBeInTheDocument();
    expect(screen.getByTestId("applicability-scope-section")).toBeInTheDocument();
    expect(screen.getByTestId("affected-persons-section")).toBeInTheDocument();
    expect(screen.getByTestId("rights-matrix-section")).toBeInTheDocument();
    expect(screen.getByTestId("specific-risks-section")).toBeInTheDocument();
    expect(screen.getByTestId("oversight-section")).toBeInTheDocument();
    expect(screen.getByTestId("consultation-section")).toBeInTheDocument();
    expect(screen.getByTestId("summary-section")).toBeInTheDocument();
  });

  it("shows a high-risk subtitle when risk score is above 70", () => {
    mockUseFria.mockReturnValue({
      ...defaultHookReturn,
      assessment: { ...baseAssessment, risk_score: 80 },
    });
    renderWithProviders(<FriaAssessment projectId="5" />);
    expect(screen.getByText("High risk — review required")).toBeInTheDocument();
  });

  it("shows a moderate-risk subtitle when risk score is between 40 and 70", () => {
    mockUseFria.mockReturnValue({
      ...defaultHookReturn,
      assessment: { ...baseAssessment, risk_score: 50 },
    });
    renderWithProviders(<FriaAssessment projectId="5" />);
    expect(screen.getByText("Moderate risk level")).toBeInTheDocument();
  });

  it("shows 'Saving...' text while a save is in progress", () => {
    mockUseFria.mockReturnValue({ ...defaultHookReturn, isSaving: true });
    renderWithProviders(<FriaAssessment projectId="5" />);
    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("shows 'Saved' text after a successful save", () => {
    mockUseFria.mockReturnValue({ ...defaultHookReturn, lastSaveStatus: "saved" });
    renderWithProviders(<FriaAssessment projectId="5" />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows 'Save failed' text after a failed save", () => {
    mockUseFria.mockReturnValue({ ...defaultHookReturn, lastSaveStatus: "error" });
    renderWithProviders(<FriaAssessment projectId="5" />);
    expect(screen.getByText("Save failed")).toBeInTheDocument();
  });

  it("disables the save snapshot button when status is approved", () => {
    mockUseFria.mockReturnValue({
      ...defaultHookReturn,
      assessment: { ...baseAssessment, status: "approved" },
    });
    renderWithProviders(<FriaAssessment projectId="5" />);
    expect(screen.getByRole("button", { name: /save snapshot/i })).toBeDisabled();
  });

  it("opens the version history modal", async () => {
    renderWithProviders(<FriaAssessment projectId="5" />);
    fireEvent.click(screen.getByRole("button", { name: /version history/i }));

    await waitFor(() => {
      expect(screen.getByTestId("fria-version-history")).toBeInTheDocument();
    });
  });

  it("opens the save snapshot modal, edits the note, and submits", async () => {
    const submitFria = vi.fn().mockResolvedValue(undefined);
    mockUseFria.mockReturnValue({ ...defaultHookReturn, submitFria });

    renderWithProviders(<FriaAssessment projectId="5" />);
    fireEvent.click(screen.getAllByRole("button", { name: /save snapshot/i })[0]);

    await waitFor(() => {
      expect(
        screen.getByText(
          "This will save a snapshot of the current assessment so you can refer back to it later. Your changes are already auto-saved as you type.",
        ),
      ).toBeInTheDocument();
    });

    const noteField = screen.getByLabelText(/note \(optional\)/i);
    fireEvent.change(noteField, { target: { value: "Completed section 1" } });

    const submitButtons = screen.getAllByRole("button", { name: /save snapshot/i });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(submitFria).toHaveBeenCalledWith("Completed section 1");
    });
  });
});
