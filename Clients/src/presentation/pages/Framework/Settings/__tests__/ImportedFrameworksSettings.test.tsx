import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockCan = vi.fn((_key: string) => true);
vi.mock("../../../../../application/hooks/useCan", () => ({
  useCan: (key: string) => mockCan(key),
  useCanCheck: () => (key: string) => mockCan(key),
}));

const mockIsEnabled = vi.fn((_key: string) => true);
vi.mock("../../../../../application/contexts/Extensions.context", () => ({
  useExtensions: () => ({ isEnabled: mockIsEnabled }),
  ExtensionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockImportedFrameworks = vi.fn(() => [] as unknown[]);
const mockQueryState = vi.fn(() => ({ isLoading: false, isError: false }));
const mockUseImportedFrameworks = vi.fn((_opts?: { enabled?: boolean }) => ({
  data: mockImportedFrameworks(),
  ...mockQueryState(),
}));
const mockDeleteImported = vi.fn();
vi.mock("../../../../../application/hooks/useFrameworkImport", () => ({
  useImportedFrameworks: (opts?: { enabled?: boolean }) => mockUseImportedFrameworks(opts),
  useDeleteImportedFramework: () => ({ mutateAsync: mockDeleteImported, isPending: false }),
}));

vi.mock("../../Components/FrameworkImportModal", () => ({
  default: () => <div data-testid="framework-import-modal" />,
}));

import ImportedFrameworksSettings from "../ImportedFrameworksSettings";

const importedFramework = {
  id: 9,
  name: "Internal AI policy",
  description: null,
  is_active: true,
  created_at: "",
  updated_at: "",
  topics: [{ id: 1, subtopics: [{ id: 1 }, { id: 2 }] }],
};

describe("ImportedFrameworksSettings (#5254)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCan.mockImplementation(() => true);
    mockImportedFrameworks.mockReturnValue([importedFramework]);
    mockQueryState.mockReturnValue({ isLoading: false, isError: false });
    mockIsEnabled.mockImplementation(() => true);
  });

  it("fetches the list only while the framework-import extension is enabled", () => {
    mockIsEnabled.mockImplementation(() => false);
    renderWithProviders(<ImportedFrameworksSettings />);
    expect(mockUseImportedFrameworks).toHaveBeenCalledWith({ enabled: false });
  });

  it("says the list is loading instead of showing the empty state", () => {
    mockImportedFrameworks.mockReturnValue([]);
    mockQueryState.mockReturnValue({ isLoading: true, isError: false });
    renderWithProviders(<ImportedFrameworksSettings />);
    expect(screen.getByText("Loading imported frameworks...")).toBeInTheDocument();
    expect(screen.queryByText(/No imported frameworks yet/)).not.toBeInTheDocument();
  });

  it("says the list failed to load instead of showing the empty state", () => {
    mockImportedFrameworks.mockReturnValue([]);
    mockQueryState.mockReturnValue({ isLoading: false, isError: true });
    renderWithProviders(<ImportedFrameworksSettings />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load imported frameworks");
    expect(screen.queryByText(/No imported frameworks yet/)).not.toBeInTheDocument();
  });

  it("lists imported frameworks with their topic and subtopic counts", () => {
    renderWithProviders(<ImportedFrameworksSettings />);
    expect(screen.getByText("Imported frameworks")).toBeInTheDocument();
    expect(screen.getByText("Internal AI policy")).toBeInTheDocument();
    expect(screen.getByText(/1 topic\(s\) · 2 subtopic\(s\)/)).toBeInTheDocument();
  });

  it("shows an empty state when nothing is imported", () => {
    mockImportedFrameworks.mockReturnValue([]);
    renderWithProviders(<ImportedFrameworksSettings />);
    expect(screen.getByText(/No imported frameworks yet/)).toBeInTheDocument();
  });

  it("says imported frameworks are added from the use case's Frameworks tab", () => {
    renderWithProviders(<ImportedFrameworksSettings />);
    expect(screen.getByText(/Add one to a use case from that use case/)).toBeInTheDocument();
  });

  it("gates import and delete on ext.frameworkImport.edit", () => {
    mockCan.mockImplementation((key) => key !== "ext.frameworkImport.edit");
    renderWithProviders(<ImportedFrameworksSettings />);
    expect(mockCan).toHaveBeenCalledWith("ext.frameworkImport.edit");
    expect(screen.getByRole("button", { name: "Import from Excel" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Delete Internal AI policy" }),
    ).not.toBeInTheDocument();
  });

  it("opens the import dialog", () => {
    renderWithProviders(<ImportedFrameworksSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Import from Excel" }));
    expect(screen.getByTestId("framework-import-modal")).toBeInTheDocument();
  });

  it("shows Delete as a destructive (error) button", () => {
    renderWithProviders(<ImportedFrameworksSettings />);
    const deleteButton = screen.getByRole("button", { name: "Delete Internal AI policy" });
    expect(deleteButton.className).toMatch(/colorError/);
  });

  it("keeps the delete dialog open with the server's reason when the framework is in use", async () => {
    mockDeleteImported.mockRejectedValue(
      new Error("Used by these use cases: Credit scoring. Remove it from them first."),
    );
    renderWithProviders(<ImportedFrameworksSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Internal AI policy" }));
    expect(
      screen.getByText(/cannot be deleted: remove it from those use cases first/),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText(
        "Used by these use cases: Credit scoring. Remove it from them first.",
      ),
    ).toBeInTheDocument();
    expect(mockDeleteImported).toHaveBeenCalledWith(9);
  });
});
