import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { PolicyHeader, type PolicyHeaderProps } from "../PolicyHeader";

function baseProps(overrides: Partial<PolicyHeaderProps> = {}): PolicyHeaderProps {
  return {
    pageTitle: "New policy",
    isEditingTitle: false,
    editedTitle: "",
    isSavingTitle: false,
    onBack: vi.fn(),
    onStartEditTitle: vi.fn(),
    onEditedTitleChange: vi.fn(),
    onSaveTitle: vi.fn(),
    onCancelEditTitle: vi.fn(),
    isNew: true,
    hasPolicyId: false,
    isHistorySidebarOpen: false,
    onToggleHistorySidebar: vi.fn(),
    isExportingPDF: false,
    isExportingDOCX: false,
    exportError: null,
    onDownloadExport: vi.fn(),
    isImporting: false,
    onDocxFileSelect: vi.fn(),
    isSaving: false,
    saveSuccess: false,
    isSaveDisabled: false,
    saveButtonText: "Save",
    onSave: vi.fn(),
    ...overrides,
  };
}

describe("PolicyHeader", () => {
  it("renders both the title area and actions bar", () => {
    renderWithProviders(<PolicyHeader {...baseProps()} />);
    expect(screen.getByText("New policy")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("wires the save action through to onSave", () => {
    const onSave = vi.fn();
    renderWithProviders(<PolicyHeader {...baseProps({ onSave })} />);
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalled();
  });

  it("wires the back action through to onBack", () => {
    const onBack = vi.fn();
    renderWithProviders(<PolicyHeader {...baseProps({ onBack })} />);
    fireEvent.click(screen.getByRole("button", { name: /back to policies/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows export/import/history actions for an existing policy", () => {
    renderWithProviders(<PolicyHeader {...baseProps({ isNew: false, hasPolicyId: true })} />);
    expect(screen.getByLabelText("Activity history")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument();
  });
});
