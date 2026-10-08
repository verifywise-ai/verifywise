import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../automation/project.automation.utils", () => ({
  buildProjectUpdateReplacements: jest.fn(() => ({})),
}));

import { updateProjectByIdQuery } from "../project.utils";
import { sequelize } from "../../database/db";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const query = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const transaction = {} as any;

/**
 * Route each SQL statement to a canned result; members 7 and 6 exist.
 * `rowExists: false` simulates the row being deleted concurrently;
 * `automationActive` adds an active "project_updated" automation.
 */
function mockDb({
  currentMembers = [7, 6],
  rowExists = true,
  automationActive = false,
}: { currentMembers?: number[]; rowExists?: boolean; automationActive?: boolean } = {}) {
  const row = rowExists ? [{ dataValues: { owner: 1 } }] : [];
  query.mockImplementation(async (sql: string, opts: any = {}) => {
    if (sql.includes("FROM projects_members"))
      return currentMembers.map((user_id) => ({ user_id }));
    if (sql.startsWith("UPDATE projects SET")) return row;
    // The read used when there is no column to update (it runs inside the transaction)
    if (sql.startsWith("SELECT * FROM projects") && opts.transaction) return row;
    if (sql.includes("FROM automation_triggers")) {
      const automation = {
        trigger_key: "project_updated",
        action_key: "send_email",
        automation_id: 1,
        params: { subject: "", body: "" },
      };
      return [automationActive ? [automation] : [], 0];
    }
    if (sql.includes("AS full_name")) return [[{ full_name: "A B" }], 0];
    return [];
  });
}

const statements = () => query.mock.calls.map((c) => String(c[0]));
const deletes = () => statements().filter((s) => s.startsWith("DELETE FROM projects_members"));
const inserts = () => statements().filter((s) => s.startsWith("INSERT INTO projects_members"));

describe("updateProjectByIdQuery members handling", () => {
  beforeEach(() => {
    query.mockReset();
    (enqueueAutomationAction as unknown as jest.Mock).mockClear();
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

  it("rejects an invalid member id instead of silently dropping it", async () => {
    await expect(
      updateProjectByIdQuery(1, { project_title: "P" } as any, ["abc"] as any, 1, transaction),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(deletes()).toHaveLength(0);
  });

  it("returns null when the row is gone, even with an active automation", async () => {
    query.mockReset();
    mockDb({ rowExists: false, automationActive: true });
    await expect(
      updateProjectByIdQuery(1, { project_title: "P" } as any, undefined, 1, transaction),
    ).resolves.toBeNull();
    expect(enqueueAutomationAction).not.toHaveBeenCalled();
  });

  it("does not fire the project-updated automation when no project field changed", async () => {
    query.mockReset();
    mockDb({ automationActive: true });
    await updateProjectByIdQuery(1, {} as any, [7], 1, transaction);
    expect(enqueueAutomationAction).not.toHaveBeenCalled();
  });

  it("still fires the project-updated automation when a field changed", async () => {
    query.mockReset();
    mockDb({ automationActive: true });
    await updateProjectByIdQuery(1, { project_title: "P" } as any, undefined, 1, transaction);
    expect(enqueueAutomationAction).toHaveBeenCalledTimes(1);
  });

  it("reads the row instead of running an empty UPDATE when only members change", async () => {
    await updateProjectByIdQuery(1, {} as any, [7], 1, transaction);
    expect(statements().some((s) => s.startsWith("UPDATE projects SET"))).toBe(false);
    expect(deletes()).toHaveLength(1);
  });
});
