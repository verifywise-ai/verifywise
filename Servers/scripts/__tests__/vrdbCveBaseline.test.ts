/**
 * The loader of a baseline file of the CVE Program (M2 Task 8, Ruling 8 of the M2 plan): it
 * refuses while the gate of the CVE records (Q7) is closed and for a file that is not named as a
 * baseline is, and otherwise applies the records of a local file to the CVE mirror in batches, then
 * sets the mirror's cursor to the day before the file's. The store is a fake and the baseline is
 * written by the test: nothing reaches a database or the network.
 */
jest.mock("../../database/db", () => ({ sequelize: { close: jest.fn() } }));
jest.mock("../../utils/vrdb.utils", () => ({}));

import fs from "fs";
import os from "os";
import path from "path";
import { writeZip } from "../../services/vendorResearch/vrdb/__tests__/helpers/zipWriter";
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

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vrdb-baseline-test-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

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

describe("vrdbCveBaseline", () => {
  it("refuses while the gate is closed", async () => {
    const file = baseline(NAME, [entryOf("CVE-2026-1001", cveRecord("CVE-2026-1001"))]);
    const fake = fakeStore();
    const lines = printed();

    const closed = await main([file], lines.write, lines.error, {
      approved: false,
      store: fake.store,
      now: () => NOW,
    });
    // The gate in the code is closed: the script refuses before it touches a store.
    const byDefault = await main([file], lines.write, lines.error);

    expect(closed).toBe(2);
    expect(byDefault).toBe(2);
    expect(lines.err.join("\n")).toContain("Q7");
    expect(fake.applied).toEqual([]);
    expect(fake.upserted).toEqual([]);
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
    const fake = fakeStore();
    const lines = printed();

    const code = await main([file], lines.write, lines.error, {
      approved: true,
      store: fake.store,
      now: () => NOW,
    });

    expect(BASELINE_BATCH).toBe(1_000);
    expect(code).toBe(0);
    expect(fake.upserted).toEqual(["cve"]);
    expect(fake.applied.map((write) => [write.records.length, write.cursor])).toEqual([
      [1_000, null],
      [2, { day: "2026-10-29" }],
    ]);
    const ids = fake.applied.flatMap((write) =>
      write.records.map((record) => record.sourceRecordId),
    );
    expect(ids).toEqual([...critical, "CVE-2026-1002"]);
    for (const write of fake.applied) {
      expect(write).toMatchObject({ sourceId: "cve", at: NOW });
      expect(write.rawSnapshotHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(lines.out.join("\n")).toContain("1002 records");
    expect(lines.out.join("\n")).toContain("2026-10-30");
  });

  it("takes a baseline whose name has a doubled .zip", async () => {
    const file = baseline(`${NAME}.zip`, [entryOf("CVE-2026-1001", cveRecord("CVE-2026-1001"))]);
    const fake = fakeStore();
    const lines = printed();

    const code = await main([file], lines.write, lines.error, {
      approved: true,
      store: fake.store,
      now: () => NOW,
    });

    expect(code).toBe(0);
    expect(fake.applied.map((write) => write.cursor)).toEqual([{ day: "2026-10-29" }]);
  });

  it("a baseline with entries that do not parse moves no cursor", async () => {
    const file = baseline(NAME, [
      entryOf("CVE-2026-1001", cveRecord("CVE-2026-1001")),
      entryOf("CVE-2026-1002", "{not json"),
      entryOf(
        "CVE-2026-1003",
        JSON.stringify({ cveMetadata: { cveId: "CVE-2026-1003", state: "RESERVED" } }),
      ),
    ]);
    const fake = fakeStore();
    const lines = printed();

    const code = await main([file], lines.write, lines.error, {
      approved: true,
      store: fake.store,
      now: () => NOW,
    });

    expect(code).toBe(1);
    expect(lines.err.join("\n")).toContain("2 entries");
    expect(fake.applied.every((write) => write.cursor === null)).toBe(true);
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
