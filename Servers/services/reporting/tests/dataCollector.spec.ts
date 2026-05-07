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
});
