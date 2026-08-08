// pdf-parse v2 exposes a `PDFParse` class (the v1 default callable was
// removed). Instantiate per buffer, extract text, then release resources.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require("pdf-parse");
import logger from "../../utils/logger/fileLogger";

export interface ParsedDocument {
  text: string;
  pageCount: number;
  metadata: Record<string, unknown>;
}

export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return {
      text: result.text,
      pageCount: result.total,
      metadata: {},
    };
  } catch (error) {
    logger.error("PDF parsing failed", { error });
    throw new Error("Failed to parse PDF document");
  } finally {
    await parser.destroy();
  }
}
