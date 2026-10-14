/**
 * Audit ledger retention -- delete rule and checkpoint table (real database).
 *
 * audit_ledger is append-only. The retention job may delete rows only inside
 * a transaction that (a) sets verifywise.ledger_retention = 'on', (b) wrote a
 * checkpoint for the organization in that same transaction, (c) deletes only
 * rows at or below the checkpoint's pruned_through_id AND older than its
 * cutoff, and (d) uses a cutoff at least 12 months old. The checkpoint table
 * itself is append-only (organization cascade excepted).
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import {
  GENESIS_HASH,
  appendToAuditLedger,
  computeEntryHash,
  verifyChain,
} from "../../utils/auditLedger.utils";
import { pruneAuditLedgerBatch } from "../../utils/auditLedgerRetention.utils";
import {
  countAuditRecordsBefore,
  getLatestRetentionRuns,
  getOrgsWithAuditRetention,
  pruneRetentionRunHistory,
  setAuditRetentionMonths,
} from "../../utils/dataRetention.utils";
import { runDataRetentionPrune } from "../../services/automations/actions/dataRetentionPrune";
import { createTestOrganization, cleanupDatabase } from "./helpers";

jest.setTimeout(60000);

const SENTINEL = "pending".padEnd(64, "0");

let orgId: number;

/**
 * Insert one correctly hashed ledger row with an explicit occurred_at:
 * `monthsAgo` months back, moved forward by `offsetSeconds` so rows seeded in
 * id order get increasing timestamps.
 */
async function insertLedgerRow(
  monthsAgo: number,
  description: string,
  prevHash: string,
  offsetSeconds = 0,
): Promise<{ id: number; hash: string }> {
  const [rows] = (await sequelize.query(
    `INSERT INTO audit_ledger
         (organization_id, entry_type, user_id, occurred_at, event_type, description, entry_hash, prev_hash)
       VALUES (:orgId, 'event_log', NULL,
               now() - make_interval(months => :monthsAgo) + make_interval(secs => :offsetSeconds),
               'Create', :description, :sentinel, :prevHash)
       RETURNING id, occurred_at`,
    {
      replacements: { orgId, monthsAgo, offsetSeconds, description, sentinel: SENTINEL, prevHash },
      type: QueryTypes.INSERT,
    },
  )) as unknown as [{ id: number; occurred_at: Date }[], number];
  const { id, occurred_at } = rows[0];
  const hash = computeEntryHash({
    id,
    entry_type: "event_log",
    user_id: null,
    occurred_at: occurred_at.toISOString(),
    event_type: "Create",
    entity_type: null,
    entity_id: null,
    action: null,
    field_name: null,
    old_value: null,
    new_value: null,
    description,
    prev_hash: prevHash,
  });
  await sequelize.query(`UPDATE audit_ledger SET entry_hash = :hash WHERE id = :id`, {
    replacements: { hash, id },
  });
  return { id: Number(id), hash };
}

describe("audit ledger retention delete rule", () => {
  let ids: number[];

  async function insertCheckpoint(
    throughId: number,
    cutoffMonthsAgo: number,
    transaction?: Transaction,
  ): Promise<void> {
    await sequelize.query(
      `INSERT INTO audit_ledger_retention_checkpoints
         (organization_id, pruned_through_id, anchor_hash, cutoff, rows_deleted)
       VALUES (:orgId, :throughId, :hash, now() - make_interval(months => :cutoffMonthsAgo), 2)`,
      {
        replacements: { orgId, throughId, cutoffMonthsAgo, hash: "a".repeat(64) },
        transaction,
      },
    );
  }

  async function flagOn(transaction: Transaction): Promise<void> {
    await sequelize.query(`SELECT set_config('verifywise.ledger_retention', 'on', true)`, {
      transaction,
    });
  }

  function deleteIdsInOwnTransaction(
    idsToDelete: number[],
    opts: { checkpoint?: { throughId: number; cutoffMonthsAgo: number }; flag?: boolean },
  ): Promise<unknown> {
    return sequelize.transaction(async (transaction) => {
      if (opts.checkpoint) {
        await insertCheckpoint(
          opts.checkpoint.throughId,
          opts.checkpoint.cutoffMonthsAgo,
          transaction,
        );
      }
      if (opts.flag !== false) await flagOn(transaction);
      await sequelize.query(`DELETE FROM audit_ledger WHERE id IN (:idsToDelete)`, {
        replacements: { idsToDelete },
        transaction,
      });
    });
  }

  async function remainingIds(): Promise<number[]> {
    const rows = await sequelize.query<{ id: string }>(
      `SELECT id FROM audit_ledger WHERE organization_id = :orgId ORDER BY id`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    return rows.map((r) => Number(r.id));
  }

  beforeEach(async () => {
    orgId = await createTestOrganization();
    // Five rows: the first four are 14 months old, the last is current.
    ids = [];
    let prev = GENESIS_HASH;
    for (let i = 1; i <= 5; i++) {
      const { id, hash } = await insertLedgerRow(i <= 4 ? 14 : 0, `entry ${i}`, prev);
      ids.push(id);
      prev = hash;
    }
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("rejects a plain delete", async () => {
    await expect(
      sequelize.query(`DELETE FROM audit_ledger WHERE id = :id`, {
        replacements: { id: ids[0] },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects a flagged delete when no checkpoint exists", async () => {
    await expect(deleteIdsInOwnTransaction([ids[0]], {})).rejects.toThrow(/append-only/);
  });

  it("rejects a same-transaction checkpointed delete when the flag is off", async () => {
    await expect(
      deleteIdsInOwnTransaction([ids[0]], {
        checkpoint: { throughId: ids[1], cutoffMonthsAgo: 13 },
        flag: false,
      }),
    ).rejects.toThrow(/append-only/);
  });

  it("deletes old rows covered by a same-transaction checkpoint and rejects the first uncovered one", async () => {
    await deleteIdsInOwnTransaction([ids[0], ids[1]], {
      checkpoint: { throughId: ids[1], cutoffMonthsAgo: 13 },
    });
    expect(await remainingIds()).toEqual(ids.slice(2));

    await expect(
      deleteIdsInOwnTransaction([ids[2]], {
        checkpoint: { throughId: ids[1], cutoffMonthsAgo: 13 },
      }),
    ).rejects.toThrow(/append-only/);
    expect(await remainingIds()).toEqual(ids.slice(2));
  });

  it("does not let a checkpoint committed in an earlier transaction authorize a delete", async () => {
    await insertCheckpoint(ids[1], 13);
    await expect(deleteIdsInOwnTransaction([ids[0]], {})).rejects.toThrow(/append-only/);
    expect(await remainingIds()).toEqual(ids);
  });

  it("rejects a checkpoint whose cutoff is newer than 12 months", async () => {
    await expect(
      deleteIdsInOwnTransaction([ids[0]], {
        checkpoint: { throughId: ids[1], cutoffMonthsAgo: 6 },
      }),
    ).rejects.toThrow(/append-only/);
    expect(await remainingIds()).toEqual(ids);
  });

  it("rejects a row newer than the cutoff even when its id is covered", async () => {
    // ids[4] is current: id <= pruned_through_id, but occurred_at >= cutoff.
    await expect(
      deleteIdsInOwnTransaction([ids[4]], {
        checkpoint: { throughId: ids[4], cutoffMonthsAgo: 13 },
      }),
    ).rejects.toThrow(/append-only/);
    expect(await remainingIds()).toEqual(ids);
  });

  it("keeps the checkpoint table append-only", async () => {
    await insertCheckpoint(ids[1], 13);
    await expect(
      sequelize.query(
        `UPDATE audit_ledger_retention_checkpoints SET rows_deleted = 9 WHERE organization_id = :orgId`,
        { replacements: { orgId } },
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      sequelize.query(
        `DELETE FROM audit_ledger_retention_checkpoints WHERE organization_id = :orgId`,
        { replacements: { orgId } },
      ),
    ).rejects.toThrow(/append-only/);
  });

  it("cascades both tables when the organization is deleted", async () => {
    await insertCheckpoint(ids[1], 13);
    await sequelize.query(
      `INSERT INTO data_retention_settings (organization_id, audit_retention_months) VALUES (:orgId, 12)`,
      { replacements: { orgId } },
    );
    await sequelize.query(`DELETE FROM organizations WHERE id = :orgId`, {
      replacements: { orgId },
    });
    const countOf = async (table: string): Promise<number> => {
      const [row] = await sequelize.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM ${table} WHERE organization_id = :orgId`,
        { replacements: { orgId }, type: QueryTypes.SELECT },
      );
      return Number(row.n);
    };
    expect(await countOf("audit_ledger")).toBe(0);
    expect(await countOf("audit_ledger_retention_checkpoints")).toBe(0);
    expect(await countOf("data_retention_settings")).toBe(0);
  });
});

describe("audit ledger prune and checkpoint-aware verification", () => {
  /** Exactly 12 months ago, as text, so the delete rule accepts it as a cutoff. */
  async function twelveMonthCutoff(): Promise<string> {
    const [row] = await sequelize.query<{ c: string }>(
      `SELECT (now() - interval '12 months')::text AS c`,
      { type: QueryTypes.SELECT },
    );
    return row.c;
  }

  /** Seed `count` rows 14 months back, increasing occurred_at; returns ids and the last hash. */
  async function seedOld(count: number): Promise<{ ids: number[]; lastHash: string }> {
    const seeded: number[] = [];
    let prev = GENESIS_HASH;
    for (let i = 1; i <= count; i++) {
      const { id, hash } = await insertLedgerRow(14, `old ${i}`, prev, i);
      seeded.push(id);
      prev = hash;
    }
    return { ids: seeded, lastHash: prev };
  }

  async function appendCurrent(count: number): Promise<void> {
    for (let i = 1; i <= count; i++) {
      await appendToAuditLedger({
        organizationId: orgId,
        entryType: "event_log",
        userId: null,
        eventType: "Create",
        description: `current ${i}`,
      });
    }
  }

  async function pruneUntilDone(cutoff: string, batchSize: number): Promise<number[]> {
    const batches: number[] = [];
    for (;;) {
      const deleted = await pruneAuditLedgerBatch(orgId, cutoff, batchSize);
      batches.push(deleted);
      if (deleted < batchSize) return batches;
    }
  }

  async function count(table: string): Promise<number> {
    const [row] = await sequelize.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    return Number(row.n);
  }

  async function remainingIds(): Promise<number[]> {
    const rows = await sequelize.query<{ id: string }>(
      `SELECT id FROM audit_ledger WHERE organization_id = :orgId ORDER BY id`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    return rows.map((r) => Number(r.id));
  }

  beforeEach(async () => {
    orgId = await createTestOrganization();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("prunes the old prefix in batches, checkpointing each, and the chain stays intact", async () => {
    const old = await seedOld(20);
    await appendCurrent(10);
    expect(await verifyChain(orgId)).toMatchObject({ status: "intact", totalEntries: 30 });

    const cutoff = await twelveMonthCutoff();
    const batches = await pruneUntilDone(cutoff, 7);
    expect(batches).toEqual([7, 7, 6]);
    expect(await count("audit_ledger_retention_checkpoints")).toBe(3);
    expect(await count("audit_ledger")).toBe(10);

    const verified = await verifyChain(orgId);
    expect(verified.status).toBe("intact");
    expect(verified.totalEntries).toBe(10);
    expect(verified.prunedThrough?.id).toBe(old.ids[19]);

    await appendCurrent(2);
    expect(await verifyChain(orgId)).toMatchObject({ status: "intact", totalEntries: 12 });
  });

  it("keeps the newest row when every row is old, and a following append still verifies", async () => {
    const old = await seedOld(6);
    const cutoff = await twelveMonthCutoff();

    expect(await pruneAuditLedgerBatch(orgId, cutoff, 100)).toBe(5);
    expect(await remainingIds()).toEqual([old.ids[5]]);
    expect(await pruneAuditLedgerBatch(orgId, cutoff, 100)).toBe(0);
    expect(await verifyChain(orgId)).toMatchObject({
      status: "intact",
      totalEntries: 1,
      prunedThrough: { id: old.ids[4] },
    });

    await appendCurrent(1);
    expect(await verifyChain(orgId)).toMatchObject({ status: "intact", totalEntries: 2 });
  });

  it("stops before a newer row that sits between older ones", async () => {
    // old, old, NEW, old, old: ids increase but occurred_at does not.
    const a = await insertLedgerRow(14, "a", GENESIS_HASH, 1);
    const b = await insertLedgerRow(14, "b", a.hash, 2);
    const newer = await insertLedgerRow(0, "newer", b.hash);
    const c = await insertLedgerRow(14, "c", newer.hash, 3);
    const d = await insertLedgerRow(14, "d", c.hash, 4);

    const cutoff = await twelveMonthCutoff();
    expect(await pruneAuditLedgerBatch(orgId, cutoff, 100)).toBe(2);
    expect(await remainingIds()).toEqual([newer.id, c.id, d.id]);
    expect(await verifyChain(orgId)).toMatchObject({
      status: "intact",
      totalEntries: 3,
      prunedThrough: { id: b.id },
    });
    // Nothing more can go: the next row is inside the retention period.
    expect(await pruneAuditLedgerBatch(orgId, cutoff, 100)).toBe(0);
  });

  it("stays intact when a prune commits while the walk is between pages", async () => {
    await seedOld(20);
    await appendCurrent(10);
    const cutoff = await twelveMonthCutoff();

    // After the first page of the walk is read, run a full prune on another
    // connection and wait for it to commit. The walk must keep its snapshot.
    const realQuery = sequelize.query.bind(sequelize) as (...args: any[]) => Promise<unknown>;
    let pruned = false;
    const spy = jest.spyOn(sequelize, "query").mockImplementation((async (...args: any[]) => {
      const result = await realQuery(...args);
      if (!pruned && typeof args[0] === "string" && args[0].includes("id > :afterId")) {
        pruned = true;
        await pruneUntilDone(cutoff, 100);
      }
      return result;
    }) as any);

    let overlapped;
    try {
      overlapped = await verifyChain(orgId, { batchSize: 5 });
    } finally {
      spy.mockRestore();
    }

    expect(pruned).toBe(true);
    expect(await count("audit_ledger")).toBe(10);
    expect(overlapped).toMatchObject({ status: "intact", totalEntries: 30 });
    // A fresh verify now sees the checkpoint and is intact from the anchor.
    expect(await verifyChain(orgId, { batchSize: 5 })).toMatchObject({
      status: "intact",
      totalEntries: 10,
    });
  });

  it("reports a tampered first remaining row as compromised", async () => {
    const old = await seedOld(10);
    await appendCurrent(2);
    await pruneUntilDone(await twelveMonthCutoff(), 100);
    expect((await verifyChain(orgId)).status).toBe("intact");

    // The append-only guard blocks UPDATE; lift it just for the tamper.
    await sequelize.query(`ALTER TABLE audit_ledger DISABLE TRIGGER trg_audit_ledger_guard_update`);
    try {
      await sequelize.query(
        `UPDATE audit_ledger SET description = 'tampered'
          WHERE id = (SELECT MIN(id) FROM audit_ledger WHERE organization_id = :orgId)`,
        { replacements: { orgId } },
      );
    } finally {
      await sequelize.query(
        `ALTER TABLE audit_ledger ENABLE TRIGGER trg_audit_ledger_guard_update`,
      );
    }

    const result = await verifyChain(orgId);
    expect(result.status).toBe("compromised");
    expect(Number(result.brokenAtId)).toBe((await remainingIds())[0]);
    expect(result.prunedThrough?.id).toBe(old.ids[9]);
  });

  it("reports a forged checkpoint that hides a deletion from the middle as compromised", async () => {
    // A forged checkpoint covers the first three rows and anchors on the third
    // row's real hash, so the walk after it would link up; only the middle row
    // is deleted, leaving rows at or below pruned_through_id.
    const a = await insertLedgerRow(14, "a", GENESIS_HASH, 1);
    const b = await insertLedgerRow(14, "b", a.hash, 2);
    const c = await insertLedgerRow(14, "c", b.hash, 3);
    await insertLedgerRow(14, "d", c.hash, 4);
    await appendCurrent(1);

    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `INSERT INTO audit_ledger_retention_checkpoints
           (organization_id, pruned_through_id, anchor_hash, cutoff, rows_deleted)
         VALUES (:orgId, :throughId, :anchor, now() - interval '13 months', 1)`,
        { replacements: { orgId, throughId: c.id, anchor: c.hash }, transaction },
      );
      await sequelize.query(`SELECT set_config('verifywise.ledger_retention', 'on', true)`, {
        transaction,
      });
      await sequelize.query(`DELETE FROM audit_ledger WHERE id = :id`, {
        replacements: { id: b.id },
        transaction,
      });
    });
    const left = await remainingIds();
    expect(left).toContain(a.id);
    expect(left).toContain(c.id);
    expect(left).not.toContain(b.id);

    const result = await verifyChain(orgId);
    expect(result.status).toBe("compromised");
    expect(Number(result.brokenAtId)).toBe(a.id);
    expect(result.prunedThrough?.id).toBe(c.id);
  });

  it("reports a tampered checkpoint anchor as compromised", async () => {
    const old = await seedOld(6);
    await appendCurrent(2);
    await pruneUntilDone(await twelveMonthCutoff(), 100);
    expect((await verifyChain(orgId)).status).toBe("intact");

    // A later checkpoint for the same prefix with a wrong anchor becomes the
    // latest one, so the first remaining row no longer links to it.
    await sequelize.query(
      `INSERT INTO audit_ledger_retention_checkpoints
         (organization_id, pruned_through_id, anchor_hash, cutoff, rows_deleted)
       VALUES (:orgId, :throughId, :anchor, now() - interval '13 months', 0)`,
      { replacements: { orgId, throughId: old.ids[5], anchor: "f".repeat(64) } },
    );

    const result = await verifyChain(orgId);
    expect(result.status).toBe("compromised");
    expect(Number(result.brokenAtId)).toBe((await remainingIds())[0]);
    expect(result.expectedHash).toBe("f".repeat(64));
  });

  it("runs the daily job end to end: counts, prunes, self-audits and records the run", async () => {
    await seedOld(10);
    await appendCurrent(2);

    // No period set yet: nothing happens and nothing is recorded.
    expect(await runDataRetentionPrune(orgId)).toBeNull();
    expect(await count("audit_ledger")).toBe(12);

    await setAuditRetentionMonths(orgId, 12, null);
    expect(await countAuditRecordsBefore(orgId, 12)).toBe(10);

    const summary = await runDataRetentionPrune(orgId);
    expect(summary).toMatchObject({ deleted: 10, capped: false });

    // Two current rows remain, plus the self-audit entry the job appended.
    expect(await count("audit_ledger")).toBe(3);
    const [selfAudit] = await sequelize.query<{ description: string }>(
      `SELECT description FROM audit_ledger WHERE organization_id = :orgId ORDER BY id DESC LIMIT 1`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    expect(selfAudit.description).toMatch(
      /^Retention removed 10 audit records before \d{4}-\d{2}-\d{2}$/,
    );

    const runs = await getLatestRetentionRuns(orgId);
    expect(runs.audit_records).toMatchObject({ deleted_count: 10, status: "success" });
    expect(await countAuditRecordsBefore(orgId, 12)).toBe(0);
    expect((await verifyChain(orgId)).status).toBe("intact");
  });
});

describe("retention run history and daily job reads", () => {
  beforeEach(async () => {
    orgId = await createTestOrganization();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  async function insertRun(recordType: string, monthsAgo: number, org = orgId): Promise<number> {
    const [rows] = (await sequelize.query(
      `INSERT INTO data_retention_runs (organization_id, record_type, ran_at, deleted_count, status)
       VALUES (:org, :recordType, now() - make_interval(months => :monthsAgo), 0, 'success')
       RETURNING id`,
      { replacements: { org, recordType, monthsAgo }, type: QueryTypes.INSERT },
    )) as unknown as [{ id: string }[], number];
    return Number(rows[0].id);
  }

  async function runIds(org = orgId): Promise<number[]> {
    const rows = await sequelize.query<{ id: string }>(
      `SELECT id FROM data_retention_runs WHERE organization_id = :org ORDER BY id`,
      { replacements: { org }, type: QueryTypes.SELECT },
    );
    return rows.map((r) => Number(r.id));
  }

  it("deletes runs older than 13 months but keeps each type's latest run", async () => {
    await insertRun("audit_records", 20);
    await insertRun("audit_records", 15);
    const latestOldAudit = await insertRun("audit_records", 14);
    await insertRun("mrm_metrics", 20);
    const currentMrm = await insertRun("mrm_metrics", 0);
    const recentShadow = await insertRun("shadow_ai_events", 2);
    // A second org whose runs are all its own latest per type (or recent).
    // Its 20-month-old audit run is older than the first org's latest audit
    // run, so it survives only if "latest per type" is worked out per org.
    const otherOrg = await createTestOrganization(`Other org ${Date.now()}`);
    const otherRuns = [
      await insertRun("audit_records", 20, otherOrg),
      await insertRun("mrm_metrics", 1, otherOrg),
    ];

    const removed = await pruneRetentionRunHistory();

    expect(removed).toBe(3);
    // The 14-month-old audit run stays: it is the only last run that type has.
    expect(await runIds()).toEqual(
      [latestOldAudit, currentMrm, recentShadow].sort((a, b) => a - b),
    );
    expect(await runIds(otherOrg)).toEqual(otherRuns);
    expect(await pruneRetentionRunHistory()).toBe(0);
  });

  it("reads every org with an audit period in one query", async () => {
    expect((await getOrgsWithAuditRetention()).some((o) => o.organizationId === orgId)).toBe(false);
    await setAuditRetentionMonths(orgId, 36, null);
    expect(await getOrgsWithAuditRetention()).toContainEqual({ organizationId: orgId, months: 36 });
    await setAuditRetentionMonths(orgId, null, null);
    expect((await getOrgsWithAuditRetention()).some((o) => o.organizationId === orgId)).toBe(false);
  });

  it("indexes model_lifecycle_change_history by org and created_at", async () => {
    // Idempotent; re-running proves the amended migration applies cleanly.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const migration = require("../../database/migrations/20261011150200-retention-timestamp-indexes.js");
    await migration.up(sequelize.getQueryInterface());
    const [index] = await sequelize.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'verifywise'
          AND indexname = 'idx_model_lifecycle_change_history_org_created_at'`,
      { type: QueryTypes.SELECT },
    );
    expect(index?.indexdef).toMatch(/\(organization_id, created_at\)/);
  });
});
