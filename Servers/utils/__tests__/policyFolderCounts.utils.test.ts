jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../database/db";
import { getPolicyFolderCountsQuery } from "../policyFolder.utils";

const query = sequelize.query as jest.Mock;

describe("getPolicyFolderCountsQuery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("scopes by organization and joins policy_manager so deleted policies are not counted", async () => {
    query.mockResolvedValueOnce([]);
    await getPolicyFolderCountsQuery(5);
    const [sql, opts] = query.mock.calls[0];
    expect(sql).toMatch(/INNER JOIN policy_manager pm/);
    expect(sql).toMatch(/pm\.organization_id = pfm\.organization_id/);
    expect(sql).toMatch(/WHERE pfm\.organization_id = :organizationId/);
    expect(opts.replacements).toEqual({ organizationId: 5 });
  });

  it("maps rows to a folder id keyed record of numbers", async () => {
    query.mockResolvedValueOnce([
      { folder_id: "2", policy_count: "4" },
      { folder_id: 9, policy_count: 1 },
    ]);
    expect(await getPolicyFolderCountsQuery(1)).toEqual({ 2: 4, 9: 1 });
  });
});
