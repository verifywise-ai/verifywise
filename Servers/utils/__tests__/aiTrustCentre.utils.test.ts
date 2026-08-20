jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn().mockResolvedValue([[], 0]),
  },
}));

jest.mock("../fileUpload.utils", () => ({
  deleteFileById: jest.fn().mockResolvedValue(undefined),
  getFileById: jest.fn().mockResolvedValue(undefined),
}));

import { uploadCompanyLogoQuery } from "../aiTrustCentre.utils";
import { sequelize } from "../../database/db";
import { deleteFileById } from "../fileUpload.utils";
import { Transaction } from "sequelize";

const query = sequelize.query as jest.Mock;
const deleteFile = deleteFileById as jest.Mock;
const tx = {} as Transaction;

describe("uploadCompanyLogoQuery", () => {
  beforeEach(() => {
    query.mockReset();
    deleteFile.mockReset().mockResolvedValue(undefined);
  });

  it("inserts a new ai_trust_center row when none exists yet (first logo upload)", async () => {
    // SELECT current logo returns no row (org has never initialized the trust center)
    query.mockResolvedValueOnce([[], 0]);
    // INSERT returns the new logo
    query.mockResolvedValueOnce([[{ logo: 42 }], 1]);

    const result = await uploadCompanyLogoQuery(42, 7, tx);

    const insertSql = query.mock.calls[1][0] as string;
    expect(insertSql).toMatch(/INSERT INTO ai_trust_center/i);
    expect(query.mock.calls[1][1].replacements).toEqual({ organizationId: 7, fileId: 42 });
    // No prior logo, so nothing to delete
    expect(deleteFile).not.toHaveBeenCalled();
    expect(result).toEqual({ logo: 42 });
  });

  it("updates the existing row and deletes the previous logo when a row exists", async () => {
    // SELECT current logo returns an existing logo file id
    query.mockResolvedValueOnce([[{ logo: 10 }], 1]);
    // UPDATE returns the new logo
    query.mockResolvedValueOnce([[{ logo: 99 }], 1]);

    const result = await uploadCompanyLogoQuery(99, 7, tx);

    const updateSql = query.mock.calls[1][0] as string;
    expect(updateSql).toMatch(/UPDATE ai_trust_center SET logo/i);
    // Previous logo (10) is cleaned up
    expect(deleteFile).toHaveBeenCalledWith(10, 7, tx);
    expect(result).toEqual({ logo: 99 });
  });
});
