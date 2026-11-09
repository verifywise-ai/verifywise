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

const NUMERIC_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)\s*$/;

/**
 * Spreadsheets run a cell that starts with one of these as a formula, and table
 * values can be free text. A leading quote makes the cell plain text. Numbers,
 * including signed numeric strings, are left as they are.
 */
const neutralizeCsvFormula = (value: unknown): string => {
  const text = String(value);
  if (typeof value !== "string") return text;
  // Skips leading whitespace except tab and carriage return, which are triggers.
  const start = text.replace(/^[^\S\t\r]+/, "");
  return /^[=+\-@\t\r]/.test(start) && !NUMERIC_TEXT.test(start) ? `'${text}` : text;
};

/**
 * Export table data to CSV
 */
export const exportToCSV = (
  data: ExportRow[],
  columns: ExportColumn[],
  filename: string = "export",
) => {
  const headers = columns.map((col) => col.label).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const strValue = neutralizeCsvFormula(row[col.id] ?? "");
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        return strValue.match(/[,"\n]/) ? `"${strValue.replace(/"/g, '""')}"` : strValue;
      })
      .join(","),
  );

  const csv = [headers, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  saveAs(blob, `${sanitizeFilename(filename)}.csv`);
};

/**
 * Export table data to Excel (.xlsx)
 */
export const exportToExcel = async (
  data: ExportRow[],
  columns: ExportColumn[],
  filename: string = "export",
) => {
  // Loaded on demand: xlsx is too heavy to bundle into every table page.
  const XLSX = await import("xlsx");
  // Create worksheet data with headers
  const wsData = [
    columns.map((col) => col.label),
    ...data.map((row) => columns.map((col) => row[col.id] ?? "")),
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
export const exportToPDF = async (
  data: ExportRow[],
  columns: ExportColumn[],
  filename: string = "export",
  title?: string,
) => {
  try {
    // Loaded on demand: jspdf + autotable are too heavy for the critical path.
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

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
export const printTable = async (data: ExportRow[], columns: ExportColumn[], title?: string) => {
  try {
    // Loaded on demand: jspdf + autotable are too heavy for the critical path.
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

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
