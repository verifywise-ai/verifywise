import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import BulkImportModal from "../BulkImportModal";

const validCsv = [
  "source_framework_id,source_control_identifier,target_framework_id,target_control_identifier,mapping_strength,domain_tag,confidence_score",
  "1,Article 9,2,A.5.1,direct,risk_management,0.9",
].join("\n");

const invalidCsv = [
  "source_framework_id,source_control_identifier,target_framework_id,target_control_identifier,mapping_strength",
  "9,,2,,bogus",
].join("\n");

function makeFile(content: string, name = "mappings.csv") {
  return new File([content], name, { type: "text/csv" });
}

describe("BulkImportModal", () => {
  const onClose = vi.fn();
  const onImport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when closed", () => {
    renderWithProviders(<BulkImportModal open={false} onClose={onClose} onImport={onImport} />);

    expect(screen.queryByText("Bulk Import Mappings")).not.toBeInTheDocument();
  });

  it("renders the upload prompt when open", () => {
    renderWithProviders(<BulkImportModal open onClose={onClose} onImport={onImport} />);

    expect(screen.getByText("Bulk Import Mappings")).toBeInTheDocument();
    expect(screen.getByText("Click to upload CSV file")).toBeInTheDocument();
  });

  it("parses a valid CSV file and shows the preview with the row's data", async () => {
    renderWithProviders(<BulkImportModal open onClose={onClose} onImport={onImport} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile(validCsv);

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Preview")).toBeInTheDocument();
    });

    expect(screen.getByText("1 valid")).toBeInTheDocument();
    expect(screen.getByText(/Article 9/)).toBeInTheDocument();
  });

  it("marks invalid rows and shows the invalid count", async () => {
    renderWithProviders(<BulkImportModal open onClose={onClose} onImport={onImport} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile(invalidCsv)] } });

    await waitFor(() => {
      expect(screen.getByText("1 invalid")).toBeInTheDocument();
    });
  });

  it("shows a parse error when the CSV has no data rows", async () => {
    renderWithProviders(<BulkImportModal open onClose={onClose} onImport={onImport} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("just_header")] } });

    await waitFor(() => {
      expect(
        screen.getByText("CSV must have a header row and at least one data row"),
      ).toBeInTheDocument();
    });
  });

  it("shows a parse error when required columns are missing", async () => {
    renderWithProviders(<BulkImportModal open onClose={onClose} onImport={onImport} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("foo,bar\n1,2")] } });

    await waitFor(() => {
      expect(screen.getByText(/Missing required columns/)).toBeInTheDocument();
    });
  });

  it("calls onImport with only valid rows when submitted", async () => {
    renderWithProviders(<BulkImportModal open onClose={onClose} onImport={onImport} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });

    await waitFor(() => {
      expect(screen.getByText("1 valid")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Import 1 Mappings" }));

    expect(onImport).toHaveBeenCalledWith([
      expect.objectContaining({
        source_framework_id: 1,
        source_control_identifier: "Article 9",
        target_framework_id: 2,
        target_control_identifier: "A.5.1",
        mapping_strength: "direct",
      }),
    ]);
  });

  it("disables the import button when there are no valid rows", () => {
    renderWithProviders(<BulkImportModal open onClose={onClose} onImport={onImport} />);

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });
});
