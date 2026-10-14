import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../featureSettings.utils", () => ({
  getFeatureSettingsQuery: jest.fn(),
}));

import { sequelize } from "../../database/db";
import { GENESIS_HASH, computeEntryHash, verifyChain } from "../auditLedger.utils";
import { getLatestLedgerCheckpoint, pruneAuditLedgerBatch } from "../auditLedgerRetention.utils";

const query = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const transaction = sequelize.transaction as unknown as jest.Mock<(...args: any[]) => Promise<any>>;

const CUTOFF = "2025-01-01T00:00:00.000Z";
const ANCHOR = "b".repeat(64);

/** Answer each query by a fragment of its SQL; unmatched statements return []. */
function answer(rules: Array<[string, any]>) {
  query.mockImplementation(async (sql: string) => {
    const hit = rules.find(([fragment]) => sql.includes(fragment));
    return hit ? hit[1] : [];
  });
}

const sqls = () => query.mock.calls.map((c) => c[0] as string);
const indexOfSql = (fragment: string) => sqls().findIndex((s) => s.includes(fragment));

describe("pruneAuditLedgerBatch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation(async (cb: any) => cb({ id: "txn" }));
  });

  it("deletes nothing and writes no checkpoint when the org has no rows", async () => {
    answer([["AS bound", [{ bound: null }]]]);
    expect(await pruneAuditLedgerBatch(7, CUTOFF, 10)).toBe(0);
    expect(indexOfSql("INSERT INTO audit_ledger_retention_checkpoints")).toBe(-1);
    expect(indexOfSql("DELETE FROM audit_ledger")).toBe(-1);
  });

  it("deletes nothing when no row lies below the bound", async () => {
    answer([
      ["AS bound", [{ bound: 5 }]],
      ["entry_hash", []],
    ]);
    expect(await pruneAuditLedgerBatch(7, CUTOFF, 10)).toBe(0);
    expect(indexOfSql("INSERT INTO audit_ledger_retention_checkpoints")).toBe(-1);
    expect(indexOfSql("DELETE FROM audit_ledger")).toBe(-1);
  });

  it("locks, scopes the org, checkpoints before deleting, and bounds the delete by L", async () => {
    answer([
      ["AS bound", [{ bound: 31 }]],
      ["entry_hash", [{ id: 7, entry_hash: `${ANCHOR}  `, n: 7 }]],
    ]);
    expect(await pruneAuditLedgerBatch(3, CUTOFF, 7)).toBe(7);

    const lock = indexOfSql("pg_advisory_xact_lock");
    const org = indexOfSql("app.current_org");
    const checkpoint = indexOfSql("INSERT INTO audit_ledger_retention_checkpoints");
    const flag = indexOfSql("verifywise.ledger_retention");
    const del = indexOfSql("DELETE FROM audit_ledger");
    expect(org).toBe(0);
    expect(lock).toBeGreaterThan(org);
    expect(checkpoint).toBeGreaterThan(lock);
    expect(flag).toBeGreaterThan(checkpoint);
    expect(del).toBeGreaterThan(flag);

    const lockOpts = query.mock.calls[lock][1] as any;
    expect(lockOpts.replacements).toEqual({ ns: 9001, organizationId: 3 });
    const cpOpts = query.mock.calls[checkpoint][1] as any;
    expect(cpOpts.replacements).toEqual({
      organizationId: 3,
      id: 7,
      hash: ANCHOR,
      cutoff: CUTOFF,
      n: 7,
    });
    const delOpts = query.mock.calls[del][1] as any;
    expect(sqls()[del]).toContain("id <= :id");
    expect(delOpts.replacements).toEqual({ organizationId: 3, id: 7 });
    // Every statement runs inside the one transaction.
    for (const call of query.mock.calls)
      expect((call[1] as any).transaction).toEqual({ id: "txn" });
  });

  it("only takes rows below the first in-retention row (a newer row stops the prune)", async () => {
    answer([["AS bound", [{ bound: 40 }]]]);
    await pruneAuditLedgerBatch(3, CUTOFF, 10);
    const boundSql = sqls()[indexOfSql("AS bound")];
    // MIN(id) over rows inside the retention period: no row with a smaller id
    // can be inside it, so every row the batch takes is older than the cutoff.
    expect(boundSql).toContain("MIN(id)");
    expect(boundSql).toContain("occurred_at >= :cutoff");
    const batchSql = sqls()[indexOfSql("entry_hash")];
    expect(batchSql).toContain("id < :bound");
    expect(batchSql).toContain("LIMIT :batchSize");
  });

  it("keeps the newest row when every row is old (bound falls back to MAX(id))", async () => {
    answer([["AS bound", [{ bound: 12 }]]]);
    await pruneAuditLedgerBatch(3, CUTOFF, 10);
    expect(sqls()[indexOfSql("AS bound")]).toContain("MAX(id)");
    expect(sqls()[indexOfSql("entry_hash")]).toContain("id < :bound");
  });
});

describe("getLatestLedgerCheckpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null without a checkpoint", async () => {
    answer([]);
    expect(await getLatestLedgerCheckpoint(7)).toBeNull();
  });

  it("returns the highest checkpoint with a trimmed anchor and ISO cutoff", async () => {
    answer([
      [
        "audit_ledger_retention_checkpoints",
        [{ pruned_through_id: "20", anchor_hash: `${ANCHOR} `, cutoff: new Date(CUTOFF) }],
      ],
    ]);
    expect(await getLatestLedgerCheckpoint(7)).toEqual({
      pruned_through_id: 20,
      anchor_hash: ANCHOR,
      cutoff: CUTOFF,
    });
    expect(sqls()[0]).toContain("ORDER BY pruned_through_id DESC");
  });
});

describe("verifyChain with checkpoints", () => {
  const occurredAt = new Date("2025-06-01T00:00:00.000Z");

  function ledgerRow(id: number, prevHash: string, description = "x") {
    const payload = {
      id,
      entry_type: "event_log",
      user_id: null,
      occurred_at: occurredAt.toISOString(),
      event_type: "Create",
      entity_type: null,
      entity_id: null,
      action: null,
      field_name: null,
      old_value: null,
      new_value: null,
      description,
      prev_hash: prevHash,
    };
    return { ...payload, occurred_at: occurredAt, entry_hash: computeEntryHash(payload) };
  }

  const checkpointRow = {
    pruned_through_id: 20,
    anchor_hash: ANCHOR,
    cutoff: new Date(CUTOFF),
  };

  /** checkpoint lookup, leftover-row check, then the walk (first page rows, then empty). */
  function mockWalk(checkpoint: any[], rows: any[], leftoverId: number | null = null) {
    let walked = false;
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("audit_ledger_retention_checkpoints")) return checkpoint;
      if (sql.includes("MIN(id)")) return [{ id: leftoverId }];
      if (sql.includes("FROM audit_ledger\n")) {
        if (walked) return [];
        walked = true;
        return rows;
      }
      return [];
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation(async (_opts: any, cb: any) => cb({ id: "txn" }));
  });

  it("starts at the anchor and walks only rows after the checkpoint", async () => {
    const first = ledgerRow(21, ANCHOR);
    const second = ledgerRow(22, first.entry_hash);
    mockWalk([checkpointRow], [first, second]);

    const result = await verifyChain(7);
    expect(result).toEqual({
      status: "intact",
      totalEntries: 2,
      prunedThrough: { id: 20, cutoff: CUTOFF },
    });
    const walkCall = query.mock.calls.find((c) =>
      (c[0] as string).includes("FROM audit_ledger\n"),
    )!;
    expect(walkCall[0]).toContain("id > :afterId");
    expect(walkCall[0]).not.toContain("OFFSET");
    expect((walkCall[1] as any).replacements.afterId).toBe(20);
  });

  it("reports compromised at the first row that does not link to the anchor", async () => {
    const first = ledgerRow(21, GENESIS_HASH);
    mockWalk([checkpointRow], [first]);

    const result = await verifyChain(7);
    expect(result.status).toBe("compromised");
    expect(result.brokenAtId).toBe(21);
    expect(result.expectedHash).toBe(ANCHOR);
    expect(result.prunedThrough).toEqual({ id: 20, cutoff: CUTOFF });
  });

  it("reports compromised when a row at or below the checkpoint remains", async () => {
    // A legitimate prune deletes every id <= pruned_through_id; a leftover row
    // means a forged checkpoint hid a deletion from the middle.
    const first = ledgerRow(21, ANCHOR);
    mockWalk([checkpointRow], [first], 3);

    const result = await verifyChain(7);
    expect(result).toEqual({
      status: "compromised",
      totalEntries: 0,
      brokenAtId: 3,
      prunedThrough: { id: 20, cutoff: CUTOFF },
    });
    const check = query.mock.calls.find((c) => (c[0] as string).includes("MIN(id)"))!;
    expect(check[0]).toContain("id <= :prunedThroughId");
    expect((check[1] as any).replacements).toEqual({ organizationId: 7, prunedThroughId: 20 });
  });

  it("returns prunedThrough on empty chains too", async () => {
    mockWalk([checkpointRow], []);
    const result = await verifyChain(7);
    expect(result.status).toBe("empty");
    expect(result.prunedThrough).toEqual({ id: 20, cutoff: CUTOFF });
  });

  it("runs in one read-only repeatable-read transaction without the advisory lock", async () => {
    mockWalk([checkpointRow], []);
    await verifyChain(7);
    const opts = transaction.mock.calls[0][0] as any;
    expect(opts.isolationLevel).toBe("REPEATABLE READ");
    expect(opts.readOnly).toBe(true);
    expect(sqls().some((q) => q.includes("pg_advisory"))).toBe(false);
    for (const call of query.mock.calls)
      expect((call[1] as any).transaction).toEqual({ id: "txn" });
  });

  it("pages by keyset: each page starts after the previous page's last id", async () => {
    const first = ledgerRow(21, ANCHOR);
    const second = ledgerRow(22, first.entry_hash);
    const third = ledgerRow(23, second.entry_hash);
    const pages = [[first, second], [third], []];
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("audit_ledger_retention_checkpoints")) return [checkpointRow];
      if (sql.includes("MIN(id)")) return [{ id: null }];
      return pages.shift() ?? [];
    });

    const result = await verifyChain(7, { batchSize: 2 });
    expect(result.status).toBe("intact");
    expect(result.totalEntries).toBe(3);
    const walks = query.mock.calls.filter((c) => (c[0] as string).includes("FROM audit_ledger\n"));
    expect(walks.map((c) => (c[1] as any).replacements.afterId)).toEqual([20, 22, 23]);
  });

  it("is unchanged without a checkpoint: genesis start, no prunedThrough", async () => {
    const first = ledgerRow(1, GENESIS_HASH);
    mockWalk([], [first]);

    const result = await verifyChain(7);
    expect(result).toEqual({ status: "intact", totalEntries: 1 });
    const walkCall = query.mock.calls.find((c) =>
      (c[0] as string).includes("FROM audit_ledger\n"),
    )!;
    expect((walkCall[1] as any).replacements.afterId).toBe(0);
  });
});
