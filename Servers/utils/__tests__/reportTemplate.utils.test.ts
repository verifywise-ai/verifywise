jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
import { sequelize } from "../../database/db";
import { getTemplatesQuery, getLatestVersionQuery } from "../reportTemplate.utils";

const q = sequelize.query as jest.Mock;

describe("reportTemplate.utils", () => {
  beforeEach(() => q.mockReset());

  it("getTemplatesQuery returns system + org templates", async () => {
    q.mockResolvedValueOnce([{ id: 1, name: "Daily Governance Pulse" }]);
    const rows = await getTemplatesQuery(42);
    expect(rows).toHaveLength(1);
    const [, opts] = q.mock.calls[0];
    expect(opts.replacements.organization_id).toBe(42);
  });

  it("getLatestVersionQuery filters by template_id", async () => {
    q.mockResolvedValueOnce([{ id: 10, version: 1 }]);
    const v = await getLatestVersionQuery(1);
    expect(v.version).toBe(1);
    expect(q.mock.calls[0][1].replacements.template_id).toBe(1);
  });
});
