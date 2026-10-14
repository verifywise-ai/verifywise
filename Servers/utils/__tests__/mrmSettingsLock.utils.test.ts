import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  __esModule: true,
  sequelize: { query: jest.fn() },
}));

import { lockMrmOrgSettings } from "../mrmSettings.utils";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;

beforeEach(() => {
  mockQuery.mockReset();
});

describe("lockMrmOrgSettings", () => {
  it("creates a missing row, then reads it FOR UPDATE in the caller's transaction", async () => {
    const tx = {} as any;
    mockQuery
      .mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([{ organization_id: 4, retention_months: 30 }]);

    const settings = await lockMrmOrgSettings(4, tx);

    const [insertSql, insertOpts] = mockQuery.mock.calls[0] as [string, any];
    const [selectSql, selectOpts] = mockQuery.mock.calls[1] as [string, any];
    expect(insertSql.replace(/\s+/g, " ")).toContain("ON CONFLICT (organization_id) DO NOTHING");
    expect(selectSql).toContain("FOR UPDATE");
    expect(insertOpts.transaction).toBe(tx);
    expect(selectOpts.transaction).toBe(tx);
    expect(selectOpts.replacements).toEqual({ organizationId: 4 });
    expect(settings).toEqual({ organization_id: 4, retention_months: 30 });
  });
});
