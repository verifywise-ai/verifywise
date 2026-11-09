const getText = jest.fn();
const destroy = jest.fn();

jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation(() => ({ getText, destroy })),
}));

import { extractText } from "../textExtractor";

beforeEach(() => {
  getText.mockReset();
  destroy.mockReset().mockResolvedValue(undefined);
});

describe("extractText for PDFs", () => {
  it("returns trimmed text and frees the parser", async () => {
    getText.mockResolvedValue({ text: "  Hello vendor  " });
    expect(await extractText(Buffer.from("%PDF-"), "application/pdf")).toBe("Hello vendor");
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("frees the parser when reading the text throws, and returns null", async () => {
    getText.mockRejectedValue(new Error("bad xref table"));
    expect(await extractText(Buffer.from("%PDF-"), "application/pdf")).toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
