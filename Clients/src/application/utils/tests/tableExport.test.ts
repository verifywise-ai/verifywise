import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Module mocks MUST be declared before importing the module under test,
 * otherwise the real implementations may be loaded/cached.
 */
vi.mock("file-saver", () => ({
  saveAs: vi.fn(),
}));

vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: vi.fn(),
    book_new: vi.fn(),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

vi.mock("jspdf-autotable", () => ({
  default: vi.fn(),
}));

/**
 * jsPDF is a default export. We mock it with a class that stores instances
 * so tests can assert calls on the created document.
 */
vi.mock("jspdf", () => {
  const instances: any[] = [];

  class MockJsPDF {
    setFontSize = vi.fn();
    setFont = vi.fn();
    text = vi.fn();
    save = vi.fn();
    output = vi.fn().mockReturnValue(new Blob(["pdf"], { type: "application/pdf" }));
    constructor() {
      instances.push(this);
    }
  }

  return {
    default: MockJsPDF,
    __instances: instances,
  };
});

// Import the module under test AFTER mocks
import { exportToCSV, exportToExcel, exportToPDF, printTable } from "../tableExport";

// Import mocked deps for assertions
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import autoTable from "jspdf-autotable";
import * as jsPDFModule from "jspdf";

describe("tableExport", () => {
  const originalAlert = globalThis.alert;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    // Mock alert + console for clean test output
    globalThis.alert = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.alert = originalAlert;
  });

  const columns = [
    { id: "name", label: "Name" },
    { id: "note", label: "Note" },
  ];

  describe("exportToCSV", () => {
    it("generates CSV with headers and rows and calls saveAs with .csv filename", () => {
      const data = [
        { name: "Alice", note: "ok" },
        { name: "Bob", note: null }, // null should become an empty string
      ];

      exportToCSV(data as any, columns as any, "my-export");

      expect(saveAs).toHaveBeenCalledTimes(1);

      const [blobArg, filenameArg] = (saveAs as any).mock.calls[0];
      expect(filenameArg).toBe("my-export.csv");
      expect(blobArg).toBeInstanceOf(Blob);
    });

    it("escapes values that contain comma, quotes or newline", async () => {
      const data = [{ name: "A,lice", note: 'He said "hi"\nnext' }];

      exportToCSV(data as any, columns as any, "escaped");

      const [blobArg] = (saveAs as any).mock.calls[0];

      // Ensure we received a real Blob
      expect(blobArg).toBeInstanceOf(Blob);

      /**
       * Read Blob content reliably in jsdom.
       * Some environments don't support Response(blob).text() properly.
       */
      const readBlobAsText = (blob: Blob): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsText(blob);
        });

      const csvText = await readBlobAsText(blobArg);

      // Header
      expect(csvText).toContain("Name,Note");

      // Escaping behavior
      expect(csvText).toContain('"A,lice"');
      expect(csvText).toContain('"He said ""hi""\nnext"');
    });

    it("uses default filename 'export' when not provided", () => {
      exportToCSV([{ name: "X", note: "Y" }] as any, columns as any);

      const [, filenameArg] = (saveAs as any).mock.calls[0];
      expect(filenameArg).toBe("export.csv");
    });

    it("sanitizes special characters in filename", () => {
      exportToCSV([{ name: "A", note: "B" }] as any, columns as any, 'my:bad"file/name');

      const [, filenameArg] = (saveAs as any).mock.calls[0];
      expect(filenameArg).toBe("my_bad_file_name.csv");
    });

    it("handles empty data array (headers only)", async () => {
      exportToCSV([], columns as any, "empty-export");

      const [blobArg] = (saveAs as any).mock.calls[0];
      const readBlobAsText = (blob: Blob): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsText(blob);
        });

      const csvText = await readBlobAsText(blobArg);
      expect(csvText).toBe("Name,Note");
    });
  });

  describe("exportToExcel", () => {
    it("creates worksheet data, sets !cols widths (capped at 50), and calls XLSX.writeFile", () => {
      const aoa_to_sheet = XLSX.utils.aoa_to_sheet as unknown as ReturnType<typeof vi.fn>;
      const book_new = XLSX.utils.book_new as unknown as ReturnType<typeof vi.fn>;
      const book_append_sheet = XLSX.utils.book_append_sheet as unknown as ReturnType<typeof vi.fn>;
      const writeFile = XLSX.writeFile as unknown as ReturnType<typeof vi.fn>;

      // Use a mutable worksheet object to assert that "!cols" gets set
      const ws: any = {};
      aoa_to_sheet.mockReturnValue(ws);

      // Fake workbook
      const wb: any = { id: "wb" };
      book_new.mockReturnValue(wb);

      const data = [
        { name: "Alice", note: "short" },
        { name: "Bob", note: "x".repeat(200) }, // should force width cap at 50
      ];

      exportToExcel(data as any, columns as any, "sheet");

      expect(aoa_to_sheet).toHaveBeenCalledTimes(1);
      const [wsData] = aoa_to_sheet.mock.calls[0];
      expect(wsData[0]).toEqual(["Name", "Note"]);
      expect(wsData[1]).toEqual(["Alice", "short"]);
      expect(wsData[2]).toEqual(["Bob", "x".repeat(200)]);

      expect(ws["!cols"]).toBeDefined();
      expect(ws["!cols"]).toHaveLength(2);

      // "Name" length 5 -> wch should be 7 (implementation adds padding)
      expect(ws["!cols"][0].wch).toBe(7);
      // Note column should be capped at 50
      expect(ws["!cols"][1].wch).toBe(50);

      expect(book_new).toHaveBeenCalledTimes(1);
      expect(book_append_sheet).toHaveBeenCalledWith(wb, ws, "Sheet1");
      expect(writeFile).toHaveBeenCalledWith(wb, "sheet.xlsx");
    });

    it("uses default filename 'export' when not provided", () => {
      const writeFile = XLSX.writeFile as unknown as ReturnType<typeof vi.fn>;
      const aoa_to_sheet = XLSX.utils.aoa_to_sheet as unknown as ReturnType<typeof vi.fn>;
      const book_new = XLSX.utils.book_new as unknown as ReturnType<typeof vi.fn>;

      aoa_to_sheet.mockReturnValue({});
      book_new.mockReturnValue({});

      exportToExcel([{ name: "X", note: "Y" }] as any, columns as any);

      expect(writeFile).toHaveBeenCalledWith(expect.anything(), "export.xlsx");
    });

    it("sanitizes special characters in Excel filename", () => {
      const writeFile = XLSX.writeFile as unknown as ReturnType<typeof vi.fn>;
      const aoa_to_sheet = XLSX.utils.aoa_to_sheet as unknown as ReturnType<typeof vi.fn>;
      const book_new = XLSX.utils.book_new as unknown as ReturnType<typeof vi.fn>;

      aoa_to_sheet.mockReturnValue({});
      book_new.mockReturnValue({});

      exportToExcel([{ name: "A", note: "B" }] as any, columns as any, "bad<file?name");

      expect(writeFile).toHaveBeenCalledWith(expect.anything(), "bad_file_name.xlsx");
    });

    it("exportToExcel: uses empty string for nullish values but keeps 0/false (covers ?? branches)", () => {
      // Spy on aoa_to_sheet AND make it return a worksheet object
      const aoaSpy = vi.spyOn(XLSX.utils, "aoa_to_sheet").mockReturnValue({} as any);

      const columns = [
        { id: "name", label: "Name" },
        { id: "note", label: "Note" },
        { id: "count", label: "Count" },
      ];

      const data = [
        { name: "Alice", note: undefined, count: 0 }, // undefined -> '' ; 0 must be preserved
        { name: null, note: "Hello", count: 5 }, // null -> ''
      ];

      exportToExcel(data as any, columns as any, "test-export");

      expect(aoaSpy).toHaveBeenCalledTimes(1);

      const wsData = aoaSpy.mock.calls[0][0] as any[];

      // Header row
      expect(wsData[0]).toEqual(["Name", "Note", "Count"]);

      // Row 1: undefined -> '' ; 0 preserved
      expect(wsData[1]).toEqual(["Alice", "", 0]);

      // Row 2: null -> '' ; note preserved
      expect(wsData[2]).toEqual(["", "Hello", 5]);
    });
  });

  describe("exportToPDF", () => {
    it("generates PDF without title and saves .pdf (startY=10)", () => {
      exportToPDF([{ name: "Alice", note: "ok" }] as any, columns as any, "pdf-file");

      const instances = (jsPDFModule as any).__instances as any[];
      expect(instances.length).toBeGreaterThan(0);
      const doc = instances[instances.length - 1];

      expect(autoTable).toHaveBeenCalledTimes(1);

      const [, options] = (autoTable as any).mock.calls[0];
      expect(options.head).toEqual([["Name", "Note"]]);
      expect(options.body).toEqual([["Alice", "ok"]]);
      expect(options.startY).toBe(10);

      expect(doc.save).toHaveBeenCalledWith("pdf-file.pdf");
    });

    it("generates PDF with title (startY=25) and writes title", () => {
      exportToPDF([{ name: "Alice", note: "ok" }] as any, columns as any, "pdf-title", "My Report");

      const instances = (jsPDFModule as any).__instances as any[];
      const doc = instances[instances.length - 1];

      expect(doc.setFontSize).toHaveBeenCalledWith(16);
      expect(doc.setFont).toHaveBeenCalledWith("helvetica", "bold");
      expect(doc.text).toHaveBeenCalledWith("My Report", 14, 15);

      const [, options] = (autoTable as any).mock.calls[(autoTable as any).mock.calls.length - 1];
      expect(options.startY).toBe(25);

      expect(doc.save).toHaveBeenCalledWith("pdf-title.pdf");
    });

    it("catches errors, logs and alerts user", () => {
      const Original = (jsPDFModule as any).default;

      // Force constructor to throw to hit the catch block
      (jsPDFModule as any).default = class Broken {
        constructor() {
          throw new Error("boom");
        }
      };

      exportToPDF([{ name: "A", note: "B" }] as any, columns as any, "x");

      expect(console.error).toHaveBeenCalledWith("Error generating PDF:", expect.any(Error));
      expect(globalThis.alert).toHaveBeenCalledWith(
        "Failed to generate PDF. Please try again or use CSV/Excel export instead.",
      );

      (jsPDFModule as any).default = Original;
    });

    it("sanitizes special characters in PDF filename", () => {
      exportToPDF([{ name: "A", note: "B" }] as any, columns as any, "bad/name:file");

      const instances = (jsPDFModule as any).__instances as any[];
      const doc = instances[instances.length - 1];
      expect(doc.save).toHaveBeenCalledWith("bad_name_file.pdf");
    });

    it("exportToPDF: converts nullish cell values to empty string (covers ?? branch)", () => {
      // Capture autoTable payload
      const autoTableMock = autoTable as unknown as ReturnType<typeof vi.fn>;
      autoTableMock.mockClear();

      const columns = [
        { id: "name", label: "Name" },
        { id: "note", label: "Note" },
      ];

      const data = [
        { name: "Alice", note: undefined }, // undefined -> ''
        { name: null, note: "Hi" }, // null -> ''
      ];

      exportToPDF(data as any, columns as any, "pdf-export");

      expect(autoTableMock).toHaveBeenCalledTimes(1);

      const config = autoTableMock.mock.calls[0][1];
      expect(config.head[0]).toEqual(["Name", "Note"]);

      // Body should contain empty strings where values are nullish
      expect(config.body).toEqual([
        ["Alice", ""],
        ["", "Hi"],
      ]);
    });
  });

  describe("printTable", () => {
    beforeEach(() => {
      /**
       * jsdom may not implement URL.createObjectURL.
       * Define it first (if missing) before spying on it.
       */
      if (!(URL as any).createObjectURL) {
        Object.defineProperty(URL, "createObjectURL", {
          value: vi.fn(),
          configurable: true,
        });
      }
      if (!(URL as any).revokeObjectURL) {
        Object.defineProperty(URL, "revokeObjectURL", {
          value: vi.fn(),
          configurable: true,
        });
      }
      vi.spyOn(URL as any, "createObjectURL").mockReturnValue("blob:mock");
      vi.spyOn(URL as any, "revokeObjectURL").mockImplementation(() => {});
    });

    it("opens new window and triggers print on load when popups are allowed", () => {
      const fakePrint = vi.fn();
      const fakeWindow: any = { onload: null, onafterprint: null, print: fakePrint };

      const openSpy = vi.spyOn(window, "open").mockReturnValue(fakeWindow);

      printTable([{ name: "A", note: "B" }] as any, columns as any, "Title");

      expect(openSpy).toHaveBeenCalledWith("blob:mock", "_blank");
      expect(typeof fakeWindow.onload).toBe("function");

      // Simulate the load event that triggers printing
      fakeWindow.onload();
      expect(fakePrint).toHaveBeenCalledTimes(1);
    });

    it("sets up cleanup via onafterprint and timeout fallback", () => {
      vi.useFakeTimers();
      const fakeWindow: any = { onload: null, onafterprint: null, print: vi.fn() };
      vi.spyOn(window, "open").mockReturnValue(fakeWindow);

      printTable([{ name: "A", note: "B" }] as any, columns as any);

      // onafterprint should be set
      expect(typeof fakeWindow.onafterprint).toBe("function");

      // Simulate onafterprint to verify it revokes URL
      fakeWindow.onafterprint();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");

      // Also verify fallback timeout triggers after 60s
      vi.advanceTimersByTime(60000);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("alerts when popups are blocked (window.open returns null) and cleans up blob URL", () => {
      vi.spyOn(window, "open").mockReturnValue(null);

      printTable([{ name: "A", note: "B" }] as any, columns as any);

      expect(globalThis.alert).toHaveBeenCalledWith("Please allow popups to print the table.");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    });

    it("catches errors, logs and alerts", () => {
      (URL.createObjectURL as any).mockImplementation(() => {
        throw new Error("boom");
      });

      printTable([{ name: "A", note: "B" }] as any, columns as any);

      expect(console.error).toHaveBeenCalledWith(
        "Error generating print preview:",
        expect.any(Error),
      );
      expect(globalThis.alert).toHaveBeenCalledWith(
        "Failed to generate print preview. Please try exporting to PDF instead.",
      );
    });

    it("printTable: converts nullish cell values to empty string (covers ?? branch)", () => {
      // Capture autoTable payload
      const autoTableMock = autoTable as unknown as ReturnType<typeof vi.fn>;
      autoTableMock.mockClear();

      // Ensure URL APIs exist in jsdom
      if (!("createObjectURL" in URL)) {
        Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:mock") });
      } else {
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
      }

      const openSpy = vi.spyOn(window, "open").mockReturnValue({
        onload: null,
        print: vi.fn(),
      } as any);

      const columns = [
        { id: "name", label: "Name" },
        { id: "note", label: "Note" },
      ];

      const data = [
        { name: "Alice", note: undefined }, // undefined -> ''
        { name: null, note: "Hi" }, // null -> ''
      ];

      printTable(data as any, columns as any);

      expect(autoTableMock).toHaveBeenCalledTimes(1);

      const config = autoTableMock.mock.calls[0][1];
      expect(config.body).toEqual([
        ["Alice", ""],
        ["", "Hi"],
      ]);

      // It should still try to open the blob URL
      expect(openSpy).toHaveBeenCalledWith("blob:mock", "_blank");
    });
  });
});
