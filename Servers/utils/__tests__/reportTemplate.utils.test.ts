jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
import { sequelize } from "../../database/db";
import {
  getTemplatesQuery,
  getLatestVersionQuery,
  getVersionByIdQuery,
} from "../reportTemplate.utils";

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
    const v = await getLatestVersionQuery(1, 42);
    expect(v.version).toBe(1);
    expect(q.mock.calls[0][1].replacements.template_id).toBe(1);
  });

  it("getLatestVersionQuery passes organization_id into the query", async () => {
    q.mockResolvedValueOnce([{ id: 10, version: 3 }]);
    const v = await getLatestVersionQuery(1, 42);
    expect(v.version).toBe(3);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.organization_id).toBe(42);
    expect(opts.replacements.template_id).toBe(1);
    // The org filter must reach the versions table by joining its parent
    // template — report_template_versions has no organization_id column.
    expect(sql).toContain("JOIN report_templates");
    expect(sql).toContain("organization_id");
  });

  it("getVersionByIdQuery passes organization_id into the query", async () => {
    q.mockResolvedValueOnce([{ id: 10, template_id: 1 }]);
    const v = await getVersionByIdQuery(10, 42);
    expect(v.id).toBe(10);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.organization_id).toBe(42);
    expect(sql).toContain("JOIN report_templates");
  });

  it("both version queries still admit system templates (organization_id IS NULL)", async () => {
    q.mockResolvedValueOnce([{ id: 10 }]);
    await getVersionByIdQuery(10, 42);
    const [sql] = q.mock.calls[0];
    expect(sql).toContain("organization_id IS NULL");
  });
});
