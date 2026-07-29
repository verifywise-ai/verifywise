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
});
