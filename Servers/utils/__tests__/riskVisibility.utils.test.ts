import { describe, it, expect } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { riskVisibilitySql, riskViewer } from "../riskVisibility.utils";

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
