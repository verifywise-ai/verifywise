import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import CustomException from "../../../../infrastructure/exceptions/customeException";
import RiskImportModal, { MAX_RISK_IMPORT_ROWS, TOO_MANY_ROWS_MESSAGE } from "./RiskImportModal";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../../../infrastructure/api/networkServices", () => ({ apiServices: api }));

// Parsing a real workbook is not under test: hand back the header and
// `sheet.dataRows` data rows (one by default).
const sheet = vi.hoisted(() => ({ dataRows: 1 }));
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
          for (let i = 0; i < sheet.dataRows; i++) {
            cb(cells([i === 0 ? "Data drift" : `Risk ${i}`, "someone@example.com"]), i + 2);
          }
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
  sheet.dataRows = 1;
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

  it("shows a server file-level error as a message, not as a table row", async () => {
    api.post.mockRejectedValue(
      new CustomException("Bad Request", 400, {
        message: "Bad Request",
        data: {
          success: false,
          imported: 0,
          failed: 6000,
          errors: [{ row: 0, field: "file", message: "Too many rows in this file." }],
          importedAt: "2026-11-15T00:00:00.000Z",
        },
      }),
    );

    await uploadAndImport();

    expect(await screen.findByText("Too many rows in this file.")).toBeInTheDocument();
    expect(screen.queryByText("Error Details:")).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed:/)).not.toBeInTheDocument();
  });
});

describe("RiskImportModal row cap", () => {
  it("states the same number as the cap", () => {
    expect(TOO_MANY_ROWS_MESSAGE).toContain(String(MAX_RISK_IMPORT_ROWS));
  });

  it("refuses a file over the cap without sending it", async () => {
    sheet.dataRows = MAX_RISK_IMPORT_ROWS + 1;

    await uploadAndImport();

    expect(await screen.findByText(TOO_MANY_ROWS_MESSAGE)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
