import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

/**
 * Extract readable text from a file buffer based on its mimetype.
 *
 * Returns plain text or null if the mimetype is unsupported or extraction fails.
 */
export async function extractText(buffer: Buffer, mimetype: string): Promise<string | null> {
  try {
    switch (mimetype) {
      case "application/pdf":
        return await extractPdf(buffer);

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return await extractDocx(buffer);

      case "application/vnd.ms-excel":
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        return extractSpreadsheet(buffer);

      case "text/csv":
      case "text/markdown":
      case "text/plain":
        return buffer.toString("utf8");

      default:
        // For now, skip images, video, legacy .doc, etc.
        return null;
    }
  } catch {
    // Swallow extraction errors; caller will treat as no searchable content
    return null;
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const { text } = await parser.getText();
  await parser.destroy();
  return text?.trim() ?? "";
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

function extractSpreadsheet(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const pieces: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      raw: true,
    }) as (string | number | boolean | null)[][];

    for (const row of rows) {
      const line = row
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          return String(cell);
        })
        .join(" ");

      if (line.trim()) {
        pieces.push(line);
      }
    }
  }

  return pieces.join("\n");
}

/**
 * Normalize extracted text before sending it to PostgreSQL FTS.
 *
 * - Removes null bytes
 * - Collapses whitespace
 * - Trims leading/trailing spaces
 * - Optionally truncates to a maximum length
 */
export function normalizeText(raw: string, maxLength = 1_000_000): string {
  if (!raw) return "";

  // Remove null bytes
  let text = raw.replace(/\u0000/g, "");

  // Collapse whitespace to a single space
  text = text.replace(/\s+/g, " ").trim();

  // Truncate to avoid huge tsvectors
  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
  }

  return text;
}
