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

import { createNewProjectQuery, updateProjectByIdQuery } from "../project.utils";
import { sequelize } from "../../database/db";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const query = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const transaction = {} as any;

/**
 * Route each SQL statement to a canned result; members 7 and 6 exist, and
 * users 6, 7 and 8 belong to the organization (99 does not).
 * `rowExists: false` simulates the row being deleted concurrently;
 * `automationActive` adds an active "project_updated" automation.
 */
function mockDb({
  currentMembers = [7, 6],
  rowExists = true,
  automationActive = false,
}: { currentMembers?: number[]; rowExists?: boolean; automationActive?: boolean } = {}) {
  const row = rowExists ? [{ dataValues: { owner: 1 } }] : [];
  const orgUsers = [6, 7, 8];
  query.mockImplementation(async (sql: string, opts: any = {}) => {
    if (sql.includes("FOR UPDATE")) return rowExists ? [{ id: 1 }] : [];
    if (sql.startsWith("SELECT user_id AS id FROM organization_members"))
      return opts.replacements.userIds
        .filter((id: number) => orgUsers.includes(id))
        .map((id: number) => ({ id }));
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

  it("rejects a user from another organization before changing members", async () => {
    await expect(
      updateProjectByIdQuery(1, { project_title: "P" } as any, [7, 99], 1, transaction),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(deletes()).toHaveLength(0);
    expect(inserts()).toHaveLength(0);
  });

  it("rejects a user from another organization before creating the use case", async () => {
    await expect(
      createNewProjectQuery({ project_title: "P" } as any, [99], [], 1, 1, transaction),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(statements().some((s) => s.startsWith("INSERT"))).toBe(false);
  });

  it("rejects an owner from another organization on update and on create", async () => {
    await expect(
      updateProjectByIdQuery(1, { owner: 99 } as any, undefined, 1, transaction),
    ).rejects.toBeInstanceOf(ValidationException);
    await expect(
      createNewProjectQuery({ project_title: "P", owner: 99 } as any, [], [], 1, 1, transaction),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(statements().some((s) => s.startsWith("INSERT") || s.startsWith("UPDATE"))).toBe(false);
  });

  it("accepts an owner from the organization and allows clearing it", async () => {
    await updateProjectByIdQuery(1, { owner: 7 } as any, undefined, 1, transaction);
    await updateProjectByIdQuery(1, { owner: null } as any, undefined, 1, transaction);
    expect(statements().filter((s) => s.startsWith("UPDATE projects SET"))).toHaveLength(2);
  });

  describe("requireOwner, checked against the locked row (#5256)", () => {
    const storedRow = (owner: number | null, external_owner_email: string | null = null) => {
      const fallback = query.getMockImplementation()!;
      query.mockImplementation(async (sql: string, opts: any = {}) => {
        if (sql.startsWith("SELECT * FROM projects") && !opts.transaction) {
          return [
            {
              id: 1,
              owner,
              external_owner_name: external_owner_email ? "Ada" : null,
              external_owner_email,
              dataValues: { owner },
            },
          ];
        }
        if (sql.includes("FROM projects_frameworks")) return [[], 0];
        return fallback(sql, opts);
      });
    };
    const write = (body: object, requireOwner?: boolean) =>
      updateProjectByIdQuery(1, body as any, undefined, 1, transaction, { requireOwner });
    const updates = () => statements().filter((s) => s.startsWith("UPDATE"));

    it("refuses to leave a use case with no owner of either kind", async () => {
      storedRow(7);
      await expect(write({ owner: null }, true)).rejects.toBeInstanceOf(ValidationException);
      expect(updates()).toHaveLength(0);
    });

    it("refuses to clear the only external owner", async () => {
      storedRow(null, "ada@example.com");
      await expect(
        write({ external_owner_name: null, external_owner_email: null }, true),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(updates()).toHaveLength(0);
    });

    it("treats owner: null as a no-op on a row with no user owner", async () => {
      storedRow(null);
      await write({ owner: null }, true);
      expect(updates()).toHaveLength(1);
    });

    it("does not apply when off, which is what the legacy API uses", async () => {
      storedRow(7);
      await write({ owner: null }, false);
      expect(updates()).toHaveLength(1);
    });
  });

  it("clears the external fields when a numeric owner is set (#5256)", async () => {
    await updateProjectByIdQuery(1, { owner: 7 } as any, undefined, 1, transaction);
    const update = query.mock.calls.find((c) => String(c[0]).startsWith("UPDATE projects SET"))!;
    expect((update[1] as any).replacements).toMatchObject({
      owner: 7,
      external_owner_name: null,
      external_owner_email: null,
    });
  });

  it("stores an external owner, lowercased, and clears the user owner (#5256)", async () => {
    await updateProjectByIdQuery(
      1,
      { external_owner_name: "Ada", external_owner_email: "ADA@Example.com" } as any,
      undefined,
      1,
      transaction,
    );
    const update = query.mock.calls.find((c) => String(c[0]).startsWith("UPDATE projects SET"))!;
    expect((update[1] as any).replacements).toMatchObject({
      owner: null,
      external_owner_name: "Ada",
      external_owner_email: "ada@example.com",
    });
  });

  it("returns null without touching members when the row is already gone", async () => {
    query.mockReset();
    mockDb({ rowExists: false });
    await expect(
      updateProjectByIdQuery(1, { project_title: "P" } as any, [8], 1, transaction),
    ).resolves.toBeNull();
    expect(deletes()).toHaveLength(0);
    expect(inserts()).toHaveLength(0);
  });

  it("does not look up automations when no project field changed", async () => {
    await updateProjectByIdQuery(1, {} as any, [7], 1, transaction);
    expect(statements().some((s) => s.includes("FROM automation_triggers"))).toBe(false);
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
