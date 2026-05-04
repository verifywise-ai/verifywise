import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FileUploadComponent } from "../index";

// Mock the CSS module
vi.mock("../drop-file-input.css", () => ({}));

describe("FileUploadComponent", () => {
  const defaultProps = {
    open: true,
    allowedFileTypes: ["application/pdf"],
    assessmentsValues: [{ file: [] }] as any,
    topicId: 0,
  };

  it("should render the upload heading", () => {
    renderWithProviders(<FileUploadComponent {...defaultProps} />);
    expect(screen.getByText("Upload a new file")).toBeInTheDocument();
  });

  it("should show supported formats text", () => {
    renderWithProviders(<FileUploadComponent {...defaultProps} />);
    expect(screen.getByText("Supported formats: PDF")).toBeInTheDocument();
  });

  it("should render drag and drop area", () => {
    renderWithProviders(<FileUploadComponent {...defaultProps} />);
    expect(screen.getByText(/Click to upload/)).toBeInTheDocument();
    expect(screen.getByText(/drag and drop/)).toBeInTheDocument();
  });

  it("should render Save button", () => {
    renderWithProviders(<FileUploadComponent {...defaultProps} />);
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("should accept a valid PDF file", async () => {
    renderWithProviders(<FileUploadComponent {...defaultProps} />);

    const file = new File(["pdf content"], "document.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector('input[type="file"]')!;

    fireEvent.change(input, { target: { files: [file] } });

    // File should appear in the list
    expect(await screen.findByText("document.pdf")).toBeInTheDocument();
  });

  it("should reject file with invalid type", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithProviders(<FileUploadComponent {...defaultProps} />);

    const file = new File(["text content"], "readme.txt", {
      type: "text/plain",
    });
    const input = document.querySelector('input[type="file"]')!;

    fireEvent.change(input, { target: { files: [file] } });

    // File should NOT appear in the list
    expect(screen.queryByText("readme.txt")).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("should prevent duplicate files", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderWithProviders(<FileUploadComponent {...defaultProps} />);

    const file = new File(["content"], "doc.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector('input[type="file"]')!;

    // Upload same file twice
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [file] } });

    // Should only appear once
    const items = await screen.findAllByText("doc.pdf");
    expect(items).toHaveLength(1);
    consoleSpy.mockRestore();
  });

  it("should remove a file when delete button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FileUploadComponent {...defaultProps} />);

    const file = new File(["content"], "remove-me.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("remove-me.pdf")).toBeInTheDocument();

    // Click the delete button
    const deleteButtons = screen.getAllByRole("button");
    const deleteBtn = deleteButtons.find(
      (btn) => btn !== screen.getByText("Save").closest("button"),
    );
    if (deleteBtn) {
      await user.click(deleteBtn);
      expect(screen.queryByText("remove-me.pdf")).not.toBeInTheDocument();
    }
  });

  it("should call onClose when Save is clicked", async () => {
    const mockOnClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<FileUploadComponent {...defaultProps} onClose={mockOnClose} />);

    await user.click(screen.getByText("Save"));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should call onHeightChange when files are added", async () => {
    const mockHeightChange = vi.fn();
    renderWithProviders(
      <FileUploadComponent {...defaultProps} onHeightChange={mockHeightChange} />,
    );

    const file = new File(["content"], "height-test.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("height-test.pdf")).toBeInTheDocument();
    // onHeightChange should have been called
    expect(mockHeightChange).toHaveBeenCalled();
  });
});
