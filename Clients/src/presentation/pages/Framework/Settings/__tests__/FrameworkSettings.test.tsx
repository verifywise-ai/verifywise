import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockDeleteProject = vi.fn();
const mockAssignFrameworkToProject = vi.fn();
const mockDeleteEntityById = vi.fn();

vi.mock("../../../../../application/repository/project.repository", () => ({
  deleteProject: (...args: any[]) => mockDeleteProject(...args),
}));

vi.mock("../../../../../application/repository/entity.repository", () => ({
  assignFrameworkToProject: (...args: any[]) => mockAssignFrameworkToProject(...args),
  deleteEntityById: (...args: any[]) => mockDeleteEntityById(...args),
}));

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin" }),
}));

vi.mock("../../../../components/Forms/ProjectForm", () => ({
  ProjectForm: () => <div data-testid="project-form" />,
}));

vi.mock("../../../../components/Forms/ProjectForm/constants", () => ({
  FrameworkTypeEnum: { OrganizationWide: "organization_wide" },
}));

vi.mock("../../../../components/Dialogs/ConfirmationModal", () => ({
  default: ({ title, onCancel, onProceed, proceedText }: any) => (
    <div data-testid="confirmation-modal">
      <span>{title}</span>
      <button onClick={onCancel}>cancel</button>
      <button onClick={onProceed}>{proceedText}</button>
    </div>
  ),
}));

vi.mock("../../../../components/Modals/StandardModal", () => ({
  default: ({ children, isOpen, onClose, onSubmit, title }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <span>{title}</span>
        {children}
        <button onClick={onClose}>close-modal</button>
        <button onClick={onSubmit}>submit-modal</button>
      </div>
    ) : null,
}));

vi.mock("../../../../components/PluginSlot", () => ({
  PluginSlot: () => <div data-testid="plugin-slot" />,
}));

vi.mock("../../../../../domain/constants/pluginSlots", () => ({
  PLUGIN_SLOTS: { ORG_FRAMEWORK_MANAGEMENT: "org-framework-management" },
}));

import FrameworkSettings from "../index";

const organizationalProject: any = {
  id: 1,
  project_title: "Org project",
  framework: [{ project_framework_id: 100, framework_id: 2, name: "ISO 42001" }],
};

const organizationalProjectTwoFrameworks: any = {
  id: 1,
  project_title: "Org project",
  framework: [
    { project_framework_id: 100, framework_id: 2, name: "ISO 42001" },
    { project_framework_id: 200, framework_id: 3, name: "ISO 27001" },
  ],
};

const allFrameworks: any[] = [
  {
    id: "2",
    is_demo: false,
    project_id: "1",
    framework_id: "2",
    name: "ISO 42001",
    description: "ISO 42001 description",
    is_organizational: true,
  },
  {
    id: "3",
    is_demo: false,
    project_id: "1",
    framework_id: "3",
    name: "ISO 27001",
    description: "ISO 27001 description",
    is_organizational: true,
  },
  {
    id: "1",
    is_demo: false,
    project_id: "1",
    framework_id: "1",
    name: "EU AI Act",
    description: "Should be excluded",
    is_organizational: true,
  },
];

const defaultProps = {
  organizationalProject,
  allFrameworks,
  filteredFrameworks: allFrameworks,
  onProjectDataChanged: vi.fn().mockResolvedValue(undefined),
  onFrameworksChanged: vi.fn(),
  setProjects: vi.fn(),
};

describe("FrameworkSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders framework settings and management sections", () => {
    renderWithProviders(<FrameworkSettings {...defaultProps} />);
    expect(screen.getByText("Framework settings")).toBeInTheDocument();
    expect(screen.getByText("Framework management")).toBeInTheDocument();
    expect(screen.getByText("Org project")).toBeInTheDocument();
  });

  it("excludes EU AI Act from the available compliance frameworks", () => {
    renderWithProviders(<FrameworkSettings {...defaultProps} />);
    expect(screen.queryByText("EU AI Act")).not.toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
    expect(screen.getByText("ISO 27001")).toBeInTheDocument();
  });

  it("shows 'Added' badge for frameworks already on the project", () => {
    renderWithProviders(<FrameworkSettings {...defaultProps} />);
    expect(screen.getByText("Added")).toBeInTheDocument();
  });

  it("opens the edit framework modal", async () => {
    renderWithProviders(<FrameworkSettings {...defaultProps} />);
    fireEvent.click(screen.getByText("Edit framework"));
    expect(screen.getByTestId("standard-modal")).toBeInTheDocument();
    expect(screen.getByTestId("project-form")).toBeInTheDocument();
  });

  it("opens the delete confirmation modal and deletes the project on success", async () => {
    mockDeleteProject.mockResolvedValue({ status: 200 });
    renderWithProviders(<FrameworkSettings {...defaultProps} />);
    fireEvent.click(screen.getByText("Delete framework"));
    expect(screen.getByText("Confirm delete")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => {
      expect(defaultProps.setProjects).toHaveBeenCalled();
    });
    expect(screen.getByText("Framework deleted successfully")).toBeInTheDocument();
  });

  it("shows an error alert when deleting the project fails", async () => {
    mockDeleteProject.mockResolvedValue({ status: 500 });
    renderWithProviders(<FrameworkSettings {...defaultProps} />);
    fireEvent.click(screen.getByText("Delete framework"));
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => {
      expect(screen.getByText("Failed to delete framework")).toBeInTheDocument();
    });
  });

  it("cancels the delete confirmation modal", () => {
    renderWithProviders(<FrameworkSettings {...defaultProps} />);
    fireEvent.click(screen.getByText("Delete framework"));
    fireEvent.click(screen.getByText("cancel"));
    expect(screen.queryByTestId("confirmation-modal")).not.toBeInTheDocument();
  });

  it("adds a framework that has not been added yet", async () => {
    mockAssignFrameworkToProject.mockResolvedValue({ status: 200 });
    renderWithProviders(<FrameworkSettings {...defaultProps} />);
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() => {
      expect(mockAssignFrameworkToProject).toHaveBeenCalledWith({
        frameworkId: 3,
        projectId: "1",
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Framework added successfully")).toBeInTheDocument();
    });
    expect(defaultProps.onProjectDataChanged).toHaveBeenCalled();
    expect(defaultProps.onFrameworksChanged).toHaveBeenCalled();
  });

  it("shows an error alert when adding a framework fails", async () => {
    mockAssignFrameworkToProject.mockResolvedValue({ status: 500 });
    renderWithProviders(<FrameworkSettings {...defaultProps} />);
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() => {
      expect(screen.getByText("Failed to add framework. Please try again.")).toBeInTheDocument();
    });
  });

  it("shows an error alert when adding a framework throws", async () => {
    mockAssignFrameworkToProject.mockRejectedValue(new Error("network"));
    renderWithProviders(<FrameworkSettings {...defaultProps} />);
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() => {
      expect(
        screen.getByText("An unexpected error occurred. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("opens the remove framework confirmation modal and removes it on success", async () => {
    mockDeleteEntityById.mockResolvedValue({ status: 200 });
    renderWithProviders(
      <FrameworkSettings
        {...defaultProps}
        organizationalProject={organizationalProjectTwoFrameworks}
      />,
    );
    fireEvent.click(screen.getAllByText("Remove")[0]);
    expect(screen.getByText("Confirm framework removal")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("confirmation-modal")).getByText("Remove"));
    await waitFor(() => {
      expect(mockDeleteEntityById).toHaveBeenCalledWith({
        routeUrl: "/frameworks/fromProject?frameworkId=2&projectId=1",
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Framework removed successfully")).toBeInTheDocument();
    });
  });

  it("shows an error alert when removing a framework fails", async () => {
    mockDeleteEntityById.mockResolvedValue({ status: 500 });
    renderWithProviders(
      <FrameworkSettings
        {...defaultProps}
        organizationalProject={organizationalProjectTwoFrameworks}
      />,
    );
    fireEvent.click(screen.getAllByText("Remove")[0]);
    fireEvent.click(within(screen.getByTestId("confirmation-modal")).getByText("Remove"));
    await waitFor(() => {
      expect(
        screen.getByText("Failed to remove framework. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("disables the remove button when it is the only framework on the project", () => {
    const singleFrameworkProject = {
      ...organizationalProject,
      framework: [{ project_framework_id: 100, framework_id: 2, name: "ISO 42001" }],
    };
    renderWithProviders(
      <FrameworkSettings
        {...defaultProps}
        organizationalProject={singleFrameworkProject}
        allFrameworks={[allFrameworks[0]]}
        filteredFrameworks={[allFrameworks[0]]}
      />,
    );
    const removeButton = screen.getByText("Remove").closest("button");
    expect(removeButton).toBeDisabled();
  });

  it("renders the plugin slot for custom framework management", () => {
    renderWithProviders(<FrameworkSettings {...defaultProps} />);
    expect(screen.getByTestId("plugin-slot")).toBeInTheDocument();
  });
});
