import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// The real incident write queries run; only the database and queue are mocked,
// so these tests cover the shared write path every writer goes through.
jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import "../../functions/incidentFunctions";
import { ValidationException } from "../../../domain.layer/exceptions/custom.exception";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<unknown>>;
const mockTransaction = sequelize.transaction as unknown as jest.Mock<() => Promise<unknown>>;

const TOO_LONG = "Description cannot exceed 32,767 characters.";

let existingRow: Record<string, unknown>;

const isWrite = (sql: string) =>
  /INSERT INTO ai_incident_managements|UPDATE ai_incident_managements/.test(sql);
const writeCalls = () => mockQuery.mock.calls.filter(([sql]) => isWrite(String(sql)));

const execute = (tool: string, params: Record<string, unknown>) =>
  writeToolExecutors.get(tool)!(params, 7);

describe("incident description rule on the shared write path (AI Advisor tools)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    existingRow = {
      id: 42,
      ai_project: "Existing incident",
      status: "Open",
      // Older rows may predate the minimum length.
      description: "",
    };
    existingRow.dataValues = { ...existingRow };
    mockTransaction.mockResolvedValue({
      commit: jest.fn(),
      rollback: jest.fn(),
      afterCommit: jest.fn(),
    });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("automation_triggers")) return [[], 0];
      if (sql.includes("INSERT INTO ai_incident_managements")) {
        return [{ id: 1, ai_project: "New", status: "Open", dataValues: {} }];
      }
      if (sql.includes("UPDATE ai_incident_managements")) return [[], 0];
      return [existingRow];
    });
  });

  it("agent_create_incident rejects a 32,768-character description without writing", async () => {
    const promise = execute("agent_create_incident", {
      title: "New",
      description: "a".repeat(32768),
    });

    await expect(promise).rejects.toBeInstanceOf(ValidationException);
    await expect(promise).rejects.toThrow(TOO_LONG);
    expect(writeCalls()).toHaveLength(0);
  });

  it("agent_create_incident accepts exactly 32,767 characters", async () => {
    await expect(
      execute("agent_create_incident", { title: "New", description: "a".repeat(32767) }),
    ).resolves.toMatchObject({ id: 1 });
    expect(writeCalls()).toHaveLength(1);
  });

  it("agent_update_incident rejects a 32,768-character description without writing", async () => {
    await expect(
      execute("agent_update_incident", { incident_id: 42, description: "a".repeat(32768) }),
    ).rejects.toThrow(TOO_LONG);
    expect(writeCalls()).toHaveLength(0);
  });

  it("agent_update_incident accepts a description over the old 1,000-character cap", async () => {
    await expect(
      execute("agent_update_incident", { incident_id: 42, description: "a".repeat(1001) }),
    ).resolves.toMatchObject({ id: 42 });
    expect(writeCalls()).toHaveLength(1);
  });

  it("does not re-check an unchanged description, so status-only edits of older rows still work", async () => {
    await expect(
      execute("agent_update_incident_status", { incident_id: 42, status: "Closed" }),
    ).resolves.toMatchObject({ id: 42 });
    expect(writeCalls()).toHaveLength(1);
  });

  it("agent_create_incident rejects a missing description instead of saving an empty one", async () => {
    await expect(execute("agent_create_incident", { title: "New" })).rejects.toThrow(
      "Description is required.",
    );
    expect(writeCalls()).toHaveLength(0);
  });

  it('treats "" and NULL as the same description on a legacy row', async () => {
    existingRow.description = null;
    existingRow.dataValues = { ...existingRow };
    await expect(
      execute("agent_update_incident", { incident_id: 42, description: "" }),
    ).resolves.toMatchObject({ id: 42 });
    // Accepted, and since "" equals NULL nothing changed: the shared write
    // path skips the UPDATE for a no-op edit.
    expect(writeCalls()).toHaveLength(0);
  });
});
