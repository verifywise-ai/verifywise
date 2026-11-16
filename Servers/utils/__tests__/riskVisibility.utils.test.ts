import { describe, it, expect } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../userPermission.utils", () => ({ getUserRoleInOrganization: jest.fn() }));

import { sequelize } from "../../database/db";
import { getUserRoleInOrganization } from "../userPermission.utils";
import {
  accessibleProjectIdSql,
  getAccessibleProjectIdsQuery,
  isRiskVisibleQuery,
  projectRiskVisibilitySql,
  riskViewer,
  riskIdVisibilitySql,
  riskViewerForUserQuery,
  riskVisibilityCondition,
  riskVisibilitySql,
  scopedRiskViewer,
  SYSTEM_RISK_VIEWER,
  UNKNOWN_RISK_VIEWER,
} from "../riskVisibility.utils";

const mockQuery = sequelize.query as jest.Mock;
const mockRole = getUserRoleInOrganization as jest.Mock;

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
  beforeEach(() => mockRole.mockReset());

  it("reads the user's role in the organization from its membership", async () => {
    mockRole.mockResolvedValue({ id: 1, name: "Admin", organizationId: null });
    expect(await riskViewerForUserQuery(3, 1)).toEqual({ userId: 3, role: "Admin" });
    expect(mockRole).toHaveBeenCalledWith(1, 3);
  });

  it("scopes a user with no role in the organization, a SuperAdmin included (ruling J9)", async () => {
    mockRole.mockResolvedValue(undefined);
    const viewer = await riskViewerForUserQuery(3, 1);
    expect(viewer).toEqual({ userId: 3, role: "" });
    expect(scopedRiskViewer(viewer)).toEqual(viewer);
  });
});

describe("the not-linked test", () => {
  it("counts a projects_risks row whatever its organization_id, so a NULL one still hides", () => {
    const { sql } = riskVisibilitySql("r", { userId: 5, role: "Editor" });
    const notExists = sql.slice(sql.indexOf("NOT EXISTS"), sql.indexOf("OR EXISTS"));
    expect(notExists).toContain("prv.risk_id = r.id");
    expect(notExists).not.toContain("organization_id");
  });
});

describe("UNKNOWN_RISK_VIEWER", () => {
  it("is a scoped viewer no user id matches, so it fails closed", () => {
    expect(scopedRiskViewer(UNKNOWN_RISK_VIEWER)).toEqual({ userId: 0, role: "" });
    expect(riskVisibilitySql("r", UNKNOWN_RISK_VIEWER).replacements).toEqual({
      visibilityUserId: 0,
    });
  });
});

describe("riskIdVisibilitySql", () => {
  it("is an EXISTS over the risk with that id in the organization, for a non-Admin", () => {
    const { sql, replacements } = riskIdVisibilitySql("t.risk_id", { userId: 5, role: "Editor" });
    expect(sql.startsWith("EXISTS (")).toBe(true);
    expect(sql).toContain("rvid.id = t.risk_id");
    expect(sql).toContain("rvid.organization_id = :organizationId");
    expect(sql).toContain("prv.risk_id = rvid.id");
    expect(sql).toContain("rvid.risk_owner = :visibilityUserId");
    expect(replacements).toEqual({ visibilityUserId: 5 });
  });

  it.each([
    ["an Admin", { userId: 1, role: "Admin" }],
    ["the system viewer", SYSTEM_RISK_VIEWER],
  ])("is empty for %s", (_label, viewer) => {
    expect(riskIdVisibilitySql("t.risk_id", viewer)).toEqual({ sql: "", replacements: {} });
  });
});

describe("accessibleProjectIdSql", () => {
  it("keeps only use cases the non-Admin can access", () => {
    const { sql, replacements } = accessibleProjectIdSql("pr.project_id", {
      userId: 5,
      role: "Reviewer",
    });
    expect(sql.startsWith(" AND EXISTS (")).toBe(true);
    expect(sql).toContain("pacc.id = pr.project_id");
    expect(sql).toContain("pacc.organization_id = :organizationId");
    expect(sql).toContain("pacc.owner = :visibilityUserId");
    expect(sql).toContain("projects_members");
    expect(sql).toContain("project_groups");
    expect(replacements).toEqual({ visibilityUserId: 5 });
  });

  it.each([
    ["an Admin", { userId: 1, role: "Admin" }],
    ["a SuperAdmin", { userId: 1, role: "SuperAdmin" }],
    ["the system viewer", SYSTEM_RISK_VIEWER],
  ])("is empty for %s", (_label, viewer) => {
    expect(accessibleProjectIdSql("pr.project_id", viewer)).toEqual({
      sql: "",
      replacements: {},
    });
  });
});
