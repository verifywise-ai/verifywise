import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import Uploader from "../index";

// Mock useIsAdmin hook
vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => true,
}));

// Mock customizable-button
vi.mock("../../button/customizable-button", () => ({
  CustomizableButton: ({ text, onClick }: { text: string; onClick?: () => void }) => (
    <button onClick={onClick}>{text}</button>
  ),
}));

describe("Uploader", () => {
  it("renders the upload area", () => {
    renderWithProviders(<Uploader />);
    expect(screen.getByText("Click to upload")).toBeInTheDocument();
    expect(screen.getByText(/or drag and drop/)).toBeInTheDocument();
  });

  it("renders the header title", () => {
    renderWithProviders(<Uploader />);
    expect(screen.getByText("Modern File Uploader")).toBeInTheDocument();
  });

  it("shows max file size in the description", () => {
    renderWithProviders(<Uploader />);
    expect(screen.getByText(/Max 10 MB per file/)).toBeInTheDocument();
  });

  it("shows supported formats", () => {
    renderWithProviders(<Uploader />);
    expect(screen.getByText(/Supported formats:/)).toBeInTheDocument();
  });

  it("renders with custom max file size", () => {
    renderWithProviders(<Uploader maxFileSize={5 * 1024 * 1024} />);
    expect(screen.getByText(/Max 5 MB per file/)).toBeInTheDocument();
  });

  it("shows single file upload text when multiple is false", () => {
    renderWithProviders(<Uploader multiple={false} />);
    expect(screen.getByText("Single file upload")).toBeInTheDocument();
  });

  it("contains a hidden file input", () => {
    renderWithProviders(<Uploader />);
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveStyle({ display: "none" });
  });
});
