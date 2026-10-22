import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../utils/compliance.utils", () => ({
  calculateComplianceScore: jest.fn(),
}));
jest.mock("../../utils/eu.utils", () => ({
  countSubControlsEUByProjectId: jest.fn(),
  countAnswersEUByProjectId: jest.fn(),
}));
jest.mock("../../utils/iso42001.utils", () => ({
  countSubClausesISOByProjectId: jest.fn(),
  countAnnexCategoriesISOByProjectId: jest.fn(),
}));
jest.mock("../../utils/iso27001.utils", () => ({
  countSubClausesISOByProjectId: jest.fn(),
  countAnnexControlsISOByProjectId: jest.fn(),
}));
jest.mock("../../utils/nist_ai_rmf.subcategory.utils", () => ({
  countNISTAIRMFSubcategoriesProgress: jest.fn(),
}));
jest.mock("../scope", () => ({
  requireOrganization: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../frameworks", () => ({
  listFrameworkRefs: jest.fn(),
}));
jest.mock("../../services/useCase.service", () => ({
  CREATE_TIME_FRAMEWORK_BUILDERS: { 1: {}, 2: {}, 3: {}, 4: {} },
}));

import { sequelize } from "../../database/db";
import { calculateComplianceScore } from "../../utils/compliance.utils";
import { countAnswersEUByProjectId, countSubControlsEUByProjectId } from "../../utils/eu.utils";
import {
  countAnnexCategoriesISOByProjectId,
  countSubClausesISOByProjectId as count42001,
} from "../../utils/iso42001.utils";
import {
  countAnnexControlsISOByProjectId,
  countSubClausesISOByProjectId as count27001,
} from "../../utils/iso27001.utils";
import { countNISTAIRMFSubcategoriesProgress } from "../../utils/nist_ai_rmf.subcategory.utils";
import { listFrameworkRefs } from "../frameworks";
import { requireOrganization } from "../scope";
import { complianceTools } from "../tools/compliance";

const CALLER = { userId: 7, organizationId: null };

const tool = (name: string) => {
  const found = complianceTools.find((t) => t.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
};
const payload = (res: any) => JSON.parse(res.content[0].text);

const mockQuery = sequelize.query as unknown as jest.Mock;

const SCORE = {
  overallScore: 54,
  calculatedAt: "2026-10-21T00:00:00.000Z",
  modules: {
    riskManagement: { score: 50, weight: 0.3, totalDataPoints: 4 },
    vendorManagement: { score: 60, weight: 0.3, totalDataPoints: 3 },
  },
};

/** One projects_frameworks row joined to its framework and use case. */
const row = (frameworkId: number, frameworkName: string, projectId = 1, title = "Screening") => ({
  project_framework_id: 100 + frameworkId,
  framework_id: frameworkId,
  framework_name: frameworkName,
  project_id: projectId,
  project_title: title,
});

beforeEach(() => {
  jest.clearAllMocks();
  (calculateComplianceScore as unknown as jest.Mock).mockResolvedValue(SCORE as never);
  (countSubControlsEUByProjectId as unknown as jest.Mock).mockResolvedValue({
    totalSubcontrols: "39",
    doneSubcontrols: "13",
  } as never);
  (countAnswersEUByProjectId as unknown as jest.Mock).mockResolvedValue({
    totalAssessments: "70",
    answeredAssessments: "23",
  } as never);
  (count42001 as unknown as jest.Mock).mockResolvedValue({
    totalSubclauses: "27",
    doneSubclauses: "4",
  } as never);
  (countAnnexCategoriesISOByProjectId as unknown as jest.Mock).mockResolvedValue({
    totalAnnexcategories: "46",
    doneAnnexcategories: "6",
  } as never);
  (count27001 as unknown as jest.Mock).mockResolvedValue({
    totalSubclauses: "20",
    doneSubclauses: "0",
  } as never);
  (countAnnexControlsISOByProjectId as unknown as jest.Mock).mockResolvedValue({
    totalAnnexControls: "93",
    doneAnnexControls: "0",
  } as never);
  (countNISTAIRMFSubcategoriesProgress as unknown as jest.Mock).mockResolvedValue({
    totalSubcategories: 72,
    doneSubcategories: 18,
  } as never);
});

describe("list_frameworks", () => {
  it("reports the name to use and the scope that constrains it", async () => {
    (listFrameworkRefs as unknown as jest.Mock).mockResolvedValue([
      { id: 1, name: "EU AI Act", isOrganizational: false },
      { id: 2, name: "ISO 42001", isOrganizational: true },
    ] as never);

    const res = await tool("list_frameworks").handler({}, CALLER);

    expect(payload(res)).toEqual({
      count: 2,
      frameworks: [
        { id: 1, name: "EU AI Act", scope: "use case", buildsControls: true },
        { id: 2, name: "ISO 42001", scope: "organization wide", buildsControls: true },
      ],
    });
  });

  it("marks a bundled framework as recording the attachment only", async () => {
    (listFrameworkRefs as unknown as jest.Mock).mockResolvedValue([
      { id: 10, name: "ALTAI", isOrganizational: false },
    ] as never);

    const res = await tool("list_frameworks").handler({}, CALLER);

    expect(payload(res).frameworks[0].buildsControls).toBe(false);
  });
});

describe("get_compliance_posture", () => {
  it("checks the organization before reading", async () => {
    mockQuery.mockResolvedValue([] as never);
    await tool("get_compliance_posture").handler({ organizationId: 3 }, CALLER);
    expect(requireOrganization).toHaveBeenCalledWith(3);
  });

  it("reports the weighted score and its modules", async () => {
    mockQuery.mockResolvedValue([] as never);

    const res = await tool("get_compliance_posture").handler({ organizationId: 3 }, CALLER);

    expect(payload(res)).toMatchObject({
      organizationId: 3,
      overallScore: 54,
      modules: {
        riskManagement: { score: 50, weight: 0.3, dataPoints: 4 },
        vendorManagement: { score: 60, weight: 0.3, dataPoints: 3 },
      },
    });
  });

  it("says so plainly when no framework is attached anywhere", async () => {
    mockQuery.mockResolvedValue([] as never);

    const res = await tool("get_compliance_posture").handler({ organizationId: 3 }, CALLER);

    expect(payload(res).useCases).toEqual([]);
    expect(payload(res).note).toMatch(/No compliance framework is instantiated/);
  });

  it("carries no note when something is attached", async () => {
    mockQuery.mockResolvedValue([row(1, "EU AI Act")] as never);

    const res = await tool("get_compliance_posture").handler({ organizationId: 3 }, CALLER);

    expect(payload(res).note).toBeUndefined();
  });

  it("reads EU AI Act progress as controls and assessment answers", async () => {
    mockQuery.mockResolvedValue([row(1, "EU AI Act")] as never);

    const res = await tool("get_compliance_posture").handler({ organizationId: 3 }, CALLER);

    // Keyed by the projects_frameworks row, not the use case.
    expect(countSubControlsEUByProjectId).toHaveBeenCalledWith(101, 3);
    expect(payload(res).useCases[0].frameworks[0].progress).toEqual({
      controls: { total: 39, done: 13, percent: 33 },
      assessment: { total: 70, answered: 23, percent: 33 },
    });
  });

  it("reads ISO 42001 progress as clauses and annex categories", async () => {
    mockQuery.mockResolvedValue([row(2, "ISO 42001")] as never);

    const res = await tool("get_compliance_posture").handler({ organizationId: 3 }, CALLER);

    expect(payload(res).useCases[0].frameworks[0].progress).toEqual({
      clauses: { total: 27, done: 4, percent: 15 },
      annexCategories: { total: 46, done: 6, percent: 13 },
    });
  });

  it("reads ISO 27001 progress as clauses and annex controls", async () => {
    mockQuery.mockResolvedValue([row(3, "ISO 27001")] as never);

    const res = await tool("get_compliance_posture").handler({ organizationId: 3 }, CALLER);

    expect(payload(res).useCases[0].frameworks[0].progress).toEqual({
      clauses: { total: 20, done: 0, percent: 0 },
      annexControls: { total: 93, done: 0, percent: 0 },
    });
  });

  /** NIST AI RMF subcategories are organization-scoped, not per use case. */
  it("labels NIST AI RMF progress as organization scoped", async () => {
    mockQuery.mockResolvedValue([row(4, "NIST AI RMF")] as never);

    const res = await tool("get_compliance_posture").handler({ organizationId: 3 }, CALLER);

    expect(countNISTAIRMFSubcategoriesProgress).toHaveBeenCalledWith(3);
    expect(payload(res).useCases[0].frameworks[0].progress).toEqual({
      subcategories: { total: 72, done: 18, percent: 25, scope: "organization" },
    });
  });

  it("says a bundled framework tracks progress elsewhere rather than reporting zero", async () => {
    mockQuery.mockResolvedValue([row(10, "ALTAI")] as never);

    const res = await tool("get_compliance_posture").handler({ organizationId: 3 }, CALLER);

    expect(payload(res).useCases[0].frameworks[0].progress.note).toMatch(
      /does not report progress through the core control tables/,
    );
  });

  it("reports a percentage of null rather than zero when nothing is tracked", async () => {
    (countSubControlsEUByProjectId as unknown as jest.Mock).mockResolvedValue({
      totalSubcontrols: "0",
      doneSubcontrols: "0",
    } as never);
    mockQuery.mockResolvedValue([row(1, "EU AI Act")] as never);

    const res = await tool("get_compliance_posture").handler({ organizationId: 3 }, CALLER);

    expect(payload(res).useCases[0].frameworks[0].progress.controls).toEqual({
      total: 0,
      done: 0,
      percent: null,
    });
  });

  it("groups several frameworks under the one use case they belong to", async () => {
    mockQuery.mockResolvedValue([
      row(2, "ISO 42001", 2, "AIMS"),
      row(3, "ISO 27001", 2, "AIMS"),
    ] as never);

    const res = await tool("get_compliance_posture").handler({ organizationId: 3 }, CALLER);

    expect(payload(res).useCases).toHaveLength(1);
    expect(payload(res).useCases[0]).toMatchObject({ useCaseId: 2, title: "AIMS" });
    expect(payload(res).useCases[0].frameworks.map((f: any) => f.framework)).toEqual([
      "ISO 42001",
      "ISO 27001",
    ]);
  });

  it("narrows the breakdown to one use case when asked", async () => {
    mockQuery.mockResolvedValue([
      row(1, "EU AI Act", 1, "Screening"),
      row(2, "ISO 42001", 2, "AIMS"),
    ] as never);

    const res = await tool("get_compliance_posture").handler(
      { organizationId: 3, useCaseId: 2 },
      CALLER,
    );

    expect(payload(res).useCases).toHaveLength(1);
    expect(payload(res).useCases[0].useCaseId).toBe(2);
  });
});
