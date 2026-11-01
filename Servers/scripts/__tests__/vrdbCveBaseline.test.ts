/**
 * The loader of a baseline file of the CVE Program (M2 Task 8, Ruling 8 of the M2 plan): it
 * refuses while the gate of the CVE records (Q7) is closed and for a file that is not named as a
 * baseline is, and otherwise applies the records of a local file to the CVE mirror in batches, then
 * sets the mirror's cursor to the day before the file's. The published records the copy's filter
 * leaves out go to the store as `retire`, so that a copy that held one stops offering it. A few
 * entries that do not parse are left out and counted, as a sync leaves them out; more than
 * `cveUnreadableAllowed` refuse the baseline and move no cursor. The store is a fake and the
 * baseline is written by the test: nothing reaches a database or the network.
 */
jest.mock("../../database/db", () => ({ sequelize: { close: jest.fn() } }));
jest.mock("../../utils/vrdb.utils", () => ({}));

import fs from "fs";
import os from "os";
import path from "path";
import { writeZip } from "../../services/vendorResearch/vrdb/__tests__/helpers/zipWriter";
// The module object itself, not a copy of its names: a test sets a gate on what the code reads.
import gates = require("../../services/vendorResearch/vrdb/gates");
import type { VrdbSourceDefinition } from "../../services/vendorResearch/vrdb/sources";
import type { ApplyCounts, VrdbDeltaWrite } from "../../services/vendorResearch/vrdb/types";
import { BASELINE_BATCH, type BaselineDeps, main } from "../vrdbCveBaseline";

const NOW = new Date("2026-10-31T09:00:00Z");
const NAME = "2026-10-30_all_CVEs_at_midnight.zip";

/** A record of the CVE record format 5.1, published or rejected. */
function cveRecord(
  id: string,
  options: { state?: string; score?: number; published?: string } = {},
) {
  const state = options.state ?? "PUBLISHED";
  return JSON.stringify({
    dataType: "CVE_RECORD",
    dataVersion: "5.1",
    cveMetadata: {
      cveId: id,
      assignerOrgId: "00000000-0000-4000-8000-000000000001",
      state,
      ...(state === "PUBLISHED"
        ? { datePublished: `${options.published ?? "2026-10-20"}T08:00:00.000Z` }
        : { dateRejected: "2026-10-21T08:00:00.000Z" }),
    },
    containers: {
      cna:
        state === "PUBLISHED"
          ? {
              descriptions: [{ lang: "en", value: `The flaw ${id}.` }],
              affected: [{ vendor: "Example Corp", product: "Gateway" }],
              metrics: [
                { cvssV3_1: { baseScore: options.score ?? 9.8, baseSeverity: "CRITICAL" } },
              ],
            }
          : { rejectedReasons: [{ lang: "en", value: "Not a vulnerability." }] },
    },
  });
}

const entryOf = (id: string, data: string) => ({
  name: `cves/${id.slice(4, 8)}/${id.slice(9, -3)}xxx/${id}.json`,
  data,
});

/** Entries that do not parse, in turn: text that is not JSON, and JSON of a state the copy lacks. */
const unreadableEntries = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const id = `CVE-2026-${3000 + index}`;
    const data =
      index % 2 === 0
        ? "{not json"
        : JSON.stringify({ cveMetadata: { cveId: id, state: "RESERVED" } });
    return entryOf(id, data);
  });

/** Published records that the copy leaves out, for their score is below 9.0. */
const belowCriticalEntries = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const id = `CVE-2026-${6000 + index}`;
    return entryOf(id, cveRecord(id, { score: 7.5 }));
  });

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vrdb-baseline-test-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

/**
 * Sets the gate of the code (gates.ts) for the rest of a test, whatever the file says today: the
 * script takes it when it is given none, and these tests must not change when the gate opens.
 */
const gateSetTo = (open: boolean) =>
  jest.replaceProperty(gates as { CVE_TERMS_APPROVED: boolean }, "CVE_TERMS_APPROVED", open);

/** A baseline as the CVE Program publishes it: a zip holding cves.zip, which holds the records. */
function baseline(name: string, entries: Array<{ name: string; data: string }>): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, writeZip([{ name: "cves.zip", data: writeZip(entries), method: 0 }]));
  return file;
}

function fakeStore() {
  const applied: VrdbDeltaWrite[] = [];
  const upserted: string[] = [];
  const store: BaselineDeps["store"] = {
    async upsertVrdbSourceQuery(definition: VrdbSourceDefinition) {
      upserted.push(definition.id);
    },
    async applyVrdbDeltaQuery(input: VrdbDeltaWrite): Promise<ApplyCounts> {
      applied.push(input);
      return {
        seen: input.records.length,
        inserted: input.records.length,
        updated: 0,
        statusChanged: 0,
      };
    },
  };
  return { store, applied, upserted };
}

function printed() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    write: (text: string) => out.push(text),
    error: (text: string) => err.push(text),
  };
}

/** Runs the script on a baseline against a fake store; what it did and printed comes back. */
async function load(file: string) {
  const fake = fakeStore();
  const lines = printed();
  const code = await main([file], lines.write, lines.error, {
    approved: true,
    store: fake.store,
    now: () => NOW,
  });
  return { code, applied: fake.applied, upserted: fake.upserted, out: lines.out, err: lines.err };
}

describe("vrdbCveBaseline", () => {
  it("refuses while the gate is closed", async () => {
    const file = baseline(NAME, [entryOf("CVE-2026-1001", cveRecord("CVE-2026-1001"))]);
    const fake = fakeStore();
    const lines = printed();
    gateSetTo(false);

    const closed = await main([file], lines.write, lines.error, {
      approved: false,
      store: fake.store,
      now: () => NOW,
    });
    // Given no gate, the script takes the one in the code: closed, it refuses before a store.
    const byDefault = await main([file], lines.write, lines.error);

    expect(closed).toBe(2);
    expect(byDefault).toBe(2);
    expect(lines.err.join("\n")).toContain("Q7");
    expect(fake.applied).toEqual([]);
    expect(fake.upserted).toEqual([]);
  });

  it("takes the gate of the code when it is given none, and goes on to the file once it is open", async () => {
    const lines = printed();
    gateSetTo(true);

    // A file that is not named as a baseline is refused for its name, not for the gate.
    const code = await main(["cves.zip"], lines.write, lines.error);

    expect(code).toBe(2);
    expect(lines.err.join("\n")).toContain("<day>_all_CVEs_at_midnight.zip");
    expect(lines.err.join("\n")).not.toContain("Q7");
  });

  it("refuses a file that is not named as a baseline", async () => {
    const fake = fakeStore();
    const lines = printed();
    const deps = { approved: true, store: fake.store, now: () => NOW };

    for (const name of [
      "cves.zip",
      "2026-10-30_delta_CVEs_at_end_of_day.zip",
      "2026-13-40_all_CVEs_at_midnight.zip",
    ]) {
      const file = baseline(name, [entryOf("CVE-2026-1001", cveRecord("CVE-2026-1001"))]);
      expect(await main([file], lines.write, lines.error, deps)).toBe(2);
    }
    expect(await main([], lines.write, lines.error, deps)).toBe(2);
    expect(lines.err.join("\n")).toContain("<day>_all_CVEs_at_midnight.zip");
    expect(fake.applied).toEqual([]);
  });

  it("applies a baseline from a local file", async () => {
    const critical = Array.from(
      { length: BASELINE_BATCH + 1 },
      (_, index) => `CVE-2026-${2000 + index}`,
    );
    const file = baseline(NAME, [
      ...critical.map((id) => entryOf(id, cveRecord(id))),
      entryOf("CVE-2026-1002", cveRecord("CVE-2026-1002", { state: "REJECTED" })),
      entryOf("CVE-2026-1003", cveRecord("CVE-2026-1003", { score: 7.2 })),
      entryOf("CVE-2023-1004", cveRecord("CVE-2023-1004", { published: "2023-02-01" })),
      { name: "../CVE-2026-1005.json", data: cveRecord("CVE-2026-1005") },
      { name: "cves/delta.json", data: "{}" },
    ]);

    const run = await load(file);

    expect(BASELINE_BATCH).toBe(1_000);
    expect(run.code).toBe(0);
    expect(run.upserted).toEqual(["cve"]);
    // The two published records the filter leaves out (7.2, and published in 2023) go to the store
    // as `retire`, beside the records it keeps; entries that are not records are not read.
    expect(run.applied.map((write) => [write.records.length, write.retire, write.cursor])).toEqual([
      [1_000, [], null],
      [2, ["CVE-2026-1003", "CVE-2023-1004"], { day: "2026-10-29" }],
    ]);
    const ids = run.applied.flatMap((write) =>
      write.records.map((record) => record.sourceRecordId),
    );
    expect(ids).toEqual([...critical, "CVE-2026-1002"]);
    for (const write of run.applied) {
      expect(write).toMatchObject({ sourceId: "cve", at: NOW });
      expect(write.rawSnapshotHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(run.err).toEqual([]);
    expect(run.out).toEqual([
      "Applied 1002 records of the CVE baseline of 2026-10-30; 2 published records were left out (not critical, or published before 2024-10-31). The CVE mirror reads the changes from 2026-10-30 on.",
    ]);
  });

  it("takes a baseline whose name has a doubled .zip, as the release serves it", async () => {
    // The release asset <day>_all_CVEs_at_midnight.zip is served as ...zip.zip.
    const file = baseline("2026-10-31_all_CVEs_at_midnight.zip.zip", [
      entryOf("CVE-2026-1001", cveRecord("CVE-2026-1001")),
    ]);

    const run = await load(file);

    expect(run.code).toBe(0);
    expect(run.applied.map((write) => write.cursor)).toEqual([{ day: "2026-10-30" }]);
    expect(run.out.join("\n")).toContain("the CVE baseline of 2026-10-31");
  });

  it("speaks of one record, and of one entry, in the singular", async () => {
    const file = baseline(NAME, [
      entryOf("CVE-2026-1001", cveRecord("CVE-2026-1001")),
      entryOf("CVE-2026-1002", cveRecord("CVE-2026-1002", { score: 5 })),
      entryOf("CVE-2026-1003", "{not json"),
    ]);

    const run = await load(file);

    expect(run.code).toBe(0);
    expect(run.out).toEqual([
      "Applied 1 record of the CVE baseline of 2026-10-30; 1 published record was left out (not critical, or published before 2024-10-31); 1 entry that does not parse was left out. The CVE mirror reads the changes from 2026-10-30 on.",
    ]);
  });

  it("a baseline where more than ten entries, and more than a hundredth of them, do not parse moves no cursor", async () => {
    // Eleven of twelve entries: past the ten a baseline leaves out. That is a new format.
    const file = baseline(NAME, [
      entryOf("CVE-2026-1001", cveRecord("CVE-2026-1001")),
      ...unreadableEntries(11),
    ]);

    const run = await load(file);

    expect(run.code).toBe(1);
    expect(run.err.join("\n")).toContain("11 entries");
    expect(run.applied.every((write) => write.cursor === null)).toBe(true);
    expect(run.out).toEqual([]);
  });

  it("keeps the batches it flushed before it refused, and still moves no cursor", async () => {
    // 1,001 records fill a batch, and the eleven entries after them are past ten and past a
    // hundredth of the 1,012 entries.
    const ids = Array.from(
      { length: BASELINE_BATCH + 1 },
      (_, index) => `CVE-2026-${2000 + index}`,
    );
    const file = baseline(NAME, [
      ...ids.map((id) => entryOf(id, cveRecord(id))),
      ...unreadableEntries(11),
    ]);

    const run = await load(file);

    expect(run.code).toBe(1);
    expect(run.applied.map((write) => [write.records.length, write.cursor])).toEqual([
      [1_000, null],
    ]);
    expect(run.err).toEqual([
      "11 entries of the baseline do not parse. 1000 records were applied; the cursor was not moved.",
    ]);
    expect(run.out).toEqual([]);
  });

  it.each([
    ["no entry at all", () => []],
    ["one entry, which does not parse", () => unreadableEntries(1)],
    [
      "only entries that do not parse, as many as a baseline may leave out",
      () => unreadableEntries(10),
    ],
  ])(
    "a baseline with %s holds no record, so it moves no cursor and marks nothing as copied",
    async (_name, entriesOf) => {
      // Under the tolerance of ten, so the count of entries that do not parse is not what refuses it:
      // a wrong file, or a damaged one, must not leave the list marked as copied with no record in it.
      const run = await load(baseline(NAME, entriesOf()));

      expect(run.code).toBe(1);
      expect(run.err).toEqual([
        "The baseline holds no CVE record that can be read. Nothing was applied; the cursor was not moved.",
      ]);
      expect(run.applied).toEqual([]);
      expect(run.out).toEqual([]);
    },
  );

  it("a baseline whose records are all left out is still a baseline: the entries were read", async () => {
    const run = await load(baseline(NAME, belowCriticalEntries(3)));

    expect(run.code).toBe(0);
    const last = run.applied[run.applied.length - 1];
    expect(last.cursor).toEqual({ day: "2026-10-29" });
    expect(last.records).toEqual([]);
    expect(last.retire).toHaveLength(3);
  });

  it("a baseline with a few entries that do not parse is applied, and says how many it left out", async () => {
    const file = baseline(NAME, [
      entryOf("CVE-2026-1001", cveRecord("CVE-2026-1001")),
      entryOf("CVE-2026-1002", "{not json"),
      entryOf(
        "CVE-2026-1003",
        JSON.stringify({ cveMetadata: { cveId: "CVE-2026-1003", state: "RESERVED" } }),
      ),
    ]);

    const run = await load(file);

    expect(run.code).toBe(0);
    const last = run.applied[run.applied.length - 1];
    expect(last.cursor).toEqual({ day: "2026-10-29" });
    expect(last.records.map((record) => record.sourceRecordId)).toEqual(["CVE-2026-1001"]);
    // An entry that could not be read is not retired: its state is unknown.
    expect(last.retire).toEqual([]);
    expect(run.err).toEqual([]);
    expect(run.out).toEqual([
      "Applied 1 record of the CVE baseline of 2026-10-30; 0 published records were left out (not critical, or published before 2024-10-31); 2 entries that do not parse were left out. The CVE mirror reads the changes from 2026-10-30 on.",
    ]);
  });

  it("allows a hundredth of all the entries it reads, not of the records it keeps", async () => {
    // 1,100 entries, none of them kept: the tolerance is 11, so 11 that do not parse are left out
    // and 12 refuse the baseline. Counted over the kept records, it would be the ten.
    const tolerated = await load(
      baseline(NAME, [...belowCriticalEntries(1_089), ...unreadableEntries(11)]),
    );
    const refused = await load(
      baseline("2026-10-29_all_CVEs_at_midnight.zip", [
        ...belowCriticalEntries(1_088),
        ...unreadableEntries(12),
      ]),
    );

    expect(tolerated.code).toBe(0);
    // The first 1,000 ids left out fill a batch; the rest go with the cursor.
    expect(tolerated.applied.map((write) => write.cursor)).toEqual([null, { day: "2026-10-29" }]);
    expect(tolerated.out.join("\n")).toContain("; 11 entries that do not parse were left out");
    expect(refused.code).toBe(1);
    expect(refused.err.join("\n")).toContain("12 entries");
    expect(refused.applied.every((write) => write.cursor === null)).toBe(true);
  });

  it("hands the store the ids of the published records it leaves out, in batches of 1,000, the last with the cursor", async () => {
    // What the filter leaves out: a 7.5 record, and a critical one published before the window.
    // What it keeps: a 9.8 record, and a rejected one.
    const few = await load(
      baseline(NAME, [
        entryOf("CVE-2026-1001", cveRecord("CVE-2026-1001", { score: 9.8 })),
        entryOf("CVE-2026-1002", cveRecord("CVE-2026-1002", { score: 7.5 })),
        entryOf("CVE-2023-1003", cveRecord("CVE-2023-1003", { published: "2023-02-01" })),
        entryOf("CVE-2026-1004", cveRecord("CVE-2026-1004", { state: "REJECTED" })),
      ]),
    );

    expect(few.code).toBe(0);
    expect(
      few.applied.map((write) => [
        write.records.map((record) => record.sourceRecordId),
        write.retire,
        write.cursor,
      ]),
    ).toEqual([
      [
        ["CVE-2026-1001", "CVE-2026-1004"],
        ["CVE-2026-1002", "CVE-2023-1003"],
        { day: "2026-10-29" },
      ],
    ]);

    // 1,001 left-out records fill a batch of ids, and the one after it goes with the cursor.
    const many = await load(
      baseline("2026-10-29_all_CVEs_at_midnight.zip", belowCriticalEntries(BASELINE_BATCH + 1)),
    );

    expect(many.code).toBe(0);
    expect(
      many.applied.map((write) => [write.records.length, write.retire?.length, write.cursor]),
    ).toEqual([
      [0, 1_000, null],
      [0, 1, { day: "2026-10-28" }],
    ]);
    expect(many.applied.flatMap((write) => write.retire ?? [])).toEqual(
      Array.from({ length: BASELINE_BATCH + 1 }, (_, index) => `CVE-2026-${6000 + index}`),
    );
  });

  it("a full batch of ids takes the records read so far with it, and no record is applied twice", async () => {
    const early = ["CVE-2026-1001", "CVE-2026-1002", "CVE-2026-1003"];
    const file = baseline(NAME, [
      ...early.map((id) => entryOf(id, cveRecord(id))),
      ...belowCriticalEntries(BASELINE_BATCH),
      entryOf("CVE-2026-1004", cveRecord("CVE-2026-1004")),
    ]);

    const run = await load(file);

    expect(run.code).toBe(0);
    expect(
      run.applied.map((write) => [
        write.records.map((record) => record.sourceRecordId),
        write.retire?.length,
        write.cursor,
      ]),
    ).toEqual([
      [early, 1_000, null],
      [["CVE-2026-1004"], 0, { day: "2026-10-29" }],
    ]);
    expect(run.out.join("\n")).toContain("Applied 4 records");
  });

  it("a file that cannot be read moves nothing", async () => {
    const fake = fakeStore();
    const lines = printed();
    const deps = { approved: true, store: fake.store, now: () => NOW };
    const notZip = path.join(dir, NAME);
    fs.writeFileSync(notZip, "<html>Not a zip</html>");

    expect(
      await main(
        [path.join(dir, "2026-10-29_all_CVEs_at_midnight.zip")],
        lines.write,
        lines.error,
        deps,
      ),
    ).toBe(1);
    expect(await main([notZip], lines.write, lines.error, deps)).toBe(1);

    expect(lines.err.join("\n")).toContain("not_zip");
    expect(fake.applied).toEqual([]);
  });
});
