import { describe, it, expect } from "@jest/globals";
import { projectAccessSql, projectVisibilitySql, seesAllProjects } from "./projectVisibility.utils";

const viewer = { userId: 9, role: "Editor" };

describe("seesAllProjects", () => {
  it("is true for Admin and SuperAdmin only", () => {
    expect(seesAllProjects("Admin")).toBe(true);
    expect(seesAllProjects("SuperAdmin")).toBe(true);
    expect(seesAllProjects("Editor")).toBe(false);
    expect(seesAllProjects("Auditor")).toBe(false);
    expect(seesAllProjects(undefined)).toBe(false);
  });
});

describe("projectVisibilitySql (#5253 group access)", () => {
  it("returns an empty fragment for admins", () => {
    expect(projectVisibilitySql("p", { userId: 1, role: "Admin" })).toEqual({
      sql: "",
      replacements: {},
    });
  });

  it("grants access via direct membership or group membership", () => {
    const { sql, replacements } = projectVisibilitySql("p", viewer);
    expect(sql).toContain("p.owner = :visibilityUserId");
    expect(sql).toContain("projects_members pm");
    expect(sql).toContain("project_groups pg");
    expect(sql).toContain("group_members gm");
    expect(sql).toContain("pg.project_id = p.id");
    expect(sql).toContain("gm.user_id = :visibilityUserId");
    expect(replacements).toEqual({ visibilityUserId: 9 });
  });

  it("projectAccessSql scopes by access even for Admins", () => {
    const { sql, replacements } = projectAccessSql("p", 1);
    expect(sql).toContain("project_groups pg");
    expect(replacements).toEqual({ visibilityUserId: 1 });
    expect(projectVisibilitySql("p", viewer).sql).toBe(projectAccessSql("p", 9).sql);
  });

  it("aliases tables through the alias argument", () => {
    const { sql } = projectVisibilitySql("proj", viewer);
    expect(sql).toContain("proj.owner = :visibilityUserId");
    expect(sql).toContain("pm.project_id = proj.id");
    expect(sql).toContain("pg.project_id = proj.id");
  });
});
