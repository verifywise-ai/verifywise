/**
 * @fileoverview Data Collector Service Tests
 *
 * Tests for ReportDataCollector: risk color mapping, metadata collection,
 * section data aggregation, and factory function.
 *
 * @module tests/dataCollector
 */

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../../utils/reporting.utils", () => ({
  getProjectRisksReportQuery: jest.fn(),
  getAssessmentReportQuery: jest.fn(),
  getComplianceReportQuery: jest.fn(),
  getClausesReportQuery: jest.fn(),
  getAnnexesReportQuery: jest.fn(),
}));

jest.mock("../../../utils/organization.utils", () => ({
  getOrganizationByIdQuery: jest.fn(),
}));

jest.mock("../../../utils/user.utils", () => ({
  getUserByIdQuery: jest.fn(),
}));

jest.mock("../../../utils/project.utils", () => ({
  getProjectByIdQuery: jest.fn(),
}));

jest.mock("../../../utils/framework.utils", () => ({
  getAllFrameworkByIdQuery: jest.fn(),
}));

jest.mock("../chartUtils", () => ({
  generateRiskDistributionChart: jest.fn().mockReturnValue("<svg>bar</svg>"),
  generateRiskDonutChart: jest.fn().mockReturnValue("<svg>donut</svg>"),
  generateComplianceProgressChart: jest.fn().mockReturnValue("<svg>compliance</svg>"),
  generateRiskLegend: jest.fn().mockReturnValue("<svg>legend</svg>"),
  generateAssessmentStatusChart: jest.fn().mockReturnValue("<svg>assessment</svg>"),
  generateAssessmentLegend: jest.fn().mockReturnValue("<svg>assessmentLegend</svg>"),
}));

import { ReportDataCollector, createDataCollector } from "../dataCollector";
import {
  getProjectRisksReportQuery,
  getComplianceReportQuery,
  getAssessmentReportQuery,
} from "../../../utils/reporting.utils";
import { getUserByIdQuery } from "../../../utils/user.utils";
import { getProjectByIdQuery } from "../../../utils/project.utils";
import { getAllFrameworkByIdQuery } from "../../../utils/framework.utils";
import { getOrganizationByIdQuery } from "../../../utils/organization.utils";
import { sequelize } from "../../../database/db";

const mockGetProjectRisks = getProjectRisksReportQuery as jest.MockedFunction<
  typeof getProjectRisksReportQuery
>;
const mockGetUser = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockGetProject = getProjectByIdQuery as jest.MockedFunction<typeof getProjectByIdQuery>;
const mockGetFramework = getAllFrameworkByIdQuery as jest.MockedFunction<
  typeof getAllFrameworkByIdQuery
>;
const mockGetOrg = getOrganizationByIdQuery as jest.MockedFunction<typeof getOrganizationByIdQuery>;
const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockGetCompliance = getComplianceReportQuery as jest.MockedFunction<
  typeof getComplianceReportQuery
>;
const mockGetAssessment = getAssessmentReportQuery as jest.MockedFunction<
  typeof getAssessmentReportQuery
>;

describe("dataCollector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProject.mockResolvedValue({
      project_title: "Test Project",
      owner: 5,
      is_organizational: false,
    } as any);
    mockGetFramework.mockResolvedValue({ name: "EU AI Act" } as any);
    mockGetUser.mockResolvedValue({
      name: "John",
      surname: "Doe",
      organization_id: 10,
    } as any);
    mockGetOrg.mockResolvedValue({ name: "Acme Corp" } as any);
    mockGetProjectRisks.mockResolvedValue([]);
    mockGetCompliance.mockResolvedValue([]);
    mockGetAssessment.mockResolvedValue([]);
    mockQuery.mockResolvedValue([]);
  });

  describe("createDataCollector", () => {
    it("should create a ReportDataCollector instance", () => {
      const collector = createDataCollector(10, 1, 1, 100, 5);
      expect(collector).toBeInstanceOf(ReportDataCollector);
    });
  });

  describe("collectAllData", () => {
    it("should collect metadata and branding for any sections", async () => {
      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData([]);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.projectTitle).toBe("Test Project");
      expect(result.metadata.frameworkName).toBe("EU AI Act");
      expect(result.branding).toBeDefined();
      expect(result.branding.organizationName).toBe("Acme Corp");
    });

    it("should collect project risks when section included", async () => {
      mockGetProjectRisks.mockResolvedValue([
        {
          id: 1,
          risk_name: "Risk 1",
          risk_level_autocalculated: "High",
          risk_description: "Test",
        },
        {
          id: 2,
          risk_name: "Risk 2",
          risk_level_autocalculated: "Low",
          risk_description: "Test 2",
        },
      ] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["projectRisks"]);

      expect(result.sections.projectRisks).toBeDefined();
      expect(result.sections.projectRisks!.totalRisks).toBe(2);
      expect(result.sections.projectRisks!.risksByLevel.length).toBe(2);
    });

    it("should collect all sections when 'all' is specified", async () => {
      mockGetProjectRisks.mockResolvedValue([]);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["all"]);

      // For frameworkId=1 (EU AI Act), should include compliance and assessment
      expect(result.sections.projectRisks).toBeDefined();
    });

    it("should render charts when risk data exists", async () => {
      mockGetProjectRisks.mockResolvedValue([{ id: 1, risk_level_autocalculated: "High" }] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["projectRisks"]);

      expect(result.renderedCharts).toBeDefined();
      expect(result.renderedCharts.riskDistributionBar).toBeDefined();
      expect(result.renderedCharts.riskDistributionDonut).toBeDefined();
    });

    it("should map risk levels to correct colors", async () => {
      mockGetProjectRisks.mockResolvedValue([
        { id: 1, risk_level_autocalculated: "Critical" },
        { id: 2, risk_level_autocalculated: "High" },
        { id: 3, risk_level_autocalculated: "Medium" },
        { id: 4, risk_level_autocalculated: "Low" },
      ] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["projectRisks"]);

      const risksByLevel = result.sections.projectRisks!.risksByLevel;
      const critical = risksByLevel.find((r) => r.level === "Critical");
      const high = risksByLevel.find((r) => r.level === "High");
      const medium = risksByLevel.find((r) => r.level === "Medium");
      const low = risksByLevel.find((r) => r.level === "Low");

      expect(critical!.color).toBe("#B42318");
      expect(high!.color).toBe("#C4320A");
      expect(medium!.color).toBe("#B54708");
      expect(low!.color).toBe("#027A48");
    });

    it("should use default color for unknown risk levels", async () => {
      mockGetProjectRisks.mockResolvedValue([
        { id: 1, risk_level_autocalculated: "CustomLevel" },
      ] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["projectRisks"]);

      const custom = result.sections.projectRisks!.risksByLevel.find(
        (r) => r.level === "CustomLevel",
      );
      expect(custom!.color).toBe("#667085");
    });

    it("should handle missing project owner gracefully", async () => {
      mockGetProject.mockResolvedValue({
        project_title: "Test",
        owner: null,
        is_organizational: false,
      } as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData([]);

      expect(result.metadata.projectOwner).toBe("Unknown");
    });

    it("should default to VerifyWise branding when org not found", async () => {
      mockGetUser.mockResolvedValue({ name: "Test", surname: "User" } as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData([]);

      expect(result.branding.primaryColor).toBe("#13715B");
    });
  });

  describe("collector column corrections", () => {
    it("reads risks.mitigation_status for projectRisks, not the orthogonal approval_status", async () => {
      // `risks` carries BOTH columns and they are independent axes:
      // mitigation_status is 'Not Started' | 'In Progress' | 'Completed' |
      // 'On Hold' | 'Deferred' | 'Canceled' | 'Requires review', while
      // approval_status is a free varchar the UI fills with 'Approved' |
      // 'Rejected' | 'In Review' | 'Pending'. Reading the latter under the
      // name `mitigationStatus` made the section's "how many are unmitigated"
      // question answer against approval state instead.
      mockGetProjectRisks.mockResolvedValue([
        {
          id: 11,
          risk_name: "Unreviewed training data",
          risk_level_autocalculated: "High risk",
          mitigation_status: "Not Started",
          approval_status: "Approved",
        },
      ] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["projectRisks"]);

      expect(result.sections.projectRisks!.risks[0].mitigationStatus).toBe("Not Started");
    });

    it("reads model_risks.status (not the non-existent mitigation_status) and surfaces plan/date/impact/likelihood", async () => {
      // verifywise.model_risks has no `mitigation_status` column, so the old
      // read made every model risk in every report literally "Unknown".
      mockQuery.mockResolvedValue([
        {
          id: 3,
          model_name: "gpt-4o",
          risk_name: "Prompt injection",
          risk_level: "High",
          status: "In Progress",
          mitigation_plan: "Add an input classifier in front of the endpoint.",
          target_date: new Date(2026, 7, 14),
          impact: "Data exfiltration from the retrieval store.",
          likelihood: "Likely",
        },
      ] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["modelRisks"]);

      const risk = result.sections.modelRisks!.risks[0];
      expect(risk.mitigationStatus).toBe("In Progress");
      expect(risk.mitigationPlan).toBe("Add an input classifier in front of the endpoint.");
      expect(risk.targetDate).toBe("2026-08-14");
      expect(risk.impact).toBe("Data exfiltration from the retrieval store.");
      expect(risk.likelihood).toBe("Likely");
    });

    it("leaves the optional model-risk fields undefined rather than inventing them", async () => {
      mockQuery.mockResolvedValue([
        { id: 4, model_name: "claude", risk_name: "Drift", risk_level: "Low" },
      ] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["modelRisks"]);

      const risk = result.sections.modelRisks!.risks[0];
      expect(risk.mitigationStatus).toBe("Unknown");
      expect(risk.mitigationPlan).toBeUndefined();
      expect(risk.targetDate).toBeUndefined();
    });

    it("resolves the numeric control owner to a name and keeps the control family and due date", async () => {
      // getControlByIdQuery (eu.utils.ts:467-496) selects `c.owner AS owner`
      // (line 482) — a users FK — and no owner_name/owner_surname aliases at
      // all. It does select `c.due_date AS due_date` (line 484), which the
      // collector then dropped.
      mockGetCompliance.mockResolvedValue([
        {
          name: "Human oversight",
          controls: [
            {
              id: 7,
              title: "Assign an oversight owner",
              status: "In progress",
              owner: 42,
              due_date: new Date(2026, 8, 30),
              description: "Named accountable person per high-risk system.",
            },
            {
              id: 8,
              title: "Log oversight decisions",
              status: "Done",
              owner: null,
              due_date: null,
            },
          ],
        },
      ] as any);
      mockQuery.mockResolvedValue([{ id: 42, name: "John", surname: "Doe" }] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["compliance"]);

      const controls = result.sections.compliance!.controls;
      expect((mockQuery.mock.calls[0] as any)[1].replacements.ids).toEqual([42]);
      expect(controls[0].owner).toBe("John Doe");
      expect(controls[0].category).toBe("Human oversight");
      expect(controls[0].dueDate).toBe("2026-09-30");
      // No owner id, no invented owner; no due date, no invented date.
      expect(controls[1].owner).toBeUndefined();
      expect(controls[1].dueDate).toBeUndefined();
      expect(controls[1].category).toBe("Human oversight");
    });

    it("reads the control family from the category's `title`, the column the query returns", async () => {
      // getComplianceEUByProjectIdQuery -> getCompliancesEUByIdQuery returns
      // controlcategories_struct_eu rows, whose label column is `title`. There
      // is no `name`, so reading only `name` made every control's family
      // "Unknown" and collapsed the compliance-progress chart to one bar.
      mockGetCompliance.mockResolvedValue([
        {
          id: 1,
          title: "AI literacy",
          controls: [{ id: 7, title: "Train staff", status: "Done", owner: null }],
        },
      ] as any);
      mockQuery.mockResolvedValue([] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["compliance"]);

      expect(result.sections.compliance!.controls[0].category).toBe("AI literacy");
      expect(result.charts.complianceProgress).toEqual([
        { category: "AI literacy", completed: 1, total: 1, percentage: 100 },
      ]);
    });

    it("names the model_inventories join column `approver`, since there is no owner column", async () => {
      // verifywise.model_inventories has `approver` (a users FK) and NO `owner`
      // column at all — the UI labels the field "Approver". Projecting the
      // joined name as `owner` made the models section assert an ownership the
      // schema cannot support, and the facts snapshot counted "owner_<name>"
      // buckets over it.
      mockQuery.mockResolvedValue([
        {
          id: 1,
          model: "gpt-4o",
          version: "2026-05",
          status: "Approved",
          approver_name: "Jane",
          approver_surname: "Roe",
          capabilities: "General purpose chat.",
        },
        { id: 2, model: "claude", status: "Pending" },
      ] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["models"]);

      const models = result.sections.models!.models;
      expect(models[0].approver).toBe("Jane Roe");
      expect((models[0] as any).owner).toBeUndefined();
      expect(models[1].approver).toBeUndefined();
    });

    it("names the incident person `reporter`, and does not alias `type` a second time as a title", async () => {
      // verifywise.ai_incident_managements has `reporter` and no `assignee`,
      // and no `title` at all. Whoever filed an incident is not accountable for
      // it, and printing `type` under two adjacent column headings is noise.
      mockQuery.mockResolvedValue([
        {
          id: 9,
          incident_id: "INC-9",
          type: "Data quality",
          severity: "Serious",
          status: "Open",
          reporter: "Dana Reed",
        },
      ] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["incidentManagement"]);

      const incident = result.sections.incidentManagement!.incidents[0];
      expect(incident.reporter).toBe("Dana Reed");
      expect((incident as any).assignee).toBeUndefined();
      expect((incident as any).title).toBeUndefined();
      expect(incident.type).toBe("Data quality");
    });

    it("scopes the control-owner lookup to the caller's organization, in one query", async () => {
      // `users` is tenant-scoped (docs/technical/security/tenant-isolation.md
      // §2.1/§4.4) and getUserByIdQuery is `SELECT * FROM users WHERE id = :id`
      // with no org filter. Control 7's owner belongs to org 10; control 8's
      // owner belongs to another tenant. The foreign name must not reach the
      // rendered report, the facts block sent to the tenant's LLM provider,
      // collectAllowedOwners, or the persisted audit_metadata.
      mockGetCompliance.mockResolvedValue([
        {
          name: "Human oversight",
          controls: [
            { id: 7, title: "In-org owner", status: "Waiting", owner: 42 },
            { id: 8, title: "Foreign-org owner", status: "Waiting", owner: 99 },
          ],
        },
      ] as any);
      // The scoped query returns only the in-org row; 99 simply has no match.
      mockQuery.mockResolvedValue([{ id: 42, name: "John", surname: "Doe" }] as any);

      const collector = createDataCollector(10, 1, 1, 100, 5);
      const result = await collector.collectAllData(["compliance"]);

      const controls = result.sections.compliance!.controls;
      expect(controls[0].owner).toBe("John Doe");
      expect(controls[1].owner).toBeUndefined();

      // One round-trip for both ids, filtered on the caller's organization.
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, options] = mockQuery.mock.calls[0] as [string, any];
      expect(sql).toContain("organization_id = :organizationId");
      expect(options.replacements).toEqual({ organizationId: 10, ids: [42, 99] });
      // The unscoped per-id helper is no longer used for control owners.
      expect(mockGetUser).not.toHaveBeenCalledWith(99);
    });
  });
});
