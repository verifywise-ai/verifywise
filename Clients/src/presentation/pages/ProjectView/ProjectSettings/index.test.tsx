import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams("projectId=5"), vi.fn()],
  };
});

let mockUserRoleName = "Admin";
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName, userId: 1 }),
}));

const mockUseProjectData = vi.fn();
vi.mock("../../../../application/hooks/useProjectData", () => ({
  default: (...args: any[]) => mockUseProjectData(...args),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 1, name: "Alice", surname: "Admin", email: "alice@example.com" },
      { id: 2, name: "Bob", surname: "Builder", email: "bob@example.com" },
      { id: 3, name: "Carol", surname: "Cloud", email: "carol@example.com" },
    ],
  }),
}));

const mockUseFrameworks = vi.fn();
vi.mock("../../../../application/hooks/useFrameworks", () => ({
  default: (...args: any[]) => mockUseFrameworks(...args),
}));

const mockAssignFrameworkToProject = vi.fn();
const mockDeleteEntityById = vi.fn();
vi.mock("../../../../application/repository/entity.repository", () => ({
  assignFrameworkToProject: (...args: any[]) => mockAssignFrameworkToProject(...args),
  deleteEntityById: (...args: any[]) => mockDeleteEntityById(...args),
}));

const mockUpdateProject = vi.fn();
const mockDeleteProject = vi.fn();
vi.mock("../../../../application/repository/project.repository", () => ({
  updateProject: (...args: any[]) => mockUpdateProject(...args),
  deleteProject: (...args: any[]) => mockDeleteProject(...args),
}));

vi.mock("../../../../application/tools/log.engine", () => ({
  logEngine: vi.fn(),
}));

vi.mock("../IntakeSubmissionCard", () => ({
  default: () => <div data-testid="intake-submission-card" />,
}));

const mockFlushCustomFields = vi.fn();
vi.mock("../../../components/CustomFieldsSection", async () => {
  const { forwardRef, useImperativeHandle } =
    await vi.importActual<typeof import("react")>("react");
  return {
    default: forwardRef(({ onDirtyChange }: any, ref) => {
      useImperativeHandle(ref, () => ({
        flush: (...args: any[]) => mockFlushCustomFields(...args),
        hasPendingValues: () => true,
      }));
      return (
        <div data-testid="custom-fields-section">
          <button type="button" onClick={() => onDirtyChange?.(true)}>
            Change custom field
          </button>
        </div>
      );
    }),
  };
});

vi.mock("../../../components/CustomFieldsSection/RequiredCustomFieldsGate", () => ({
  useRequiredCustomFieldsGate: () => ({ blocked: false, onPendingChange: vi.fn() }),
}));

vi.mock("../RiskAnalysisModal", () => ({
  default: ({ isOpen, updateClassification }: any) => (
    <div data-testid="risk-analysis-modal" data-open={isOpen}>
      <button
        type="button"
        onClick={() =>
          updateClassification({
            questionnaireVersion: 2,
            level: "High risk",
            role: "Provider",
            reasons: [],
            obligations: [],
          })
        }
      >
        mock wizard save
      </button>
      <button
        type="button"
        onClick={() =>
          updateClassification({
            questionnaireVersion: 2,
            level: "High risk",
            role: "Provider",
            roles: ["Provider", "Deployer"],
            reasons: [],
            obligations: [],
          })
        }
      >
        mock wizard save both
      </button>
      <button
        type="button"
        onClick={() =>
          updateClassification({
            questionnaireVersion: 2,
            level: "Limited risk",
            role: null,
            reasons: [],
            obligations: [],
          })
        }
      >
        Finish risk wizard
      </button>
    </div>
  ),
}));

import ProjectSettings from "./index";
import type { Project } from "../../../../domain/types/Project";

const baseProject = {
  id: 5,
  project_title: "Chatbot Assistant",
  goal: "Answer support questions",
  status: "In progress",
  owner: 1,
  members: ["2"],
  start_date: "2024-05-01T00:00:00Z",
  ai_risk_classification: null,
  high_risk_roles: [],
  geography: 1,
  target_industry: "",
  description: "",
  framework: [],
} as unknown as Project;

const euAiActFramework = { id: 1, name: "EU AI Act", is_organizational: false };
const iso42001Framework = { id: 2, name: "ISO 42001", is_organizational: false };

describe("ProjectSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlushCustomFields.mockResolvedValue(undefined);
    mockUserRoleName = "Admin";
    mockUseProjectData.mockReturnValue({ project: baseProject });
    mockUseFrameworks.mockReturnValue({
      filteredFrameworks: [],
      allFrameworks: [euAiActFramework, iso42001Framework],
    });
  });

  it("renders core project fields once loaded", async () => {
    renderWithProviders(<ProjectSettings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument();
    });
    expect(screen.getByText("Use Case Overview")).toBeInTheDocument();
    expect(screen.getByText("Use case details")).toBeInTheDocument();
    expect(screen.getByText("Team & Compliance")).toBeInTheDocument();
    expect(screen.getByTestId("intake-submission-card")).toBeInTheDocument();
    expect(screen.getByTestId("custom-fields-section")).toBeInTheDocument();
  });

  it("clears the required error when the risk wizard fills in the classification", async () => {
    mockUseFrameworks.mockReturnValue({
      filteredFrameworks: [euAiActFramework],
      allFrameworks: [euAiActFramework, iso42001Framework],
    });
    mockUseProjectData.mockReturnValue({
      project: {
        ...baseProject,
        framework: [{ project_framework_id: 1, framework_id: 1, name: "EU AI Act" }],
      },
    });

    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());

    // Saving with an empty classification shows the required error
    fireEvent.change(screen.getByDisplayValue("Chatbot Assistant"), {
      target: { value: "Renamed Assistant" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("AI risk classification is required when EU AI Act is selected."),
    ).toBeInTheDocument();

    // The wizard reports its result: the error goes away
    fireEvent.click(screen.getByRole("button", { name: "Finish risk wizard" }));
    await waitFor(() =>
      expect(
        screen.queryByText("AI risk classification is required when EU AI Act is selected."),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Limited risk")).toBeInTheDocument();
  });

  it("keeps Save disabled after the risk wizard, since the wizard already saved the value", async () => {
    mockUseFrameworks.mockReturnValue({
      filteredFrameworks: [euAiActFramework],
      allFrameworks: [euAiActFramework, iso42001Framework],
    });
    mockUseProjectData.mockReturnValue({
      project: {
        ...baseProject,
        framework: [{ project_framework_id: 1, framework_id: 1, name: "EU AI Act" }],
      },
    });

    const triggerRefresh = vi.fn();
    renderWithProviders(<ProjectSettings triggerRefresh={triggerRefresh} />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Finish risk wizard" }));
    await waitFor(() => expect(screen.getByText("Limited risk")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    // The rest of the use case view is refreshed, as after a normal Save
    expect(triggerRefresh).toHaveBeenCalledWith(true);
  });

  it("disables the Save button until a field is modified", async () => {
    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue("Chatbot Assistant"), {
      target: { value: "Renamed Assistant" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });
  });

  it("enables Save when only a custom field answer changes", async () => {
    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Change custom field" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });
  });

  it("saves only the custom field values when no project field changed", async () => {
    mockFlushCustomFields.mockResolvedValue(undefined);
    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Change custom field" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockFlushCustomFields).toHaveBeenCalledWith(5));
    expect(mockUpdateProject).not.toHaveBeenCalled();
    expect(await screen.findByText("Use case updated successfully")).toBeInTheDocument();
  });

  it("disables Save while a save is in progress", async () => {
    let finish: () => void = () => {};
    mockFlushCustomFields.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Change custom field" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockFlushCustomFields).toHaveBeenCalledTimes(1);
    finish();
  });

  it("saves updated project details successfully", async () => {
    mockUpdateProject.mockResolvedValue({ status: 202 });
    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue("Chatbot Assistant"), {
      target: { value: "Renamed Assistant" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateProject).toHaveBeenCalled();
    });
    expect(mockUpdateProject.mock.calls[0][0]).toMatchObject({
      id: 5,
      body: expect.objectContaining({ project_title: "Renamed Assistant" }),
    });
    expect(await screen.findByText("Use case updated successfully")).toBeInTheDocument();
  });

  it("shows a server error message when saving fails with status 400", async () => {
    mockUpdateProject.mockResolvedValue({
      status: 400,
      data: { data: { message: "Title already exists" } },
    });
    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue("Chatbot Assistant"), {
      target: { value: "Duplicate title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Title already exists")).toBeInTheDocument();
  });

  it("opens a confirmation dialog when reassigning ownership to an existing member", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());

    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]); // owner select
    fireEvent.click(await screen.findByRole("option", { name: /Bob Builder/ }));

    expect(screen.getByText("Confirm owner change")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "I understand" }));

    await waitFor(() => {
      expect(screen.queryByText("Confirm owner change")).not.toBeInTheDocument();
    });
  });

  it("shows EU AI Act risk classification fields once that framework is applicable", async () => {
    mockUseFrameworks.mockReturnValue({
      filteredFrameworks: [euAiActFramework],
      allFrameworks: [euAiActFramework, iso42001Framework],
    });
    mockUseProjectData.mockReturnValue({
      project: {
        ...baseProject,
        framework: [{ project_framework_id: 1, framework_id: 1, name: "EU AI Act" }],
      },
    });

    renderWithProviders(<ProjectSettings />);

    expect(await screen.findByText("AI risk classification *")).toBeInTheDocument();
    expect(screen.getByText("High-risk roles *")).toBeInTheDocument();
  });

  it("opens the risk analysis modal from the classification helper link", async () => {
    mockUseFrameworks.mockReturnValue({
      filteredFrameworks: [euAiActFramework],
      allFrameworks: [euAiActFramework, iso42001Framework],
    });
    mockUseProjectData.mockReturnValue({
      project: {
        ...baseProject,
        framework: [{ project_framework_id: 1, framework_id: 1, name: "EU AI Act" }],
      },
    });

    renderWithProviders(<ProjectSettings />);
    await screen.findByText("AI risk classification *");

    fireEvent.click(screen.getByText("Calculate your AI risk classification"));

    expect(screen.getByTestId("risk-analysis-modal")).toHaveAttribute("data-open", "true");
  });

  const euAiActProject = {
    ...baseProject,
    ai_risk_classification: "Minimal risk",
    high_risk_roles: ["Deployer"],
    framework: [{ project_framework_id: 1, framework_id: 1, name: "EU AI Act" }],
  };
  const useEuAiAct = () => {
    mockUseFrameworks.mockReturnValue({
      filteredFrameworks: [euAiActFramework],
      allFrameworks: [euAiActFramework, iso42001Framework],
    });
    mockUseProjectData.mockReturnValue({ project: euAiActProject });
  };

  it("takes the level and role the wizard saved, without marking the form as changed", async () => {
    useEuAiAct();
    mockUpdateProject.mockResolvedValue({ status: 202 });
    renderWithProviders(<ProjectSettings />);
    await screen.findByText("AI risk classification *");

    fireEvent.click(screen.getByText("mock wizard save"));

    await waitFor(() => expect(screen.getByText("High risk")).toBeInTheDocument());
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue("Chatbot Assistant"), {
      target: { value: "Renamed Assistant" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateProject).toHaveBeenCalled());
    expect(mockUpdateProject.mock.calls[0][0].body).toMatchObject({
      ai_risk_classification: "High risk",
      high_risk_roles: ["Provider"],
    });
  });

  it("takes both roles from the wizard without marking the form as changed", async () => {
    useEuAiAct();
    renderWithProviders(<ProjectSettings />);
    await screen.findByText("AI risk classification *");
    fireEvent.click(screen.getByText("mock wizard save both"));
    await waitFor(() => expect(screen.getByText("Provider")).toBeInTheDocument());
    expect(screen.getByText("Deployer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves a second role picked in the multi-select", async () => {
    useEuAiAct();
    mockUpdateProject.mockResolvedValue({ status: 202 });
    renderWithProviders(<ProjectSettings />);
    await screen.findByText("AI risk classification *");
    fireEvent.keyDown(document.getElementById("high-risk-roles-input")!, { key: "ArrowDown" });
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Provider"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateProject).toHaveBeenCalled());
    expect(mockUpdateProject.mock.calls[0][0].body).toMatchObject({
      high_risk_roles: ["Provider", "Deployer"],
    });
    expect(mockUpdateProject.mock.calls[0][0].body).not.toHaveProperty("type_of_high_risk_role");
  });

  it("requires a role when EU AI Act is selected", async () => {
    mockUseFrameworks.mockReturnValue({
      filteredFrameworks: [euAiActFramework],
      allFrameworks: [euAiActFramework, iso42001Framework],
    });
    mockUseProjectData.mockReturnValue({
      project: { ...euAiActProject, high_risk_roles: [] },
    });
    renderWithProviders(<ProjectSettings />);
    await screen.findByText("AI risk classification *");
    fireEvent.change(screen.getByDisplayValue("Chatbot Assistant"), {
      target: { value: "Renamed Assistant" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Select at least one high-risk role when EU AI Act is selected."),
    ).toBeInTheDocument();
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  it.each(["Reviewer", "Auditor"])("hides the classification wizard link from %s", async (role) => {
    mockUserRoleName = role;
    useEuAiAct();
    renderWithProviders(<ProjectSettings />);
    await screen.findByText("AI risk classification *");
    expect(screen.queryByText("Calculate your AI risk classification")).not.toBeInTheDocument();
  });

  it("opens the delete confirmation dialog and deletes the project on confirm", async () => {
    mockDeleteProject.mockResolvedValue({ status: 200 });
    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete use case" }));
    expect(screen.getByText("Delete this use case?")).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteProject).toHaveBeenCalledWith({ id: 5 });
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/overview");
    });
  });

  it("shows an error alert when project deletion fails", async () => {
    mockDeleteProject.mockResolvedValue({ status: 500 });
    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete use case" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText("Failed to delete use case. Please try again."),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("disables the delete button for roles without delete permission", async () => {
    mockUserRoleName = "Auditor";
    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Delete use case" })).toBeDisabled();
  });

  it("adds a framework, calls the assignment API, and updates the monitored regulations list", async () => {
    mockAssignFrameworkToProject.mockResolvedValue({ status: 200 });
    // The "Applicable regulations" picker only renders once the project already
    // monitors at least one framework, so start with ISO 42001 assigned.
    mockUseFrameworks.mockReturnValue({
      filteredFrameworks: [iso42001Framework],
      allFrameworks: [euAiActFramework, iso42001Framework],
    });
    mockUseProjectData.mockReturnValue({
      project: {
        ...baseProject,
        framework: [{ project_framework_id: 2, framework_id: 2, name: "ISO 42001" }],
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<ProjectSettings />);
    await waitFor(() => expect(screen.getByDisplayValue("Chatbot Assistant")).toBeInTheDocument());

    const regulationsInput = document.querySelector(
      "#monitored-regulations-and-standards-input",
    ) as HTMLInputElement;
    await user.click(regulationsInput);
    await user.click(await screen.findByText("EU AI Act"));

    await waitFor(() => {
      expect(mockAssignFrameworkToProject).toHaveBeenCalledWith({
        frameworkId: 1,
        projectId: "5",
      });
    });
    expect(await screen.findByText("Framework added successfully")).toBeInTheDocument();
  });
});
