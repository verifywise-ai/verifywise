/**
 * Model lifecycle item change history (issue #4915 + review follow-ups).
 *
 * updateItem snapshots only the columns the UPDATE can write, normalizes
 * values for comparison, records nothing when nothing changed, and appends
 * to the audit ledger.
 */

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../../utils/auditLedger.utils", () => ({
  appendToAuditLedger: jest.fn().mockResolvedValue(undefined),
}));

import { sequelize } from "../../../database/db";
import { appendToAuditLedger } from "../../../utils/auditLedger.utils";
import { updateItem } from "../modelLifecycle.service";

const mockQuery = sequelize.query as jest.Mock;

const BEFORE = {
  name: "Old name",
  description: "Desc",
  item_type: "gate",
  is_required: true,
  display_order: 1,
  config: null,
  is_active: true,
};

function mockBeforeThenUpdate(updated: any = { id: 5, name: "New name" }) {
  mockQuery
    .mockReset()
    .mockResolvedValueOnce([BEFORE]) // before-snapshot SELECT
    .mockResolvedValueOnce([[updated], 1]); // UPDATE ... RETURNING
}

const historyInsert = () =>
  mockQuery.mock.calls.find((call) =>
    String(call[0]).includes("INSERT INTO model_lifecycle_change_history"),
  );

describe("updateItem change history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("records an updated change with old and new snapshots and the actor", async () => {
    mockBeforeThenUpdate();

    const result = await updateItem(1, 5, { name: "New name" }, 7);

    expect(result).toEqual({ id: 5, name: "New name" });
    const insert = historyInsert();
    expect(insert).toBeDefined();
    expect(insert[1].replacements).toEqual(
      expect.objectContaining({
        organizationId: 1,
        itemId: 5,
        changeType: "updated",
        changedBy: 7,
        oldValue: JSON.stringify({ name: "Old name" }),
        newValue: JSON.stringify({ name: "New name" }),
      }),
    );
    expect(appendToAuditLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 1,
        entryType: "change_history",
        userId: 7,
        entityType: "model_lifecycle_item",
        entityId: 5,
        action: "updated",
      }),
    );
  });

  it("keeps structured config values as objects in the snapshot", async () => {
    mockQuery
      .mockReset()
      .mockResolvedValueOnce([{ ...BEFORE, config: { Approver: "Admin" } }])
      .mockResolvedValueOnce([[{ id: 6 }], 1]);

    await updateItem(1, 6, { config: { Approver: "Reviewer" } }, null);

    const insert = historyInsert();
    expect(insert[1].replacements.oldValue).toBe(JSON.stringify({ config: { Approver: "Admin" } }));
    expect(insert[1].replacements.newValue).toBe(
      JSON.stringify({ config: { Approver: "Reviewer" } }),
    );
    expect(insert[1].replacements.changedBy).toBeNull();
  });

  it("ignores request-body keys the UPDATE does not apply", async () => {
    mockBeforeThenUpdate();

    await updateItem(1, 5, { name: "New name", id: 9, phase_id: 2 }, 7);

    const insert = historyInsert();
    expect(insert).toBeDefined();
    const newSnapshot = JSON.parse(insert[1].replacements.newValue);
    expect(Object.keys(newSnapshot).sort()).toEqual(["name"]);
  });

  it("records nothing when the values are unchanged", async () => {
    mockBeforeThenUpdate();

    await updateItem(1, 5, { is_required: true, display_order: 1 }, 7);

    expect(historyInsert()).toBeUndefined();
    expect(appendToAuditLedger).not.toHaveBeenCalled();
  });

  // Review: JSONB comes back with its keys reordered, so a string compare saw
  // an unchanged config as edited.
  it("records nothing when a config differs only in key order", async () => {
    mockQuery
      .mockReset()
      .mockResolvedValueOnce([{ ...BEFORE, config: { max: 2, threshold: 1 } }])
      .mockResolvedValueOnce([[{ id: 6 }], 1]);

    await updateItem(1, 6, { config: { threshold: 1, max: 2 } }, 7);

    expect(historyInsert()).toBeUndefined();
    expect(appendToAuditLedger).not.toHaveBeenCalled();
  });

  it("records nothing when there are no fields to update", async () => {
    const result = await updateItem(1, 5, {}, 7);
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
