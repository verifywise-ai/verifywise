/**
 * The lists the vendor risk database holds (spec D4.1, Rulings 1 and 5 of the M1 plan): who
 * publishes each, how the database gets it (a copy of the whole list on a schedule, or, read
 * through, the answers of the database for a vendor's key, kept for a few hours), under which
 * licence, and the attribution a page that shows its records must carry. A copy or an answer is
 * out of date 48 hours after its last success (192 hours for a list that is copied weekly). A list
 * behind a closed gate (gates.ts) is defined here but neither copied nor looked up.
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
      "CC0 1.0 (https://open.fda.gov/license/): openFDA's device recall records and, for their class and classification day only, its device enforcement reports; the GMDN content of the openfda block is not used (Q34, Q37)",
    attribution:
      "FDA medical device recalls and enforcement reports through openFDA, US Food and Drug Administration (CC0 1.0), joined by VerifyWise to the FDA list of AI-enabled medical devices. Data provided by the U.S. Food and Drug Administration (https://open.fda.gov).",
    documentationUrl: "https://open.fda.gov/apis/device/recall/",
    missingStatus: "withdrawn",
  },
  {
    id: "canada_sema",
    name: "Consolidated Canadian Autonomous Sanctions List",
    operator: "Global Affairs Canada",
    listName: "Consolidated Canadian Autonomous Sanctions List",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "2 1 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada), through the open.canada.ca dataset record ab076f2e-94b1-4039-bb3d-58002deb826d, which lists sema-lmes.xml as its resource; entities only (individuals and ships are not copied: the licence does not cover personal information); decided on delegation on 2026-11-10 (Q46)",
    attribution:
      "Contains information licensed under the Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada). Source: Global Affairs Canada, Consolidated Canadian Autonomous Sanctions List. Not endorsed by the Government of Canada. Entries adapted by VerifyWise.",
    documentationUrl:
      "https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx?lang=eng",
    missingStatus: "delisted",
  },
  {
    id: "california_breaches",
    name: "California Attorney General data breach list",
    operator: "the California Department of Justice, Office of the Attorney General",
    listName: "California Attorney General data breach list",
    category: "security_incidents",
    mode: "mirror",
    schedule: "12 7 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "Considered in the public domain; may be distributed or copied as permitted by law (https://oag.ca.gov/conditions): the Department's own list only (organisation, breach dates, reported date), never the sample notices, which the breached organisations wrote; the conditions page gives no warranty of accuracy and implies no endorsement; person-named practices are not copied; decided on delegation on 2026-11-10 (Q50)",
    attribution:
      "Source: State of California Department of Justice, Office of the Attorney General, data security breach list. Not endorsed by the Department. Entries adapted by VerifyWise.",
    documentationUrl: "https://oag.ca.gov/privacy/databreach/list",
    missingStatus: "withdrawn",
  },
  {
    id: "uk_ofsi",
    name: "UK OFSI financial sanctions enforcement notices",
    operator: "the Office of Financial Sanctions Implementation (HM Treasury)",
    listName: "UK OFSI financial sanctions enforcement notices",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "18 10 * * 3",
    staleAfterHours: 192,
    licence:
      "Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): the GOV.UK search metadata of OFSI's penalty and disclosure notices (title, short description, date); personal data excluded (Q52)",
    attribution:
      "UK Office of Financial Sanctions Implementation (HM Treasury) enforcement notices, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise; no endorsement by HM Treasury is implied.",
    documentationUrl:
      "https://www.gov.uk/government/collections/enforcement-of-financial-sanctions",
    missingStatus: "withdrawn",
  },
  {
    id: "charlotin",
    name: "AI Hallucination Cases database",
    operator: "Damien Charlotin (HEC Paris), the database's author",
    listName: "AI Hallucination Cases database",
    category: "ai_specific",
    mode: "mirror",
    schedule: "25 15 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), stated on the database page and in the export's x-license and link headers; the site's Content-Signal ai-train=no is honoured: the data never trains or fine-tunes a model (Q39)",
    attribution:
      "AI Hallucination Cases Database, Damien Charlotin, https://www.damiencharlotin.com/hallucinations/. Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Counted and adapted by VerifyWise; not endorsed by its author.",
    documentationUrl: "https://www.damiencharlotin.com/hallucinations/",
    missingStatus: "withdrawn",
  },
  {
    id: "ftc_penalties",
    name: "FTC civil penalty cases",
    operator: "the US Federal Trade Commission",
    listName: "FTC civil penalty case list",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "55 4 * * 2",
    staleAfterHours: 192,
    licence:
      "CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/), as FTC's data.json states for the dataset 'FTC Bureau of Consumer Protection Penalty Actions'; FTC website policy: attribution where feasible, no implied endorsement, the FTC seal not used; names of natural persons are not copied",
    attribution:
      "Source: United States Federal Trade Commission, www.ftc.gov (consumer protection civil penalty cases, CC0 1.0). Not endorsed by the FTC. Entries adapted by VerifyWise.",
    documentationUrl: "https://www.ftc.gov/data.json",
    missingStatus: "withdrawn",
  },
  {
    id: "piperoll",
    name: "PipeRoll Agent Incident Registry",
    operator: "PipeRoll, an independent registry kept by one editor",
    listName: "PipeRoll Agent Incident Registry",
    category: "ai_specific",
    mode: "mirror",
    schedule: "21 11 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): the registry's incident records and exports, per its incidents/LICENSE (the repository's MIT licence covers the tooling only); the AIID cross-references (aiid_incident_id) are not used; accepted on 2026-11-10 (Q38)",
    attribution:
      "PipeRoll Agent Incident Registry (piperoll.org), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); each record cites the PIR ids of the entries it shows and links the newest entry. Adapted by VerifyWise: titles shortened and edited, entries counted; not endorsed by PipeRoll.",
    documentationUrl: "https://piperoll.org/data/",
    missingStatus: "withdrawn",
  },
  {
    id: "eu_dg_comp",
    name: "European Commission competition cases",
    operator: "the European Commission (DG Competition)",
    listName: "European Commission antitrust, cartel and DMA case data",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "51 17 * * 1",
    staleAfterHours: 192,
    licence:
      "Commission reuse notice (Decision 2011/833/EU); CC BY 4.0 per the Commission's legal notice (https://commission.europa.eu/legal-notice_en): the antitrust, cartel and DMA case files of DG Competition's open data only (no merger, state-aid or foreign-subsidy file, no attachment, press release or timeline text); person-shaped names of non-cartel antitrust cases dropped; accepted on delegation on 2026-11-10 (Q45)",
    attribution:
      "Source: European Commission, DG Competition case data (open data), (c) European Union, reused under the Commission reuse notice (CC BY 4.0). Changes made by VerifyWise.",
    documentationUrl:
      "https://competition-policy.ec.europa.eu/about/news/dg-competitions-case-data-available-open-data-2025-03-18_en",
    missingStatus: "withdrawn",
  },
  {
    id: "disclose_io",
    name: "disclose.io program list",
    operator: "disclose.io (the community-maintained diodb repository)",
    listName: "disclose.io vulnerability disclosure program list",
    category: "security_incidents",
    mode: "mirror",
    schedule: "8 20 * * 6",
    staleAfterHours: 192,
    licence:
      "CC0 1.0 per the diodb LICENSE file (GitHub: CC0-1.0); the README's License section says CC BY 4.0, so the list is attributed as CC BY 4.0 requires; contact e-mails and contact URLs are not copied; decided on delegation on 2026-11-10 (Q49)",
    attribution:
      "disclose.io diodb (https://github.com/disclose/diodb), CC0 1.0 per its LICENSE, attributed as CC BY 4.0 per its README. Entries are community contributions; adapted by VerifyWise.",
    documentationUrl: "https://github.com/disclose/diodb",
    missingStatus: "withdrawn",
  },
  {
    id: "uk_cma",
    name: "UK Competition and Markets Authority cases",
    operator: "the Competition and Markets Authority",
    listName: "UK Competition and Markets Authority cases",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "16 8 * * 2",
    staleAfterHours: 192,
    licence:
      "Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): the GOV.UK search metadata of the CMA case pages (title, case type, state, outcome, dates); case documents, party submissions and personal data are excluded (Q52)",
    attribution:
      "UK Competition and Markets Authority cases, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise (party names extracted from case titles and cases counted); no endorsement by the Competition and Markets Authority is implied.",
    documentationUrl: "https://www.gov.uk/cma-cases",
    missingStatus: "withdrawn",
  },
  {
    id: "canada_ai_register",
    name: "Government of Canada AI Register",
    operator: "the Treasury Board of Canada Secretariat",
    listName: "Government of Canada AI Register",
    category: "ai_specific",
    mode: "mirror",
    schedule: "31 20 * * 1",
    staleAfterHours: 192,
    licence:
      "Open Government Licence - Canada 2.0 (https://open.canada.ca/en/open-government-licence-canada): the dataset record's licence (ca-ogl-lgo); personal information, third-party rights and official symbols are outside it and are not used; accepted on 2026-11-10 (Q40)",
    attribution:
      "Contains information licensed under the Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada). Source: Government of Canada AI Register (Minimum Viable Product), Treasury Board of Canada Secretariat. Adapted by VerifyWise; not endorsed by the Government of Canada.",
    documentationUrl: "https://open.canada.ca/data/en/dataset/fcbc0200-79ba-4fa4-94a6-00e32facea6b",
    missingStatus: "withdrawn",
  },
  {
    id: "ftc_competition",
    name: "FTC nonmerger enforcement actions",
    operator: "the US Federal Trade Commission",
    listName: "FTC nonmerger enforcement action list",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "57 4 * * 4",
    staleAfterHours: 192,
    licence:
      "CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/), as FTC's data.json and catalog.data.gov state for 'FTC Nonmerger Enforcement Actions'; FTC website policy: attribution where feasible, no implied endorsement, the FTC seal not used",
    attribution:
      "Source: United States Federal Trade Commission, www.ftc.gov (nonmerger enforcement actions, CC0 1.0). Not endorsed by the FTC. Parties read from the matter titles and entries adapted by VerifyWise.",
    documentationUrl: "https://catalog.data.gov/dataset/ftc-nonmerger-enforcement-actions",
    missingStatus: "withdrawn",
  },
  {
    id: "omb_ai_inventory",
    name: "US federal AI use case inventory",
    operator: "the US Office of Management and Budget",
    listName: "US federal AI use case inventory",
    category: "ai_specific",
    mode: "mirror",
    schedule: "33 21 * * 2",
    staleAfterHours: 192,
    licence:
      "None published; a work of the US Government (17 U.S.C. §105) compiled by the Office of Management and Budget from the agencies' public inventories; contact_email and the agencies' and contractors' free text are not used; accepted on 2026-11-10 in the way of Q31 and Q33 (Q41)",
    attribution:
      "Source: US Office of Management and Budget, 2025 Federal Agency AI Use Case Inventory (compiled from agencies' public inventories). Entries adapted by VerifyWise; not endorsed by OMB.",
    documentationUrl: "https://github.com/ombegov/2025-Federal-Agency-AI-Use-Case-Inventory",
    missingStatus: "withdrawn",
  },
  {
    id: "co_sic_penalties",
    name: "Colombia SIC consumer protection sanctions",
    operator: "Colombia's Superintendencia de Industria y Comercio (SIC)",
    listName: "Colombia SIC consumer protection sanctions list",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "4 3 * * 3",
    staleAfterHours: 192,
    licence:
      "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), as datos.gov.co states for dataset 73dx-n59j; MinTIC portal terms: cite 'Fuente: Portal de Datos Abiertos www.datos.gov.co' with the data's update date and do not distort the meaning; rows naming natural persons are not copied; adapted records are shared under CC BY-SA 4.0; decided on delegation on 2026-11-10 (Q47)",
    attribution:
      "Fuente: Portal de Datos Abiertos www.datos.gov.co (Superintendencia de Industria y Comercio, consumer protection sanctions), CC BY-SA 4.0. Adapted by VerifyWise; the adapted records are shared under CC BY-SA 4.0.",
    documentationUrl: "https://www.datos.gov.co/d/73dx-n59j",
    missingStatus: "withdrawn",
  },
  {
    id: "uk_atrs",
    name: "UK Algorithmic Transparency Recording Standard records",
    operator: "the Cabinet Office (GOV.UK), for the public bodies that publish the records",
    listName: "UK Algorithmic Transparency Records",
    category: "ai_specific",
    mode: "mirror",
    schedule: "14 5 * * 1",
    staleAfterHours: 192,
    licence:
      "Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): GOV.UK states that all its content is available under the OGL v3.0 except where otherwise stated, and no record states otherwise; records by bodies that are not Crown bodies (local authorities, 13 of 155) rely on that statement; contact e-mail addresses, named officials, linked documents and logos are excluded; accepted on 2026-11-10 (Q51)",
    attribution:
      "UK Algorithmic Transparency Recording Standard records, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise (supplier names extracted and records counted); no endorsement by the Cabinet Office or the publishing bodies is implied.",
    documentationUrl: "https://www.gov.uk/algorithmic-transparency-records",
    missingStatus: "withdrawn",
  },
  {
    id: "nhtsa_recalls",
    name: "NHTSA vehicle and equipment recalls",
    operator: "NHTSA",
    listName: "NHTSA recalls file",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "3 9 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "Public Domain U.S. Government (DOT data catalogue tag on NHTSA's dataset); a work of the US Government (17 U.S.C. §105), accepted in the way of Q31 on 2026-11-10; the manufacturer-supplied fields 25 to 27 and the Part 573 texts are not used (Q36)",
    attribution:
      "Source: US National Highway Traffic Safety Administration, recalls flat file. Not endorsed by NHTSA. Entries adapted by VerifyWise.",
    documentationUrl: "https://www.nhtsa.gov/nhtsa-datasets-and-apis",
    missingStatus: "withdrawn",
  },
  {
    id: "fmti",
    name: "Foundation Model Transparency Index",
    operator: "the Stanford Center for Research on Foundation Models (CRFM)",
    listName: "Foundation Model Transparency Index",
    category: "ai_specific",
    mode: "mirror",
    schedule: "45 21 * * 5",
    staleAfterHours: 192,
    licence:
      "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): the stanford-crfm/fmti repository's LICENSE.md (the README says CC-BY); the December 2025 scores file only; the transparency reports in the repository are not used; accepted on 2026-11-10 (Q44)",
    attribution:
      "Foundation Model Transparency Index (Bommasani, Klyman et al.), Stanford Center for Research on Foundation Models, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Indicators counted by VerifyWise from the published scores file; not endorsed by Stanford CRFM.",
    documentationUrl: "https://github.com/stanford-crfm/fmti",
    missingStatus: "withdrawn",
  },
  {
    id: "uk_mhra",
    name: "UK MHRA field safety notice lists",
    operator: "the Medicines and Healthcare products Regulatory Agency",
    listName: "UK MHRA field safety notice lists",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "22 22 * * 4",
    staleAfterHours: 192,
    licence:
      "Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): the MHRA's weekly field safety notice list pages on GOV.UK; the manufacturers' attached field safety notices (third-party documents) are not read or copied (Q52)",
    attribution:
      "UK Medicines and Healthcare products Regulatory Agency field safety notice lists, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise (entries counted by manufacturer); no endorsement by the MHRA is implied.",
    documentationUrl: "https://www.gov.uk/drug-device-alerts",
    missingStatus: "withdrawn",
  },
  {
    id: "nl_algoritmeregister",
    name: "Dutch Algorithm Register",
    operator:
      "the Dutch Ministry of the Interior and Kingdom Relations (the publishing public bodies write the descriptions)",
    listName: "Dutch Algorithm Register",
    category: "ai_specific",
    mode: "mirror",
    schedule: "37 22 * * 3",
    staleAfterHours: 192,
    licence:
      "No named licence: reuse permitted by the register's copyright page (https://algoritmes.overheid.nl/nl/footer/copyright: 'De inhoud van deze website mag worden hergebruikt'); the EUPL-1.2 covers only the register's code; contact fields not used; accepted on 2026-11-10 as a new precedent, pending the owner's confirmation (Q42)",
    attribution:
      "Bron: Algoritmeregister van de Nederlandse overheid (algoritmes.overheid.nl); each record names up to three of the public bodies that published the descriptions it counts and links the register's search, which lists them all. Entries adapted by VerifyWise; not endorsed by the Dutch government.",
    documentationUrl: "https://algoritmes.overheid.nl/api-docs",
    missingStatus: "withdrawn",
  },
  {
    id: "nhtsa_odi",
    name: "NHTSA defect investigations",
    operator: "NHTSA",
    listName: "NHTSA defect investigations file",
    category: "legal_regulatory",
    mode: "mirror",
    schedule: "1 10 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "Public Domain U.S. Government (DOT data catalogue tag on NHTSA's dataset); a work of the US Government (17 U.S.C. §105), accepted in the way of Q31 on 2026-11-10 (Q35)",
    attribution:
      "Source: US National Highway Traffic Safety Administration, Office of Defects Investigation (defect investigations flat file). Not endorsed by NHTSA. Entries adapted by VerifyWise.",
    documentationUrl: "https://www.nhtsa.gov/nhtsa-datasets-and-apis",
    missingStatus: "withdrawn",
  },
  {
    id: "fedramp",
    name: "FedRAMP Marketplace",
    operator: "the US General Services Administration (FedRAMP)",
    listName: "FedRAMP Marketplace data",
    category: "certifications",
    mode: "mirror",
    schedule: "6 19 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "None published; a work of the US General Services Administration (17 U.S.C. §105) in GSA's FedRAMP/marketplace-fedramp-gov-data repository: only GSA's status fields are copied (provider, offering, status and its date, impact level, authorisation type, agency count, UEI); the host of each offering's website is used as a match key only and never shown; logos, provider descriptions and contact data are not copied; decided on delegation on 2026-11-10 (Q48)",
    attribution:
      "Source: US General Services Administration, FedRAMP Marketplace data. Not endorsed by GSA or FedRAMP. Entries adapted by VerifyWise.",
    documentationUrl: "https://github.com/FedRAMP/marketplace-fedramp-gov-data",
    missingStatus: "delisted",
  },
  {
    id: "epoch_ai",
    name: "Epoch AI Data on AI Models",
    operator: "Epoch AI",
    listName: "Epoch AI Data on AI Models",
    category: "ai_specific",
    mode: "mirror",
    schedule: "39 23 * * 4",
    staleAfterHours: 192,
    licence:
      "Creative Commons Attribution (Epoch AI's data pages: 'free to use, distribute, and reproduce provided the source and authors are credited'; version 4.0 on the AI companies page, unstated on the AI models documentation): the AI models dataset; accepted on 2026-11-10 (Q43)",
    attribution:
      "Epoch AI, 'Data on AI models', published online at epoch.ai (https://epoch.ai/data/ai-models-documentation), under the Creative Commons Attribution licence. Counted and adapted by VerifyWise; not endorsed by Epoch AI.",
    documentationUrl: "https://epoch.ai/data/ai-models-documentation",
    missingStatus: "withdrawn",
  },
  {
    id: "c2pa_conforming",
    name: "C2PA Conforming Products List",
    operator: "the Coalition for Content Provenance and Authenticity (C2PA)",
    listName: "C2PA Conforming Products List",
    category: "certifications",
    mode: "mirror",
    schedule: "49 16 * * *",
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): the c2pa-org/conformance-public repository's LICENSE; the C2PA name and marks are not licensed and are used only to name the source",
    attribution:
      "C2PA Conforming Products List, c2pa-org/conformance-public repository, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Adapted by VerifyWise; not endorsed by the C2PA.",
    documentationUrl: "https://github.com/c2pa-org/conformance-public",
    missingStatus: "withdrawn",
  },
  {
    id: "gleif",
    name: "GLEIF LEI records",
    operator: "the Global Legal Entity Identifier Foundation",
    listName: "GLEIF LEI records",
    category: "financial_health",
    mode: "read_through",
    ttlHours: 24,
    staleAfterHours: STALE_AFTER_HOURS,
    licence:
      "CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) under GLEIF's LEI Data Terms of Use (https://www.gleif.org/en/meta/lei-data-terms-of-use): access only through GLEIF's access services, no claim of rights in LEI data, and no statement that implies that VerifyWise or its products are provided, supported, authorised or associated by or with GLEIF (liquidated damages of CHF 100,000 per case of non-compliance); accepted on 2026-11-10 (Q53)",
    attribution:
      "GLEIF LEI data (CC0 1.0), from the Global Legal Entity Identifier Foundation's API. VerifyWise is not associated with GLEIF, and GLEIF does not provide, support, authorise or endorse VerifyWise or its products.",
    documentationUrl: "https://www.gleif.org/en/lei-data/gleif-api",
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
