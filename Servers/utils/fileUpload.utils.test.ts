const mockQuery = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { ConflictException } from "../domain.layer/exceptions/custom.exception";
import { BIAS_AUDIT_STANCE_SOURCE, deleteFileById } from "./fileUpload.utils";

const tx = {} as any;

describe("deleteFileById", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses a bias audit stance PDF and deletes nothing", async () => {
    mockQuery.mockResolvedValueOnce([{ source: BIAS_AUDIT_STANCE_SOURCE }]);

    await expect(deleteFileById(42, 5, tx)).rejects.toBeInstanceOf(ConflictException);

    const sql = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain("organization_id = :organizationId");
    expect(sql.some((s) => s.includes("DELETE"))).toBe(false);
  });

  it("deletes any other file, mappings first, org-scoped", async () => {
    mockQuery
      .mockResolvedValueOnce([{ source: "File manager" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 42 }]);

    expect(await deleteFileById(42, 5, tx)).toBe(true);

    const sql = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(sql[1]).toContain("DELETE FROM file_folder_mappings");
    expect(sql[2]).toContain("DELETE FROM files");
    expect(mockQuery.mock.calls[2][1].replacements).toEqual({ organizationId: 5, id: 42 });
  });

  it("passes the transaction to the guard read", async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await deleteFileById(7, 5, tx);
    expect(mockQuery.mock.calls[0][1].transaction).toBe(tx);
  });
});
