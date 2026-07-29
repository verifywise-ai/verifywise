jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
import { sequelize } from "../../database/db";
import {
  getTemplatesQuery,
  getLatestVersionQuery,
  getVersionByIdQuery,
  createTemplateQuery,
  updateTemplateQuery,
  archiveTemplateQuery,
  createTemplateVersionQuery,
  slugify,
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

  it("createTemplateQuery inserts org-scoped, non-system, with a derived slug", async () => {
    q.mockResolvedValueOnce([{ id: 7, slug: "quarterly-board-pack" }]);
    const row = await createTemplateQuery(
      { name: "Quarterly board pack", category: "governance", default_scope: "organization" },
      42,
      9,
    );
    expect(row.id).toBe(7);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.organization_id).toBe(42);
    expect(opts.replacements.created_by).toBe(9);
    expect(opts.replacements.slug).toBe("quarterly-board-pack");
    // is_system_template is a SQL literal, never a replacement — so a caller
    // cannot set it. Assert the literal, not a bare "false", which would also
    // match half a dozen unrelated substrings.
    expect(sql).toMatch(/is_system_template[\s\S]*VALUES[\s\S]*false/);
    expect(opts.replacements).not.toHaveProperty("is_system_template");
  });

  it("createTemplateQuery ignores a caller-supplied is_system_template", async () => {
    q.mockResolvedValueOnce([{ id: 8 }]);
    await createTemplateQuery(
      {
        name: "Sneaky",
        category: "governance",
        default_scope: "project",
        is_system_template: true,
      },
      42,
      9,
    );
    const [, opts] = q.mock.calls[0];
    expect(opts.replacements.is_system_template).toBeUndefined();
  });

  it("updateTemplateQuery refuses system templates in the WHERE clause", async () => {
    q.mockResolvedValueOnce([[{ id: 7 }], 1]);
    await updateTemplateQuery(7, 42, { name: "Renamed" });
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.organization_id).toBe(42);
    expect(sql).toContain("is_system_template = false");
    // Not "organization_id IS NULL OR ..." — writes never match a system row.
    expect(sql).not.toContain("organization_id IS NULL");
  });

  it("archiveTemplateQuery soft-deletes via is_active", async () => {
    q.mockResolvedValueOnce([[{ id: 7 }], 1]);
    await archiveTemplateQuery(7, 42);
    const [sql, opts] = q.mock.calls[0];
    expect(sql).toContain("is_active = false");
    expect(sql).not.toContain("DELETE");
    expect(sql).toContain("is_system_template = false");
    expect(opts.replacements.organization_id).toBe(42);
  });

  it("createTemplateVersionQuery appends at MAX(version) + 1", async () => {
    q.mockResolvedValueOnce([{ id: 30, version: 4 }]);
    const v = await createTemplateVersionQuery(7, 42, { sections_config: { sections: [] } }, 9);
    expect(v.version).toBe(4);
    const [sql, opts] = q.mock.calls[0];
    expect(sql).toContain("COALESCE(MAX(version), 0) + 1");
    expect(opts.replacements.template_id).toBe(7);
    expect(opts.replacements.organization_id).toBe(42);
  });

  // Duplicating a template inserts a new version through this query. An empty
  // framework_config means every framework in scope, so a dropped column turns
  // a copy of a framework-specific template into an org-wide report.
  it("createTemplateVersionQuery carries the framework selection into the new version", async () => {
    q.mockResolvedValueOnce([{ id: 31, version: 1 }]);
    await createTemplateVersionQuery(
      7,
      42,
      {
        sections_config: { sections: [] },
        framework_config: { frameworkIds: ["native:2"] },
      },
      9,
    );
    const [sql, opts] = q.mock.calls[0];
    expect(sql).toContain("framework_config");
    expect(JSON.parse(opts.replacements.framework_config)).toEqual({
      frameworkIds: ["native:2"],
    });
  });

  it("createTemplateVersionQuery defaults framework_config to the column default", async () => {
    q.mockResolvedValueOnce([{ id: 32, version: 1 }]);
    await createTemplateVersionQuery(7, 42, { sections_config: { sections: [] } }, 9);
    const [, opts] = q.mock.calls[0];
    expect(opts.replacements.framework_config).toBe("{}");
  });

  it("slugify collapses punctuation and trims separators", () => {
    expect(slugify("Quarterly Board Pack!")).toBe("quarterly-board-pack");
    expect(slugify("  --Weird__Name--  ")).toBe("weird-name");
    expect(slugify("!!!")).toBe("template");
  });
});
