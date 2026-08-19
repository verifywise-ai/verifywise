import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import {
  PolicyEditorActionsBar,
  type PolicyEditorActionsBarProps,
} from "../PolicyEditorActionsBar";

function baseProps(
  overrides: Partial<PolicyEditorActionsBarProps> = {},
): PolicyEditorActionsBarProps {
  return {
    isNew: false,
    hasPolicyId: true,
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

describe("PolicyEditorActionsBar", () => {
  it("renders history, export, import and save controls for an existing policy", () => {
    renderWithProviders(<PolicyEditorActionsBar {...baseProps()} />);
    expect(screen.getByLabelText("Activity history")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument();
    expect(screen.getByText("Import")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("hides history and export controls for a brand new policy", () => {
    renderWithProviders(
      <PolicyEditorActionsBar {...baseProps({ isNew: true, hasPolicyId: false })} />,
    );
    expect(screen.queryByTitle("Activity history")).not.toBeInTheDocument();
    expect(screen.queryByText("Export")).not.toBeInTheDocument();
  });

  it("calls onToggleHistorySidebar when the history button is clicked", () => {
    const onToggleHistorySidebar = vi.fn();
    renderWithProviders(<PolicyEditorActionsBar {...baseProps({ onToggleHistorySidebar })} />);
    fireEvent.click(screen.getByLabelText("Activity history"));
    expect(onToggleHistorySidebar).toHaveBeenCalled();
  });

  it("opens the export menu and downloads a PDF when selected", () => {
    const onDownloadExport = vi.fn();
    renderWithProviders(<PolicyEditorActionsBar {...baseProps({ onDownloadExport })} />);
    fireEvent.click(screen.getByText("Export"));
    fireEvent.click(screen.getByText("Download as PDF"));
    expect(onDownloadExport).toHaveBeenCalledWith("pdf");
  });

  it("opens the export menu and downloads a Word doc when selected", () => {
    const onDownloadExport = vi.fn();
    renderWithProviders(<PolicyEditorActionsBar {...baseProps({ onDownloadExport })} />);
    fireEvent.click(screen.getByText("Export"));
    fireEvent.click(screen.getByText("Download as Word"));
    expect(onDownloadExport).toHaveBeenCalledWith("docx");
  });

  it("shows exporting labels while an export is in progress", () => {
    renderWithProviders(<PolicyEditorActionsBar {...baseProps({ isExportingPDF: true })} />);
    expect(screen.getByText("Exporting PDF...")).toBeInTheDocument();
  });

  it("shows the export error message when present", () => {
    renderWithProviders(
      <PolicyEditorActionsBar {...baseProps({ exportError: "Export failed" })} />,
    );
    expect(screen.getByText("Export failed")).toBeInTheDocument();
  });

  it("triggers the hidden file input when Import is clicked", () => {
    renderWithProviders(<PolicyEditorActionsBar {...baseProps()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    fireEvent.click(screen.getByText("Import"));
    expect(clickSpy).toHaveBeenCalled();
  });

  it("calls onDocxFileSelect when a file is selected", () => {
    const onDocxFileSelect = vi.fn();
    renderWithProviders(<PolicyEditorActionsBar {...baseProps({ onDocxFileSelect })} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input);
    expect(onDocxFileSelect).toHaveBeenCalled();
  });

  it("shows the importing label while importing", () => {
    renderWithProviders(<PolicyEditorActionsBar {...baseProps({ isImporting: true })} />);
    expect(screen.getByText("Importing...")).toBeInTheDocument();
  });

  it("calls onSave when the save button is clicked", () => {
    const onSave = vi.fn();
    renderWithProviders(<PolicyEditorActionsBar {...baseProps({ onSave })} />);
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalled();
  });

  it("shows a spinner icon on the save button while saving", () => {
    renderWithProviders(<PolicyEditorActionsBar {...baseProps({ isSaving: true })} />);
    const saveButton = screen.getByText("Save").closest("button")!;
    expect(saveButton.querySelector(".lucide-loader-circle")).toBeInTheDocument();
  });

  it("shows the saved confirmation state", () => {
    renderWithProviders(
      <PolicyEditorActionsBar {...baseProps({ saveButtonText: "Saved", saveSuccess: true })} />,
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("disables the save button when isSaveDisabled is true", () => {
    renderWithProviders(<PolicyEditorActionsBar {...baseProps({ isSaveDisabled: true })} />);
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
  });
});
