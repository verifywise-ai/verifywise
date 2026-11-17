import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import BulkUploadButton from "../BulkUploadButton";
import BulkUploadModal from "../BulkUploadModal";
import FilePreviewAndMetadata from "../FilePreviewAndMetadata";
import type { FileAnalysis } from "../useFileAnalysis";

vi.mock("../../../../../application/hooks/useCan", () => ({
  useCan: () => true,
  useCanCheck: () => () => true,
  usePermissionsSettled: () => true,
}));

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userToken: { name: "Ada" } }),
}));

vi.mock("../../../../../infrastructure/api/networkServices", () => ({
  apiServices: { post: vi.fn() },
}));

function analysis(overrides: Partial<FileAnalysis> = {}): FileAnalysis {
  return {
    file: new File(["a,b"], "customers.csv"),
    fileName: "customers.csv",
    fileSize: 3,
    format: "CSV",
    headers: ["a", "b"],
    rowCount: 1,
    previewRows: [{ a: "1", b: "2" }],
    pii: { containsPii: false, piiColumns: [] },
    skipped: false,
    metadata: {
      name: "customers",
      description: "",
      version: "1.0",
      format: "CSV",
      type: "",
      classification: "",
      contains_pii: false,
      pii_types: "",
      owner: "",
      source: "",
      status: "Draft",
    },
    ...overrides,
  };
}

describe("BulkUploadButton", () => {
  it("uses the default control size, like the button beside it", () => {
    renderWithProviders(<BulkUploadButton onClick={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Bulk upload" });
    expect(button.className).not.toContain("MuiButton-sizeSmall");
    expect(button.className).toContain("MuiButton-sizeMedium");
  });
});

describe("BulkUploadModal", () => {
  it("shows a sentence-case title and step names", () => {
    renderWithProviders(<BulkUploadModal open onClose={vi.fn()} />);

    expect(screen.getByText("Dataset bulk upload")).toBeInTheDocument();
    expect(screen.getByText("Select files")).toBeInTheDocument();
    expect(screen.getByText("Review metadata")).toBeInTheDocument();
  });
});

describe("FilePreviewAndMetadata", () => {
  it("applies the batch defaults from the Apply button", () => {
    const onApplyBatchDefaults = vi.fn();
    renderWithProviders(
      <FilePreviewAndMetadata
        analyses={[analysis()]}
        onUpdateMetadata={vi.fn()}
        onToggleSkip={vi.fn()}
        onApplyBatchDefaults={onApplyBatchDefaults}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Owner name"), { target: { value: "Data team" } });
    fireEvent.click(screen.getByTestId("dataset-bulk-upload-apply-defaults"));

    expect(onApplyBatchDefaults).toHaveBeenCalledWith({ owner: "Data team" });
  });

  it("does not apply when no default is set", () => {
    const onApplyBatchDefaults = vi.fn();
    renderWithProviders(
      <FilePreviewAndMetadata
        analyses={[analysis()]}
        onUpdateMetadata={vi.fn()}
        onToggleSkip={vi.fn()}
        onApplyBatchDefaults={onApplyBatchDefaults}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApplyBatchDefaults).not.toHaveBeenCalled();
  });
});
