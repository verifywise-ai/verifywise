/**
 * @fileoverview Guards the project-scoped section queries against join fan-out.
 *
 * The link tables are not one row per (entity, project): a model can be linked
 * to one project twice, once with a framework and once without
 * (model_inventories_projects_frameworks holds exactly that today). A plain
 * JOIN then returns the model once per link row, and the section reports twice
 * as many models — and twice as many model risks — as the organization has.
 *
 * @module tests/dataCollector.dedupe
 */

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));

jest.mock("../../../utils/reporting.utils", () => ({
  getProjectRisksReportQuery: jest.fn().mockResolvedValue([]),
  getAssessmentReportQuery: jest.fn().mockResolvedValue([]),
  getComplianceReportQuery: jest.fn().mockResolvedValue([]),
  getClausesReportQuery: jest.fn().mockResolvedValue([]),
  getAnnexesReportQuery: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../../utils/organization.utils", () => ({
  getOrganizationByIdQuery: jest.fn().mockResolvedValue({ name: "Acme" }),
}));

jest.mock("../../../utils/user.utils", () => ({
  getUserByIdQuery: jest.fn().mockResolvedValue({ name: "A", surname: "B", organization_id: 10 }),
}));

jest.mock("../../../utils/project.utils", () => ({
  getProjectByIdQuery: jest.fn().mockResolvedValue({ project_title: "P", is_organizational: false }),
}));

jest.mock("../../../utils/framework.utils", () => ({
  getAllFrameworkByIdQuery: jest.fn().mockResolvedValue({ name: "EU AI Act" }),
}));

jest.mock("../chartUtils", () => ({
  generateRiskDistributionChart: jest.fn().mockReturnValue("<svg/>"),
  generateRiskDonutChart: jest.fn().mockReturnValue("<svg/>"),
  generateComplianceProgressChart: jest.fn().mockReturnValue("<svg/>"),
  generateRiskLegend: jest.fn().mockReturnValue("<svg/>"),
  generateAssessmentStatusChart: jest.fn().mockReturnValue("<svg/>"),
  generateAssessmentLegend: jest.fn().mockReturnValue("<svg/>"),
}));

import { createDataCollector } from "../dataCollector";
import { sequelize } from "../../../database/db";

const mockQuery = sequelize.query as jest.Mock;

/** The SQL issued for a section, identified by a table only it selects from. */
function sqlFor(table: string): string {
  const call = mockQuery.mock.calls.find(([sql]: [string]) => String(sql).includes(table));
  return call ? String(call[0]) : "";
}

describe("project-scoped section queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
  });

  it.each([
    ["models", "model_inventories_projects_frameworks"],
    ["modelRisks", "model_risks"],
    ["vendors", "vendors_projects"],
    ["vendorRisks", "vendorrisks"],
  ])("de-duplicates %s across its link table", async (section, table) => {
    const collector = createDataCollector(10, 1, 1, 100, 5);
    await collector.collectAllData([section]);

    const sql = sqlFor(table);
    expect(sql).not.toBe("");
    expect(sql).toContain("SELECT DISTINCT");
  });
});
