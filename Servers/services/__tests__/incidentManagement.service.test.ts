import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const afterCommitCallbacks: Array<() => void> = [];
const mockTransaction = {
  commit: jest.fn(),
  rollback: jest.fn(),
  afterCommit: jest.fn((cb: () => void) => afterCommitCallbacks.push(cb)),
};

// sequelize.transaction() opens the update transaction.
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async (options?: any, callback?: any) =>
      typeof callback === "function"
        ? callback({ savepointOf: options?.transaction })
        : mockTransaction,
    ),
    query: jest.fn(),
  },
}));
// Real diff; the queries are stubbed.
jest.mock("../../utils/incidentManagement.utils", () => ({
  ...(jest.requireActual("../../utils/incidentManagement.utils") as object),
  getIncidentByIdQuery: jest.fn(),
  updateIncidentByIdQuery: jest.fn(),
  validateIncidentReferences: jest.fn(async () => []),
  enqueueIncidentUpdatedAutomations: jest.fn(async () => undefined),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
// Real history formatting; only the history write is stubbed.
jest.mock("../../utils/changeHistory.base.utils", () => ({
  ...(jest.requireActual("../../utils/changeHistory.base.utils") as object),
  recordMultipleFieldChanges: jest.fn(),
}));

import {
  INCIDENT_CHANGED_MESSAGE,
  IncidentUpdateValidationError,
  updateIncident,
} from "../incidentManagement.service";
import { sequelize } from "../../database/db";
import {
  enqueueIncidentUpdatedAutomations,
  getIncidentByIdQuery,
  updateIncidentByIdQuery,
  validateIncidentReferences,
} from "../../utils/incidentManagement.utils";
import { recordMultipleFieldChanges } from "../../utils/changeHistory.base.utils";
import { ConflictException } from "../../domain.layer/exceptions/custom.exception";
import {
  AIIncidentManagementApprovalStatus as Approval,
  AIIncidentManagementStatus as Status,
} from "../../domain.layer/enums/ai-incident-management.enum";
import {
  drawerSave,
  mapIncidentRow,
  storedIncident,
  storedIncidentRow,
  STORED_UPDATED_AT,
} from "./helpers/incidentFixtures";

const mockGet = getIncidentByIdQuery as jest.MockedFunction<any>;
const mockUpdate = updateIncidentByIdQuery as jest.MockedFunction<any>;
const mockRefs = validateIncidentReferences as jest.MockedFunction<any>;
const mockEnqueue = enqueueIncidentUpdatedAutomations as jest.MockedFunction<any>;
const mockRecord = recordMultipleFieldChanges as jest.MockedFunction<any>;

describe("updateIncident (shared incident write path)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    afterCommitCallbacks.length = 0;
    mockGet.mockImplementation(async () => storedIncident());
    mockUpdate.mockImplementation(async (_id: number, changed: any) => ({ id: 42, ...changed }));
    mockRefs.mockResolvedValue([]);
  });

  it("loads the incident once, locked FOR UPDATE in its own transaction", async () => {
    await updateIncident(1, 42, { status: Status.INVESTIGATING }, 7);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(42, 1, { transaction: mockTransaction, lock: true });
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
  });

  it("resets the approval when replaying the edit drawer's reopen save", async () => {
    const { expected_updated_at: expectedUpdatedAt, ...updates } = drawerSave(
      storedIncident().toSafeJSON(),
      { status: Status.INVESTIGATING },
    );

    await updateIncident(1, 42, updates, 7, { expectedUpdatedAt });

    // Only the reopen and the reset are written.
    expect(mockUpdate.mock.calls[0][1]).toEqual({
      status: Status.INVESTIGATING,
      approval_status: Approval.PENDING,
      approved_by: null,
      approval_date: null,
      approval_notes: null,
    });
  });

  it("records history for exactly the columns it writes", async () => {
    await updateIncident(1, 42, { status: Status.INVESTIGATING, assignee_id: 8 }, 7);

    const written = Object.keys(mockUpdate.mock.calls[0][1]);
    const [entity, incidentId, userId, orgId, changes, tx, system] = mockRecord.mock.calls[0];
    expect([entity, incidentId, userId, orgId, tx, system]).toEqual([
      "incident",
      42,
      7,
      1,
      mockTransaction,
      false,
    ]);
    expect(changes).toHaveLength(written.length);
    expect(changes).toEqual(
      expect.arrayContaining([
        { fieldName: "Status", oldValue: "Closed", newValue: "Investigating" },
        { fieldName: "Approval status", oldValue: "Approved", newValue: "Pending" },
        { fieldName: "Approved by", oldValue: "Jane Doe", newValue: "-" },
        expect.objectContaining({ fieldName: "Approval date", newValue: "-" }),
        { fieldName: "Approval notes", oldValue: "Closure signed off", newValue: "-" },
        // FK changes are tracked and shown by name (user lookup; mocked DB → fallback).
        { fieldName: "Owner", oldValue: "User #7", newValue: "User #8" },
      ]),
    );
  });

  it("does nothing for a no-op update: no write, no history, no automations", async () => {
    const stored = storedIncident();
    mockGet.mockResolvedValue(stored);
    // The drawer saved with nothing edited: only the version is sent.
    const { expected_updated_at: expectedUpdatedAt, ...updates } = drawerSave(
      stored.toSafeJSON(),
      {},
    );

    const result = await updateIncident(1, 42, updates, 7, { expectedUpdatedAt });

    expect(result).toBe(stored);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockTransaction.afterCommit).not.toHaveBeenCalled();
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
  });

  it("enqueues automations only after commit", async () => {
    await updateIncident(1, 42, { status: Status.OPEN }, 7);

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(afterCommitCallbacks).toHaveLength(1);
    afterCommitCallbacks[0]();
    expect(mockEnqueue).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ id: 42 }),
      expect.objectContaining({ status: Status.OPEN }),
    );
  });

  it("looks up history names tenant-scoped on the update transaction", async () => {
    await updateIncident(1, 42, { assignee_id: 8 }, 7);

    const userLookups = (sequelize.query as jest.MockedFunction<any>).mock.calls.filter(
      ([sql]: [string]) => String(sql).includes("FROM users"),
    );
    expect(userLookups).toHaveLength(2); // old and new owner
    const savepointStatements = (sequelize.query as jest.MockedFunction<any>).mock.calls
      .map(([sql]: [string]) => sql)
      .filter((sql: string) => /SAVEPOINT history_lookup_\d+$/.test(sql));
    expect(savepointStatements.filter((sql: string) => sql.startsWith("SAVEPOINT"))).toHaveLength(
      2,
    );
    expect(savepointStatements.filter((sql: string) => sql.startsWith("RELEASE"))).toHaveLength(2);
    for (const [sql, options] of userLookups) {
      expect(sql).toContain("organization_id = :organizationId");
      expect(options).toMatchObject({
        replacements: { organizationId: 1 },
        // On the update transaction, inside its own SAVEPOINT.
        transaction: mockTransaction,
      });
    }
  });

  describe("optimistic concurrency (expectedUpdatedAt)", () => {
    it("reads the stored version from updatedAt, where mapToModel puts updated_at", async () => {
      const stored = storedIncident();
      // The regression: dataValues has no updated_at on a mapped row.
      expect(stored.dataValues).not.toHaveProperty("updated_at");
      expect(stored.dataValues).toHaveProperty("updatedAt", STORED_UPDATED_AT);
      mockGet.mockResolvedValue(stored);

      // The drawer's own save, with the version it loaded from the API JSON.
      const { expected_updated_at: expectedUpdatedAt, ...updates } = drawerSave(
        stored.toSafeJSON(),
        { status: Status.INVESTIGATING },
      );
      await updateIncident(1, 42, updates, 7, { expectedUpdatedAt });

      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["empty", ""],
      ["whitespace", "   "],
      ["not a date", "yesterday-ish"],
      ["number", 12345],
      ["object", {}],
    ])(
      "rejects a %s expectedUpdatedAt as a validation error, not a conflict",
      async (_label, expectedUpdatedAt) => {
        const attempt = updateIncident(1, 42, { status: Status.OPEN }, 7, { expectedUpdatedAt });

        await expect(attempt).rejects.toBeInstanceOf(IncidentUpdateValidationError);
        await expect(attempt).rejects.toMatchObject({
          errors: [expect.objectContaining({ field: "expected_updated_at", code: "INVALID_DATE" })],
        });
        expect(sequelize.transaction).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["null", null],
      ["undefined", undefined],
    ])("skips the version check for a %s expectedUpdatedAt", async (_label, expectedUpdatedAt) => {
      await updateIncident(1, 42, { status: Status.OPEN }, 7, { expectedUpdatedAt });
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it("a retry after a conflict keeps the other editor's status and approval", async () => {
      // A opened the incident while it was Open / Pending.
      const seenByA = mapIncidentRow({
        ...storedIncidentRow(),
        status: Status.OPEN,
        approval_status: Approval.PENDING,
        approved_by: null,
        approval_date: null,
        approval_notes: null,
        updated_at: new Date("2026-10-09T09:00:00.000Z"),
      });
      // B then closed and approved it (the fixture's stored state).
      const afterB = storedIncident();
      mockGet.mockResolvedValue(afterB);

      // A edits only the description and saves with the version A loaded.
      const firstTry = drawerSave(seenByA.toSafeJSON(), { description: "A's notes" });
      const { expected_updated_at: staleVersion, ...aEdits } = firstTry;
      await expect(
        updateIncident(1, 42, aEdits, 7, { expectedUpdatedAt: staleVersion }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockUpdate).not.toHaveBeenCalled();

      // The drawer refreshed to B's version and A saves again: still only A's edit.
      const retry = drawerSave(afterB.toSafeJSON(), { description: "A's notes" });
      const { expected_updated_at: latestVersion, ...retryEdits } = retry;
      await updateIncident(1, 42, retryEdits, 7, { expectedUpdatedAt: latestVersion });

      // Only the description is written; B's Closed / Approved stands.
      expect(mockUpdate.mock.calls[0][1]).toEqual({ description: "A's notes" });
    });

    it("accepts the updated_at the editor loaded", async () => {
      await updateIncident(1, 42, { status: Status.OPEN }, 7, {
        expectedUpdatedAt: STORED_UPDATED_AT.toISOString(),
      });
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("refuses a stale updated_at with a ConflictException and writes nothing", async () => {
      const attempt = updateIncident(1, 42, { status: Status.OPEN }, 7, {
        expectedUpdatedAt: "2026-10-10T12:00:00.000Z",
      });

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toThrow(INCIDENT_CHANGED_MESSAGE);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  it("rejects a malformed reference before any reference lookup", async () => {
    const attempt = updateIncident(1, 42, { project_id: "abc" }, 7);

    await expect(attempt).rejects.toBeInstanceOf(IncidentUpdateValidationError);
    await expect(attempt).rejects.toMatchObject({
      errors: [expect.objectContaining({ field: "project_id" })],
    });
    expect(mockRefs).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("validates references against the locked row inside the transaction", async () => {
    mockRefs.mockResolvedValue(["assignee_id"]);

    const attempt = updateIncident(1, 42, { assignee_id: 999 }, 7);

    await expect(attempt).rejects.toBeInstanceOf(IncidentUpdateValidationError);
    await expect(attempt).rejects.toMatchObject({
      errors: [
        {
          field: "assignee_id",
          message: "assignee_id does not reference an entity in your organization",
          code: "INVALID_REFERENCE",
        },
      ],
    });
    // Unchanged FKs come from the locked row.
    expect(mockRefs).toHaveBeenCalledWith(
      { model_inventory_id: null, project_id: 3, assignee_id: 999 },
      1,
      mockTransaction,
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("records a system change with no actor when changedBySystem is set", async () => {
    await updateIncident(1, 42, { status: Status.OPEN }, null, { changedBySystem: true });

    const [, , userId, , , , system] = mockRecord.mock.calls[0];
    expect(userId).toBeNull();
    expect(system).toBe(true);
  });

  it("uses the caller's transaction without committing or rolling it back", async () => {
    const callerTx = { commit: jest.fn(), rollback: jest.fn(), afterCommit: jest.fn() };
    await updateIncident(1, 42, { status: Status.OPEN }, 7, { transaction: callerTx as any });

    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith(42, 1, { transaction: callerTx, lock: true });
    expect(callerTx.afterCommit).toHaveBeenCalledTimes(1);
    expect(callerTx.commit).not.toHaveBeenCalled();
    expect(callerTx.rollback).not.toHaveBeenCalled();
  });

  it("returns null and rolls back when the incident does not exist", async () => {
    mockGet.mockResolvedValue(null);

    await expect(updateIncident(1, 99, { status: Status.OPEN }, 7)).resolves.toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
  });

  it("rolls back and rethrows when the write fails", async () => {
    mockUpdate.mockRejectedValue(new Error("db down"));

    await expect(updateIncident(1, 42, { status: Status.OPEN }, 7)).rejects.toThrow("db down");
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
