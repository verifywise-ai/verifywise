import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../../database/db", () => ({
  sequelize: {
    query: jest.fn<any>(),
  },
}));

jest.mock("../textExtractor", () => ({
  extractText: jest.fn<any>(),
  normalizeText: jest.fn<any>(),
}));

import { indexFileContent } from "../fileContentIndexer.service";
import { sequelize } from "../../../database/db";
import { extractText, normalizeText } from "../textExtractor";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockExtract = extractText as jest.MockedFunction<typeof extractText>;
const mockNormalize = normalizeText as jest.MockedFunction<typeof normalizeText>;

describe("indexFileContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("writes normalized content + tsvector when extraction succeeds", async () => {
    mockExtract.mockResolvedValueOnce("hello world");
    mockNormalize.mockReturnValueOnce("hello world");

    await indexFileContent(42, Buffer.from("blob"), "text/plain", 99);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const args = mockQuery.mock.calls[0];
    expect((args[1] as any).replacements).toEqual({
      content_text: "hello world",
      orgId: 99,
      fileId: 42,
    });
  });

  it("skips DB update when normalized text is empty", async () => {
    mockExtract.mockResolvedValueOnce("");
    mockNormalize.mockReturnValueOnce("");

    await indexFileContent(42, Buffer.from(""), "text/plain", 99);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("swallows extraction errors and does not throw", async () => {
    mockExtract.mockRejectedValueOnce(new Error("PDF parse failed"));

    await expect(
      indexFileContent(42, Buffer.from(""), "application/pdf", 99),
    ).resolves.toBeUndefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
