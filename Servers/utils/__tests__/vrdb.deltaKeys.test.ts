/**
 * The apply of one day of a list read by its changes (the CVE records), with the database mocked:
 * which match keys a stored record is written with when its change comes without keys. A rejected
 * CVE names no product, so the copy keeps the keys it was matched by and the rejection reaches the
 * findings that cite it; an active CVE that names no vendor any more (a CNA corrected the affected
 * vendor to "n/a") no longer matches the vendor it used to name. tests/integration/vrdb.sync.test.ts
 * runs the statements on a real database.
 */
jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import type { Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import type { ParsedRecord } from "../../services/vendorResearch/vrdb/types";
import { applyVrdbDeltaQuery } from "../vrdb.utils";

const query = sequelize.query as unknown as jest.Mock;
const TRANSACTION = {} as Transaction;
const AT = new Date("2026-11-02T02:29:00Z");

const cveRecord = (overrides: Partial<ParsedRecord> = {}): ParsedRecord => ({
  sourceRecordId: "CVE-2026-0001",
  recordType: "vulnerability",
  title: "CVE-2026-0001: a flaw",
  summary: "CVE: CVE-2026-0001.",
  url: "https://www.cve.org/CVERecord?id=CVE-2026-0001",
  identifiers: { cveID: "CVE-2026-0001" },
  matchKeys: [],
  publishedAt: "2026-10-01",
  sourceUpdatedAt: null,
  ...overrides,
});

/** The keys the apply wrote for the record, given the copy that holds it with `stored` keys. */
async function keysWritten(record: ParsedRecord, stored: string[]): Promise<string[]> {
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM vrdb_sources WHERE id = :sourceId FOR UPDATE")) {
      return [{ id: "cve" }];
    }
    if (sql.includes("SELECT source_record_id, content_hash, status, match_keys")) {
      return [
        {
          source_record_id: record.sourceRecordId,
          content_hash: "a".repeat(64),
          status: "active",
          match_keys: stored,
        },
      ];
    }
    return [];
  });

  await applyVrdbDeltaQuery(
    {
      sourceId: "cve",
      records: [record],
      cursor: { day: "2026-11-01" },
      rawSnapshotHash: "h",
      at: AT,
    },
    TRANSACTION,
  );

  const insert = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO vrdb_records"));
  if (insert === undefined) throw new Error("nothing was written");
  const payload = JSON.parse(
    (insert[1] as { replacements: { payload: string } }).replacements.payload,
  );
  return payload[0].match_keys;
}

describe("applyVrdbDeltaQuery: the keys of a change that comes without keys", () => {
  it("keeps the stored keys of a record that was rejected", async () => {
    const rejected = cveRecord({ status: "rejected", title: "CVE-2026-0001: rejected" });
    expect(await keysWritten(rejected, ["cve:acmeanalytics"])).toEqual(["cve:acmeanalytics"]);
  });

  it("drops the stored keys of an active record that names no vendor any more", async () => {
    const corrected = cveRecord({
      status: "active",
      summary: "CVE: CVE-2026-0001. Affected: n/a.",
    });
    expect(await keysWritten(corrected, ["cve:acmeanalytics"])).toEqual([]);
  });

  it("drops them too for a record that gives no status, which is active", async () => {
    expect(await keysWritten(cveRecord({ summary: "A new text." }), ["cve:acmeanalytics"])).toEqual(
      [],
    );
  });

  it("writes the keys a record gives, whatever was stored", async () => {
    const named = cveRecord({ matchKeys: ["cve:exampleltd"] });
    expect(await keysWritten(named, ["cve:acmeanalytics"])).toEqual(["cve:exampleltd"]);
  });
});
