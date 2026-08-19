import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ConformityStepStatus } from "../../../../domain/types/ceMarking";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGetCEMarking = vi.fn();
const mockUpdateClassificationAndScope = vi.fn();
const mockUpdateConformityStep = vi.fn();
const mockUpdateDeclaration = vi.fn();
const mockUpdateRegistration = vi.fn();
const mockGetAllPolicies = vi.fn();
const mockGetAllEvidences = vi.fn();
const mockGetAllIncidents = vi.fn();
const mockUpdateLinkedPolicies = vi.fn();
const mockUpdateLinkedEvidences = vi.fn();
const mockUpdateLinkedIncidents = vi.fn();

vi.mock("../../../../application/repository/ceMarking.repository", () => ({
  getCEMarking: (...args: any[]) => mockGetCEMarking(...args),
  updateClassificationAndScope: (...args: any[]) => mockUpdateClassificationAndScope(...args),
  updateConformityStep: (...args: any[]) => mockUpdateConformityStep(...args),
  updateDeclaration: (...args: any[]) => mockUpdateDeclaration(...args),
  updateRegistration: (...args: any[]) => mockUpdateRegistration(...args),
  getAllPolicies: (...args: any[]) => mockGetAllPolicies(...args),
  getAllEvidences: (...args: any[]) => mockGetAllEvidences(...args),
  getAllIncidents: (...args: any[]) => mockGetAllIncidents(...args),
  updateLinkedPolicies: (...args: any[]) => mockUpdateLinkedPolicies(...args),
  updateLinkedEvidences: (...args: any[]) => mockUpdateLinkedEvidences(...args),
  updateLinkedIncidents: (...args: any[]) => mockUpdateLinkedIncidents(...args),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 1, name: "Jane", surname: "Doe" }] }),
}));

const mockUseProjectData = vi.fn();
vi.mock("../../../../application/hooks/useProjectData", () => ({
  default: (...args: any[]) => mockUseProjectData(...args),
}));

import CEMarking from "./index";

const baseData = {
  isHighRiskAISystem: true,
  roleInProduct: "standalone",
  annexIIICategory: "annex_iii_5",
  controlsCompleted: 5,
  controlsTotal: 10,
  assessmentsCompleted: 2,
  assessmentsTotal: 4,
  conformitySteps: [
    {
      id: 1,
      step: "Risk assessment",
      description: "Assess risk",
      status: ConformityStepStatus.InProgress,
      owner: "1",
      dueDate: "2024-06-01",
      completedDate: null,
    },
  ],
  completedStepsCount: 3,
  totalStepsCount: 8,
  declarationStatus: "draft",
  signedOn: null,
  signatory: null,
  declarationDocument: null,
  registrationStatus: "not_registered",
  euRegistrationId: null,
  registrationDate: null,
  euRecordUrl: null,
  policiesLinked: 2,
  evidenceLinked: 3,
  totalIncidents: 1,
  linkedPolicies: [1],
  linkedEvidences: [2],
  linkedIncidents: [3],
};

describe("CEMarking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCEMarking.mockResolvedValue(baseData);
    mockUseProjectData.mockReturnValue({
      project: { goal: "Automate support" },
      error: null,
      isLoading: false,
    });
    mockGetAllPolicies.mockResolvedValue([{ id: 1, title: "Policy A", status: "Approved" }]);
    mockGetAllEvidences.mockResolvedValue([{ id: 2, filename: "evidence.pdf", source: "Upload" }]);
    mockGetAllIncidents.mockResolvedValue([
      { id: 3, type: "Bias", severity: "High", status: "Open" },
    ]);
  });

  it("shows a loading spinner while data loads", () => {
    mockGetCEMarking.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<CEMarking projectId="1" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows the project error when project data fails to load", async () => {
    mockUseProjectData.mockReturnValue({
      project: null,
      error: "Project not found",
      isLoading: false,
    });
    renderWithProviders(<CEMarking projectId="1" />);
    expect(await screen.findByText("Project not found")).toBeInTheDocument();
  });

  it("shows a fallback message when CE Marking data fails to load", async () => {
    mockGetCEMarking.mockRejectedValue(new Error("network error"));
    renderWithProviders(<CEMarking projectId="1" />);
    expect(await screen.findByText(/Unable to load CE Marking data/)).toBeInTheDocument();
  });

  it("renders classification, completion and step summary once loaded", async () => {
    renderWithProviders(<CEMarking projectId="1" />);

    expect(await screen.findByText("Classification and scope")).toBeInTheDocument();
    expect(screen.getByText("Automate support")).toBeInTheDocument();
    expect(screen.getByText("Controls. 5 of 10 completed")).toBeInTheDocument();
    expect(screen.getByText("Assessments. 2 of 4 completed")).toBeInTheDocument();
    expect(screen.getByText("3 OF 8 STEPS COMPLETED OR NOT NEEDED")).toBeInTheDocument();
    expect(screen.getByText("Risk assessment")).toBeInTheDocument();
  });

  it("shows a confirmation dialog before changing the high-risk classification, and applies it on confirm", async () => {
    mockUpdateClassificationAndScope.mockResolvedValue({ ...baseData, isHighRiskAISystem: false });
    renderWithProviders(<CEMarking projectId="1" />);
    await screen.findByText("Classification and scope");

    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.mouseDown(comboboxes[0]); // high-risk select
    fireEvent.click(await screen.findByRole("option", { name: "No" }));

    expect(screen.getByText("Confirm Classification Change")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockUpdateClassificationAndScope).toHaveBeenCalledWith("1", {
        isHighRiskAISystem: false,
      });
    });
  });

  it("optimistically updates the Annex III category and reverts on failure", async () => {
    mockUpdateClassificationAndScope.mockRejectedValue(new Error("fail"));
    renderWithProviders(<CEMarking projectId="1" />);
    await screen.findByText("Classification and scope");

    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.mouseDown(comboboxes[1]); // annex III category select
    fireEvent.click(await screen.findByRole("option", { name: /Annex III 1/ }));

    await waitFor(() => {
      expect(mockUpdateClassificationAndScope).toHaveBeenCalledWith("1", {
        annexIIICategory: "annex_iii_1",
      });
    });
  });

  it("navigates to the framework checklist when 'View detailed EU AI Act checklist' is clicked", async () => {
    renderWithProviders(<CEMarking projectId="7" />);
    await screen.findByText("Classification and scope");

    fireEvent.click(screen.getByText("View detailed EU AI Act checklist"));

    expect(mockNavigate).toHaveBeenCalledWith(
      "/project-view?projectId=7&tab=frameworks&framework=eu-ai-act",
    );
  });

  it("opens the conformity step modal and saves changes", async () => {
    mockUpdateConformityStep.mockResolvedValue({ ...baseData });
    renderWithProviders(<CEMarking projectId="1" />);
    await screen.findByText("Risk assessment");

    fireEvent.click(screen.getByText("Risk assessment"));
    expect(await screen.findByText("Edit: Risk assessment")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockUpdateConformityStep).toHaveBeenCalledWith(
        "1",
        1,
        expect.objectContaining({
          description: "Assess risk",
          status: ConformityStepStatus.InProgress,
        }),
      );
    });
  });

  it("opens the declaration modal and saves declaration details", async () => {
    mockUpdateDeclaration.mockResolvedValue({ ...baseData, declarationStatus: "signed" });
    renderWithProviders(<CEMarking projectId="1" />);
    await screen.findByText("Declaration of conformity");

    fireEvent.click(screen.getByRole("button", { name: "Edit declaration details" }));
    expect(await screen.findByText("Edit declaration of conformity")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockUpdateDeclaration).toHaveBeenCalled();
    });
  });

  it("opens the EU registration modal and saves registration details", async () => {
    mockUpdateRegistration.mockResolvedValue({ ...baseData, registrationStatus: "pending" });
    renderWithProviders(<CEMarking projectId="1" />);
    await screen.findByText("EU registration");

    fireEvent.click(screen.getByRole("button", { name: "Edit EU registration details" }));
    expect(await screen.findByText("Edit EU registration")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockUpdateRegistration).toHaveBeenCalled();
    });
  });

  it("opens the policies modal, toggles a policy, and saves linked policies", async () => {
    mockUpdateLinkedPolicies.mockResolvedValue({ ...baseData });
    renderWithProviders(<CEMarking projectId="1" />);
    await screen.findByText("Policies and evidence");

    fireEvent.click(screen.getByText("Manage linked policies"));
    expect(await screen.findByText("Policy A")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Policy A"));
    fireEvent.click(screen.getByRole("button", { name: /link \d policic?y|link \d policies/i }));

    await waitFor(() => {
      expect(mockUpdateLinkedPolicies).toHaveBeenCalledWith("1", expect.any(Array));
    });
  });

  it("opens the evidence modal and lists available evidence", async () => {
    renderWithProviders(<CEMarking projectId="1" />);
    await screen.findByText("Policies and evidence");

    fireEvent.click(screen.getByText("Manage linked evidence"));
    expect(await screen.findByText("evidence.pdf")).toBeInTheDocument();
  });

  it("opens the incidents modal and lists available incidents", async () => {
    renderWithProviders(<CEMarking projectId="1" />);
    await screen.findByText("Incidents for this use case");

    fireEvent.click(screen.getByText("View incidents for this use case"));
    expect(await screen.findByText("Type: Bias")).toBeInTheDocument();
  });
});
