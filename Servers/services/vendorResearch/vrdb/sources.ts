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
