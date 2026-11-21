/**
 * The marks of the 23 lists that the vendor risk database added on 2026-11-10: what the text of a
 * record of a list begins with (spec D4.14). Four places say
 * the same name: the constant that the connector of a list exports, the name that the verifier is
 * told for a record of the list (`VERIFIER_DATABASE_NAMES`), the name of the list in its definition
 * in sources.ts, and the table of this file, which is written out here as its own pin, so that a
 * change in any one of them moves this test. No mark begins another: the analysis prompt tells the
 * model "a source whose text begins with the name of ...", and a text that begins with one mark must
 * not begin with another.
 */
import {
  RECORD_SOURCE_IDS,
  type VrdbSourceId,
} from "../../../../domain.layer/interfaces/i.vendorResearch";
import { CHANGE_MARK } from "../../policySnapshots";
import { VERIFIER_DATABASE_NAMES } from "../../prompts";
import { C2PA_CONFORMING_RECORD_MARK } from "../connectors/c2paConforming";
import { CALIFORNIA_BREACHES_RECORD_MARK } from "../connectors/californiaBreaches";
import { CANADA_AI_REGISTER_RECORD_MARK } from "../connectors/canadaAiRegister";
import { CANADA_SEMA_RECORD_MARK } from "../connectors/canadaSema";
import { CHARLOTIN_RECORD_MARK } from "../connectors/charlotin";
import { CO_SIC_PENALTIES_RECORD_MARK } from "../connectors/coSicPenalties";
import { DISCLOSE_IO_RECORD_MARK } from "../connectors/discloseIo";
import { EPOCH_AI_RECORD_MARK } from "../connectors/epochAi";
import { EU_DG_COMP_RECORD_MARK } from "../connectors/euDgComp";
import { FEDRAMP_RECORD_MARK } from "../connectors/fedramp";
import { FMTI_RECORD_MARK } from "../connectors/fmti";
import { FTC_COMPETITION_RECORD_MARK } from "../connectors/ftcCompetition";
import { FTC_PENALTIES_RECORD_MARK } from "../connectors/ftcPenalties";
import { GLEIF_RECORD_MARK } from "../connectors/gleif";
import { NHTSA_ODI_RECORD_MARK } from "../connectors/nhtsaOdi";
import { NHTSA_RECALLS_RECORD_MARK } from "../connectors/nhtsaRecalls";
import { NL_ALGORITMEREGISTER_RECORD_MARK } from "../connectors/nlAlgoritmeregister";
import { OMB_AI_INVENTORY_RECORD_MARK } from "../connectors/ombAiInventory";
import { PIPEROLL_RECORD_MARK } from "../connectors/piperoll";
import { UK_ATRS_RECORD_MARK } from "../connectors/ukAtrs";
import { UK_CMA_RECORD_MARK } from "../connectors/ukCma";
import { UK_MHRA_RECORD_MARK } from "../connectors/ukMhra";
import { UK_OFSI_RECORD_MARK } from "../connectors/ukOfsi";
import { VRDB_SOURCES } from "../sources";

type List = readonly [
  id: VrdbSourceId,
  /** The constant that the connector of the list exports. */
  constant: string,
  /** The mark, as this table gives it. */
  mark: string,
  /**
   * The field of the definition in sources.ts that holds the mark: the `name` of every list but
   * uk_atrs, whose `name` is a longer one and whose `listName` is its mark.
   */
  field: "name" | "listName",
];

const NEW_LISTS: readonly List[] = [
  [
    "canada_sema",
    CANADA_SEMA_RECORD_MARK,
    "Consolidated Canadian Autonomous Sanctions List",
    "name",
  ],
  ["charlotin", CHARLOTIN_RECORD_MARK, "AI Hallucination Cases database", "name"],
  ["piperoll", PIPEROLL_RECORD_MARK, "PipeRoll Agent Incident Registry", "name"],
  ["eu_dg_comp", EU_DG_COMP_RECORD_MARK, "European Commission competition cases", "name"],
  ["ftc_penalties", FTC_PENALTIES_RECORD_MARK, "FTC civil penalty cases", "name"],
  ["ftc_competition", FTC_COMPETITION_RECORD_MARK, "FTC nonmerger enforcement actions", "name"],
  ["uk_cma", UK_CMA_RECORD_MARK, "UK Competition and Markets Authority cases", "name"],
  ["uk_ofsi", UK_OFSI_RECORD_MARK, "UK OFSI financial sanctions enforcement notices", "name"],
  [
    "co_sic_penalties",
    CO_SIC_PENALTIES_RECORD_MARK,
    "Colombia SIC consumer protection sanctions",
    "name",
  ],
  ["nhtsa_recalls", NHTSA_RECALLS_RECORD_MARK, "NHTSA vehicle and equipment recalls", "name"],
  ["nhtsa_odi", NHTSA_ODI_RECORD_MARK, "NHTSA defect investigations", "name"],
  ["uk_mhra", UK_MHRA_RECORD_MARK, "UK MHRA field safety notice lists", "name"],
  [
    "california_breaches",
    CALIFORNIA_BREACHES_RECORD_MARK,
    "California Attorney General data breach list",
    "name",
  ],
  [
    "canada_ai_register",
    CANADA_AI_REGISTER_RECORD_MARK,
    "Government of Canada AI Register",
    "name",
  ],
  ["omb_ai_inventory", OMB_AI_INVENTORY_RECORD_MARK, "US federal AI use case inventory", "name"],
  ["nl_algoritmeregister", NL_ALGORITMEREGISTER_RECORD_MARK, "Dutch Algorithm Register", "name"],
  ["uk_atrs", UK_ATRS_RECORD_MARK, "UK Algorithmic Transparency Records", "listName"],
  ["epoch_ai", EPOCH_AI_RECORD_MARK, "Epoch AI Data on AI Models", "name"],
  ["fmti", FMTI_RECORD_MARK, "Foundation Model Transparency Index", "name"],
  ["c2pa_conforming", C2PA_CONFORMING_RECORD_MARK, "C2PA Conforming Products List", "name"],
  ["fedramp", FEDRAMP_RECORD_MARK, "FedRAMP Marketplace", "name"],
  ["disclose_io", DISCLOSE_IO_RECORD_MARK, "disclose.io program list", "name"],
  ["gleif", GLEIF_RECORD_MARK, "GLEIF LEI records", "name"],
];

/** The 16 databases that had a name for the verifier before the 23 lists of 2026-11-10. */
const EARLIER_IDS: readonly string[] = [
  "kev",
  "nvd",
  "hibp",
  "sec",
  "statuspage",
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
];

/** The other words that the text of a source begins with (Status page of the vendor, Page change). */
const OTHER_BEGINNINGS: readonly string[] = ["Status page", CHANGE_MARK];

/** A mark as the beginnings are compared: in lower case, with every run of white space as one blank. */
const compact = (text: string): string => text.replace(/\s+/g, " ").trim().toLowerCase();

/** The pairs of `marks` of which the first is the beginning of the second (or equal to it). */
function beginnings(marks: readonly string[]): string[] {
  const kept = marks.map(compact);
  const pairs: string[] = [];
  kept.forEach((mark, at) =>
    kept.forEach((other, to) => {
      if (at !== to && other.startsWith(mark)) pairs.push(`${marks[at]} | ${marks[to]}`);
    }),
  );
  return pairs;
}

describe("the marks of the lists of 2026-11-10", () => {
  it("has a row for each of the 23 lists that came after the 16 named before, and for no other", () => {
    const ids = NEW_LISTS.map(([id]) => id);

    expect(ids).toHaveLength(23);
    expect(new Set(ids).size).toBe(23);
    expect([...EARLIER_IDS, ...ids].sort()).toEqual([...RECORD_SOURCE_IDS].sort());
  });

  it.each(NEW_LISTS)(
    "%s: the constant of its connector is the mark of the table",
    (_id, constant, mark) => {
      expect(constant).toBe(mark);
    },
  );

  it.each(NEW_LISTS)("%s: the verifier is told the same name", (id, _constant, mark) => {
    expect(VERIFIER_DATABASE_NAMES[id]).toBe(mark);
  });

  it.each(NEW_LISTS)(
    "%s: its definition in sources.ts names the list by the mark",
    (id, _constant, mark, field) => {
      const definition = VRDB_SOURCES.find((source) => source.id === id);

      expect(definition).toBeDefined();
      expect(definition?.[field]).toBe(mark);
    },
  );

  it("gives the 23 lists marks that are pairwise different, compared in lower case and with white space collapsed", () => {
    const marks = NEW_LISTS.map(([, , mark]) => compact(mark));

    expect(new Set(marks).size).toBe(23);
  });

  it("has no mark among the 39 databases that the verifier is told that is the beginning of another", () => {
    const marks = Object.values(VERIFIER_DATABASE_NAMES);

    expect(marks).toHaveLength(39);
    expect(beginnings(marks)).toEqual([]);
  });

  it("has no mark of the 23 lists that begins like, or is begun by, the other words that a source text begins with", () => {
    const marks = NEW_LISTS.map(([, , mark]) => mark);

    expect(beginnings([...marks, ...OTHER_BEGINNINGS])).toEqual([]);
  });

  describe("the comparison of beginnings", () => {
    it("finds a mark that begins another, whatever the case and the white space", () => {
      expect(beginnings(["FTC civil penalty cases", "ftc  CIVIL penalty\tcases of 2026"])).toEqual([
        "FTC civil penalty cases | ftc  CIVIL penalty\tcases of 2026",
      ]);
    });

    it("finds two marks that are equal", () => {
      expect(beginnings(["FedRAMP Marketplace", "fedramp  marketplace"])).toHaveLength(2);
    });

    it("finds nothing in marks that only share their first words", () => {
      expect(
        beginnings(["NHTSA defect investigations", "NHTSA vehicle and equipment recalls"]),
      ).toEqual([]);
    });
  });
});
