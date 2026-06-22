import { parsePdf } from "./pdfParser";
import { parseDocx } from "./docxParser";
import type { ParsedDocument } from "./pdfParser";

export type { ParsedDocument };

const PARSERS: Record<string, (buffer: Buffer) => Promise<ParsedDocument>> = {
  "application/pdf": parsePdf,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": parseDocx,
};

export async function parseDocument(buffer: Buffer, mimeType: string): Promise<ParsedDocument> {
  const parser = PARSERS[mimeType];
  if (!parser) {
    throw new Error(`Unsupported document type: ${mimeType}`);
  }
  return parser(buffer);
}

export function isSupportedMimeType(mimeType: string): boolean {
  return mimeType in PARSERS;
}
