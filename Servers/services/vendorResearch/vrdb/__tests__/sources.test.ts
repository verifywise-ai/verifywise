/**
 * The lists the vendor risk database mirrors (spec D4, Rulings 1 and 5 of the M1 plan): one
 * definition per VRDB id, with its schedule, its licence and when its copy is out of date; a list
 * behind a closed gate (gates.ts) is neither synced nor looked up.
 */
import { createHash } from "crypto";
import { VRDB_SOURCE_IDS } from "../../../../domain.layer/interfaces/i.vendorResearch";
import { MAX_RECORDS, RECORD_CATEGORY } from "../../records/types";
import { classifyRecord, recordMatchOf } from "../../sourceRegistry/classify";
import * as gatesModule from "../gates";
import {
  CVE_TERMS_APPROVED,
  SEC_CONTACT,
  UN_PERMISSION_GRANTED,
  VRDB_GATES,
  type VrdbGate,
} from "../gates";
import {
  CVE_TERMS_LICENCE,
  VRDB_SOURCES,
  activeMirrors,
  activeReadThroughs,
  activeVrdbSources,
  cveCopyrightOf,
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
    // The SEC (Q4) and the CVE records (Q7) are open; the UN list (Q6) is the one that waits.
    expect(VRDB_GATES).toEqual({ Q4: true, Q6: false, Q7: true });
    expect(vrdbSourceOf("cve").gate).toBe("Q7");
    expect(vrdbSourceOf("un_sanctions").gate).toBe("Q6");
    expect(vrdbSourceOf("sec").gate).toBe("Q4");
    // By default: the SEC after the NVD and the CVE records after the EU list, in the order of the
    // table, without the UN list.
    expect(idsOf(activeVrdbSources())).toEqual([
      "kev",
      "nvd",
      "sec",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "cve",
    ]);
    expect(idsOf(activeMirrors())).toEqual(["kev", "ofac", "uk_sanctions", "eu_fsf", "cve"]);
    expect(idsOf(activeReadThroughs())).toEqual(["nvd", "sec"]);
    // With every gate closed, only the lists that have none are active.
    expect(idsOf(activeVrdbSources(CLOSED))).toEqual([
      "kev",
      "nvd",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
    ]);
    expect(idsOf(activeMirrors(CLOSED))).toEqual(["kev", "ofac", "uk_sanctions", "eu_fsf"]);
    expect(idsOf(activeReadThroughs(CLOSED))).toEqual(["nvd"]);
  });

  it("opens Q4 with the Technical Support address that verifywise.ai publishes (answered 2026-10-31)", () => {
    // The address of a role, not of a person, on VerifyWise's own domain: the SEC writes to it
    // before it limits or blocks the client.
    expect(SEC_CONTACT).toBe("tech@verifywise.ai");
    expect(SEC_CONTACT).toMatch(/^[^@\s]+@verifywise\.ai$/);
    expect(VRDB_GATES.Q4).toBe(true);
  });

  it("opens Q7 once the product owner has accepted the CVE Terms of Use for this use (2026-10-31)", () => {
    expect(CVE_TERMS_APPROVED).toBe(true);
    expect(VRDB_GATES.Q7).toBe(CVE_TERMS_APPROVED);
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
    // The licence and the attribution of the cve row have a block of their own (the notice, Q7).
    expect(vrdbSourceOf("cve")).toMatchObject({
      name: "CVE Program records",
      documentationUrl: "https://github.com/CVEProject/cvelistV5",
    });
    expect(vrdbSourceOf("un_sanctions")).toMatchObject({
      name: "UN Security Council Consolidated List",
      licence: "UN terms of use: personal, non-commercial use only (Q6)",
      attribution: "United Nations Security Council Consolidated List",
      documentationUrl: "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list",
    });
    expect(vrdbSourceOf("uk_sanctions").attribution).toBe(
      "UK Sanctions List, FCDO. Contains public sector information licensed under the Open Government Licence v3.0.",
    );
    expect(vrdbSourceOf("ofac").licence).toBe(
      "None published; a work of the US Government (17 U.S.C. §105); use accepted by the product owner on 2026-10-31 (Q5)",
    );
  });

  describe("the notice of the CVE records (Q7)", () => {
    const LEAD = "CVE Terms of Use (https://www.cve.org/Legal/TermsOfUse). CVE Usage: ";
    const attributionIn = (year: number) =>
      `CVE records Copyright © 1999-${year}, The MITRE Corporation, under the CVE Terms of Use (https://www.cve.org/Legal/TermsOfUse)`;

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it("keeps the CVE Usage paragraph of the Terms byte for byte", () => {
      // The paragraph as cve.org prints it, with CVE™ and without a final newline. The Terms let a
      // copy be made on one condition, that it reproduces MITRE's copyright designation and this
      // licence, so a changed character is not a style fix.
      expect(CVE_TERMS_LICENCE).toHaveLength(411);
      expect(CVE_TERMS_LICENCE).toContain("(CVE™)");
      expect(createHash("sha256").update(CVE_TERMS_LICENCE, "utf8").digest("hex")).toBe(
        "0d3c13bf515180f5fb2789eb6c9e15a01090efa0820a357daaf47215c2fbf5f8",
      );
    });

    it("puts the paragraph whole in the licence of the cve row", () => {
      expect(vrdbSourceOf("cve").licence).toBe(LEAD + CVE_TERMS_LICENCE);
    });

    it("writes MITRE's copyright designation from a year", () => {
      expect(cveCopyrightOf(2026)).toBe("Copyright © 1999-2026, The MITRE Corporation");
      expect(cveCopyrightOf(2031)).toBe("Copyright © 1999-2031, The MITRE Corporation");
    });

    it("attributes the records to MITRE with the year of the day, and without a registered mark", () => {
      jest.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z") });
      expect(vrdbSourceOf("cve").attribution).toBe(attributionIn(2026));
      expect(vrdbSourceOf("cve").attribution).toContain(cveCopyrightOf(2026));
      expect(vrdbSourceOf("cve").attribution).not.toContain("®");
    });

    it.each([
      ["2026-12-31T23:30:00Z", 2026],
      ["2027-01-01T00:30:00Z", 2027],
    ])("at %s the attribution names %i, by the UTC clock and not the local one", (now, year) => {
      jest.useFakeTimers({ now: new Date(now) });
      // In whatever zone the process runs, the local year is 1999 here, so that only the UTC year can
      // be right. Without it a process in UTC, or in a zone that shares New Year with it, would pass
      // a notice that read the local clock.
      jest.spyOn(Date.prototype, "getFullYear").mockReturnValue(1999);
      expect(vrdbSourceOf("cve").attribution).toBe(attributionIn(year));
    });

    it("reads the year at each use, so a process that runs over New Year writes the new one", () => {
      jest.useFakeTimers({ now: new Date("2026-12-31T23:59:59Z") });
      const source = vrdbSourceOf("cve");
      expect(source.attribution).toBe(attributionIn(2026));
      jest.setSystemTime(new Date("2027-01-01T00:00:01Z"));
      expect(source.attribution).toBe(attributionIn(2027));
    });
  });

  it("keeps the UN gate shut until the UN gives its written permission (Q6)", () => {
    expect(UN_PERMISSION_GRANTED).toBe(false);
    expect(VRDB_GATES.Q6).toBe(UN_PERMISSION_GRANTED);
    // The gate no longer waits for a person to read the terms, so the old name is gone.
    expect(Object.keys(gatesModule)).not.toContain("UN_TERMS_READ");
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
