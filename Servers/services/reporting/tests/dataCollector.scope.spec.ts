/**
 * @fileoverview Tests for scope-aware collection.
 *
 * A report covers a set of projects_frameworks pairings. Framework sections are
 * collected once per pairing and merged; organization-wide sections are
 * collected once for the whole report, not once per pairing.
 *
 * @module tests/dataCollector.scope
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
  getProjectByIdQuery: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../../utils/framework.utils", () => ({
  getAllFrameworkByIdQuery: jest.fn().mockResolvedValue(null),
}));

jest.mock("../chartUtils", () => ({
  generateRiskDistributionChart: jest.fn().mockReturnValue("<svg/>"),
  generateRiskDonutChart: jest.fn().mockReturnValue("<svg/>"),
  generateComplianceProgressChart: jest.fn().mockReturnValue("<svg/>"),
  generateRiskLegend: jest.fn().mockReturnValue("<svg/>"),
  generateAssessmentStatusChart: jest.fn().mockReturnValue("<svg/>"),
  generateAssessmentLegend: jest.fn().mockReturnValue("<svg/>"),
}));

import { createScopedDataCollector } from "../dataCollector";
import {
  getComplianceReportQuery,
  getAssessmentReportQuery,
  getClausesReportQuery,
  getAnnexesReportQuery,
  getProjectRisksReportQuery,
} from "../../../utils/reporting.utils";
import { FrameworkTarget } from "../reportScope";

const mockCompliance = getComplianceReportQuery as jest.Mock;
const mockAssessment = getAssessmentReportQuery as jest.Mock;
const mockClauses = getClausesReportQuery as jest.Mock;
const mockAnnexes = getAnnexesReportQuery as jest.Mock;
const mockRisks = getProjectRisksReportQuery as jest.Mock;

const EU: FrameworkTarget = {
  projectId: 1,
  projectTitle: "Alpha",
  isOrganizationalProject: false,
  frameworkId: 1,
  frameworkName: "EU AI Act",
  projectFrameworkId: 11,
};

const EU_SECOND: FrameworkTarget = {
  projectId: 2,
  projectTitle: "Beta",
  isOrganizationalProject: false,
  frameworkId: 1,
  frameworkName: "EU AI Act",
  projectFrameworkId: 22,
};

const ISO: FrameworkTarget = {
  projectId: 3,
  projectTitle: "Gamma",
  isOrganizationalProject: true,
  frameworkId: 2,
  frameworkName: "ISO 42001",
  projectFrameworkId: 33,
};

const controlCategory = (controlId: string) => [
  { name: "Cat", controls: [{ id: 1, control_id: controlId, title: "t", status: "Done" }] },
];

describe("createScopedDataCollector — organization scope", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCompliance.mockResolvedValue([]);
    mockAssessment.mockResolvedValue([]);
    mockClauses.mockResolvedValue([]);
    mockAnnexes.mockResolvedValue([]);
    mockRisks.mockResolvedValue([]);
  });

  it("collects a framework section from every pairing that supports it", async () => {
    mockCompliance
      .mockResolvedValueOnce(controlCategory("C1"))
      .mockResolvedValueOnce(controlCategory("C2"));

    const collector = createScopedDataCollector(10, 5, "organization", [EU, EU_SECOND, ISO]);
    const data = await collector.collectAllData(["compliance"]);

    // Once per EU pairing, and not for the ISO one — compliance is EU AI Act's.
    expect(mockCompliance).toHaveBeenCalledTimes(2);
    expect(mockCompliance).toHaveBeenCalledWith(11, 10);
    expect(mockCompliance).toHaveBeenCalledWith(22, 10);
    expect(data.sections.compliance!.controls.map((c) => c.controlId)).toEqual(["C1", "C2"]);
    expect(data.sections.compliance!.totalControls).toBe(2);
  });

  it("collects the ISO section from the ISO pairing in the same run", async () => {
    mockClauses.mockResolvedValue([{ id: 1, clause_id: "4", title: "c", status: "Done" }]);

    const collector = createScopedDataCollector(10, 5, "organization", [EU, ISO]);
    const data = await collector.collectAllData(["compliance", "clausesAndAnnexes"]);

    expect(mockClauses).toHaveBeenCalledTimes(1);
    expect(mockClauses).toHaveBeenCalledWith(33, 10);
    expect(data.sections.clausesAndAnnexes!.clauses).toHaveLength(1);
  });

  it("collects an organization-wide section once, not once per pairing", async () => {
    const { sequelize } = require("../../../database/db");
    const collector = createScopedDataCollector(10, 5, "organization", [EU, EU_SECOND, ISO]);
    await collector.collectAllData(["trainingRegistry"]);

    const trainingCalls = (sequelize.query as jest.Mock).mock.calls.filter(([sql]: [string]) =>
      String(sql).includes("trainingregistar"),
    );
    expect(trainingCalls).toHaveLength(1);
  });

  it("does not filter organization-scope risks by a project", async () => {
    const collector = createScopedDataCollector(10, 5, "organization", [EU, ISO]);
    await collector.collectAllData(["projectRisks"]);

    // getProjectRisksReportQuery pins pr.project_id. An organization report
    // must not go through it at all, or it reports one project's risks — or,
    // with the id it used to be given, none.
    expect(mockRisks).not.toHaveBeenCalled();
  });

  it("marks the report organizational so the renderers drop the project line", async () => {
    const collector = createScopedDataCollector(10, 5, "organization", [EU, ISO]);
    const data = await collector.collectAllData([]);

    expect(data.metadata.isOrganizational).toBe(true);
    expect(data.metadata.scope).toBe("organization");
    expect(data.metadata.frameworkName).toBe("EU AI Act, ISO 42001");
  });
});

describe("createScopedDataCollector — project scope", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCompliance.mockResolvedValue([]);
    mockAssessment.mockResolvedValue([]);
    mockRisks.mockResolvedValue([]);
  });

  it("still filters risks by the project", async () => {
    const collector = createScopedDataCollector(10, 5, "project", [EU]);
    await collector.collectAllData(["projectRisks"]);

    expect(mockRisks).toHaveBeenCalledWith(1, 10);
  });

  it("covers every framework the project holds, not just one", async () => {
    const bothOnOneProject: FrameworkTarget[] = [
      { ...EU, projectId: 1, projectTitle: "Alpha" },
      { ...ISO, projectId: 1, projectTitle: "Alpha", isOrganizationalProject: false },
    ];
    mockCompliance.mockResolvedValue(controlCategory("C1"));
    mockClauses.mockResolvedValue([{ id: 1, clause_id: "4", title: "c", status: "Done" }]);

    const collector = createScopedDataCollector(10, 5, "project", bothOnOneProject);
    const data = await collector.collectAllData(["compliance", "clausesAndAnnexes"]);

    expect(data.sections.compliance!.controls).toHaveLength(1);
    expect(data.sections.clausesAndAnnexes!.clauses).toHaveLength(1);
  });
});
