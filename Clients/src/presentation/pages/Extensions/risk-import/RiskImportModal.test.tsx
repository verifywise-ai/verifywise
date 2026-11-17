import { useState } from "react";
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
  const importButton = await screen.findByRole("button", { name: "Import risks" });
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
    // All or nothing: a rejected import says nothing went in, with no counts.
    expect(screen.getByText("Nothing was imported")).toBeInTheDocument();
    expect(
      screen.getByText("Fix the rows below in your file and upload it again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/imported,|failed|completed/i)).not.toBeInTheDocument();
    // Sent through the repository to the strict /api/v1 import, with the
    // sheet row of each row and the global error toast suppressed.
    expect(api.post).toHaveBeenCalledWith(
      "/v1/risk-import/import",
      {
        csvData: [{ risk_name: "Data drift", risk_owner: "someone@example.com", row_number: 2 }],
      },
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
    expect(screen.queryByText("Error details")).not.toBeInTheDocument();
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
    expect(screen.queryByText("Error details")).not.toBeInTheDocument();
    expect(screen.queryByText(/risks? failed/)).not.toBeInTheDocument();
  });
});

describe("RiskImportModal response without a result", () => {
  it("shows the import error and keeps Import off, since the outcome is unknown", async () => {
    api.post.mockResolvedValue({ data: { message: "OK" } });

    await uploadAndImport();

    expect(await screen.findByText("Failed to import risks")).toBeInTheDocument();
    expect(
      screen.getByText("Check the risks list before you import this file again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import risks" })).toBeDisabled();
    expect(screen.queryByText("Import completed")).not.toBeInTheDocument();
    // The chosen file stays, so the user sees what was sent.
    expect(screen.getByText("risks.xlsx")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});

describe("RiskImportModal layout", () => {
  it("renders as a StandardModal with sentence-case copy", () => {
    renderWithProviders(<RiskImportModal open onClose={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Import risks from Excel")).toBeInTheDocument();
    expect(screen.getByText("Step 1: Download the Excel template")).toBeInTheDocument();
    expect(screen.getByText("Step 2: Upload the filled Excel file")).toBeInTheDocument();
    expect(screen.getByText("Step 3: Import risks")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download template" })).toBeInTheDocument();
  });

  it("keeps Import risks disabled until a file is parsed", () => {
    renderWithProviders(<RiskImportModal open onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Import risks" })).toBeDisabled();
  });

  it("opens the hidden file input from the Choose file button", () => {
    renderWithProviders(<RiskImportModal open onClose={vi.fn()} />);
    const fileInput = screen.getByTestId("risk-import-file-input") as HTMLInputElement;
    const click = vi.spyOn(fileInput, "click");

    fireEvent.click(screen.getByTestId("risk-import-choose-file"));

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("does not close while an import is in flight", async () => {
    let finish: (value: unknown) => void = () => undefined;
    api.post.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const onClose = vi.fn();
    renderWithProviders(<RiskImportModal open onClose={onClose} />);
    const fileInput = screen.getByTestId("risk-import-file-input") as HTMLInputElement;
    const file = new File(["x"], "risks.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(1) });
    fireEvent.change(fileInput, { target: { files: [file] } });
    const importButton = await screen.findByRole("button", { name: "Import risks" });
    await waitFor(() => expect(importButton).toBeEnabled());
    fireEvent.click(importButton);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();

    finish({ data: { data: { success: false, imported: 0, failed: 0, errors: [] } } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/** Like RiskManagement: the modal stays mounted and only `open` flips. */
function Harness({ onImportComplete }: { onImportComplete?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <RiskImportModal
        open={open}
        onClose={() => setOpen(false)}
        onImportComplete={onImportComplete}
      />
    </>
  );
}

async function chooseFile() {
  const fileInput = screen.getByTestId("risk-import-file-input") as HTMLInputElement;
  const file = new File(["x"], "risks.xlsx");
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(1) });
  fireEvent.change(fileInput, { target: { files: [file] } });
  const importButton = await screen.findByRole("button", { name: "Import risks" });
  await waitFor(() => expect(importButton).toBeEnabled());
  return importButton;
}

const SUCCESS = {
  data: {
    data: {
      success: true,
      imported: 1,
      failed: 0,
      errors: [],
      importedAt: "2026-11-15T00:00:00.000Z",
    },
  },
};

describe("RiskImportModal after a successful import", () => {
  it("does not import the same rows twice during the success delay", async () => {
    api.post.mockResolvedValue(SUCCESS);
    renderWithProviders(<Harness />);
    const importButton = await chooseFile();

    fireEvent.click(importButton);
    expect(await screen.findByText("Import completed")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Import risks" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Import risks" }));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("closes and reopens empty, so the rows cannot be sent again", async () => {
    api.post.mockResolvedValue(SUCCESS);
    const onImportComplete = vi.fn();
    renderWithProviders(<Harness onImportComplete={onImportComplete} />);
    fireEvent.click(await chooseFile());

    await waitFor(() => expect(onImportComplete).toHaveBeenCalledTimes(1), { timeout: 2500 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("risks.xlsx")).not.toBeInTheDocument();
    expect(screen.queryByText("Import completed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import risks" })).toBeDisabled();
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});

describe("RiskImportModal busy states", () => {
  it("lets Cancel close while the template is still downloading", async () => {
    api.get.mockReturnValue(new Promise(() => undefined));
    const onClose = vi.fn();
    renderWithProviders(<RiskImportModal open onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Download template" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the chosen file while an import is in flight", async () => {
    api.post.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<RiskImportModal open onClose={vi.fn()} />);
    fireEvent.click(await chooseFile());

    const chip = await screen.findByText("risks.xlsx");
    // MUI renders the delete icon only when onDelete is set.
    await waitFor(() =>
      expect(chip.closest(".MuiChip-root")?.querySelector(".MuiChip-deleteIcon")).toBeNull(),
    );
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
