/**
 * The lookup of the process (records/index.ts). The vendor risk database is always on, so the one
 * lookup that the runs share leaves out the databases that it mirrors or reads through, whatever
 * the environment says of the flag it used to have. The records switch (VENDOR_RESEARCH_RECORDS)
 * is the only way to turn the lookup off.
 */
const mockGuardedFetch = jest.fn();
jest.mock("../../../webResearch/guardedFetch", () => ({
  ...jest.requireActual("../../../webResearch/guardedFetch"),
  guardedFetch: (...args: unknown[]) => mockGuardedFetch(...args),
}));

import { RESEARCH_CATEGORIES } from "../../../../domain.layer/interfaces/i.vendorResearch";
import { FetchError } from "../../../webResearch/guardedFetch";
import { buildTarget } from "../../target";
import { hibpUrl } from "../hibp";
import { sharedRecordsLookup, sourcesBesideVrdb } from "../index";
import { KEV_URL } from "../kev";
import { OFAC_ALT_URL, OFAC_SDN_URL } from "../ofac";
import { SEC_TICKERS_URL } from "../sec";

const target = buildTarget({
  vendor_name: "Brise Networks, Inc.",
  website: "https://www.brisenetworks.example",
  vendor_provides: "Network gear",
});

describe("sharedRecordsLookup", () => {
  beforeEach(() => {
    // No test of this file reaches the web: every address that is asked is not found.
    mockGuardedFetch.mockReset().mockImplementation(async () => {
      throw new FetchError("not_found");
    });
  });

  it("is none when the records are turned off", () => {
    expect(sharedRecordsLookup({ records: false })).toBeUndefined();
  });

  it("is one lookup for the whole process when they are on, so that the memory of the answers is shared", () => {
    const first = sharedRecordsLookup({ records: true });

    expect(typeof first).toBe("function");
    expect(sharedRecordsLookup({ records: true })).toBe(first);
  });

  it("asks only what the vendor risk database does not keep, with no flag set", async () => {
    const lookup = sharedRecordsLookup({ records: true });
    if (lookup === undefined) throw new Error("the records are on in this test");

    const outcomes = await lookup({
      target,
      researchable: [...RESEARCH_CATEGORIES],
      now: new Date("2026-10-28T12:00:00Z"),
      signal: new AbortController().signal,
    });

    const asked = mockGuardedFetch.mock.calls.map(([url]) => String(url));
    expect(sourcesBesideVrdb()).toEqual(["hibp", "statuspage"]);
    expect(outcomes.map((outcome) => outcome.source).sort()).toEqual(["hibp", "statuspage"]);
    expect(asked).toContain(hibpUrl("brisenetworks.example"));
    // The catalog, the sanctions list, the NVD and the SEC are the database's.
    expect(asked).not.toContain(KEV_URL);
    expect(asked).not.toContain(OFAC_SDN_URL);
    expect(asked).not.toContain(OFAC_ALT_URL);
    expect(asked).not.toContain(SEC_TICKERS_URL);
    expect(asked.some((url) => new URL(url).hostname === "services.nvd.nist.gov")).toBe(false);
  });

  describe("reading the environment when it is given no settings", () => {
    const realEnv = process.env;

    afterEach(() => {
      jest.restoreAllMocks();
      // A boolean, so that a failure cannot print the real environment.
      expect(process.env === realEnv).toBe(true);
    });

    it("is the shared lookup with nothing set, and is not changed by the variable of the earlier flag", () => {
      const shared = sharedRecordsLookup({ records: true });

      jest.replaceProperty(process, "env", {});
      expect(sharedRecordsLookup()).toBe(shared);
      jest.replaceProperty(process, "env", { VENDOR_RESEARCH_VRDB: "false" });
      expect(sharedRecordsLookup()).toBe(shared);
      jest.replaceProperty(process, "env", { VENDOR_RESEARCH_VRDB: "true" });
      expect(sharedRecordsLookup()).toBe(shared);
    });

    it("is none when the environment turns the records off, the earlier flag or not", () => {
      jest.replaceProperty(process, "env", { VENDOR_RESEARCH_RECORDS: "false" });
      expect(sharedRecordsLookup()).toBeUndefined();

      jest.replaceProperty(process, "env", {
        VENDOR_RESEARCH_RECORDS: "false",
        VENDOR_RESEARCH_VRDB: "true",
      });
      expect(sharedRecordsLookup()).toBeUndefined();
    });
  });
});
