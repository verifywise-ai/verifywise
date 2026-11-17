import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockIsEnabled = vi.fn();
vi.mock("../../../../application/contexts/Extensions.context", () => ({
  useExtensions: () => ({ isEnabled: mockIsEnabled }),
  ExtensionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockGetImportedFrameworks = vi.fn();
vi.mock("../../../../application/repository/frameworkImport.repository", () => ({
  getImportedFrameworks: () => mockGetImportedFrameworks(),
}));

const mockGetLinks = vi.fn();
const mockAttach = vi.fn();
const mockDetach = vi.fn();
vi.mock("../../../../application/repository/importedFrameworkAssessment.repository", () => ({
  getProjectImportedFrameworks: (...args: unknown[]) => mockGetLinks(...args),
  attachImportedFramework: (...args: unknown[]) => mockAttach(...args),
  detachImportedFramework: (...args: unknown[]) => mockDetach(...args),
  getImportedFrameworkDashboard: vi.fn(),
}));

vi.mock("../../../../application/repository/entity.repository", () => ({
  assignFrameworkToProject: vi.fn(),
  deleteEntityById: vi.fn(),
}));

import AddFrameworkModal from "./index";
import type { Project } from "../../../../domain/types/Project";
import type { Framework } from "../../../../domain/types/Framework";

const frameworks: Framework[] = [
  { id: "2", name: "ISO 42001", description: "ISO 42001 description" } as Framework,
];

const project = {
  id: 7,
  framework: [],
  is_organizational: false,
} as unknown as Project;

const importedFramework = (id: number, name: string, isActive = true) => ({
  id,
  name,
  description: null,
  is_active: isActive,
  created_at: "",
  updated_at: "",
  topics: [{ id: 1, topic_number: "1", name: "T", description: null, order_no: 1, subtopics: [] }],
});

describe("AddFrameworkModal imported frameworks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEnabled.mockImplementation((key: string) => key === "framework-import");
    mockGetImportedFrameworks.mockResolvedValue([
      importedFramework(1, "Internal AI policy"),
      importedFramework(2, "Vendor checklist"),
      importedFramework(3, "Retired policy", false),
    ]);
    mockGetLinks.mockResolvedValue([
      {
        id: 40,
        imported_framework_id: 2,
        name: "Vendor checklist",
        description: null,
        created_at: "",
      },
    ]);
  });

  it("lists active imports, marks attached ones and hides inactive unattached ones", async () => {
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={vi.fn()} frameworks={frameworks} project={project} />,
    );

    const section = await screen.findByTestId("imported-frameworks-section");
    expect(within(section).getByText("Internal AI policy")).toBeInTheDocument();
    expect(within(section).getByText("Vendor checklist")).toBeInTheDocument();
    expect(within(section).queryByText("Retired policy")).not.toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Add Internal AI policy" })).toBeVisible();
    expect(within(section).getByRole("button", { name: "Remove Vendor checklist" })).toBeVisible();
    expect(mockGetLinks).toHaveBeenCalledWith(7);
  });

  it("attaches an imported framework and reports the change", async () => {
    mockAttach.mockResolvedValue({ id: 41 });
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

    fireEvent.click(await screen.findByRole("button", { name: "Add Internal AI policy" }));

    await waitFor(() =>
      expect(mockAttach).toHaveBeenCalledWith({ projectId: 7, importedFrameworkId: 1 }),
    );
    await waitFor(() => expect(onFrameworksChanged).toHaveBeenCalledWith("add"));
  });

  it("shows the server message when attaching fails", async () => {
    mockAttach.mockRejectedValue(new Error("This framework is already on this use case"));
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={vi.fn()} frameworks={frameworks} project={project} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add Internal AI policy" }));

    expect(
      await screen.findByText("This framework is already on this use case"),
    ).toBeInTheDocument();
  });

  it("asks for confirmation before removing, then detaches the link", async () => {
    mockDetach.mockResolvedValue(undefined);
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

    fireEvent.click(await screen.findByRole("button", { name: "Remove Vendor checklist" }));
    expect(mockDetach).not.toHaveBeenCalled();
    expect(screen.getByText(/Its assessment in this use case is deleted/)).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(mockDetach).toHaveBeenCalledWith({ projectId: 7, linkId: 40 }));
    await waitFor(() => expect(onFrameworksChanged).toHaveBeenCalledWith("removeImported"));
  });

  it("hides the section while the framework-import extension is off", async () => {
    mockIsEnabled.mockReturnValue(false);
    renderWithProviders(
      <AddFrameworkModal open={true} onClose={vi.fn()} frameworks={frameworks} project={project} />,
    );

    expect(await screen.findByText("ISO 42001")).toBeInTheDocument();
    expect(screen.queryByTestId("imported-frameworks-section")).not.toBeInTheDocument();
    expect(mockGetImportedFrameworks).not.toHaveBeenCalled();
  });

  it("hides the section on organizational projects", async () => {
    renderWithProviders(
      <AddFrameworkModal
        open={true}
        onClose={vi.fn()}
        frameworks={frameworks}
        project={{ ...project, is_organizational: true } as Project}
      />,
    );

    expect(await screen.findByText("ISO 42001")).toBeInTheDocument();
    expect(screen.queryByTestId("imported-frameworks-section")).not.toBeInTheDocument();
  });
});
