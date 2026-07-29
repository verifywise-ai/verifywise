/**
 * @fileoverview Tests for report scope resolution.
 *
 * A report's framework sections are gated on a projects_frameworks pairing.
 * The wizard has no framework picker, so the pairing has to be derived from
 * scope + projectId — see resolveFrameworkTargets.
 *
 * @module tests/reportScope
 */

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { resolveFrameworkTargets } from "../reportScope";
import { sequelize } from "../../../database/db";
import { Sequelize } from "sequelize";
import { injectReplacements } from "sequelize/lib/utils/sql";

const mockQuery = sequelize.query as jest.Mock;

const ROW = {
  project_framework_id: 7,
  framework_id: 1,
  project_id: 3,
  project_title: "AI Recruitment Screening Platform",
  is_organizational: false,
  framework_name: "EU AI Act",
};

describe("resolveFrameworkTargets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([ROW]);
  });

  it("maps a row to a target", async () => {
    const targets = await resolveFrameworkTargets("project", 3, 10);

    expect(targets).toEqual([
      {
        projectId: 3,
        projectTitle: "AI Recruitment Screening Platform",
        isOrganizationalProject: false,
        frameworkId: 1,
        frameworkName: "EU AI Act",
        projectFrameworkId: 7,
      },
    ]);
  });

  it("restricts project scope to the one project", async () => {
    await resolveFrameworkTargets("project", 3, 10);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("pf.project_id = :projectId");
    expect(options.replacements).toEqual({ organizationId: 10, projectId: 3 });
  });

  it("covers every project in the organization under organization scope", async () => {
    await resolveFrameworkTargets("organization", null, 10);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).not.toContain("pf.project_id = :projectId");
    expect(options.replacements).toEqual({ organizationId: 10 });
  });

  it("scopes both the pairing and its project to the organization", async () => {
    // pf.organization_id alone is not enough: a pairing row could name a
    // project belonging to another tenant.
    await resolveFrameworkTargets("organization", null, 10);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("pf.organization_id = :organizationId");
    expect(sql).toContain("p.organization_id = :organizationId");
  });

  it("returns an empty list when the organization has no frameworks", async () => {
    mockQuery.mockResolvedValue([]);

    expect(await resolveFrameworkTargets("organization", null, 10)).toEqual([]);
  });

  it("returns an empty list rather than throwing when a project scope has no projectId", async () => {
    // validateScheduledReportInput already rejects this, but a stored schedule
    // predating that validation must not blow up the run.
    expect(await resolveFrameworkTargets("project", null, 10)).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("narrows to the selected native frameworks", async () => {
    await resolveFrameworkTargets("organization", null, 10, ["native:2", "native:3"]);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("pf.framework_id = ANY(ARRAY[:nativeFrameworkIds]::INTEGER[])");
    expect(options.replacements.nativeFrameworkIds).toEqual([2, 3]);
  });

  it("renders a real Postgres ANY(ARRAY[...]) fragment, not a bare comma list", async () => {
    // jest.mock above replaces sequelize.query, which is exactly why Finding 1
    // (the `= ANY(:ids)` bare-comma-list bug) could pass every SQL-string
    // assertion above while producing invalid SQL: nothing ever ran the
    // captured replacements through Sequelize's own parameter injection. This
    // test imports the real sequelize package (only "../../../database/db" is
    // mocked, not "sequelize" itself) and does that injection for real.
    await resolveFrameworkTargets("organization", null, 10, ["native:2", "native:3"]);

    const [sql, options] = mockQuery.mock.calls[0];
    const dialectSequelize = new Sequelize("db", "u", "p", { dialect: "postgres", logging: false });
    const rendered = injectReplacements(sql, dialectSequelize.dialect, options.replacements);

    expect(rendered).toContain("ARRAY[2, 3]");
    expect(rendered).not.toContain("ANY(2, 3)");
  });

  it("adds no framework predicate for an empty selection", async () => {
    for (const empty of [undefined, null, []]) {
      mockQuery.mockClear();
      await resolveFrameworkTargets("organization", null, 10, empty as any);

      const [sql, options] = mockQuery.mock.calls[0];
      expect(sql).not.toContain("nativeFrameworkIds");
      expect(options.replacements).not.toHaveProperty("nativeFrameworkIds");
    }
  });

  it("resolves nothing when the selection names only non-native frameworks", async () => {
    // projects_frameworks holds native pairings only. Falling through to an
    // unfiltered query here would silently widen the report to every framework
    // the caller explicitly did not ask for.
    expect(await resolveFrameworkTargets("organization", null, 10, ["plugin:soc2"])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("ignores an unparseable entry rather than querying for it", async () => {
    expect(await resolveFrameworkTargets("organization", null, 10, ["iso42001"])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
