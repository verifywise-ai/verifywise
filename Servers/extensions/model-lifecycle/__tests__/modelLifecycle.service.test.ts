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
import {
  attachFile,
  deleteItem,
  deletePhase,
  detachFile,
  updateItem,
} from "../modelLifecycle.service";

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

// DELETE on a lifecycle item's file used to hard-delete `files` by id whether
// or not the item linked to it, so any file in the organization could be
// removed through this route.
describe("detachFile", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  const fileDeletes = () =>
    mockQuery.mock.calls.filter((call) => /DELETE\s+FROM\s+files\b/i.test(String(call[0])));

  it("leaves the file alone and reports false when the item has no link to it", async () => {
    mockQuery.mockResolvedValueOnce([]); // DELETE ... RETURNING matched nothing

    const detached = await detachFile(1, 10, 20, 99);

    expect(detached).toBe(false);
    expect(fileDeletes()).toHaveLength(0);
  });

  it("removes the link, scoped to the organization, model and item, and reports true", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 7 }]);

    const detached = await detachFile(1, 10, 20, 99);

    expect(detached).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/DELETE FROM model_lifecycle_item_files/);
    expect(String(sql)).toMatch(/organization_id = :organizationId/);
    expect(String(sql)).toMatch(/RETURNING/);
    expect(options.replacements).toEqual({
      organizationId: 1,
      modelId: 10,
      itemId: 20,
      fileId: 99,
    });
    // The file may be linked elsewhere; the File Manager owns its deletion.
    expect(fileDeletes()).toHaveLength(0);
  });
});

// Deleting a phase or item used to hard-delete every `files` row linked under
// it, including shared evidence or policy files other records still use.
describe("deletePhase / deleteItem", () => {
  beforeEach(() => {
    mockQuery.mockReset().mockResolvedValue([]);
  });

  const fileDeletes = () =>
    mockQuery.mock.calls.filter((call) => /DELETE\s+FROM\s+files\b/i.test(String(call[0])));

  it("deletes only the phase, scoped to the organization, and never a file", async () => {
    await deletePhase(1, 3);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/DELETE FROM model_lifecycle_phases/);
    expect(String(sql)).toMatch(/organization_id = :organizationId/);
    expect(options.replacements).toEqual({ organizationId: 1, phaseId: 3 });
    expect(fileDeletes()).toHaveLength(0);
  });

  it("deletes only the item, scoped to the organization, and never a file", async () => {
    await deleteItem(1, 5);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/DELETE FROM model_lifecycle_items/);
    expect(String(sql)).toMatch(/organization_id = :organizationId/);
    expect(options.replacements).toEqual({ organizationId: 1, itemId: 5 });
    expect(fileDeletes()).toHaveLength(0);
  });
});

// The foreign key accepts any tenant's file, so attach must check ownership
// itself or one org could link (and then read the name of) another's file.
describe("attachFile", () => {
  beforeEach(() => mockQuery.mockReset());

  it("refuses a file outside the organization and writes nothing", async () => {
    mockQuery.mockResolvedValueOnce([{ count: "0" }]); // visibility COUNT: no row

    const link = await attachFile(1, 10, 20, 7, 99);

    expect(link).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/files\.organization_id = :organizationId/);
    expect(options.replacements).toMatchObject({ fileIds: [99], organizationId: 1 });
  });

  it("links a file the organization owns", async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: "1" }]) // visibility COUNT
      .mockResolvedValueOnce(undefined) // ensureValueRow INSERT
      .mockResolvedValueOnce([{ id: 55 }]) // ensureValueRow SELECT
      .mockResolvedValueOnce([[{ id: 3, value_id: 55, file_id: 99 }], 1]); // link INSERT

    const link = await attachFile(1, 10, 20, 7, 99);

    expect(link).toEqual({ id: 3, value_id: 55, file_id: 99 });
    expect(String(mockQuery.mock.calls[3][0])).toMatch(/INSERT INTO model_lifecycle_item_files/);
  });
});
