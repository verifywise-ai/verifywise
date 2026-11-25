/**
 * The lists the vendor risk database mirrors (spec D4, Rulings 1 and 5 of the M1 plan): one
 * definition per VRDB id, with its licence and when its copy is out of date (a bundled list 60 days
 * after its bundle was built, a database read through after its own hours); a list behind a closed
 * gate (gates.ts) is neither bundled nor looked up. The four AI-specific lists
 * (spec D2.14 to D2.17) are pinned against the sheets of the rulings of 2026-11-05, and the US
 * Consolidated Screening List and the FDA device recalls (spec D2.19, D2.20) against the sheets of
 * the rulings of 2026-11-07, as amended the same day. The 23 lists added on 2026-11-10 are pinned
 * against their sheets below (their licences, attributions and statuses):
 * no expected value of theirs is read from the registry.
 */
import { createHash } from "crypto";
import {
  VRDB_SOURCE_IDS,
  type VrdbSourceId,
} from "../../../../domain.layer/interfaces/i.vendorResearch";
import { MAX_RECORDS, RECORD_CATEGORY } from "../../records/types";
import { classifyRecord, recordMatchOf } from "../../sourceRegistry/classify";
import { ATTESTATION_READERS } from "../attestations";
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
  BUNDLED_STALE_AFTER_HOURS,
  CVE_TERMS_LICENCE,
  type MirrorSource,
  type ReadThroughSource,
  VRDB_SOURCES,
  activeMirrors,
  activeReadThroughs,
  activeVrdbSources,
  coveredSources,
  cveCopyrightOf,
  isMirror,
  isStale,
  staleAfterHoursOf,
  vrdbSourceOf,
} from "../sources";

const CLOSED: Record<VrdbGate, boolean> = { Q4: false, Q6: false, Q7: false, Q29: false };
const OPEN: Record<VrdbGate, boolean> = { Q4: true, Q6: true, Q7: true, Q29: true };
const idsOf = (sources: ReadonlyArray<{ id: string }>) => sources.map((source) => source.id);

/** The 23 lists added on 2026-11-10, in the order of the registry. */
const NEW_IDS = [
  "canada_sema",
  "california_breaches",
  "uk_ofsi",
  "charlotin",
  "ftc_penalties",
  "piperoll",
  "eu_dg_comp",
  "disclose_io",
  "uk_cma",
  "canada_ai_register",
  "ftc_competition",
  "omb_ai_inventory",
  "co_sic_penalties",
  "uk_atrs",
  "nhtsa_recalls",
  "fmti",
  "uk_mhra",
  "nl_algoritmeregister",
  "nhtsa_odi",
  "fedramp",
  "epoch_ai",
  "c2pa_conforming",
  "gleif",
] as const;
/** The 22 of them that are copied: GLEIF is read through. */
const NEW_MIRROR_IDS = [
  "canada_sema",
  "california_breaches",
  "uk_ofsi",
  "charlotin",
  "ftc_penalties",
  "piperoll",
  "eu_dg_comp",
  "disclose_io",
  "uk_cma",
  "canada_ai_register",
  "ftc_competition",
  "omb_ai_inventory",
  "co_sic_penalties",
  "uk_atrs",
  "nhtsa_recalls",
  "fmti",
  "uk_mhra",
  "nl_algoritmeregister",
  "nhtsa_odi",
  "fedramp",
  "epoch_ai",
  "c2pa_conforming",
] as const;

/**
 * The values of the sheets of the 22 lists that are copied: the registry is built from them and no
 * value here is read from it.
 */
const NEW_SHEETS = [
  {
    id: "canada_sema",
    name: "Consolidated Canadian Autonomous Sanctions List",
    operator: "Global Affairs Canada",
    listName: "Consolidated Canadian Autonomous Sanctions List",
    category: "legal_regulatory",
    missingStatus: "delisted",
    documentationUrl:
      "https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx?lang=eng",
    licence:
      "Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada), through the open.canada.ca dataset record ab076f2e-94b1-4039-bb3d-58002deb826d, which lists sema-lmes.xml as its resource; entities only (individuals and ships are not copied: the licence does not cover personal information); decided on delegation on 2026-11-10 (Q46)",
    attribution:
      "Contains information licensed under the Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada). Source: Global Affairs Canada, Consolidated Canadian Autonomous Sanctions List. Not endorsed by the Government of Canada. Entries adapted by VerifyWise.",
  },
  {
    id: "california_breaches",
    name: "California Attorney General data breach list",
    operator: "the California Department of Justice, Office of the Attorney General",
    listName: "California Attorney General data breach list",
    category: "security_incidents",
    missingStatus: "withdrawn",
    documentationUrl: "https://oag.ca.gov/privacy/databreach/list",
    licence:
      "Considered in the public domain; may be distributed or copied as permitted by law (https://oag.ca.gov/conditions): the Department's own list only (organisation, breach dates, reported date), never the sample notices, which the breached organisations wrote; the conditions page gives no warranty of accuracy and implies no endorsement; person-named practices are not copied; decided on delegation on 2026-11-10 (Q50)",
    attribution:
      "Source: State of California Department of Justice, Office of the Attorney General, data security breach list. Not endorsed by the Department. Entries adapted by VerifyWise.",
  },
  {
    id: "uk_ofsi",
    name: "UK OFSI financial sanctions enforcement notices",
    operator: "the Office of Financial Sanctions Implementation (HM Treasury)",
    listName: "UK OFSI financial sanctions enforcement notices",
    category: "legal_regulatory",
    missingStatus: "withdrawn",
    documentationUrl:
      "https://www.gov.uk/government/collections/enforcement-of-financial-sanctions",
    licence:
      "Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): the GOV.UK search metadata of OFSI's penalty and disclosure notices (title, short description, date); personal data excluded (Q52)",
    attribution:
      "UK Office of Financial Sanctions Implementation (HM Treasury) enforcement notices, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise; no endorsement by HM Treasury is implied.",
  },
  {
    id: "charlotin",
    name: "AI Hallucination Cases database",
    operator: "Damien Charlotin (HEC Paris), the database's author",
    listName: "AI Hallucination Cases database",
    category: "ai_specific",
    missingStatus: "withdrawn",
    documentationUrl: "https://www.damiencharlotin.com/hallucinations/",
    licence:
      "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), stated on the database page and in the export's x-license and link headers; the site's Content-Signal ai-train=no is honoured: the data never trains or fine-tunes a model (Q39)",
    attribution:
      "AI Hallucination Cases Database, Damien Charlotin, https://www.damiencharlotin.com/hallucinations/. Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Counted and adapted by VerifyWise; not endorsed by its author.",
  },
  {
    id: "ftc_penalties",
    name: "FTC civil penalty cases",
    operator: "the US Federal Trade Commission",
    listName: "FTC civil penalty case list",
    category: "legal_regulatory",
    missingStatus: "withdrawn",
    documentationUrl: "https://www.ftc.gov/data.json",
    licence:
      "CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/), as FTC's data.json states for the dataset 'FTC Bureau of Consumer Protection Penalty Actions'; FTC website policy: attribution where feasible, no implied endorsement, the FTC seal not used; names of natural persons are not copied",
    attribution:
      "Source: United States Federal Trade Commission, www.ftc.gov (consumer protection civil penalty cases, CC0 1.0). Not endorsed by the FTC. Entries adapted by VerifyWise.",
  },
  {
    id: "piperoll",
    name: "PipeRoll Agent Incident Registry",
    operator: "PipeRoll, an independent registry kept by one editor",
    listName: "PipeRoll Agent Incident Registry",
    category: "ai_specific",
    missingStatus: "withdrawn",
    documentationUrl: "https://piperoll.org/data/",
    licence:
      "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): the registry's incident records and exports, per its incidents/LICENSE (the repository's MIT licence covers the tooling only); the AIID cross-references (aiid_incident_id) are not used; accepted on 2026-11-10 (Q38)",
    attribution:
      "PipeRoll Agent Incident Registry (piperoll.org), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); each record cites the PIR ids of the entries it shows and links the newest entry. Adapted by VerifyWise: titles shortened and edited, entries counted; not endorsed by PipeRoll.",
  },
  {
    id: "eu_dg_comp",
    name: "European Commission competition cases",
    operator: "the European Commission (DG Competition)",
    listName: "European Commission antitrust, cartel and DMA case data",
    category: "legal_regulatory",
    missingStatus: "withdrawn",
    documentationUrl:
      "https://competition-policy.ec.europa.eu/about/news/dg-competitions-case-data-available-open-data-2025-03-18_en",
    licence:
      "Commission reuse notice (Decision 2011/833/EU); CC BY 4.0 per the Commission's legal notice (https://commission.europa.eu/legal-notice_en): the antitrust, cartel and DMA case files of DG Competition's open data only (no merger, state-aid or foreign-subsidy file, no attachment, press release or timeline text); person-shaped names of non-cartel antitrust cases dropped; accepted on delegation on 2026-11-10 (Q45)",
    attribution:
      "Source: European Commission, DG Competition case data (open data), (c) European Union, reused under the Commission reuse notice (CC BY 4.0). Changes made by VerifyWise.",
  },
  {
    id: "disclose_io",
    name: "disclose.io program list",
    operator: "disclose.io (the community-maintained diodb repository)",
    listName: "disclose.io vulnerability disclosure program list",
    category: "security_incidents",
    missingStatus: "withdrawn",
    documentationUrl: "https://github.com/disclose/diodb",
    licence:
      "CC0 1.0 per the diodb LICENSE file (GitHub: CC0-1.0); the README's License section says CC BY 4.0, so the list is attributed as CC BY 4.0 requires; contact e-mails and contact URLs are not copied; decided on delegation on 2026-11-10 (Q49)",
    attribution:
      "disclose.io diodb (https://github.com/disclose/diodb), CC0 1.0 per its LICENSE, attributed as CC BY 4.0 per its README. Entries are community contributions; adapted by VerifyWise.",
  },
  {
    id: "uk_cma",
    name: "UK Competition and Markets Authority cases",
    operator: "the Competition and Markets Authority",
    listName: "UK Competition and Markets Authority cases",
    category: "legal_regulatory",
    missingStatus: "withdrawn",
    documentationUrl: "https://www.gov.uk/cma-cases",
    licence:
      "Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): the GOV.UK search metadata of the CMA case pages (title, case type, state, outcome, dates); case documents, party submissions and personal data are excluded (Q52)",
    attribution:
      "UK Competition and Markets Authority cases, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise (party names extracted from case titles and cases counted); no endorsement by the Competition and Markets Authority is implied.",
  },
  {
    id: "canada_ai_register",
    name: "Government of Canada AI Register",
    operator: "the Treasury Board of Canada Secretariat",
    listName: "Government of Canada AI Register",
    category: "ai_specific",
    missingStatus: "withdrawn",
    documentationUrl: "https://open.canada.ca/data/en/dataset/fcbc0200-79ba-4fa4-94a6-00e32facea6b",
    licence:
      "Open Government Licence - Canada 2.0 (https://open.canada.ca/en/open-government-licence-canada): the dataset record's licence (ca-ogl-lgo); personal information, third-party rights and official symbols are outside it and are not used; accepted on 2026-11-10 (Q40)",
    attribution:
      "Contains information licensed under the Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada). Source: Government of Canada AI Register (Minimum Viable Product), Treasury Board of Canada Secretariat. Adapted by VerifyWise; not endorsed by the Government of Canada.",
  },
  {
    id: "ftc_competition",
    name: "FTC nonmerger enforcement actions",
    operator: "the US Federal Trade Commission",
    listName: "FTC nonmerger enforcement action list",
    category: "legal_regulatory",
    missingStatus: "withdrawn",
    documentationUrl: "https://catalog.data.gov/dataset/ftc-nonmerger-enforcement-actions",
    licence:
      "CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/), as FTC's data.json and catalog.data.gov state for 'FTC Nonmerger Enforcement Actions'; FTC website policy: attribution where feasible, no implied endorsement, the FTC seal not used",
    attribution:
      "Source: United States Federal Trade Commission, www.ftc.gov (nonmerger enforcement actions, CC0 1.0). Not endorsed by the FTC. Parties read from the matter titles and entries adapted by VerifyWise.",
  },
  {
    id: "omb_ai_inventory",
    name: "US federal AI use case inventory",
    operator: "the US Office of Management and Budget",
    listName: "US federal AI use case inventory",
    category: "ai_specific",
    missingStatus: "withdrawn",
    documentationUrl: "https://github.com/ombegov/2025-Federal-Agency-AI-Use-Case-Inventory",
    licence:
      "None published; a work of the US Government (17 U.S.C. §105) compiled by the Office of Management and Budget from the agencies' public inventories; contact_email and the agencies' and contractors' free text are not used; accepted on 2026-11-10 in the way of Q31 and Q33 (Q41)",
    attribution:
      "Source: US Office of Management and Budget, 2025 Federal Agency AI Use Case Inventory (compiled from agencies' public inventories). Entries adapted by VerifyWise; not endorsed by OMB.",
  },
  {
    id: "co_sic_penalties",
    name: "Colombia SIC consumer protection sanctions",
    operator: "Colombia's Superintendencia de Industria y Comercio (SIC)",
    listName: "Colombia SIC consumer protection sanctions list",
    category: "legal_regulatory",
    missingStatus: "withdrawn",
    documentationUrl: "https://www.datos.gov.co/d/73dx-n59j",
    licence:
      "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), as datos.gov.co states for dataset 73dx-n59j; MinTIC portal terms: cite 'Fuente: Portal de Datos Abiertos www.datos.gov.co' with the data's update date and do not distort the meaning; rows naming natural persons are not copied; adapted records are shared under CC BY-SA 4.0; decided on delegation on 2026-11-10 (Q47)",
    attribution:
      "Fuente: Portal de Datos Abiertos www.datos.gov.co (Superintendencia de Industria y Comercio, consumer protection sanctions), CC BY-SA 4.0. Adapted by VerifyWise; the adapted records are shared under CC BY-SA 4.0.",
  },
  {
    id: "uk_atrs",
    name: "UK Algorithmic Transparency Recording Standard records",
    operator: "the Cabinet Office (GOV.UK), for the public bodies that publish the records",
    listName: "UK Algorithmic Transparency Records",
    category: "ai_specific",
    missingStatus: "withdrawn",
    documentationUrl: "https://www.gov.uk/algorithmic-transparency-records",
    licence:
      "Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): GOV.UK states that all its content is available under the OGL v3.0 except where otherwise stated, and no record states otherwise; records by bodies that are not Crown bodies (local authorities, 13 of 155) rely on that statement; contact e-mail addresses, named officials, linked documents and logos are excluded; accepted on 2026-11-10 (Q51)",
    attribution:
      "UK Algorithmic Transparency Recording Standard records, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise (supplier names extracted and records counted); no endorsement by the Cabinet Office or the publishing bodies is implied.",
  },
  {
    id: "nhtsa_recalls",
    name: "NHTSA vehicle and equipment recalls",
    operator: "NHTSA",
    listName: "NHTSA recalls file",
    category: "legal_regulatory",
    missingStatus: "withdrawn",
    documentationUrl: "https://www.nhtsa.gov/nhtsa-datasets-and-apis",
    licence:
      "Public Domain U.S. Government (DOT data catalogue tag on NHTSA's dataset); a work of the US Government (17 U.S.C. §105), accepted in the way of Q31 on 2026-11-10; the manufacturer-supplied fields 25 to 27 and the Part 573 texts are not used (Q36)",
    attribution:
      "Source: US National Highway Traffic Safety Administration, recalls flat file. Not endorsed by NHTSA. Entries adapted by VerifyWise.",
  },
  {
    id: "fmti",
    name: "Foundation Model Transparency Index",
    operator: "the Stanford Center for Research on Foundation Models (CRFM)",
    listName: "Foundation Model Transparency Index",
    category: "ai_specific",
    missingStatus: "withdrawn",
    documentationUrl: "https://github.com/stanford-crfm/fmti",
    licence:
      "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): the stanford-crfm/fmti repository's LICENSE.md (the README says CC-BY); the December 2025 scores file only; the transparency reports in the repository are not used; accepted on 2026-11-10 (Q44)",
    attribution:
      "Foundation Model Transparency Index (Bommasani, Klyman et al.), Stanford Center for Research on Foundation Models, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Indicators counted by VerifyWise from the published scores file; not endorsed by Stanford CRFM.",
  },
  {
    id: "uk_mhra",
    name: "UK MHRA field safety notice lists",
    operator: "the Medicines and Healthcare products Regulatory Agency",
    listName: "UK MHRA field safety notice lists",
    category: "legal_regulatory",
    missingStatus: "withdrawn",
    documentationUrl: "https://www.gov.uk/drug-device-alerts",
    licence:
      "Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): the MHRA's weekly field safety notice list pages on GOV.UK; the manufacturers' attached field safety notices (third-party documents) are not read or copied (Q52)",
    attribution:
      "UK Medicines and Healthcare products Regulatory Agency field safety notice lists, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise (entries counted by manufacturer); no endorsement by the MHRA is implied.",
  },
  {
    id: "nl_algoritmeregister",
    name: "Dutch Algorithm Register",
    operator:
      "the Dutch Ministry of the Interior and Kingdom Relations (the publishing public bodies write the descriptions)",
    listName: "Dutch Algorithm Register",
    category: "ai_specific",
    missingStatus: "withdrawn",
    documentationUrl: "https://algoritmes.overheid.nl/api-docs",
    licence:
      "No named licence: reuse permitted by the register's copyright page (https://algoritmes.overheid.nl/nl/footer/copyright: 'De inhoud van deze website mag worden hergebruikt'); the EUPL-1.2 covers only the register's code; contact fields not used; accepted on 2026-11-10 as a new precedent, pending the owner's confirmation (Q42)",
    attribution:
      "Bron: Algoritmeregister van de Nederlandse overheid (algoritmes.overheid.nl); each record names up to three of the public bodies that published the descriptions it counts and links the register's search, which lists them all. Entries adapted by VerifyWise; not endorsed by the Dutch government.",
  },
  {
    id: "nhtsa_odi",
    name: "NHTSA defect investigations",
    operator: "NHTSA",
    listName: "NHTSA defect investigations file",
    category: "legal_regulatory",
    missingStatus: "withdrawn",
    documentationUrl: "https://www.nhtsa.gov/nhtsa-datasets-and-apis",
    licence:
      "Public Domain U.S. Government (DOT data catalogue tag on NHTSA's dataset); a work of the US Government (17 U.S.C. §105), accepted in the way of Q31 on 2026-11-10 (Q35)",
    attribution:
      "Source: US National Highway Traffic Safety Administration, Office of Defects Investigation (defect investigations flat file). Not endorsed by NHTSA. Entries adapted by VerifyWise.",
  },
  {
    id: "fedramp",
    name: "FedRAMP Marketplace",
    operator: "the US General Services Administration (FedRAMP)",
    listName: "FedRAMP Marketplace data",
    category: "certifications",
    attests: true,
    missingStatus: "delisted",
    documentationUrl: "https://github.com/FedRAMP/marketplace-fedramp-gov-data",
    licence:
      "None published; a work of the US General Services Administration (17 U.S.C. §105) in GSA's FedRAMP/marketplace-fedramp-gov-data repository: only GSA's status fields are copied (provider, offering, status and its date, impact level, authorisation type, agency count, UEI); the host of each offering's website is used as a match key only and never shown; logos, provider descriptions and contact data are not copied; decided on delegation on 2026-11-10 (Q48)",
    attribution:
      "Source: US General Services Administration, FedRAMP Marketplace data. Not endorsed by GSA or FedRAMP. Entries adapted by VerifyWise.",
  },
  {
    id: "epoch_ai",
    name: "Epoch AI Data on AI Models",
    operator: "Epoch AI",
    listName: "Epoch AI Data on AI Models",
    category: "ai_specific",
    missingStatus: "withdrawn",
    documentationUrl: "https://epoch.ai/data/ai-models-documentation",
    licence:
      "Creative Commons Attribution (Epoch AI's data pages: 'free to use, distribute, and reproduce provided the source and authors are credited'; version 4.0 on the AI companies page, unstated on the AI models documentation): the AI models dataset; accepted on 2026-11-10 (Q43)",
    attribution:
      "Epoch AI, 'Data on AI models', published online at epoch.ai (https://epoch.ai/data/ai-models-documentation), under the Creative Commons Attribution licence. Counted and adapted by VerifyWise; not endorsed by Epoch AI.",
  },
  {
    id: "c2pa_conforming",
    name: "C2PA Conforming Products List",
    operator: "the Coalition for Content Provenance and Authenticity (C2PA)",
    listName: "C2PA Conforming Products List",
    category: "certifications",
    attests: true,
    missingStatus: "withdrawn",
    documentationUrl: "https://github.com/c2pa-org/conformance-public",
    licence:
      "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): the c2pa-org/conformance-public repository's LICENSE; the C2PA name and marks are not licensed and are used only to name the source",
    attribution:
      "C2PA Conforming Products List, c2pa-org/conformance-public repository, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Adapted by VerifyWise; not endorsed by the C2PA.",
  },
] as const;

/** GLEIF's sheet: the one list of the 23 that is read through (answers kept 24 hours). */
const GLEIF_SHEET = {
  id: "gleif",
  name: "GLEIF LEI records",
  operator: "the Global Legal Entity Identifier Foundation",
  listName: "GLEIF LEI records",
  category: "financial_health",
  mode: "read_through",
  ttlHours: 24,
  staleAfterHours: 48,
  documentationUrl: "https://www.gleif.org/en/lei-data/gleif-api",
  licence:
    "CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) under GLEIF's LEI Data Terms of Use (https://www.gleif.org/en/meta/lei-data-terms-of-use): access only through GLEIF's access services, no claim of rights in LEI data, and no statement that implies that VerifyWise or its products are provided, supported, authorised or associated by or with GLEIF (liquidated damages of CHF 100,000 per case of non-compliance); accepted on 2026-11-10 (Q53)",
  attribution:
    "GLEIF LEI data (CC0 1.0), from the Global Legal Entity Identifier Foundation's API. VerifyWise is not associated with GLEIF, and GLEIF does not provide, support, authorise or endorse VerifyWise or its products.",
} as const;

/**
 * The licence and the attribution of the fda_device_recalls row after the FDA enforcement reports were
 * folded into it (Q37): the one shipped list whose sheet moved.
 */
const FDA_DEVICE_RECALLS_AMENDED = {
  licence:
    "CC0 1.0 (https://open.fda.gov/license/): openFDA's device recall records and, for their class and classification day only, its device enforcement reports; the GMDN content of the openfda block is not used (Q34, Q37)",
  attribution:
    "FDA medical device recalls and enforcement reports through openFDA, US Food and Drug Administration (CC0 1.0), joined by VerifyWise to the FDA list of AI-enabled medical devices. Data provided by the U.S. Food and Drug Administration (https://open.fda.gov).",
} as const;

/** The definition of a list that is copied. */
const mirrorOf = (id: VrdbSourceId): MirrorSource => {
  const definition = vrdbSourceOf(id);
  if (!isMirror(definition)) throw new Error(`${id} is not copied`);
  return definition;
};

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
      // The 23 lists added on 2026-11-10 stand after them, in the order that keeps the lists of one
      // host apart and puts the registers after the lists that can raise a risk (spec D4.14).
      ...NEW_IDS,
    ]);
    expect(VRDB_SOURCE_IDS).toHaveLength(37);
    expect(idsOf(VRDB_SOURCES)).toEqual([...VRDB_SOURCE_IDS]);
    for (const id of VRDB_SOURCE_IDS) expect(vrdbSourceOf(id).id).toBe(id);
  });

  it("holds 34 lists that are copied and three that are read through, GLEIF the third", () => {
    expect(
      VRDB_SOURCES.filter((source) => !isMirror(source)).map((source) => [source.id, source.mode]),
    ).toEqual([
      ["nvd", "read_through"],
      ["sec", "read_through"],
      ["gleif", "read_through"],
    ]);
    expect(VRDB_SOURCES.filter(isMirror)).toHaveLength(34);
    expect(NEW_MIRROR_IDS).toHaveLength(22);
    expect(NEW_IDS).toHaveLength(23);
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
    // the CVE records (the UN list that stood before it waits behind its gate), the four open AI
    // lists after it, in the order of the table, without the UN list and the AI Incident Database,
    // and the 23 lists of 2026-11-10 last: none of them has a gate.
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
      ...NEW_IDS,
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
      ...NEW_MIRROR_IDS,
    ]);
    expect(idsOf(activeReadThroughs())).toEqual(["nvd", "sec", "gleif"]);
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
      ...NEW_IDS,
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
      ...NEW_MIRROR_IDS,
    ]);
    expect(idsOf(activeReadThroughs(CLOSED))).toEqual(["nvd", "gleif"]);
  });

  it("holds no gate for any of the 23 lists of 2026-11-10: each is active, and the 22 copied are bundled, with every gate closed", () => {
    for (const id of NEW_IDS) {
      expect([id, vrdbSourceOf(id).gate]).toEqual([id, undefined]);
      expect(idsOf(activeVrdbSources(CLOSED))).toContain(id);
    }
    for (const id of NEW_MIRROR_IDS) expect(idsOf(activeMirrors(CLOSED))).toContain(id);
    expect(idsOf(activeReadThroughs(CLOSED))).toContain("gleif");
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
    // The screening list, the four open AI lists and the 23 lists of 2026-11-10 have no gate, so they
    // are in every one of these: the screening list stands after the UN list and before the AI
    // Incident Database.
    const NO_GATE = ["atlas", "nhtsa_sgo", "fda_ai_devices", "fda_device_recalls", ...NEW_IDS];
    expect(idsOf(activeVrdbSources({ ...CLOSED, Q7: true }))).toEqual([
      "kev",
      "nvd",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "cve",
      "csl",
      ...NO_GATE,
    ]);
    expect(idsOf(activeVrdbSources({ ...CLOSED, Q6: true }))).toEqual([
      "kev",
      "nvd",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "un_sanctions",
      "csl",
      ...NO_GATE,
    ]);
    expect(idsOf(activeVrdbSources({ ...CLOSED, Q4: true }))).toEqual([
      "kev",
      "nvd",
      "sec",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "csl",
      ...NO_GATE,
    ]);
    expect(idsOf(activeVrdbSources({ ...CLOSED, Q29: true }))).toEqual([
      "kev",
      "nvd",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "csl",
      "aiid",
      ...NO_GATE,
    ]);
    // With every gate open all 37 are active: 34 copied and three read through.
    expect(idsOf(activeVrdbSources(OPEN))).toEqual([...VRDB_SOURCE_IDS]);
    expect(idsOf(activeMirrors(OPEN))).toEqual(
      VRDB_SOURCE_IDS.filter((id) => id !== "nvd" && id !== "sec" && id !== "gleif"),
    );
    expect(idsOf(activeReadThroughs(OPEN))).toEqual(["nvd", "sec", "gleif"]);
  });

  it("every bundled list is out of date 60 days after its bundle was built, and a database read through after its own 48 hours", () => {
    expect(BUNDLED_STALE_AFTER_HOURS).toBe(60 * 24);
    expect(VRDB_SOURCES.map((source) => [source.id, staleAfterHoursOf(source)])).toEqual(
      VRDB_SOURCES.map(({ id }) => [id, ["nvd", "sec", "gleif"].includes(id) ? 48 : 1440]),
    );
    // A bundled list keeps no hours of its own: a release, not a schedule, brings it up to date.
    for (const source of VRDB_SOURCES.filter(isMirror)) {
      expect([source.id, "staleAfterHours" in source]).toEqual([source.id, false]);
    }
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
        ({ id, operator, listName, category, missingStatus, mode }) => ({
          id,
          operator,
          listName,
          category,
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
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "ofac",
        operator: "OFAC",
        listName: "OFAC SDN list",
        category: "legal_regulatory",
        missingStatus: "delisted",
        mode: "mirror",
      },
      {
        id: "uk_sanctions",
        operator: "FCDO",
        listName: "UK Sanctions List",
        category: "legal_regulatory",
        missingStatus: "delisted",
        mode: "mirror",
      },
      {
        id: "eu_fsf",
        operator: "European Commission",
        listName: "EU financial sanctions list",
        category: "legal_regulatory",
        missingStatus: "delisted",
        mode: "mirror",
      },
      {
        id: "cve",
        operator: "the CVE Program",
        listName: "CVE List",
        category: "security_incidents",
        missingStatus: null,
        mode: "mirror",
      },
      {
        id: "un_sanctions",
        operator: "the UN Security Council",
        listName: "UN Security Council Consolidated List",
        category: "legal_regulatory",
        missingStatus: "delisted",
        mode: "mirror",
      },
      {
        id: "csl",
        operator: "the International Trade Administration",
        listName: "US Consolidated Screening List",
        category: "legal_regulatory",
        missingStatus: "delisted",
        mode: "mirror",
      },
      {
        id: "aiid",
        operator: "the Responsible AI Collaborative",
        listName: "AI Incident Database",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "atlas",
        operator: "MITRE",
        listName: "MITRE ATLAS case studies",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "nhtsa_sgo",
        operator: "NHTSA",
        listName: "NHTSA Standing General Order crash reports",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "fda_ai_devices",
        operator: "the FDA",
        listName: "FDA list of AI-enabled medical devices",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "fda_device_recalls",
        operator: "the FDA",
        listName: "FDA device recall database",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      // The 22 lists copied that were added on 2026-11-10, in the order of the registry.
      {
        id: "canada_sema",
        operator: "Global Affairs Canada",
        listName: "Consolidated Canadian Autonomous Sanctions List",
        category: "legal_regulatory",
        missingStatus: "delisted",
        mode: "mirror",
      },
      {
        id: "california_breaches",
        operator: "the California Department of Justice, Office of the Attorney General",
        listName: "California Attorney General data breach list",
        category: "security_incidents",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "uk_ofsi",
        operator: "the Office of Financial Sanctions Implementation (HM Treasury)",
        listName: "UK OFSI financial sanctions enforcement notices",
        category: "legal_regulatory",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "charlotin",
        operator: "Damien Charlotin (HEC Paris), the database's author",
        listName: "AI Hallucination Cases database",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "ftc_penalties",
        operator: "the US Federal Trade Commission",
        listName: "FTC civil penalty case list",
        category: "legal_regulatory",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "piperoll",
        operator: "PipeRoll, an independent registry kept by one editor",
        listName: "PipeRoll Agent Incident Registry",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "eu_dg_comp",
        operator: "the European Commission (DG Competition)",
        listName: "European Commission antitrust, cartel and DMA case data",
        category: "legal_regulatory",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "disclose_io",
        operator: "disclose.io (the community-maintained diodb repository)",
        listName: "disclose.io vulnerability disclosure program list",
        category: "security_incidents",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "uk_cma",
        operator: "the Competition and Markets Authority",
        listName: "UK Competition and Markets Authority cases",
        category: "legal_regulatory",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "canada_ai_register",
        operator: "the Treasury Board of Canada Secretariat",
        listName: "Government of Canada AI Register",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "ftc_competition",
        operator: "the US Federal Trade Commission",
        listName: "FTC nonmerger enforcement action list",
        category: "legal_regulatory",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "omb_ai_inventory",
        operator: "the US Office of Management and Budget",
        listName: "US federal AI use case inventory",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "co_sic_penalties",
        operator: "Colombia's Superintendencia de Industria y Comercio (SIC)",
        listName: "Colombia SIC consumer protection sanctions list",
        category: "legal_regulatory",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "uk_atrs",
        operator: "the Cabinet Office (GOV.UK), for the public bodies that publish the records",
        listName: "UK Algorithmic Transparency Records",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "nhtsa_recalls",
        operator: "NHTSA",
        listName: "NHTSA recalls file",
        category: "legal_regulatory",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "fmti",
        operator: "the Stanford Center for Research on Foundation Models (CRFM)",
        listName: "Foundation Model Transparency Index",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "uk_mhra",
        operator: "the Medicines and Healthcare products Regulatory Agency",
        listName: "UK MHRA field safety notice lists",
        category: "legal_regulatory",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "nl_algoritmeregister",
        operator:
          "the Dutch Ministry of the Interior and Kingdom Relations (the publishing public bodies write the descriptions)",
        listName: "Dutch Algorithm Register",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "nhtsa_odi",
        operator: "NHTSA",
        listName: "NHTSA defect investigations file",
        category: "legal_regulatory",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "fedramp",
        operator: "the US General Services Administration (FedRAMP)",
        listName: "FedRAMP Marketplace data",
        category: "certifications",
        missingStatus: "delisted",
        mode: "mirror",
      },
      {
        id: "epoch_ai",
        operator: "Epoch AI",
        listName: "Epoch AI Data on AI Models",
        category: "ai_specific",
        missingStatus: "withdrawn",
        mode: "mirror",
      },
      {
        id: "c2pa_conforming",
        operator: "the Coalition for Content Provenance and Authenticity (C2PA)",
        listName: "C2PA Conforming Products List",
        category: "certifications",
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
        licence:
          "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/): the incidents, entities and classifications collections of the AI Incident Database; report text, submissions and media excluded. Commercial use awaits the operator's confirmation (Q29).",
      },
      {
        id: "atlas",
        name: "MITRE ATLAS case studies",
        operator: "MITRE",
        listName: "MITRE ATLAS case studies",
        licence:
          "Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0); the atlas-data repository's LICENSE (Q32).",
      },
      {
        id: "nhtsa_sgo",
        name: "NHTSA Standing General Order crash reports",
        operator: "NHTSA",
        listName: "NHTSA Standing General Order crash reports",
        licence:
          "None published; a work of the US Government (17 U.S.C. §105); accepted on 2026-11-05 (Q31)",
      },
      {
        id: "fda_ai_devices",
        name: "FDA list of AI-enabled medical devices",
        operator: "the FDA",
        listName: "FDA list of AI-enabled medical devices",
        licence: "Public domain (fda.gov: content may be republished freely)",
      },
    ] as const;

    it.each(SHEETS)(
      "$id is a bundled mirror in ai_specific that withdraws a record it no longer lists",
      ({ id, name, operator, listName, licence }) => {
        const definition = vrdbSourceOf(id);

        expect(isMirror(definition)).toBe(true);
        expect(definition).toMatchObject({
          id,
          name,
          operator,
          listName,
          category: "ai_specific",
          mode: "mirror",
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

      // Closed, it is neither bundled nor looked up ...
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
        ...NEW_IDS,
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
        missingStatus: "withdrawn",
        // Amended on 2026-11-10 when the FDA enforcement reports were folded into the list (Q37): its
        // records now carry the FDA's class and classification day, so the licence names those reports
        // and the attribution carries the notice openFDA asks for.
        ...FDA_DEVICE_RECALLS_AMENDED,
        documentationUrl: "https://open.fda.gov/apis/device/recall/",
      },
    ] as const;

    it.each(SHEETS)(
      "$id is a bundled mirror in $category, with the values of its sheet word for word",
      (sheet) => {
        const definition = vrdbSourceOf(sheet.id);

        expect(isMirror(definition)).toBe(true);
        // The whole definition: a field that the sheet does not name, a gate included, fails it.
        expect(definition).toEqual({ ...sheet, mode: "mirror" });
      },
    );

    it("holds no gate for either list: both are active, and bundled, with every gate closed", () => {
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

  describe("the 23 lists added on 2026-11-10", () => {
    it.each(NEW_SHEETS)(
      "$id is a bundled mirror in $category, with the values of its sheet word for word",
      (sheet) => {
        const definition = vrdbSourceOf(sheet.id);

        expect(isMirror(definition)).toBe(true);
        // The whole definition: a field that the sheet does not name, a gate included, fails it.
        expect(definition).toEqual({ ...sheet, mode: "mirror" });
      },
    );

    it("reads GLEIF through, keeping an answer 24 hours, with the values of its sheet word for word", () => {
      expect(isMirror(vrdbSourceOf("gleif"))).toBe(false);
      expect(vrdbSourceOf("gleif")).toEqual(GLEIF_SHEET);
    });

    it("delists the entries that a sanctions list or the register of authorisations drops, and withdraws every other record", () => {
      expect(NEW_MIRROR_IDS.filter((id) => mirrorOf(id).missingStatus === "delisted")).toEqual([
        "canada_sema",
        "fedramp",
      ]);
      expect(
        NEW_MIRROR_IDS.filter((id) => mirrorOf(id).missingStatus === "withdrawn"),
      ).toHaveLength(20);
    });
  });

  describe("isStale", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const ago = (hours: number, minutes = 0) =>
      new Date(now.getTime() - (hours * 60 + minutes) * 60_000);

    it("is true for a list never loaded, bundled or read through", () => {
      expect(isStale(vrdbSourceOf("kev"), null, now)).toBe(true);
      expect(isStale(vrdbSourceOf("gleif"), null, now)).toBe(true);
    });

    it.each([["kev"], ["cve"], ["uk_cma"], ["nhtsa_recalls"]] as const)(
      "is false for the bundled %s at 59 days 23 h 59 min, and true at 60 days 1 min",
      (id) => {
        const definition = vrdbSourceOf(id);
        expect(staleAfterHoursOf(definition)).toBe(1440);
        expect(isStale(definition, ago(1439, 59), now)).toBe(false);
        expect(isStale(definition, ago(1440, 1), now)).toBe(true);
        // A bundle is not out of date at the 48 hours of a database read through.
        expect(isStale(definition, ago(49), now)).toBe(false);
      },
    );

    it.each([["nvd"], ["sec"], ["gleif"]] as const)(
      "is false for %s, read through, at 47 h 59 min and true at 48 h 1 min: its own hours",
      (id) => {
        const definition = vrdbSourceOf(id);
        expect(staleAfterHoursOf(definition)).toBe(48);
        expect(isStale(definition, ago(47, 59), now)).toBe(false);
        expect(isStale(definition, ago(48, 1), now)).toBe(true);
      },
    );

    it("reads the hours of a read-through definition as it is given", () => {
      const definition = { ...vrdbSourceOf("gleif"), staleAfterHours: 6 } as ReadThroughSource;
      expect(staleAfterHoursOf(definition)).toBe(6);
      expect(isStale(definition, ago(5, 59), now)).toBe(false);
      expect(isStale(definition, ago(6, 1), now)).toBe(true);
    });
  });
});

describe("the lists that attest", () => {
  it("are the two certification lists, and each has a reader of its records", () => {
    const attesting = VRDB_SOURCES.filter((source) => source.attests === true).map(
      (source) => source.id,
    );
    expect(attesting).toEqual(["fedramp", "c2pa_conforming"]);
    expect(Object.keys(ATTESTATION_READERS).sort()).toEqual([...attesting].sort());
  });
});

describe("coveredSources", () => {
  it("drops a bundled list the release ships no bundle of, and keeps the read-through sources", () => {
    const shipped = new Set(
      activeVrdbSources()
        .filter((source) => source.mode === "mirror" && source.id !== "eu_dg_comp")
        .map((source) => source.id),
    );
    const ids = coveredSources(shipped).map((source) => source.id);
    expect(ids).not.toContain("eu_dg_comp");
    expect(ids).toContain("nvd");
    expect(ids).toContain("gleif");
    expect(ids).toEqual(
      activeVrdbSources()
        .map((source) => source.id)
        .filter((id) => id !== "eu_dg_comp"),
    );
  });

  it("keeps every active list when the shipped lists are unknown", () => {
    expect(coveredSources(null)).toEqual(activeVrdbSources());
  });
});
