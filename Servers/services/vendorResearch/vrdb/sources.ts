/**
 * The lists the vendor risk database holds (spec D4.1, Rulings 1 and 5 of the M1 plan): who
 * publishes each, how the database gets it (a copy of the whole list on a schedule, or, read
 * through, the answers of the database for a vendor's key, kept for a few hours), under which
 * licence, and the attribution a page that shows its records must carry. A copy or an answer is
 * out of date 48 hours after its last success. A list behind a closed gate (gates.ts) is defined
 * here but neither copied nor looked up.
 */
import type {
  ResearchCategory,
  VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import { VRDB_GATES, type VrdbGate } from "./gates";

interface SourceBase {
  id: VrdbSourceId;
  name: string;
  operator: string;
  /** The list's name in a sentence of the rationale: "the CISA KEV catalog". */
  listName: string;
  /** The category whose sources its records are. */
  category: ResearchCategory;
  staleAfterHours: number;
  licence: string;
  attribution: string;
  documentationUrl: string;
  /** The gate that keeps the list off until a person opens it; none: always on. */
  gate?: VrdbGate;
}

/** A list the job copies on its schedule. */
export interface MirrorSource extends SourceBase {
  mode: "mirror";
  /** When the job copies the list: a five-field cron, in UTC, each on a minute of its own. */
  schedule: string;
  /**
   * What a record becomes when the list no longer holds it; null for a list read by its changes
   * (the CVE records), whose records leave by a status of their own.
   */
  missingStatus: "withdrawn" | "delisted" | null;
}

/** A database asked at run time, whose answers are kept for a while. */
export interface ReadThroughSource extends SourceBase {
  mode: "read_through";
  /** How long an answer is kept before the database is asked again. */
  ttlHours: number;
}

export type VrdbSourceDefinition = MirrorSource | ReadThroughSource;

const STALE_AFTER_HOURS = 48;

/**
 * The CVE Usage paragraph of the CVE Terms of Use (https://www.cve.org/Legal/TermsOfUse), word for
 * word as the page prints it, with CVE™ and without a final newline (Q7). The Terms let anyone copy
 * the CVE records on one condition: that every copy reproduces MITRE's copyright designation and
 * this licence. So the cve row of vrdb_sources, which every record of the copy points to, holds the
 * paragraph whole. It is 411 characters, and a test pins its UTF-8 sha256: do not change a character.
 */
export const CVE_TERMS_LICENCE =
  "MITRE hereby grants you a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute Common Vulnerabilities and Exposures (CVE™). Any copy you make for such purposes is authorized provided that you reproduce MITRE's copyright designation and this license in any such copy.";

/** MITRE's copyright designation as cve.org prints it, to the given year (Q7). */
export const cveCopyrightOf = (year: number): string =>
  `Copyright © 1999-${year}, The MITRE Corporation`;

export const VRDB_SOURCES: readonly VrdbSourceDefinition[] = [
  {
    id: "kev",
    name: "CISA Known Exploited Vulnerabilities",
    operator: "CISA",
    listName: "CISA KEV catalog",
    category: "security_incidents",
    mode: "mirror",
    schedule: "23 * * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence: "CC0 1.0",
    attribution: "CISA Known Exploited Vulnerabilities catalog (CC0 1.0)",
    documentationUrl: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    missingStatus: "withdrawn",
  },
  {
    id: "nvd",
    name: "National Vulnerability Database",
    operator: "NIST",
    listName: "NVD",
    category: "security_incidents",
    mode: "read_through",
    ttlHours: 6,
    staleAfterHours: STALE_AFTER_HOURS,
    licence: "Public domain",
    attribution:
      "This product uses data from the NVD API but is not endorsed or certified by the NVD.",
    documentationUrl: "https://nvd.nist.gov/developers/vulnerabilities",
  },
  {
    id: "sec",
    name: "SEC EDGAR",
    operator: "SEC",
    listName: "SEC EDGAR filings",
    category: "security_incidents",
    mode: "read_through",
    ttlHours: 1,
    staleAfterHours: STALE_AFTER_HOURS,
    licence: "Free to reuse (SEC)",
    attribution: "SEC EDGAR, US Securities and Exchange Commission",
    documentationUrl: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
    gate: "Q4",
  },
  {
    id: "ofac",
    name: "OFAC Specially Designated Nationals list",
    operator: "OFAC",
    listName: "OFAC SDN list",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "41 */6 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "None published; a work of the US Government (17 U.S.C. §105); use accepted by the product owner on 2026-10-31 (Q5)",
    attribution: "OFAC Specially Designated Nationals list, US Department of the Treasury",
    documentationUrl: "https://sanctionslist.ofac.treas.gov/Home/static/sdn.html",
    missingStatus: "delisted",
  },
  {
    id: "uk_sanctions",
    name: "UK Sanctions List",
    operator: "FCDO",
    listName: "UK Sanctions List",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "47 */6 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence: "Open Government Licence v3.0",
    attribution:
      "UK Sanctions List, FCDO. Contains public sector information licensed under the Open Government Licence v3.0.",
    documentationUrl: "https://www.gov.uk/government/publications/the-uk-sanctions-list",
    missingStatus: "delisted",
  },
  {
    id: "eu_fsf",
    name: "EU consolidated list of financial sanctions",
    operator: "European Commission",
    listName: "EU financial sanctions list",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "53 */6 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence: "Commission reuse notice (Decision 2011/833/EU); CC BY 4.0",
    attribution: "EU consolidated list of financial sanctions, © European Union",
    documentationUrl:
      "https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions",
    missingStatus: "delisted",
  },
  {
    id: "cve",
    name: "CVE Program records",
    operator: "the CVE Program",
    listName: "CVE List",
    category: "security_incidents",
    mode: "mirror",
    schedule: "29 2 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence: `CVE Terms of Use (https://www.cve.org/Legal/TermsOfUse). CVE Usage: ${CVE_TERMS_LICENCE}`,
    // Read at each use and not once at start-up, so a process that runs over New Year writes the new
    // year at its next sync. cve.org writes the word mark as CVE™ and registers only the logo, so the
    // attribution carries no registered-mark sign.
    get attribution(): string {
      return `CVE records ${cveCopyrightOf(new Date().getUTCFullYear())}, under the CVE Terms of Use (https://www.cve.org/Legal/TermsOfUse)`;
    },
    documentationUrl: "https://github.com/CVEProject/cvelistV5",
    missingStatus: null,
    gate: "Q7",
  },
  {
    id: "un_sanctions",
    name: "UN Security Council Consolidated List",
    operator: "the UN Security Council",
    listName: "UN Security Council Consolidated List",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "59 */6 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence: "UN terms of use: personal, non-commercial use only (Q6)",
    attribution: "United Nations Security Council Consolidated List",
    documentationUrl: "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list",
    missingStatus: "delisted",
    gate: "Q6",
  },
  {
    id: "csl",
    name: "US Consolidated Screening List",
    operator: "the International Trade Administration",
    listName: "US Consolidated Screening List",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "7 */6 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "None published; a work of the US Government (17 U.S.C. §105) compiled by the International Trade Administration, whose developer terms allow services that search, display and analyze it; accepted on 2026-11-07 (Q33)",
    attribution:
      "This product uses data from the International Trade Administration's Consolidated Screening List but is not endorsed or certified by the International Trade Administration. Entries adapted by VerifyWise.",
    documentationUrl: "https://www.trade.gov/consolidated-screening-list",
    missingStatus: "delisted",
  },
  {
    id: "aiid",
    name: "AI Incident Database",
    operator: "the Responsible AI Collaborative",
    listName: "AI Incident Database",
    category: "ai_specific",
    mode: "mirror",
    schedule: "11 4 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/): the incidents, entities and classifications collections of the AI Incident Database; report text, submissions and media excluded. Commercial use awaits the operator's confirmation (Q29).",
    attribution:
      "AI Incident Database, Responsible AI Collaborative (incidentdatabase.ai), CC BY-SA 4.0. Adapted by VerifyWise; the adapted records are shared under CC BY-SA 4.0.",
    documentationUrl: "https://incidentdatabase.ai/research/snapshots/",
    missingStatus: "withdrawn",
    gate: "Q29",
  },
  {
    id: "atlas",
    name: "MITRE ATLAS case studies",
    operator: "MITRE",
    listName: "MITRE ATLAS case studies",
    category: "ai_specific",
    mode: "mirror",
    schedule: "17 3 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0); the atlas-data repository's LICENSE (Q32).",
    // Read at each use, as the CVE's is, so that a process that runs over New Year writes the new
    // year at its next sync.
    get attribution(): string {
      return `MITRE ATLAS™ case studies, Copyright 2021-${new Date().getUTCFullYear()} The MITRE Corporation, under the Apache License 2.0. Adapted by VerifyWise.`;
    },
    documentationUrl: "https://github.com/mitre-atlas/atlas-data",
    missingStatus: "withdrawn",
  },
  {
    id: "nhtsa_sgo",
    name: "NHTSA Standing General Order crash reports",
    operator: "NHTSA",
    listName: "NHTSA Standing General Order crash reports",
    category: "ai_specific",
    mode: "mirror",
    schedule: "5 13 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "None published; a work of the US Government (17 U.S.C. §105); accepted on 2026-11-05 (Q31)",
    attribution:
      "NHTSA Standing General Order crash reports, US Department of Transportation. Counted by VerifyWise; NHTSA states the data may be incomplete or unverified.",
    documentationUrl:
      "https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting",
    missingStatus: "withdrawn",
  },
  {
    id: "fda_ai_devices",
    name: "FDA list of AI-enabled medical devices",
    operator: "the FDA",
    listName: "FDA list of AI-enabled medical devices",
    category: "ai_specific",
    mode: "mirror",
    schedule: "35 5 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence: "Public domain (fda.gov: content may be republished freely)",
    attribution: "FDA list of AI-enabled medical devices, US Food and Drug Administration",
    documentationUrl:
      "https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices",
    missingStatus: "withdrawn",
  },
  {
    id: "fda_device_recalls",
    name: "FDA recalls of AI-enabled medical devices",
    operator: "the FDA",
    // "the {listName} entry matches the vendor by name only": a recall is an entry of the FDA's
    // recall database, so the list reads as one in that sentence (the name is for the other lines).
    listName: "FDA device recall database",
    category: "ai_specific",
    mode: "mirror",
    schedule: "43 14 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "CC0 1.0 (https://open.fda.gov/license/): openFDA's device recall records; the GMDN content of the openfda block is not used (Q34)",
    attribution:
      "FDA medical device recalls through openFDA, US Food and Drug Administration (CC0 1.0), joined by VerifyWise to the FDA list of AI-enabled medical devices.",
    documentationUrl: "https://open.fda.gov/apis/device/recall/",
    missingStatus: "withdrawn",
  },
];

/** The lists whose gate is open, or that have none, in the order above. `gates` is for the tests. */
export const activeVrdbSources = (
  gates: Readonly<Record<VrdbGate, boolean>> = VRDB_GATES,
): VrdbSourceDefinition[] =>
  VRDB_SOURCES.filter((source) => source.gate === undefined || gates[source.gate]);

/** True for a list the job copies. */
export const isMirror = (source: VrdbSourceDefinition): source is MirrorSource =>
  source.mode === "mirror";

/** The active lists the job copies. */
export const activeMirrors = (gates?: Readonly<Record<VrdbGate, boolean>>): MirrorSource[] =>
  activeVrdbSources(gates).filter(isMirror);

/** The active databases asked at run time. */
export const activeReadThroughs = (
  gates?: Readonly<Record<VrdbGate, boolean>>,
): ReadThroughSource[] =>
  activeVrdbSources(gates).filter(
    (source): source is ReadThroughSource => source.mode === "read_through",
  );

/** The definition of a list. */
export function vrdbSourceOf(id: VrdbSourceId): VrdbSourceDefinition {
  const found = VRDB_SOURCES.find((source) => source.id === id);
  if (found === undefined) throw new Error(`Unknown VRDB source: ${id}`);
  return found;
}

/** True when the copy of a list is out of date: never made, or older than its limit. */
export function isStale(
  definition: VrdbSourceDefinition,
  lastSuccessAt: Date | null,
  now: Date,
): boolean {
  if (lastSuccessAt === null) return true;
  return now.getTime() - lastSuccessAt.getTime() > definition.staleAfterHours * 3_600_000;
}
