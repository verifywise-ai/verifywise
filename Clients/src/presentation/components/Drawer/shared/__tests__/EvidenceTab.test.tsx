import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import EvidenceTab from "../EvidenceTab";
import type { UseEvidenceFilesReturn } from "../useEvidenceFiles";

vi.mock("../../../FilePickerModal", () => ({
  FilePickerModal: ({ open, title }: { open: boolean; title?: string }) =>
    open ? <div data-testid="file-picker-modal">{title}</div> : null,
}));

function makeEvidence(overrides: Partial<UseEvidenceFilesReturn> = {}): UseEvidenceFilesReturn {
  return {
    evidenceFiles: [],
    uploadFiles: [],
    pendingAttachFiles: [],
    deletedFileIds: [],
    showFilePicker: false,
    setShowFilePicker: vi.fn(),
    loadFiles: vi.fn(),
    handleAddFiles: vi.fn(),
    handleAttachExistingFiles: vi.fn(),
    handleRemovePendingAttach: vi.fn(),
    handleDeleteEvidenceFile: vi.fn(),
    handleDeleteUploadFile: vi.fn(),
    handleDownloadFile: vi.fn(),
    resetPending: vi.fn(),
    setEvidenceFiles: vi.fn(),
    ...overrides,
  } as UseEvidenceFilesReturn;
}

describe("EvidenceTab", () => {
  it("renders the default body text", () => {
    renderWithProviders(<EvidenceTab evidence={makeEvidence()} />);

    expect(
      screen.getByText("Upload evidence files to document how this requirement is implemented."),
    ).toBeInTheDocument();
  });

  it("renders custom body text when provided", () => {
    renderWithProviders(<EvidenceTab evidence={makeEvidence()} bodyText="Custom instructions" />);

    expect(screen.getByText("Custom instructions")).toBeInTheDocument();
  });

  it("shows the empty state and zero-count when there are no files", () => {
    renderWithProviders(<EvidenceTab evidence={makeEvidence()} />);

    expect(screen.getByText("0 files attached")).toBeInTheDocument();
    expect(screen.getByText("No evidence files uploaded yet")).toBeInTheDocument();
  });

  it("renders each evidence file with its size and source", () => {
    const evidence = makeEvidence({
      evidenceFiles: [
        { id: "1", fileName: "report.pdf", size: 2048, source: "File Manager" } as any,
      ],
    });
    renderWithProviders(<EvidenceTab evidence={evidence} />);

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
    expect(screen.getByText(/Source: File Manager/)).toBeInTheDocument();
    expect(screen.getByText("1 files attached")).toBeInTheDocument();
  });

  it("calls handleDownloadFile with the file id and name when the download icon is clicked", () => {
    const evidence = makeEvidence({
      evidenceFiles: [{ id: "1", fileName: "report.pdf", size: 100 } as any],
    });
    renderWithProviders(<EvidenceTab evidence={evidence} />);

    fireEvent.click(screen.getByRole("button", { name: "Download file" }));

    expect(evidence.handleDownloadFile).toHaveBeenCalledWith("1", "report.pdf");
  });

  it("calls handleDeleteEvidenceFile when the delete icon is clicked", () => {
    const evidence = makeEvidence({
      evidenceFiles: [{ id: "1", fileName: "report.pdf", size: 100 } as any],
    });
    renderWithProviders(<EvidenceTab evidence={evidence} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete file" }));

    expect(evidence.handleDeleteEvidenceFile).toHaveBeenCalledWith("1");
  });

  it("disables the evidence delete icon when isEditingDisabled", () => {
    const evidence = makeEvidence({
      evidenceFiles: [{ id: "1", fileName: "report.pdf", size: 100 } as any],
    });
    renderWithProviders(<EvidenceTab evidence={evidence} isEditingDisabled />);

    expect(screen.getByRole("button", { name: "Delete file" })).toBeDisabled();
  });

  it("shows the pending-upload section and removes a file from the queue", () => {
    const evidence = makeEvidence({
      uploadFiles: [{ id: "u1", fileName: "new.pdf", size: 500 } as any],
    });
    renderWithProviders(<EvidenceTab evidence={evidence} />);

    expect(screen.getByText("Pending upload")).toBeInTheDocument();
    expect(screen.getByText("+1 pending upload")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove from queue" }));

    expect(evidence.handleDeleteUploadFile).toHaveBeenCalledWith("u1");
  });

  it("shows the pending-attach section and removes a file from the queue", () => {
    const evidence = makeEvidence({
      pendingAttachFiles: [{ id: "a1", fileName: "existing.pdf" } as any],
    });
    renderWithProviders(<EvidenceTab evidence={evidence} />);

    expect(screen.getByText("Pending attach")).toBeInTheDocument();
    expect(screen.getByText("+1 pending attach")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove from queue" }));

    expect(evidence.handleRemovePendingAttach).toHaveBeenCalledWith("a1");
  });

  it("shows the pending-delete count badge", () => {
    const evidence = makeEvidence({ deletedFileIds: [1, 2] });
    renderWithProviders(<EvidenceTab evidence={evidence} />);

    expect(screen.getByText("-2 pending delete")).toBeInTheDocument();
  });

  it("opens the file picker when 'Attach existing files' is clicked", () => {
    const evidence = makeEvidence();
    renderWithProviders(<EvidenceTab evidence={evidence} />);

    fireEvent.click(screen.getByText("Attach existing files"));

    expect(evidence.setShowFilePicker).toHaveBeenCalledWith(true);
  });

  it("renders the file picker modal when showFilePicker is true", () => {
    const evidence = makeEvidence({ showFilePicker: true });
    renderWithProviders(<EvidenceTab evidence={evidence} />);

    expect(screen.getByTestId("file-picker-modal")).toBeInTheDocument();
  });

  it("disables the upload and attach buttons when isEditingDisabled", () => {
    renderWithProviders(<EvidenceTab evidence={makeEvidence()} isEditingDisabled />);

    expect(screen.getByText("Upload new files").closest("button")).toBeDisabled();
    expect(screen.getByText("Attach existing files").closest("button")).toBeDisabled();
  });
});
