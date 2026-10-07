import { recordEntityChange, recordEntityFieldChangeBulk } from "../changeHistory.base.utils";
import { sequelize } from "../../database/db";
import { appendToAuditLedger } from "../auditLedger.utils";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../auditLedger.utils", () => ({
  appendToAuditLedger: jest.fn(),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockQuery = sequelize.query as jest.Mock;
const mockAppend = appendToAuditLedger as jest.Mock;

/** A transaction double that collects afterCommit hooks so a test can fire them. */
const makeTransaction = () => {
  const hooks: Array<() => void> = [];
  return {
    hooks,
    afterCommit: jest.fn((hook: () => void) => hooks.push(hook)),
  };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([[], 0]);
  mockAppend.mockResolvedValue(undefined);
});

describe("recordEntityChange audit ledger timing", () => {
  it("appends to the ledger immediately when no transaction is passed", async () => {
    await recordEntityChange("risk", 10, "updated", 3, 1, "Mitigation status", "a", "b");
    expect(mockAppend).toHaveBeenCalledTimes(1);
  });

  it("defers the ledger append until the transaction commits", async () => {
    const tx = makeTransaction();
    await recordEntityChange("risk", 10, "updated", 3, 1, "Mitigation status", "a", "b", tx as any);

    // Nothing written to the append-only ledger yet: a rollback must leave no entry.
    expect(mockAppend).not.toHaveBeenCalled();
    expect(tx.afterCommit).toHaveBeenCalledTimes(1);

    tx.hooks.forEach((hook) => hook());
    expect(mockAppend).toHaveBeenCalledTimes(1);
    expect(mockAppend.mock.calls[0][0]).toMatchObject({
      organizationId: 1,
      entityType: "risk",
      entityId: 10,
      userId: 3,
    });
  });
});

describe("recordEntityFieldChangeBulk", () => {
  it("writes every row in one INSERT inside the transaction, with a null actor", async () => {
    const tx = makeTransaction();
    await recordEntityFieldChangeBulk(
      "risk",
      [10, 11, 12],
      1,
      "Mitigation status",
      "Completed",
      "Requires review",
      tx as any,
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("unnest(ARRAY[:entity_ids]::int[])");
    expect(sql).toContain("NULL, true, NOW()");
    expect(sql).toContain("changed_by_system");
    expect(opts.transaction).toBe(tx);
    expect(opts.replacements).toMatchObject({
      organization_id: 1,
      entity_ids: [10, 11, 12],
      old_value: "Completed",
      new_value: "Requires review",
    });
  });

  it("appends ledger entries only after commit, one at a time", async () => {
    const tx = makeTransaction();
    let inFlight = 0;
    let maxInFlight = 0;
    mockAppend.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await flush();
      inFlight--;
    });

    await recordEntityFieldChangeBulk(
      "risk",
      [10, 11, 12],
      1,
      "Mitigation status",
      "Completed",
      "Requires review",
      tx as any,
    );
    expect(mockAppend).not.toHaveBeenCalled();

    tx.hooks.forEach((hook) => hook());
    for (let i = 0; i < 6; i++) await flush();

    expect(mockAppend).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
    expect(mockAppend.mock.calls.map(([entry]) => entry.entityId)).toEqual([10, 11, 12]);
    expect(mockAppend.mock.calls.every(([entry]) => entry.userId === null)).toBe(true);
  });

  it("does nothing for an empty id list", async () => {
    const tx = makeTransaction();
    await recordEntityFieldChangeBulk("risk", [], 1, "f", "a", "b", tx as any);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(tx.afterCommit).not.toHaveBeenCalled();
  });
});
