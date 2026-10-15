const mockQuery = jest.fn();

jest.mock("../../../database/db", () => ({
  sequelize: {
    query: (...args: unknown[]) => mockQuery(...args),
    transaction: jest.fn(),
  },
}));

jest.mock("../../../utils/nistAiRmfCorrect.utils", () => ({
  getAllFunctionsWithCategoriesQuery: jest.fn(),
  getAllCategoriesWithSubcategoriesQuery: jest.fn(),
  getSubcategoryByIdQuery: jest.fn(),
  countSubcategoriesNISTByProjectId: jest.fn(),
  countSubcategoryAssignmentsNISTByProjectId: jest.fn(),
  updateSubcategoryQuery: jest.fn(),
}));

jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));

jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { availableNistAiRmfTools } from "../../functions/nistAiRmfFunctions";
import { availableProjectTools } from "../../functions/projectFunctions";
import { toolsDefinition as nistToolsDefinition } from "../../tools/nistAiRmfTools";
import { bridgeTools } from "../../toolBridge";
import { getAdvisorPrompt } from "../../prompts";
import {
  countSubcategoriesNISTByProjectId,
  countSubcategoryAssignmentsNISTByProjectId,
} from "../../../utils/nistAiRmfCorrect.utils";

const ORG_ID = 1;
const countSubs = countSubcategoriesNISTByProjectId as jest.Mock;
const countAssignments = countSubcategoryAssignmentsNISTByProjectId as jest.Mock;

describe("Advisor Functions: NIST AI RMF org perspective", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    jest.clearAllMocks();
  });

  describe("actionable not-linked error (project-scoped tools)", () => {
    it("get_nist_progress throws the fully wrapped actionable message", async () => {
      mockQuery.mockResolvedValue([[], 0]);

      await expect(
        availableNistAiRmfTools["get_nist_progress"]({ project_id: 5 }, ORG_ID),
      ).rejects.toThrow(
        "Failed to fetch NIST AI RMF progress: NIST AI RMF is not linked to project #5. " +
          "To set it up: (1) go to the Frameworks page, (2) select your organizational project, " +
          "(3) add the NIST AI RMF framework, then try again.",
      );
    });

    it("toolBridge surfaces the actionable message to the model as { error }", async () => {
      mockQuery.mockResolvedValue([[], 0]);

      const progressDef = nistToolsDefinition.filter(
        (t: any) => t.function.name === "get_nist_progress",
      );
      const bridged = bridgeTools(progressDef, availableNistAiRmfTools, ORG_ID);
      const result = (await bridged["get_nist_progress"].execute!(
        { project_id: 5 },
        {} as any,
      )) as { error?: string };

      expect(result.error).toContain("NIST AI RMF is not linked to project #5");
      expect(result.error).toContain("add the NIST AI RMF framework");
    });
  });

  describe("get_nist_org_progress", () => {
    it("zero linked projects returns not_configured with setup message, not an error", async () => {
      mockQuery.mockResolvedValue([[], 0]);

      const res = await availableNistAiRmfTools["get_nist_org_progress"]({}, ORG_ID);

      expect(res.status).toBe("not_configured");
      expect(res.linkedProjects).toBe(0);
      expect(res.projects).toEqual([]);
      expect(res.totals).toBeNull();
      expect(res.excludedDemoProjects).toEqual([]);
      expect(res.message).toContain("add the NIST AI RMF framework");
    });

    it("single linked project passes counts through", async () => {
      mockQuery.mockResolvedValue([
        [
          {
            project_framework_id: 42,
            project_id: 7,
            project_title: "Organizational Project",
            is_demo: false,
          },
        ],
        1,
      ]);
      countSubs.mockResolvedValue({ totalSubcategories: "100", doneSubcategories: "25" });
      countAssignments.mockResolvedValue({
        totalSubcategories: "100",
        assignedSubcategories: "40",
      });

      const res = await availableNistAiRmfTools["get_nist_org_progress"]({}, ORG_ID);

      expect(res.status).toBe("ok");
      expect(res.linkedProjects).toBe(1);
      expect(countSubs).toHaveBeenCalledWith(42, ORG_ID);
      expect(countAssignments).toHaveBeenCalledWith(42, ORG_ID);
      expect(res.projects[0]).toMatchObject({
        project_id: 7,
        completionPercentage: 25,
        assignmentPercentage: 40,
      });
      expect(res.totals).toEqual({
        totalSubcategories: 100,
        doneSubcategories: 25,
        completionPercentage: 25,
        totalAssigned: 40,
        assignmentPercentage: 40,
      });
    });

    it("multiple linked projects: string/NULL counts coerced, percentages recomputed from sums", async () => {
      mockQuery.mockResolvedValue([
        [
          {
            project_framework_id: 42,
            project_id: 7,
            project_title: "Org Project",
            is_demo: false,
          },
          {
            project_framework_id: 43,
            project_id: 8,
            project_title: "Second Org Project",
            is_demo: false,
          },
        ],
        2,
      ]);
      countSubs.mockImplementation((pfId: number) =>
        Promise.resolve(
          pfId === 42
            ? { totalSubcategories: "100", doneSubcategories: "25" }
            : { totalSubcategories: "40", doneSubcategories: "40" },
        ),
      );
      countAssignments.mockImplementation((pfId: number) =>
        Promise.resolve(
          pfId === 42
            ? { totalSubcategories: "100", assignedSubcategories: "40" }
            : { totalSubcategories: "40", assignedSubcategories: null },
        ),
      );

      const res = await availableNistAiRmfTools["get_nist_org_progress"]({}, ORG_ID);

      expect(res.status).toBe("ok");
      expect(res.linkedProjects).toBe(2);
      // 25/100 + 40/40 => 65/140 = 46% — NOT 25% + 100% = 125%
      expect(res.totals.totalSubcategories).toBe(140);
      expect(res.totals.doneSubcategories).toBe(65);
      expect(res.totals.completionPercentage).toBe(46);
      // 40/100 + NULL/40 => 40/140 = 29%
      expect(res.totals.totalAssigned).toBe(40);
      expect(res.totals.assignmentPercentage).toBe(29);
    });

    it("demo projects are excluded from totals and listed separately", async () => {
      mockQuery.mockResolvedValue([
        [
          {
            project_framework_id: 42,
            project_id: 7,
            project_title: "Org Project",
            is_demo: false,
          },
          { project_framework_id: 44, project_id: 9, project_title: "Demo Org", is_demo: true },
        ],
        2,
      ]);
      countSubs.mockResolvedValue({ totalSubcategories: "100", doneSubcategories: "10" });
      countAssignments.mockResolvedValue({
        totalSubcategories: "100",
        assignedSubcategories: "10",
      });

      const res = await availableNistAiRmfTools["get_nist_org_progress"]({}, ORG_ID);

      expect(res.status).toBe("ok");
      expect(res.linkedProjects).toBe(1);
      expect(res.excludedDemoProjects).toEqual([{ project_id: 9, project_title: "Demo Org" }]);
      expect(res.totals.doneSubcategories).toBe(10);
      // count utils must never be called for the demo project
      expect(countSubs).not.toHaveBeenCalledWith(44, expect.anything());
    });

    it("demo-only organization returns not_configured with demo-specific message", async () => {
      mockQuery.mockResolvedValue([
        [{ project_framework_id: 44, project_id: 9, project_title: "Demo Org", is_demo: true }],
        1,
      ]);

      const res = await availableNistAiRmfTools["get_nist_org_progress"]({}, ORG_ID);

      expect(res.status).toBe("not_configured");
      expect(res.totals).toBeNull();
      expect(res.message).toContain("demo project");
      expect(res.excludedDemoProjects).toEqual([{ project_id: 9, project_title: "Demo Org" }]);
      expect(countSubs).not.toHaveBeenCalled();
    });

    it("a failing count query fails the whole tool with a wrapped error (no partial data)", async () => {
      mockQuery.mockResolvedValue([
        [
          {
            project_framework_id: 42,
            project_id: 7,
            project_title: "Org Project",
            is_demo: false,
          },
        ],
        1,
      ]);
      countSubs.mockRejectedValue(new Error("relation does not exist"));
      countAssignments.mockResolvedValue({
        totalSubcategories: "100",
        assignedSubcategories: "40",
      });

      await expect(availableNistAiRmfTools["get_nist_org_progress"]({}, ORG_ID)).rejects.toThrow(
        "Failed to fetch NIST AI RMF organization progress: relation does not exist",
      );
    });

    it("discovery query is org-scoped, targets framework_id = 4, and uses replacements only", async () => {
      mockQuery.mockResolvedValue([[], 0]);

      await availableNistAiRmfTools["get_nist_org_progress"]({}, ORG_ID);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, options] = mockQuery.mock.calls[0];
      expect(sql).toContain("framework_id = 4");
      expect(sql).toContain("pf.organization_id = :organizationId");
      expect(sql).toContain("p.is_demo");
      expect(options).toEqual({ replacements: { organizationId: ORG_ID } });
    });
  });

  describe("list_projects exposes is_organizational", () => {
    it("maps the flag through to the result", async () => {
      // listProjects uses QueryTypes.SELECT → sequelize returns rows directly
      mockQuery.mockResolvedValue([
        {
          id: 7,
          uc_id: null,
          project_title: "Organizational Project",
          status: "Active",
          ai_risk_classification: null,
          owner: 1,
          is_organizational: true,
        },
      ]);

      const projects = await availableProjectTools["list_projects"]({}, ORG_ID);

      expect(projects[0]).toMatchObject({ id: 7, is_organizational: true });
    });
  });

  describe("tool wiring", () => {
    it("every NIST tool definition has an implementation and vice versa", () => {
      const definedNames = nistToolsDefinition.map((t: any) => t.function.name).sort();
      const implementedNames = Object.keys(availableNistAiRmfTools).sort();
      expect(definedNames).toEqual(implementedNames);
      expect(definedNames).toContain("get_nist_org_progress");
    });
  });

  describe("system prompt", () => {
    it("routes org-level NIST questions to get_nist_org_progress", () => {
      const prompt = getAdvisorPrompt();
      expect(prompt).toContain("get_nist_org_progress");
      expect(prompt).toContain("Organization-level questions");
    });
  });
});
