/**
 * The lists the vendor risk database mirrors (spec D4, Rulings 1 and 5 of the M1 plan): one
 * definition per VRDB id, with its schedule, its licence and when its copy is out of date; a list
 * behind a closed gate (gates.ts) is neither synced nor looked up.
 */
import { VRDB_SOURCE_IDS } from "../../../../domain.layer/interfaces/i.vendorResearch";
import { MAX_RECORDS, RECORD_CATEGORY } from "../../records/types";
import { classifyRecord, recordMatchOf } from "../../sourceRegistry/classify";
import { VRDB_GATES, type VrdbGate } from "../gates";
import {
  VRDB_SOURCES,
  activeMirrors,
  activeReadThroughs,
  activeVrdbSources,
  isMirror,
  isStale,
  vrdbSourceOf,
} from "../sources";

const CLOSED: Record<VrdbGate, boolean> = { Q4: false, Q6: false, Q7: false };
const OPEN: Record<VrdbGate, boolean> = { Q4: true, Q6: true, Q7: true };
const idsOf = (sources: ReadonlyArray<{ id: string }>) => sources.map((source) => source.id);

describe("the VRDB sources", () => {
  it("has one definition per VRDB id, in order", () => {
    expect(VRDB_SOURCE_IDS).toEqual([
      "kev",
      "nvd",
      "sec",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "cve",
      "un_sanctions",
    ]);
    expect(idsOf(VRDB_SOURCES)).toEqual([...VRDB_SOURCE_IDS]);
    for (const id of VRDB_SOURCE_IDS) expect(vrdbSourceOf(id).id).toBe(id);
  });

  it("every active mirror has a schedule on a minute of its own", () => {
    const minutesOf = (gates: Record<VrdbGate, boolean>) =>
      activeMirrors(gates).map(({ id, schedule }) => [id, schedule.split(" ")[0]]);
    expect(minutesOf(CLOSED)).toEqual([
      ["kev", "23"],
      ["ofac", "41"],
      ["uk_sanctions", "47"],
      ["eu_fsf", "53"],
    ]);
    expect(minutesOf(OPEN)).toEqual([
      ["kev", "23"],
      ["ofac", "41"],
      ["uk_sanctions", "47"],
      ["eu_fsf", "53"],
      ["cve", "29"],
      ["un_sanctions", "59"],
    ]);
    const FIELD = /^(?:\*|\*\/\d+|\d+)$/;
    for (const { schedule } of activeMirrors(OPEN)) {
      const fields = schedule.split(" ");
      expect(fields).toHaveLength(5);
      expect(fields.filter((field) => !FIELD.test(field))).toEqual([]);
    }
  });

  it("a source behind a closed gate is not active", () => {
    expect(VRDB_GATES).toEqual({ Q4: false, Q6: false, Q7: false });
    expect(vrdbSourceOf("cve").gate).toBe("Q7");
    expect(vrdbSourceOf("un_sanctions").gate).toBe("Q6");
    expect(vrdbSourceOf("sec").gate).toBe("Q4");
    for (const gates of [undefined, CLOSED]) {
      expect(idsOf(activeVrdbSources(gates))).toEqual([
        "kev",
        "nvd",
        "ofac",
        "uk_sanctions",
        "eu_fsf",
      ]);
      expect(idsOf(activeMirrors(gates))).toEqual(["kev", "ofac", "uk_sanctions", "eu_fsf"]);
      expect(idsOf(activeReadThroughs(gates))).toEqual(["nvd"]);
    }
  });

  it("opening a gate makes it active", () => {
    expect(idsOf(activeVrdbSources({ ...CLOSED, Q7: true }))).toEqual([
      "kev",
      "nvd",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "cve",
    ]);
    expect(idsOf(activeVrdbSources({ ...CLOSED, Q6: true }))).toEqual([
      "kev",
      "nvd",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "un_sanctions",
    ]);
    expect(idsOf(activeVrdbSources({ ...CLOSED, Q4: true }))).toEqual([
      "kev",
      "nvd",
      "sec",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
    ]);
    expect(idsOf(activeMirrors(OPEN))).toEqual(
      VRDB_SOURCE_IDS.filter((id) => id !== "nvd" && id !== "sec"),
    );
    expect(idsOf(activeReadThroughs(OPEN))).toEqual(["nvd", "sec"]);
  });

  it("every source is stale after 48 hours", () => {
    expect(VRDB_SOURCES.map((source) => source.staleAfterHours)).toEqual([
      48, 48, 48, 48, 48, 48, 48, 48,
    ]);
  });

  it("every source names its attribution and documentation", () => {
    for (const source of VRDB_SOURCES) {
      expect(source.attribution.trim()).not.toBe("");
      expect(source.licence.trim()).not.toBe("");
      expect(new URL(source.documentationUrl).protocol).toBe("https:");
    }
  });

  it("holds the values of the plan's table", () => {
    expect(
      VRDB_SOURCES.filter(isMirror).map(
        ({ id, operator, listName, category, schedule, missingStatus, mode }) => ({
          id,
          operator,
          listName,
          category,
          schedule,
          missingStatus,
          mode,
        }),
      ),
    ).toEqual([
      {
        id: "kev",
        operator: "CISA",
        listName: "CISA KEV catalog",
        category: "security_incidents",
        schedule: "23 * * * *",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "ofac",
        operator: "OFAC",
        listName: "OFAC SDN list",
        category: "legal_regulatory",
        schedule: "41 */6 * * *",
        missingStatus: "delisted",
        mode: "mirror",
      },
      {
        id: "uk_sanctions",
        operator: "FCDO",
        listName: "UK Sanctions List",
        category: "legal_regulatory",
        schedule: "47 */6 * * *",
        missingStatus: "delisted",
        mode: "mirror",
      },
      {
        id: "eu_fsf",
        operator: "European Commission",
        listName: "EU financial sanctions list",
        category: "legal_regulatory",
        schedule: "53 */6 * * *",
        missingStatus: "delisted",
        mode: "mirror",
      },
      {
        id: "cve",
        operator: "the CVE Program",
        listName: "CVE List",
        category: "security_incidents",
        schedule: "29 2 * * *",
        missingStatus: null,
        mode: "mirror",
      },
      {
        id: "un_sanctions",
        operator: "the UN Security Council",
        listName: "UN Security Council Consolidated List",
        category: "legal_regulatory",
        schedule: "59 */6 * * *",
        missingStatus: "delisted",
        mode: "mirror",
      },
    ]);
    expect(vrdbSourceOf("cve")).toMatchObject({
      name: "CVE Program records",
      licence: "CVE Terms of Use",
      attribution:
        "CVE® records © The MITRE Corporation, under the CVE Terms of Use (https://www.cve.org/Legal/TermsOfUse)",
      documentationUrl: "https://github.com/CVEProject/cvelistV5",
    });
    expect(vrdbSourceOf("un_sanctions")).toMatchObject({
      name: "UN Security Council Consolidated List",
      licence: "UNVERIFIED (Q6)",
      attribution: "United Nations Security Council Consolidated List",
      documentationUrl: "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list",
    });
    expect(vrdbSourceOf("uk_sanctions").attribution).toBe(
      "UK Sanctions List, FCDO. Contains public sector information licensed under the Open Government Licence v3.0.",
    );
    expect(vrdbSourceOf("ofac").licence).toBe("None published (Q5)");
  });

  it("reads the NVD through, keeping an answer six hours (Ruling 2 of the M2 plan)", () => {
    expect(vrdbSourceOf("nvd")).toEqual({
      id: "nvd",
      name: "National Vulnerability Database",
      operator: "NIST",
      listName: "NVD",
      category: "security_incidents",
      mode: "read_through",
      ttlHours: 6,
      staleAfterHours: 48,
      licence: "Public domain",
      attribution:
        "This product uses data from the NVD API but is not endorsed or certified by the NVD.",
      documentationUrl: "https://nvd.nist.gov/developers/vulnerabilities",
    });
  });

  it("reads the SEC through behind Q4, keeping an answer one hour (Rulings 2 and 14 of the M2 plan)", () => {
    expect(vrdbSourceOf("sec")).toEqual({
      id: "sec",
      name: "SEC EDGAR",
      operator: "SEC",
      listName: "SEC EDGAR filings",
      category: "security_incidents",
      mode: "read_through",
      ttlHours: 1,
      staleAfterHours: 48,
      licence: "Free to reuse (SEC)",
      attribution: "SEC EDGAR, US Securities and Exchange Commission",
      documentationUrl:
        "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
      gate: "Q4",
    });
  });

  it("serves the two new sanctions lists in legal_regulatory, two records each", () => {
    expect(RECORD_CATEGORY.uk_sanctions).toBe("legal_regulatory");
    expect(RECORD_CATEGORY.eu_fsf).toBe("legal_regulatory");
    expect(MAX_RECORDS.uk_sanctions).toBe(2);
    expect(MAX_RECORDS.eu_fsf).toBe(2);
  });

  it("serves CVE records in security_incidents, three a run, as official and strong", () => {
    expect(RECORD_CATEGORY.cve).toBe("security_incidents");
    expect(MAX_RECORDS.cve).toBe(3);
    expect(classifyRecord("cve").category).toBe("official");
    expect(recordMatchOf("cve")).toBe("strong");
  });

  it("serves the UN list in legal_regulatory, two records a run, as official and weak", () => {
    expect(RECORD_CATEGORY.un_sanctions).toBe("legal_regulatory");
    expect(MAX_RECORDS.un_sanctions).toBe(2);
    expect(classifyRecord("un_sanctions").category).toBe("official");
    expect(recordMatchOf("un_sanctions")).toBe("weak");
  });

  describe("isStale", () => {
    const kev = vrdbSourceOf("kev");
    const now = new Date("2026-10-30T12:00:00Z");
    const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

    it("is false at 47 h 59 min", () => expect(isStale(kev, ago(47 * 60 + 59), now)).toBe(false));
    it("is true at 48 h 1 min", () => expect(isStale(kev, ago(48 * 60 + 1), now)).toBe(true));
    it("is true for a list never copied", () => expect(isStale(kev, null, now)).toBe(true));
  });
});
