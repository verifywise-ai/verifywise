import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import CustomException from "../../../../infrastructure/exceptions/customeException";
import RiskImportModal from "./RiskImportModal";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../../../infrastructure/api/networkServices", () => ({ apiServices: api }));

// Parsing a real workbook is not under test: hand back one data row.
vi.mock("exceljs", () => {
  class Workbook {
    xlsx = { load: async () => undefined };
    getWorksheet() {
      return {
        eachRow: (cb: (row: unknown, rowNumber: number) => void) => {
          const cells = (values: string[]) => ({
            eachCell: (_opts: unknown, fn: (cell: { value: string }, col: number) => void) =>
              values.forEach((value, i) => fn({ value }, i + 1)),
          });
          cb(cells(["Risk name", "Risk owner"]), 1);
          cb(cells(["Data drift", "someone@example.com"]), 2);
        },
      };
    }
  }
  return { Workbook, default: { Workbook } };
});

async function uploadAndImport() {
  renderWithProviders(<RiskImportModal open onClose={vi.fn()} />);
  // The dialog renders in a portal, so look in the whole document.
  const fileInput = document.body.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], "risks.xlsx");
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(1) });
  fireEvent.change(fileInput, { target: { files: [file] } });
  const importButton = await screen.findByRole("button", { name: "Import Risks" });
  await waitFor(() => expect(importButton).toBeEnabled());
  fireEvent.click(importButton);
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe("RiskImportModal import errors", () => {
  it("shows the row error table for a 400 that carries the import result", async () => {
    // apiServices throws a CustomException whose `response` is the
    // { message, data } envelope from STATUS_CODE[400](result).
    api.post.mockRejectedValue(
      new CustomException("Bad Request", 400, {
        message: "Bad Request",
        data: {
          success: false,
          imported: 0,
          failed: 1,
          errors: [{ row: 2, field: "risk_owner", message: "Unknown risk owner" }],
          importedAt: "2026-11-15T00:00:00.000Z",
        },
      }),
    );

    await uploadAndImport();

    expect(await screen.findByText("Unknown risk owner")).toBeInTheDocument();
    expect(screen.getByText("risk_owner")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith(
      "/extensions/risk-import/import",
      { csvData: [{ risk_name: "Data drift", risk_owner: "someone@example.com" }] },
      { suppressGlobalErrorToast: true },
    );
  });

  it("shows the server message when the error has no row errors", async () => {
    api.post.mockRejectedValue(
      new CustomException("No rows to import", 400, {
        message: "Bad Request",
        data: "No rows to import",
      }),
    );

    await uploadAndImport();

    expect(await screen.findByText("No rows to import")).toBeInTheDocument();
    expect(screen.queryByText("Error Details:")).not.toBeInTheDocument();
  });
});
