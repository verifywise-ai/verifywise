import { describe, it, expect } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../database/db";
import {
  getAccessibleProjectIdsQuery,
  isRiskVisibleQuery,
  projectRiskVisibilitySql,
  riskViewer,
  riskViewerForUserQuery,
  riskVisibilityCondition,
  riskVisibilitySql,
  scopedRiskViewer,
  SYSTEM_RISK_VIEWER,
} from "../riskVisibility.utils";

const mockQuery = sequelize.query as jest.Mock;

describe("riskVisibilitySql", () => {
  it.each(["Admin", "SuperAdmin"])("adds nothing for %s", (role) => {
    expect(riskVisibilitySql("r", { userId: 5, role })).toEqual({ sql: "", replacements: {} });
  });

  it.each(["Editor", "Auditor", "Reviewer"])(
    "scopes %s by use case, owner and approver",
    (role) => {
      const { sql, replacements } = riskVisibilitySql("risk", { userId: 5, role });
      expect(replacements).toEqual({ visibilityUserId: 5 });
      expect(sql.startsWith(" AND (")).toBe(true);
      // unlinked risks stay visible; only projects_risks counts as a link
      expect(sql).toContain("NOT EXISTS");
      expect(sql).toContain("FROM projects_risks prv");
      expect(sql).not.toContain("frameworks_risks");
      // linked to a use case the viewer can reach
      expect(sql).toContain("pv.owner = :visibilityUserId");
      expect(sql).toContain("projects_members");
      expect(sql).toContain("project_groups");
      // owner and approver always see their own risk
      expect(sql).toContain("risk.risk_owner = :visibilityUserId");
      expect(sql).toContain("risk.risk_approval = :visibilityUserId");
      expect(sql).toContain("prv.risk_id = risk.id");
    },
  );

  it("does not filter the risk's own project aggregate with a WHERE on a join", () => {
    const { sql } = riskVisibilitySql("r", { userId: 5, role: "Editor" });
    expect(sql).not.toMatch(/\bpr\./);
  });
});

describe("riskViewer", () => {
  it("reads the signed-in user from the request", () => {
    expect(riskViewer({ userId: 3, role: "Editor" })).toEqual({ userId: 3, role: "Editor" });
    expect(riskViewer({ userId: 3 })).toEqual({ userId: 3, role: "" });
  });
});

describe("the system viewer", () => {
  beforeEach(() => mockQuery.mockReset());

  it("sees every risk without a query", async () => {
    expect(riskVisibilitySql("r", SYSTEM_RISK_VIEWER)).toEqual({ sql: "", replacements: {} });
    expect(riskVisibilityCondition("r", SYSTEM_RISK_VIEWER)).toBeNull();
    expect(projectRiskVisibilitySql("r", SYSTEM_RISK_VIEWER)).toEqual({
      sql: "",
      replacements: {},
    });
    expect(await isRiskVisibleQuery(4, 1, SYSTEM_RISK_VIEWER)).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("can link any use case of the organization", async () => {
    mockQuery.mockResolvedValue([{ id: 3 }, { id: 4 }]);
    expect(await getAccessibleProjectIdsQuery([3, 4], 1, SYSTEM_RISK_VIEWER)).toEqual([3, 4]);
    expect(mockQuery.mock.calls[0][0]).not.toContain("visibilityUserId");
  });
});

describe("scopedRiskViewer", () => {
  it("is null for viewers who see every risk", () => {
    expect(scopedRiskViewer(SYSTEM_RISK_VIEWER)).toBeNull();
    expect(scopedRiskViewer({ userId: 1, role: "Admin" })).toBeNull();
    expect(scopedRiskViewer({ userId: 1, role: "SuperAdmin" })).toBeNull();
  });

  it("is the user for anyone else", () => {
    expect(scopedRiskViewer({ userId: 2, role: "Editor" })).toEqual({ userId: 2, role: "Editor" });
    expect(scopedRiskViewer({ userId: 2, role: "" })).toEqual({ userId: 2, role: "" });
  });
});

describe("riskVisibilityCondition", () => {
  it("is the riskVisibilitySql predicate without the leading AND", () => {
    const viewer = { userId: 5, role: "Editor" };
    const condition = riskVisibilityCondition("r", viewer)!;
    expect(` AND ${condition.sql}`).toBe(riskVisibilitySql("r", viewer).sql);
    expect(condition.replacements).toEqual({ visibilityUserId: 5 });
  });
});

describe("projectRiskVisibilitySql", () => {
  it("adds the hidden-use-case rule on top of the risk rule for a non-Admin", () => {
    const { sql, replacements } = projectRiskVisibilitySql("r", { userId: 5, role: "Auditor" });
    expect(sql.startsWith(riskVisibilitySql("r", { userId: 5, role: "Auditor" }).sql)).toBe(true);
    expect(sql).toContain("pvs.id = :projectId");
    expect(sql).toContain(
      "r.risk_owner = :visibilityUserId OR r.risk_approval = :visibilityUserId",
    );
    expect(replacements).toEqual({ visibilityUserId: 5 });
  });

  it("adds nothing for an Admin", () => {
    expect(projectRiskVisibilitySql("r", { userId: 5, role: "Admin" })).toEqual({
      sql: "",
      replacements: {},
    });
  });
});

describe("riskViewerForUserQuery", () => {
  beforeEach(() => mockQuery.mockReset());

  it("reads the user's role in the organization", async () => {
    mockQuery.mockResolvedValue([{ name: "Admin" }]);
    expect(await riskViewerForUserQuery(3, 1)).toEqual({ userId: 3, role: "Admin" });
  });

  it("scopes a user with no role in the organization, a SuperAdmin included (ruling J9)", async () => {
    mockQuery.mockResolvedValue([]);
    const viewer = await riskViewerForUserQuery(3, 1);
    expect(viewer).toEqual({ userId: 3, role: "" });
    expect(scopedRiskViewer(viewer)).toEqual(viewer);
  });
});
