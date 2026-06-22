// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");
import logger from "../../utils/logger/fileLogger";

export interface ParsedDocument {
  text: string;
  pageCount: number;
  metadata: Record<string, unknown>;
}

export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const result = await pdfParse(buffer);
    return {
      text: result.text,
      pageCount: result.numpages,
      metadata: result.info ?? {},
    };
  } catch (error) {
    logger.error("PDF parsing failed", { error });
    throw new Error("Failed to parse PDF document");
  }
}
