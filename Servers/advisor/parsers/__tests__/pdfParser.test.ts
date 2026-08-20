// pdf-parse v2 pulls in pdfjs, whose worker uses dynamic import — which Jest's
// VM can't run. So we mock the module and assert parsePdf drives the v2 API
// correctly (this also guards against a regression back to the v1 call form,
// which would invoke the module object as a function and blow up).
jest.mock("pdf-parse", () => {
  const getText = jest.fn();
  const destroy = jest.fn().mockResolvedValue(undefined);
  const PDFParse = jest.fn().mockImplementation(() => ({ getText, destroy }));
  return { PDFParse, __mocks: { getText, destroy, PDFParse } };
});

import { parsePdf } from "../pdfParser";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getText, destroy, PDFParse } = require("pdf-parse").__mocks;

describe("parsePdf", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getText.mockResolvedValue({ text: "Hello Evidence PDF\n", total: 1, pages: [] });
    destroy.mockResolvedValue(undefined);
  });

  it("uses the pdf-parse v2 API and maps text + page count", async () => {
    const buffer = Buffer.from("dummy-pdf-bytes");
    const result = await parsePdf(buffer);

    expect(PDFParse).toHaveBeenCalledWith({ data: buffer });
    expect(getText).toHaveBeenCalledTimes(1);
    expect(result.text).toContain("Hello Evidence PDF");
    expect(result.pageCount).toBe(1);
    expect(destroy).toHaveBeenCalledTimes(1); // resources released
  });

  it("wraps parse failures and still releases resources", async () => {
    getText.mockRejectedValueOnce(new Error("boom"));
    await expect(parsePdf(Buffer.from("x"))).rejects.toThrow("Failed to parse PDF document");
    expect(destroy).toHaveBeenCalledTimes(1); // finally runs even on failure
  });
});
