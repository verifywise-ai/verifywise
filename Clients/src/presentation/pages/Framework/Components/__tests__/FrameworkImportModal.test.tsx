import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockMutateAsync = vi.fn();
vi.mock("../../../../../application/hooks/useFrameworkImport", () => ({
  useImportFramework: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useImportedFrameworks: () => ({ data: [] }),
  useUpdateImportedFramework: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteImportedFramework: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../../../../../application/repository/frameworkImport.repository", () => ({
  downloadFrameworkImportTemplate: vi.fn(),
  importFramework: vi.fn(),
  getImportedFrameworks: vi.fn(),
  updateImportedFramework: vi.fn(),
  deleteImportedFramework: vi.fn(),
}));

import FrameworkImportModal from "../FrameworkImportModal";

describe("FrameworkImportModal (#5254)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the three import steps", () => {
    renderWithProviders(<FrameworkImportModal open onClose={vi.fn()} onImportComplete={vi.fn()} />);
    expect(screen.getByText(/Step 1: Download the Excel template/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 2: Upload the filled Excel file/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 3: Import framework/i)).toBeInTheDocument();
  });

  it("keeps the import button disabled until rows are parsed", () => {
    renderWithProviders(<FrameworkImportModal open onClose={vi.fn()} onImportComplete={vi.fn()} />);
    const importButton = screen.getByRole("button", { name: /import framework/i });
    expect(importButton).toBeDisabled();
  });

  it("rejects non-xlsx files with an error", () => {
    renderWithProviders(<FrameworkImportModal open onClose={vi.fn()} onImportComplete={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["data"], "frameworks.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText(/Please upload an Excel file/i)).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
