import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockGetEvidence = vi.fn();
const mockLinkEvidence = vi.fn();
const mockUnlinkEvidence = vi.fn();

vi.mock("../../../../application/repository/fria.repository", () => ({
  friaRepository: {
    getEvidence: (...args: any[]) => mockGetEvidence(...args),
    linkEvidence: (...args: any[]) => mockLinkEvidence(...args),
    unlinkEvidence: (...args: any[]) => mockUnlinkEvidence(...args),
  },
}));

let pickerOnSelect: ((files: any[]) => void) | undefined;
vi.mock("../../../components/FilePickerModal", () => ({
  FilePickerModal: ({ open, onSelect }: any) => {
    pickerOnSelect = onSelect;
    return open ? <div data-testid="file-picker-modal" /> : null;
  },
}));

let uploadOnSuccess: ((file: any) => void) | undefined;
vi.mock("../../../components/Modals/FileUpload", () => ({
  default: ({ uploadProps }: any) => {
    uploadOnSuccess = uploadProps.onSuccess;
    return uploadProps.open ? <div data-testid="file-upload-modal" /> : null;
  },
}));

import FriaEvidenceButton from "./FriaEvidenceButton";

describe("FriaEvidenceButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pickerOnSelect = undefined;
    uploadOnSuccess = undefined;
    mockGetEvidence.mockResolvedValue([]);
  });

  it("fetches evidence for the given fria id and section on mount", async () => {
    mockGetEvidence.mockResolvedValue([
      { id: 1, link_id: 10, file_name: "doc.pdf" },
    ]);
    renderWithProviders(<FriaEvidenceButton friaId={1} entityType="section_1" />);

    await waitFor(() => {
      expect(mockGetEvidence).toHaveBeenCalledWith(1, "section_1");
    });
    expect(await screen.findByText("doc.pdf")).toBeInTheDocument();
  });

  it("does not fetch evidence when friaId is falsy", () => {
    renderWithProviders(<FriaEvidenceButton friaId={0} entityType="section_1" />);
    expect(mockGetEvidence).not.toHaveBeenCalled();
  });

  it("renders the default and custom label", async () => {
    const { rerender } = renderWithProviders(
      <FriaEvidenceButton friaId={1} entityType="section_1" />,
    );
    await waitFor(() => expect(mockGetEvidence).toHaveBeenCalled());
    expect(screen.getByText("Attach evidence")).toBeInTheDocument();

    rerender(<FriaEvidenceButton friaId={1} entityType="section_1" label="Custom label" />);
    expect(screen.getByText("Custom label")).toBeInTheDocument();
  });

  it("opens the file picker modal", async () => {
    renderWithProviders(<FriaEvidenceButton friaId={1} entityType="section_1" />);
    await waitFor(() => expect(mockGetEvidence).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Attach evidence"));
    expect(screen.getByTestId("file-picker-modal")).toBeInTheDocument();
  });

  it("links evidence when files are selected via the picker", async () => {
    mockLinkEvidence.mockResolvedValue(undefined);
    renderWithProviders(<FriaEvidenceButton friaId={1} entityType="section_1" />);
    await waitFor(() => expect(mockGetEvidence).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Attach evidence"));
    await waitFor(() => expect(pickerOnSelect).toBeDefined());

    await pickerOnSelect!([{ id: "5", fileName: "new.pdf" }]);

    await waitFor(() => {
      expect(mockLinkEvidence).toHaveBeenCalledWith(1, 5, "section_1");
    });
  });

  it("opens the upload modal and links evidence on upload success", async () => {
    mockLinkEvidence.mockResolvedValue(undefined);
    renderWithProviders(<FriaEvidenceButton friaId={1} entityType="section_2" />);
    await waitFor(() => expect(mockGetEvidence).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Upload new"));
    expect(screen.getByTestId("file-upload-modal")).toBeInTheDocument();
    await waitFor(() => expect(uploadOnSuccess).toBeDefined());

    await uploadOnSuccess!({ data: { id: 42 } });

    await waitFor(() => {
      expect(mockLinkEvidence).toHaveBeenCalledWith(1, 42, "section_2");
    });
  });

  it("does nothing on upload success when no file id is present", async () => {
    renderWithProviders(<FriaEvidenceButton friaId={1} entityType="section_2" />);
    await waitFor(() => expect(mockGetEvidence).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Upload new"));
    await waitFor(() => expect(uploadOnSuccess).toBeDefined());

    await uploadOnSuccess!({});
    expect(mockLinkEvidence).not.toHaveBeenCalled();
  });

  it("removes a linked evidence file", async () => {
    mockGetEvidence.mockResolvedValue([{ id: 1, link_id: 10, file_name: "doc.pdf" }]);
    mockUnlinkEvidence.mockResolvedValue(undefined);
    renderWithProviders(<FriaEvidenceButton friaId={1} entityType="section_1" />);

    const fileChip = await screen.findByText("doc.pdf");
    const removeIcon = fileChip.parentElement?.querySelector("span[class]");
    fireEvent.click(removeIcon!);

    await waitFor(() => {
      expect(mockUnlinkEvidence).toHaveBeenCalledWith(1, 10);
    });
    await waitFor(() => {
      expect(screen.queryByText("doc.pdf")).not.toBeInTheDocument();
    });
  });

  it("resets files on fetch failure", async () => {
    mockGetEvidence.mockRejectedValue(new Error("network error"));
    renderWithProviders(<FriaEvidenceButton friaId={1} entityType="section_1" />);

    await waitFor(() => expect(mockGetEvidence).toHaveBeenCalled());
    expect(screen.queryByText("doc.pdf")).not.toBeInTheDocument();
  });
});
