/**
 * The lists the vendor risk database mirrors (spec D4, Rulings 1 and 5 of the M1 plan): one
 * definition per VRDB id, with its schedule, its licence and when its copy is out of date; a list
 * behind a closed gate (gates.ts) is neither synced nor looked up. The four AI-specific lists
 * (spec D2.14 to D2.17) are pinned against the sheets of the rulings of 2026-11-05, and the US
 * Consolidated Screening List and the FDA device recalls (spec D2.19, D2.20) against the sheets of
 * the rulings of 2026-11-07, as amended the same day.
 */
import { createHash } from "crypto";
import { VRDB_SOURCE_IDS } from "../../../../domain.layer/interfaces/i.vendorResearch";
import { MAX_RECORDS, RECORD_CATEGORY } from "../../records/types";
import { classifyRecord, recordMatchOf } from "../../sourceRegistry/classify";
import * as gatesModule from "../gates";
import {
  AIID_PERMISSION_GRANTED,
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

const CLOSED: Record<VrdbGate, boolean> = { Q4: false, Q6: false, Q7: false, Q29: false };
const OPEN: Record<VrdbGate, boolean> = { Q4: true, Q6: true, Q7: true, Q29: true };
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
      "csl",
      "aiid",
      "atlas",
      "nhtsa_sgo",
      "fda_ai_devices",
      "fda_device_recalls",
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
      ["csl", "7"],
      ["atlas", "17"],
      ["nhtsa_sgo", "5"],
      ["fda_ai_devices", "35"],
      ["fda_device_recalls", "43"],
    ]);
    expect(minutesOf(OPEN)).toEqual([
      ["kev", "23"],
      ["ofac", "41"],
      ["uk_sanctions", "47"],
      ["eu_fsf", "53"],
      ["cve", "29"],
      ["un_sanctions", "59"],
      ["csl", "7"],
      ["aiid", "11"],
      ["atlas", "17"],
      ["nhtsa_sgo", "5"],
      ["fda_ai_devices", "35"],
      ["fda_device_recalls", "43"],
    ]);
    // A minute of its own: two downloads of tens of megabytes never start together.
    const minutes = activeMirrors(OPEN).map(({ schedule }) => schedule.split(" ")[0]);
    expect(new Set(minutes).size).toBe(minutes.length);
    const FIELD = /^(?:\*|\*\/\d+|\d+)$/;
    for (const { schedule } of activeMirrors(OPEN)) {
      const fields = schedule.split(" ");
      expect(fields).toHaveLength(5);
      expect(fields.filter((field) => !FIELD.test(field))).toEqual([]);
    }
  });

  it("a source behind a closed gate is not active", () => {
    // The SEC (Q4) and the CVE records (Q7) are open; the UN list (Q6) and the AI Incident Database
    // (Q29) are the ones that wait.
    expect(VRDB_GATES).toEqual({ Q4: true, Q6: false, Q7: true, Q29: false });
    expect(vrdbSourceOf("cve").gate).toBe("Q7");
    expect(vrdbSourceOf("un_sanctions").gate).toBe("Q6");
    expect(vrdbSourceOf("aiid").gate).toBe("Q29");
    expect(vrdbSourceOf("sec").gate).toBe("Q4");
    // By default: the SEC after the NVD, the CVE records after the EU list, the screening list after
    // the CVE records (the UN list that stood before it waits behind its gate), and the four open AI
    // lists last, in the order of the table, without the UN list and the AI Incident Database.
    expect(idsOf(activeVrdbSources())).toEqual([
      "kev",
      "nvd",
      "sec",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "cve",
      "csl",
      "atlas",
      "nhtsa_sgo",
      "fda_ai_devices",
      "fda_device_recalls",
    ]);
    expect(idsOf(activeMirrors())).toEqual([
      "kev",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "cve",
      "csl",
      "atlas",
      "nhtsa_sgo",
      "fda_ai_devices",
      "fda_device_recalls",
    ]);
    expect(idsOf(activeReadThroughs())).toEqual(["nvd", "sec"]);
    // With every gate closed, only the lists that have none are active.
    expect(idsOf(activeVrdbSources(CLOSED))).toEqual([
      "kev",
      "nvd",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "csl",
      "atlas",
      "nhtsa_sgo",
      "fda_ai_devices",
      "fda_device_recalls",
    ]);
    expect(idsOf(activeMirrors(CLOSED))).toEqual([
      "kev",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "csl",
      "atlas",
      "nhtsa_sgo",
      "fda_ai_devices",
      "fda_device_recalls",
    ]);
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
    // The screening list and the four open AI lists have no gate, so they are in every one of these:
    // the screening list stands after the UN list and before the AI Incident Database.
    const AI_OPEN = ["atlas", "nhtsa_sgo", "fda_ai_devices", "fda_device_recalls"];
    expect(idsOf(activeVrdbSources({ ...CLOSED, Q7: true }))).toEqual([
      "kev",
      "nvd",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "cve",
      "csl",
      ...AI_OPEN,
    ]);
    expect(idsOf(activeVrdbSources({ ...CLOSED, Q6: true }))).toEqual([
      "kev",
      "nvd",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "un_sanctions",
      "csl",
      ...AI_OPEN,
    ]);
    expect(idsOf(activeVrdbSources({ ...CLOSED, Q4: true }))).toEqual([
      "kev",
      "nvd",
      "sec",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "csl",
      ...AI_OPEN,
    ]);
    expect(idsOf(activeVrdbSources({ ...CLOSED, Q29: true }))).toEqual([
      "kev",
      "nvd",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "csl",
      "aiid",
      ...AI_OPEN,
    ]);
    expect(idsOf(activeMirrors(OPEN))).toEqual(
      VRDB_SOURCE_IDS.filter((id) => id !== "nvd" && id !== "sec"),
    );
    expect(idsOf(activeReadThroughs(OPEN))).toEqual(["nvd", "sec"]);
  });

  it("every source is stale after 48 hours", () => {
    expect(VRDB_SOURCES.map((source) => source.staleAfterHours)).toEqual([
      48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48,
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
      {
        id: "csl",
        operator: "the International Trade Administration",
        listName: "US Consolidated Screening List",
        category: "legal_regulatory",
        schedule: "7 */6 * * *",
        missingStatus: "delisted",
        mode: "mirror",
      },
      {
        id: "aiid",
        operator: "the Responsible AI Collaborative",
        listName: "AI Incident Database",
        category: "ai_specific",
        schedule: "11 4 * * *",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "atlas",
        operator: "MITRE",
        listName: "MITRE ATLAS case studies",
        category: "ai_specific",
        schedule: "17 3 * * *",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "nhtsa_sgo",
        operator: "NHTSA",
        listName: "NHTSA Standing General Order crash reports",
        category: "ai_specific",
        schedule: "5 13 * * *",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "fda_ai_devices",
        operator: "the FDA",
        listName: "FDA list of AI-enabled medical devices",
        category: "ai_specific",
        schedule: "35 5 * * *",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "fda_device_recalls",
        operator: "the FDA",
        listName: "FDA device recall database",
        category: "ai_specific",
        schedule: "43 14 * * *",
        missingStatus: "withdrawn",
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

  it.each([
    ["aiid", 3, "unverified"],
    ["atlas", 3, "trusted_press"],
    ["nhtsa_sgo", 3, "official"],
    ["fda_ai_devices", 2, "official"],
  ] as const)(
    "serves %s in ai_specific, %i records a run, as %s and weak (R3, R4, R7)",
    (id, records, category) => {
      expect(RECORD_CATEGORY[id]).toBe("ai_specific");
      expect(MAX_RECORDS[id]).toBe(records);
      // Every match of these lists is by name, so no record of them is strong, whatever its class.
      expect(classifyRecord(id).category).toBe(category);
      expect(recordMatchOf(id)).toBe("weak");
    },
  );

  describe("the AI-specific lists (spec D2.14 to D2.17, Q29 to Q32)", () => {
    // The values of the sheets of the rulings of 2026-11-05. The attribution of the ATLAS case
    // studies carries the year of the day, so it has a block of its own below.
    const SHEETS = [
      {
        id: "aiid",
        name: "AI Incident Database",
        operator: "the Responsible AI Collaborative",
        listName: "AI Incident Database",
        schedule: "11 4 * * *",
        licence:
          "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/): the incidents, entities and classifications collections of the AI Incident Database; report text, submissions and media excluded. Commercial use awaits the operator's confirmation (Q29).",
      },
      {
        id: "atlas",
        name: "MITRE ATLAS case studies",
        operator: "MITRE",
        listName: "MITRE ATLAS case studies",
        schedule: "17 3 * * *",
        licence:
          "Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0); the atlas-data repository's LICENSE (Q32).",
      },
      {
        id: "nhtsa_sgo",
        name: "NHTSA Standing General Order crash reports",
        operator: "NHTSA",
        listName: "NHTSA Standing General Order crash reports",
        schedule: "5 13 * * *",
        licence:
          "None published; a work of the US Government (17 U.S.C. §105); accepted on 2026-11-05 (Q31)",
      },
      {
        id: "fda_ai_devices",
        name: "FDA list of AI-enabled medical devices",
        operator: "the FDA",
        listName: "FDA list of AI-enabled medical devices",
        schedule: "35 5 * * *",
        licence: "Public domain (fda.gov: content may be republished freely)",
      },
    ] as const;

    it.each(SHEETS)(
      "$id is a mirror in ai_specific that is out of date after 48 hours and withdraws a record it no longer lists",
      ({ id, name, operator, listName, schedule, licence }) => {
        const definition = vrdbSourceOf(id);

        expect(isMirror(definition)).toBe(true);
        expect(definition).toMatchObject({
          id,
          name,
          operator,
          listName,
          category: "ai_specific",
          mode: "mirror",
          schedule,
          staleAfterHours: 48,
          licence,
          missingStatus: "withdrawn",
        });
      },
    );

    it("holds the attribution of each list that has a fixed one, word for word", () => {
      expect(vrdbSourceOf("aiid").attribution).toBe(
        "AI Incident Database, Responsible AI Collaborative (incidentdatabase.ai), CC BY-SA 4.0. Adapted by VerifyWise; the adapted records are shared under CC BY-SA 4.0.",
      );
      expect(vrdbSourceOf("nhtsa_sgo").attribution).toBe(
        "NHTSA Standing General Order crash reports, US Department of Transportation. Counted by VerifyWise; NHTSA states the data may be incomplete or unverified.",
      );
      expect(vrdbSourceOf("fda_ai_devices").attribution).toBe(
        "FDA list of AI-enabled medical devices, US Food and Drug Administration",
      );
    });

    it("points to the page of each operator that publishes the list", () => {
      expect(vrdbSourceOf("aiid").documentationUrl).toBe(
        "https://incidentdatabase.ai/research/snapshots/",
      );
      expect(vrdbSourceOf("atlas").documentationUrl).toBe(
        "https://github.com/mitre-atlas/atlas-data",
      );
      // The paths of these two pages are marked "verify" in the sheets: the host is what is fixed.
      expect(new URL(vrdbSourceOf("nhtsa_sgo").documentationUrl).hostname).toBe("www.nhtsa.gov");
      expect(new URL(vrdbSourceOf("fda_ai_devices").documentationUrl).hostname).toBe("www.fda.gov");
    });

    it("keeps the AI Incident Database shut until its operator confirms in writing, or the product owner accepts the risk (Q29)", () => {
      expect(AIID_PERMISSION_GRANTED).toBe(false);
      expect(VRDB_GATES.Q29).toBe(AIID_PERMISSION_GRANTED);
      expect(vrdbSourceOf("aiid").gate).toBe("Q29");
      // The licence says why: the operator's confirmation is still awaited.
      expect(vrdbSourceOf("aiid").licence).toContain("awaits the operator's confirmation (Q29)");

      // Closed, it is neither scheduled nor looked up ...
      expect(idsOf(activeVrdbSources())).not.toContain("aiid");
      expect(idsOf(activeMirrors())).not.toContain("aiid");
      expect(idsOf(activeVrdbSources(CLOSED))).not.toContain("aiid");
      // ... and opening the gate makes it active, at its place in the table, and changes nothing else.
      expect(idsOf(activeVrdbSources({ ...VRDB_GATES, Q29: true }))).toEqual([
        "kev",
        "nvd",
        "sec",
        "ofac",
        "uk_sanctions",
        "eu_fsf",
        "cve",
        "csl",
        "aiid",
        "atlas",
        "nhtsa_sgo",
        "fda_ai_devices",
        "fda_device_recalls",
      ]);
      expect(idsOf(activeMirrors({ ...VRDB_GATES, Q29: true }))).toContain("aiid");
      expect(vrdbSourceOf("aiid").mode).toBe("mirror");
    });

    it("leaves the other three open: no gate, active with every gate closed", () => {
      for (const id of ["atlas", "nhtsa_sgo", "fda_ai_devices"] as const) {
        expect(vrdbSourceOf(id).gate).toBeUndefined();
        expect(idsOf(activeVrdbSources(CLOSED))).toContain(id);
        expect(idsOf(activeMirrors(CLOSED))).toContain(id);
      }
    });

    describe("the notice of the ATLAS case studies (Q32)", () => {
      const attributionIn = (year: number) =>
        `MITRE ATLAS™ case studies, Copyright 2021-${year} The MITRE Corporation, under the Apache License 2.0. Adapted by VerifyWise.`;

      afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
      });

      it("attributes the case studies to MITRE with the year of the day", () => {
        jest.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z") });
        expect(vrdbSourceOf("atlas").attribution).toBe(attributionIn(2026));
        expect(vrdbSourceOf("atlas").attribution).toContain(
          "Copyright 2021-2026 The MITRE Corporation",
        );
        expect(vrdbSourceOf("atlas").attribution).toContain("under the Apache License 2.0");
      });

      it.each([
        ["2026-12-31T23:30:00Z", 2026],
        ["2027-01-01T00:30:00Z", 2027],
      ])("at %s the attribution names %i, by the UTC clock and not the local one", (now, year) => {
        jest.useFakeTimers({ now: new Date(now) });
        // In whatever zone the process runs, the local year is 1999 here, so that only the UTC year can
        // be right.
        jest.spyOn(Date.prototype, "getFullYear").mockReturnValue(1999);
        expect(vrdbSourceOf("atlas").attribution).toBe(attributionIn(year));
      });

      it("reads the year at each use, so a process that runs over New Year writes the new one", () => {
        jest.useFakeTimers({ now: new Date("2026-12-31T23:59:59Z") });
        const source = vrdbSourceOf("atlas");
        expect(source.attribution).toBe(attributionIn(2026));
        jest.setSystemTime(new Date("2027-01-01T00:00:01Z"));
        expect(source.attribution).toBe(attributionIn(2027));
      });
    });
  });

  describe("the US Consolidated Screening List and the FDA device recalls (spec D2.19, D2.20, Q33, Q34)", () => {
    // The values of the csl and fda_device_recalls sheets of the rulings of 2026-11-07 as amended the
    // same day: the product reads ITA's downloadable file and not its Data API, so the attribution of
    // the csl row is the one for a file. The closing sentence of each list's records belongs to its
    // connector, whose tests pin it.
    const SHEETS = [
      {
        id: "csl",
        name: "US Consolidated Screening List",
        operator: "the International Trade Administration",
        listName: "US Consolidated Screening List",
        category: "legal_regulatory",
        schedule: "7 */6 * * *",
        missingStatus: "delisted",
        licence:
          "None published; a work of the US Government (17 U.S.C. §105) compiled by the International Trade Administration, whose developer terms allow services that search, display and analyze it; accepted on 2026-11-07 (Q33)",
        attribution:
          "This product uses data from the International Trade Administration's Consolidated Screening List but is not endorsed or certified by the International Trade Administration. Entries adapted by VerifyWise.",
        documentationUrl: "https://www.trade.gov/consolidated-screening-list",
      },
      {
        id: "fda_device_recalls",
        name: "FDA recalls of AI-enabled medical devices",
        operator: "the FDA",
        listName: "FDA device recall database",
        category: "ai_specific",
        schedule: "43 14 * * *",
        missingStatus: "withdrawn",
        licence:
          "CC0 1.0 (https://open.fda.gov/license/): openFDA's device recall records; the GMDN content of the openfda block is not used (Q34)",
        attribution:
          "FDA medical device recalls through openFDA, US Food and Drug Administration (CC0 1.0), joined by VerifyWise to the FDA list of AI-enabled medical devices.",
        documentationUrl: "https://open.fda.gov/apis/device/recall/",
      },
    ] as const;

    it.each(SHEETS)(
      "$id is a mirror in $category that is out of date after 48 hours, with the values of its sheet word for word",
      (sheet) => {
        const definition = vrdbSourceOf(sheet.id);

        expect(isMirror(definition)).toBe(true);
        // The whole definition: a field that the sheet does not name, a gate included, fails it.
        expect(definition).toEqual({ ...sheet, mode: "mirror", staleAfterHours: 48 });
      },
    );

    it("holds no gate for either list: both are active, and scheduled, with every gate closed", () => {
      for (const { id } of SHEETS) {
        expect(vrdbSourceOf(id).gate).toBeUndefined();
        expect(idsOf(activeVrdbSources(CLOSED))).toContain(id);
        expect(idsOf(activeMirrors(CLOSED))).toContain(id);
        expect(idsOf(activeMirrors())).toContain(id);
      }
    });

    it("attributes the screening list for the file that is read, not for ITA's Data API, and says that its entries are adapted", () => {
      const { attribution } = vrdbSourceOf("csl");

      expect(attribution).toContain(
        "International Trade Administration's Consolidated Screening List",
      );
      // The terms of the Data API ask for another sentence; this product reads the downloadable file.
      expect(attribution).not.toContain("Data API");
      // The terms bar a change of content that still names ITA as its source: every record is adapted.
      expect(attribution).toMatch(/Entries adapted by VerifyWise\.$/);
    });

    it.each([
      ["csl", "legal_regulatory", 2],
      ["fda_device_recalls", "ai_specific", 3],
    ] as const)(
      "serves %s in %s, %i records a run, as official and weak (R3, R4, R8 of 2026-11-07)",
      (id, category, records) => {
        expect(RECORD_CATEGORY[id]).toBe(category);
        expect(MAX_RECORDS[id]).toBe(records);
        // Both are a government's own records found by a name: the class labels the publisher, and a
        // name alone is a weak match (a website or an LEI of a screening-list entry is a strong key).
        expect(classifyRecord(id).category).toBe("official");
        expect(recordMatchOf(id)).toBe("weak");
      },
    );
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
