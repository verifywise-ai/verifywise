import mammoth from "mammoth";
import logger from "../../utils/logger/fileLogger";

export interface ParsedDocument {
  text: string;
  pageCount: number;
  metadata: Record<string, unknown>;
}

export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const lineCount = result.value.split("\n").filter((l) => l.trim()).length;
    return {
      text: result.value,
      pageCount: Math.max(1, Math.ceil(lineCount / 45)),
      metadata: {},
    };
  } catch (error) {
    logger.error("DOCX parsing failed", { error });
    throw new Error("Failed to parse DOCX document");
  }
}
