import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { updateProjectByIdQuery } from "../project.utils";
import { sequelize } from "../../database/db";

const query = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const transaction = {} as any;

/** Route each SQL statement to a canned result; members 7 and 6 exist. */
function mockDb(currentMembers: number[] = [7, 6]) {
  query.mockImplementation(async (sql: string, opts: any = {}) => {
    if (sql.includes("FROM projects_members"))
      return currentMembers.map((user_id) => ({ user_id }));
    if (sql.startsWith("UPDATE projects SET")) return [{ dataValues: { owner: 1 } }];
    // The read used when there is no column to update (it runs inside the transaction)
    if (sql.startsWith("SELECT * FROM projects") && opts.transaction) {
      return [{ dataValues: { owner: 1 } }];
    }
    if (sql.includes("FROM automation_triggers")) return [[], 0];
    return [];
  });
}

const statements = () => query.mock.calls.map((c) => String(c[0]));
const deletes = () => statements().filter((s) => s.startsWith("DELETE FROM projects_members"));
const inserts = () => statements().filter((s) => s.startsWith("INSERT INTO projects_members"));

describe("updateProjectByIdQuery members handling", () => {
  beforeEach(() => {
    query.mockReset();
    mockDb();
  });

  it("leaves members alone when no member list is given", async () => {
    await updateProjectByIdQuery(
      1,
      { ai_risk_classification: "Minimal risk" } as any,
      undefined,
      1,
      transaction,
    );
    expect(deletes()).toHaveLength(0);
    expect(inserts()).toHaveLength(0);
  });

  it("treats string ids as the same members, so an unchanged list touches nothing", async () => {
    await updateProjectByIdQuery(
      1,
      { project_title: "P" } as any,
      ["7", "6"] as any,
      1,
      transaction,
    );
    expect(deletes()).toHaveLength(0);
    expect(inserts()).toHaveLength(0);
  });

  it("removes every member when an explicit empty list is given", async () => {
    await updateProjectByIdQuery(1, { project_title: "P" } as any, [], 1, transaction);
    expect(deletes()).toHaveLength(2);
    expect(inserts()).toHaveLength(0);
  });

  it("inserts a repeated new id only once", async () => {
    await updateProjectByIdQuery(
      1,
      { project_title: "P" } as any,
      ["7", "6", "8", "8"] as any,
      1,
      transaction,
    );
    expect(deletes()).toHaveLength(0);
    expect(inserts()).toHaveLength(1);
  });

  it("reads the row instead of running an empty UPDATE when only members change", async () => {
    await updateProjectByIdQuery(1, {} as any, [7], 1, transaction);
    expect(statements().some((s) => s.startsWith("UPDATE projects SET"))).toBe(false);
    expect(deletes()).toHaveLength(1);
  });
});
