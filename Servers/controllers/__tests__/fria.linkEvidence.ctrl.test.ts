import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn<any>() } }));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/auditLedger.utils", () => ({ appendToAuditLedger: jest.fn() }));
jest.mock("../../utils/files/evidenceFiles.utils", () => ({
  getEvidenceFilesForEntity: jest.fn(),
  getEvidenceFilesForEntityTypes: jest.fn(),
  createFileEntityLink: jest.fn<any>().mockResolvedValue(undefined),
  deleteFileEntityLinkById: jest.fn(),
}));
jest.mock("../../utils/fria.utils", () => ({
  getFriaByIdQuery: jest.fn<any>().mockResolvedValue({ id: 3 }),
}));

import { linkFriaEvidence } from "../fria.ctrl";
import { createFileEntityLink } from "../../utils/files/evidenceFiles.utils";
import { logFailure } from "../../utils/logger/logHelper";
import { NotFoundException } from "../../domain.layer/exceptions/custom.exception";

const mockCreateLink = createFileEntityLink as jest.MockedFunction<typeof createFileEntityLink>;

function createReq(body: any): Request {
  return {
    userId: 9,
    organizationId: 4,
    params: { friaId: "3" },
    body,
    t: (s: string) => s,
  } as any;
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("linkFriaEvidence", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([true, [7], "1e2", "0x1F", " 12", 0, -1, 1.5, 2 ** 53])(
    "answers 400 and links nothing for file_id %p",
    async (fileId) => {
      const res = createRes();
      await linkFriaEvidence(createReq({ file_id: fileId, entity_type: "section_1" }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreateLink).not.toHaveBeenCalled();
    },
  );

  it("links a numeric or digit-string file_id", async () => {
    for (const fileId of [12, "12"]) {
      const res = createRes();
      await linkFriaEvidence(createReq({ file_id: fileId, entity_type: "section_1" }), res);
      expect(res.status).toHaveBeenCalledWith(201);
    }
    expect(mockCreateLink).toHaveBeenNthCalledWith(1, 4, 12, "fria", "section_1", 3, "evidence", 9);
    expect(mockCreateLink).toHaveBeenNthCalledWith(2, 4, 12, "fria", "section_1", 3, "evidence", 9);
  });

  it("answers 404 without a failure log for a file that is not visible", async () => {
    mockCreateLink.mockRejectedValueOnce(new NotFoundException("File not found", "file", 12));
    const res = createRes();
    await linkFriaEvidence(createReq({ file_id: 12, entity_type: "section_1" }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(logFailure).not.toHaveBeenCalled();
  });
});
