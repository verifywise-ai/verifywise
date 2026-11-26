import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockAssignFrameworkToProject = vi.fn();
const mockDeleteEntityById = vi.fn();

vi.mock("../../../../application/repository/entity.repository", () => ({
  assignFrameworkToProject: (...args: any[]) => mockAssignFrameworkToProject(...args),
  deleteEntityById: (...args: any[]) => mockDeleteEntityById(...args),
}));

vi.mock("../../../../application/tools/log.engine", () => ({
  logEngine: vi.fn(),
}));

vi.mock("../../../components/PluginSlot", () => ({
  PluginSlot: () => null,
}));

vi.mock("../../../../domain/constants/pluginSlots", () => ({
  PLUGIN_SLOTS: { FRAMEWORK_SELECTION: "framework-selection" },
}));

import AddFrameworkModal from "./index";
import CustomException from "../../../../infrastructure/exceptions/customeException";
import type { Project } from "../../../../domain/types/Project";
import type { Framework } from "../../../../domain/types/Framework";

const frameworks: Framework[] = [
  { id: "1", name: "EU AI Act", description: "EU AI Act description" } as Framework,
  { id: "2", name: "ISO 42001", description: "ISO 42001 description" } as Framework,
];

const project = {
  id: 7,
  framework: [{ project_framework_id: 1, framework_id: 1, name: "EU AI Act" }],
} as unknown as Project;

describe("AddFrameworkModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an 'Added' badge and Remove button for frameworks already on the project", () => {
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={vi.fn()} frameworks={frameworks} project={project} />,
    );

    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("shows the reason instead of Remove for a locked framework", () => {
    renderWithProviders(
      <AddFrameworkModal
        open={true}
        onClose={vi.fn()}
        frameworks={frameworks}
        project={project}
        lockedFrameworks={{ 1: "Required while a use case has EU AI Act" }}
      />,
    );

    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(screen.getByText("Required while a use case has EU AI Act")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("shows the server's reason when a removal is refused", async () => {
    mockDeleteEntityById.mockRejectedValue(
      new CustomException("EU AI Act (organization) can't be removed", 400, {}),
    );
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={vi.fn()} frameworks={frameworks} project={project} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const confirm = await screen.findAllByRole("button", { name: "Remove" });
    fireEvent.click(confirm[confirm.length - 1]);

    expect(
      await screen.findByText("EU AI Act (organization) can't be removed"),
    ).toBeInTheDocument();
  });

  it("says EU AI Act (organization) was added when the server added it", async () => {
    mockAssignFrameworkToProject.mockResolvedValue({
      status: 200,
      data: { data: { organization_framework_added: true } },
    });
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={vi.fn()} frameworks={frameworks} project={project} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText(
        "EU AI Act (organization) was added for the organization's own obligations. Admins fill it in on the Frameworks page.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an Add button for frameworks not yet on the project", () => {
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={vi.fn()} frameworks={frameworks} project={project} />,
    );

    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("adds a framework successfully and calls onFrameworksChanged", async () => {
    mockAssignFrameworkToProject.mockResolvedValue({ status: 200 });
    const onFrameworksChanged = vi.fn();
    renderWithProviders(
      <AddFrameworkModal
        open={true}
        onClose={vi.fn()}
        frameworks={frameworks}
        project={project}
        onFrameworksChanged={onFrameworksChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockAssignFrameworkToProject).toHaveBeenCalledWith({
        frameworkId: 2,
        projectId: "7",
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Framework added successfully")).toBeInTheDocument();
    });
    expect(onFrameworksChanged).toHaveBeenCalledWith("add");
  });

  it("shows an error toast when adding fails with a non-2xx response", async () => {
    mockAssignFrameworkToProject.mockResolvedValue({ status: 500 });
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={vi.fn()} frameworks={frameworks} project={project} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("Failed to add framework. Please try again."),
    ).toBeInTheDocument();
  });

  it("shows an error toast when adding throws", async () => {
    mockAssignFrameworkToProject.mockRejectedValue(new Error("network error"));
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={vi.fn()} frameworks={frameworks} project={project} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("An unexpected error occurred. Please try again."),
    ).toBeInTheDocument();
  });

  it("opens a confirmation modal and removes a framework on confirm", async () => {
    mockDeleteEntityById.mockResolvedValue({ status: 200 });
    const onFrameworksChanged = vi.fn();
    renderWithProviders(
      <AddFrameworkModal
        open={true}
        onClose={vi.fn()}
        frameworks={frameworks}
        project={project}
        onFrameworksChanged={onFrameworksChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(
      screen.getByText("Are you sure you want to remove EU AI Act from the project?"),
    ).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(removeButtons[removeButtons.length - 1]);

    await waitFor(() => {
      expect(mockDeleteEntityById).toHaveBeenCalledWith({
        routeUrl: "/frameworks/fromProject?frameworkId=1&projectId=7",
      });
    });
    await waitFor(() => {
      expect(onFrameworksChanged).toHaveBeenCalledWith("remove", 1);
    });
  });

  it("cancels the removal confirmation without calling deleteEntityById", () => {
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={vi.fn()} frameworks={frameworks} project={project} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockDeleteEntityById).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Are you sure you want to remove EU AI Act from the project?"),
    ).not.toBeInTheDocument();
  });

  it("shows an error toast when framework removal fails", async () => {
    mockDeleteEntityById.mockResolvedValue({ status: 500 });
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={vi.fn()} frameworks={frameworks} project={project} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(removeButtons[removeButtons.length - 1]);

    expect(
      await screen.findByText("Failed to remove framework. Please try again."),
    ).toBeInTheDocument();
  });

  it("calls onClose when Done is clicked", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={onClose} frameworks={frameworks} project={project} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});
