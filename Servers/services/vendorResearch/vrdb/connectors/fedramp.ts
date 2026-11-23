/**
 * The FedRAMP Marketplace data (spec D2.0, Q48): the US government's list of cloud offerings that
 * are FedRAMP Authorized, Ready or In Process, as the General Services Administration exports it to
 * the repository FedRAMP/marketplace-fedramp-gov-data. It is a register of authorisation statuses
 * and the context of a risk, never a finding: a listing is not a current authorisation (an agency's
 * own authorisation may have expired while the product is still listed), and it says nothing of the
 * security of a product.
 *
 * ONE FILE, READ WHOLE. `data.json` is one JSON text (a single line) whose own counts are checked on
 * every sync, on the file as the file counts it (the raw status of every product and the trimmed id
 * of every authorised one, before any product is judged readable): `Metrics.total`, `ready` and
 * `in_process` must be the numbers of the products of those statuses (Agency In Process is in none
 * of them), the ids of `AtoMapping` must be the ids of the authorised products, the file must hold
 * at least 400 products and its earliest authorisation must be on or before 2014-12-31 (the list
 * reaches back to the start). Any other file is not the list. A file of more than 5,000 products (or
 * of mappings) is not read in part: it fails as too large, before any other check.
 *
 * THE PROJECTION. A product is read for its id (`^[A-Za-z0-9]{3,20}$`), its provider (`csp`), its
 * offering (`cso`), its status and the day of that status, its impact level, its authorisation
 * type, the number of agencies that authorised it, its UEI and the host of its website. Each text
 * that is kept (the provider, the offering, the impact level, the authorisation type) is a line with
 * no control or hidden character and no angle bracket (`withoutAngles` writes `<` and `>` as the
 * quotation marks that look like them), so no markup reaches the id, the keys, the identifiers or
 * the body. The text that makes an id, a key or an identifier is never cut (`lineWithin`, which
 * gives a clean line of the limit's size at most, or nothing): a provider of more than 100
 * characters is a product that could not be read (a cut one would be a name, a key and an id with
 * the marker of the cut in them), and a website field of more than 300 has no host (a cut one could
 * end inside the host). The offering, the impact level and the authorisation type are for the text
 * only, and are cut with the marker. Everything else is never read: the provider-written texts
 * (`service_desc`, which reaches 16 KB and holds line breaks, zero-width characters and sentences
 * of its own; `all_others`, `business_function`, `fedramp_msg`), the logos, the e-mail addresses
 * of the providers and of the agencies, the whole of `Assessors` (a named contact, an e-mail and
 * an address of each), `ReuseMapping` (with its orphans) and the rest. The assessor, the service
 * and deployment models and the initial authorising agency are fields that GSA publishes and that
 * the licence note of the source allows, but no sentence of the record shows them, so the rows do
 * not carry them either.
 *
 * ONE RECORD PER PROVIDER. Products are grouped by the compact form of the provider's short name
 * (`compactName` of `shortName` of `csp`): "Examplecloud Inc." and "Examplecloud, Inc." are one
 * provider, and two spellings that do not compact alike stay two. A record says how many offerings
 * of each status the provider has and shows three of them (the authorised first, then the ready and
 * those in process; the newest day first; then the id).
 *
 * THE KEYS. The names of the provider's spellings (at most five) are the weak keys. The strong key
 * is the host of an offering's website, which is a provider-supplied fact that is NEVER shown or
 * stored as text: it is a `domain:` key only when the host (the first of the field, without
 * `www.`) is an apex domain (two labels, or three whose last two are a country suffix of
 * COMPOUND_SUFFIXES; a country suffix itself, `gov.uk`, is no apex), is not a host where many have
 * pages, is claimed by exactly one provider in the whole file, and its brand label (the first one)
 * has three characters or more and is related to the compact short name of one of the provider's
 * spellings in one of three ways: it IS the name, it contains the name (a name of four characters or
 * more: "acme" in "acmegov"), or it is the beginning of the name (a label of four characters or
 * more: "acme" in "acmecloudservices"). A short name inside another company's longer label ("hp" in
 * "hpe"), and a label that is only a word inside the name, or only three characters of it ("data"
 * in "Acme Data Systems", "usa" in "Gamma USA"), are not the provider's host. A subdomain
 * (`aws.example.com`), a shared host, a host that two providers claim and a host whose label has
 * nothing to do with the name give no key. At most five hosts, three UEIs (12 letters and digits, a
 * `regno:` key that counts only beside a name) and ten package ids are kept. A provider with no name
 * key and no host that qualifies is no record: it cannot match a vendor. (The rule is the strictest
 * of the variants that keep at least 95 % of the domain keys that the real file had before it: 424
 * of 441.)
 *
 * Natural persons: the file names companies. The only named people in it are the contacts of the
 * assessors and the mailboxes, which are never read; no person rule is applied (it would drop real
 * products).
 *
 * Every tie of every choice that is made among several (the spelling that is shown, the five that
 * are keyed, the hosts, the UEIs, the ids, the one of two products with one id) is decided by the
 * text of the choices, never by the order of the file, so that the body of a snapshot is the same
 * for the same list in any order. `meta.last_change` moves with every daily upload and is kept out
 * of the rows, so that the hash of the body changes only when a status does. A record keeps no
 * address of the file; its address is the repository's page with the provider's key.
 */
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import { isSharedHost } from "../../sharedHosts";
import { domainKey, hostsOf } from "../keys";
import type { ParsedRecord } from "../types";
import {
  compareText,
  dayText,
  instantText,
  isObject,
  lineOf,
  lineWithin,
  withoutAngles,
} from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { jsonOf } from "./kit/json";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const FEDRAMP_RECORD_MARK = "FedRAMP Marketplace";

const DATA_URL =
  "https://raw.githubusercontent.com/FedRAMP/marketplace-fedramp-gov-data/main/data.json";
/** The repository's own page: a record's address is this and the key of its provider. */
const DOCUMENTATION_URL = "https://github.com/FedRAMP/marketplace-fedramp-gov-data";
/** The file is 4.4 MB today; it is cut at four times that. */
const MAX_BYTES = 16 * 1024 * 1024;
/** 656 products today. A longer list is not read in part. */
const MAX_PRODUCTS = 5000;
/** A file with fewer products is not the marketplace. */
const MIN_PRODUCTS = 400;
/** The oldest authorisation of the real file is of 2013; a file that begins later has lost its start. */
const LATEST_FIRST_AUTHORISATION = "2014-12-31";

/** The first sentence of every record: the list, the operator's host and what kind of list it is. */
const FIRST_SENTENCE = `${FEDRAMP_RECORD_MARK} (github.com/FedRAMP), a register or status list.`;
/** The last sentence of every record. It is never cut and never left out. */
const CLOSING_SENTENCE =
  "A marketplace listing is an authorisation status, not a security assurance; the authorising " +
  "agency's own authorisation may have expired. Not endorsed by GSA or FedRAMP; adapted by VerifyWise.";

/** The statuses that a product can have, in the order in which a record shows them. */
const STATUSES = [
  "FedRAMP Authorized",
  "FedRAMP Ready",
  "FedRAMP In Process",
  "Agency In Process",
] as const;
export type FedrampStatus = (typeof STATUSES)[number];

/** The fields of a product that hold the day of each status; the first that is a day is the day. */
const DAY_FIELDS: Record<FedrampStatus, readonly string[]> = {
  "FedRAMP Authorized": ["auth_date"],
  "FedRAMP Ready": ["ready_date"],
  "FedRAMP In Process": ["ip_pmo_date", "ip_prog_date"],
  "Agency In Process": ["ip_agency_date"],
};

/** The place of a status in the order of a record's list, and the count that holds it. */
const RANK: Record<FedrampStatus, number> = {
  "FedRAMP Authorized": 0,
  "FedRAMP Ready": 1,
  "FedRAMP In Process": 2,
  "Agency In Process": 3,
};

/** The country suffixes of two labels under which the apex of a host has three. */
const COMPOUND_SUFFIXES: ReadonlySet<string> = new Set([
  "co.uk",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "com.au",
  "net.au",
  "gov.au",
  "co.nz",
  "co.jp",
  "co.in",
  "com.br",
  "com.sg",
  "co.za",
  "com.mx",
  "com.cn",
  "co.il",
  "com.tr",
  "co.kr",
  "com.tw",
  "com.hk",
]);

const PACKAGE_ID = /^[A-Za-z0-9]{3,20}$/;
const UEI = /^[A-Z0-9]{12}$/;

/**
 * The most characters of a provider, as a clean line (a longer one is no name: the product is
 * unreadable), and of an offering and the short facts of a product (cut for the text, with the marker).
 */
const PROVIDER_MAX = 100;
const OFFERING_MAX = 80;
const FACT_MAX = 20;
/**
 * The most characters of a website field, as a clean line: a longer field has no host (it is never
 * read in part). The real file's longest is 138.
 */
const WEBSITE_MAX = 300;
/** The fewest characters of the brand label of a host (its first label). */
const BRAND_MIN = 3;
/**
 * The fewest characters of a name that a longer label may contain, and of a label that a longer name
 * may begin with: a shorter name inside a label, or a shorter label inside a name, is a chance.
 */
const CONTAINED_MIN = 4;
/** The most agencies that a product is said to have: a count beyond it is no count of agencies. */
const AGENCIES_MAX = 99_999;
/** The most of each thing that a record keeps. */
const SHOWN_PRODUCTS = 3;
const SPELLINGS_KEPT = 5;
const HOSTS_KEPT = 5;
const UEIS_KEPT = 3;
const PACKAGES_KEPT = 10;

/** An offering as a record shows it. */
export interface FedrampProduct {
  id: string;
  /** The offering, as a line of at most 80 characters. */
  cso: string;
  status: FedrampStatus;
  /** The day of the status, YYYY-MM-DD. */
  day: string;
  impact: string;
  authType: string;
  /** How many agencies authorised it; 0 for none, and for a count that is none. */
  agencies: number;
}

/** What a snapshot holds of a provider: the row of the list. */
export interface FedrampProvider {
  /** The compact form of the provider's short name. */
  id: string;
  /** The spelling of the provider that the file uses most. */
  display: string;
  /** The spellings (five at most) that the names of the record's keys are made of. */
  names: string[];
  counts: { authorized: number; ready: number; inProcess: number; agency: number };
  /** The three offerings that the record shows. */
  products: FedrampProduct[];
  /** The ids of the provider's packages, the first ten in order of the text. */
  packages: string[];
  /** The hosts that are keys (five at most, in order of the text). */
  domains: string[];
  /** The UEIs of 12 letters and digits (three at most, in order of the text), in upper case. */
  ueis: string[];
  /** The newest day of the status of any of its products. */
  publishedAt: string;
}

/** A product as it is read, with what the grouping needs and a row does not keep. */
interface ReadProduct extends FedrampProduct {
  key: string;
  spelling: string;
  host: string;
  uei: string;
}

/** What names the provider of a product, whether or not the rest of the product can be read. */
interface Identity {
  key: string;
  spelling: string;
  host: string;
}

/** The day of a status date: an ISO day, or an ISO day and time with a zone, whose first ten characters are the day. */
function statusDay(value: unknown): string | null {
  const instant = instantText(lineOf(value, 40));
  return instant === null ? null : dayText(instant.slice(0, 10));
}

const statusOf = (value: unknown): FedrampStatus | null => {
  const text = lineOf(value, 40);
  return STATUSES.find((status) => status === text) ?? null;
};

function dayOfStatus(product: Record<string, unknown>, status: FedrampStatus): string | null {
  for (const field of DAY_FIELDS[status]) {
    const day = statusDay(product[field]);
    if (day !== null) return day;
  }
  return null;
}

/**
 * The first host of a website field, bare and in lower case; none for a field that holds no host,
 * and none for one that does not fit (a clean line of WEBSITE_MAX characters at most): a field that
 * is cut could end inside the host, and the host is a strong key.
 */
function hostOf(website: unknown): string {
  const line = lineWithin(website, WEBSITE_MAX);
  if (line === null) return "";
  const [first] = hostsOf(line);
  return first === undefined ? "" : domainKey(first).slice("domain:".length);
}

/**
 * Two labels, or three whose last two are a country suffix. A country suffix is no apex of anyone,
 * so a host that is one of COMPOUND_SUFFIXES itself (`gov.uk`, `com.au`) is none.
 */
function isApex(host: string): boolean {
  if (COMPOUND_SUFFIXES.has(host)) return false;
  const labels = host.split(".");
  return (
    labels.length <= 2 || (labels.length === 3 && COMPOUND_SUFFIXES.has(labels.slice(1).join(".")))
  );
}

function identityOf(item: unknown): Identity | null {
  if (!isObject(item)) return null;
  // A provider that does not fit is no name: cut, it would be the id, the keys and the identifier.
  const line = lineWithin(item.csp, PROVIDER_MAX);
  if (line === null) return null;
  // No angle bracket reaches the spelling, so none reaches the keys, the id or the identifiers.
  const spelling = withoutAngles(line);
  const key = compactName(shortName(spelling));
  return key === "" ? null : { key, spelling, host: hostOf(item.website) };
}

/** The product, or null when it cannot be read: no usable id, no offering, no status or no day for it. */
function productOf(item: Record<string, unknown>, identity: Identity): ReadProduct | null {
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const status = statusOf(item.status);
  const cso = withoutAngles(lineOf(item.cso, OFFERING_MAX));
  if (!PACKAGE_ID.test(id) || status === null || cso === "") return null;
  const day = dayOfStatus(item, status);
  if (day === null) return null;
  const agencies = item.authorization;
  const uei = typeof item.uei === "string" ? item.uei.trim().toUpperCase() : "";
  return {
    id,
    cso,
    status,
    day,
    impact: withoutAngles(lineOf(item.impact_level, FACT_MAX)),
    authType: withoutAngles(lineOf(item.auth_type, FACT_MAX)),
    agencies:
      typeof agencies === "number" &&
      Number.isSafeInteger(agencies) &&
      agencies >= 0 &&
      agencies <= AGENCIES_MAX
        ? agencies
        : 0,
    key: identity.key,
    spelling: identity.spelling,
    host: identity.host,
    uei: UEI.test(uei) ? uei : "",
  };
}

const COUNT_FIELD = {
  "FedRAMP Authorized": "authorized",
  "FedRAMP Ready": "ready",
  "FedRAMP In Process": "inProcess",
  "Agency In Process": "agency",
} as const;

/** The spellings by how many products use them (the most used first), then in order of the text. */
function spellingsOf(products: readonly ReadProduct[]): string[] {
  const used = new Map<string, number>();
  for (const { spelling } of products) used.set(spelling, (used.get(spelling) ?? 0) + 1);
  return [...used.keys()].sort(
    (a, b) => (used.get(b) ?? 0) - (used.get(a) ?? 0) || compareText(a, b),
  );
}

/**
 * Whether the brand of a host (its first label) is the provider's: at least three characters, and,
 * for the compact short name of one of its spellings (the form), one of three things: the brand IS
 * the form; the brand contains a form of four characters or more ("acme" in "acmegov"); or the form
 * begins with a brand of four characters or more ("acme" in "acmecloudservices"). The short name,
 * not the whole spelling: a host "inc.example" is no host of "Acme Inc.". A form of one to three
 * characters inside another company's longer label ("hp" in "hpe"), and a brand that is only a word
 * in the middle or at the end of a longer name, or only three characters of its start ("data" in
 * "acmedatasystems", "usa" in "gammausa"), are not the provider's host.
 */
function relatedToName(host: string, forms: readonly string[]): boolean {
  const brand = compactName(host.split(".")[0]);
  if (brand.length < BRAND_MIN) return false;
  return forms.some(
    (form) =>
      form !== "" &&
      (brand === form ||
        (form.length >= CONTAINED_MIN && brand.includes(form)) ||
        (brand.length >= CONTAINED_MIN && form.startsWith(brand))),
  );
}

const newestDay = (days: readonly string[]): string =>
  days.reduce((newest, day) => (compareText(day, newest) > 0 ? day : newest));

function providerOf(
  key: string,
  products: readonly ReadProduct[],
  claims: ReadonlyMap<string, ReadonlySet<string>>,
): FedrampProvider {
  const spellings = spellingsOf(products);
  const forms = [...new Set(spellings.map((spelling) => compactName(shortName(spelling))))];
  const counts = { authorized: 0, ready: 0, inProcess: 0, agency: 0 };
  for (const product of products) counts[COUNT_FIELD[product.status]] += 1;

  const hosts = new Set<string>();
  for (const { host } of products) {
    // Claimed by exactly one provider: this one, since one of its products names the host.
    if (
      host !== "" &&
      isApex(host) &&
      !isSharedHost(host) &&
      claims.get(host)?.size === 1 &&
      relatedToName(host, forms)
    ) {
      hosts.add(host);
    }
  }
  const ueis = new Set(products.map(({ uei }) => uei).filter((uei) => uei !== ""));
  const shown = [...products]
    .sort(
      (a, b) =>
        RANK[a.status] - RANK[b.status] || compareText(b.day, a.day) || compareText(a.id, b.id),
    )
    .slice(0, SHOWN_PRODUCTS)
    .map(({ id, cso, status, day, impact, authType, agencies }) => ({
      id,
      cso,
      status,
      day,
      impact,
      authType,
      agencies,
    }));
  return {
    id: key,
    display: spellings[0],
    names: spellings.slice(0, SPELLINGS_KEPT),
    counts,
    products: shown,
    packages: products
      .map(({ id }) => id)
      .sort(compareText)
      .slice(0, PACKAGES_KEPT),
    domains: [...hosts].sort(compareText).slice(0, HOSTS_KEPT),
    ueis: [...ueis].sort(compareText).slice(0, UEIS_KEPT),
    publishedAt: newestDay(products.map(({ day }) => day)),
  };
}

/** What the file says about itself, checked against what its products hold (see the comment of this file). */
function countsHold(
  metrics: Record<string, unknown>,
  items: readonly unknown[],
  mapping: readonly unknown[],
): boolean {
  const seen = { total: 0, ready: 0, in_process: 0 };
  const authorised = new Set<string>();
  let earliest: string | null = null;
  for (const item of items) {
    if (!isObject(item)) continue;
    const status = statusOf(item.status);
    if (status === "FedRAMP Authorized") {
      seen.total += 1;
      // The mapping cannot list an authorised product that has no id.
      if (typeof item.id !== "string") return false;
      authorised.add(item.id.trim());
      const day = statusDay(item.auth_date);
      if (day !== null && (earliest === null || compareText(day, earliest) < 0)) earliest = day;
    } else if (status === "FedRAMP Ready") {
      seen.ready += 1;
    } else if (status === "FedRAMP In Process") {
      seen.in_process += 1;
    }
  }
  if (
    metrics.total !== seen.total ||
    metrics.ready !== seen.ready ||
    metrics.in_process !== seen.in_process
  ) {
    return false;
  }
  const mapped = new Set<string>();
  for (const entry of mapping) {
    if (!isObject(entry) || typeof entry.id !== "string") return false;
    mapped.add(entry.id.trim());
  }
  if (mapped.size !== authorised.size || [...authorised].some((id) => !mapped.has(id)))
    return false;
  return earliest !== null && compareText(earliest, LATEST_FIRST_AUTHORISATION) <= 0;
}

/**
 * The providers of the file. Null when the file is not the marketplace (its shape, its counts, its
 * size from below); not complete, with no row, when it is longer than the limit.
 */
function read(fetched: Fetched): ReadResult<FedrampProvider> | null {
  const root = jsonOf(textOf(fetched, 0));
  if (!isObject(root)) return null;
  const { meta, data } = root;
  if (!isObject(meta) || typeof meta.last_change !== "string" || !isObject(data)) return null;
  const { Metrics: metrics, Products: items, AtoMapping: mapping } = data;
  if (!isObject(metrics) || !Array.isArray(items) || !Array.isArray(mapping)) return null;
  // The whole list is in the text that was parsed: it is complete unless it is longer than the limit.
  const complete = items.length <= MAX_PRODUCTS && mapping.length <= MAX_PRODUCTS;
  // A list of more products than the limit is not read in part, and no check of it means anything.
  if (!complete) return { rows: [], total: 0, unreadable: 0, complete };
  if (items.length < MIN_PRODUCTS || !countsHold(metrics, items, mapping)) return null;

  // Who claims each host is counted over every product that names a provider, readable or not.
  const claims = new Map<string, Set<string>>();
  const readable: ReadProduct[] = [];
  let unreadable = 0;
  for (const item of items) {
    const identity = identityOf(item);
    const product = identity === null || !isObject(item) ? null : productOf(item, identity);
    if (identity !== null && identity.host !== "") {
      const claimants = claims.get(identity.host) ?? new Set<string>();
      claimants.add(identity.key);
      claims.set(identity.host, claimants);
    }
    if (product === null) unreadable += 1;
    else readable.push(product);
  }

  // One product to an id: of two that share it the smaller text is kept, whatever the order of the file.
  const byId = new Map<string, ReadProduct>();
  for (const product of readable) {
    const kept = byId.get(product.id);
    if (kept === undefined) {
      byId.set(product.id, product);
      continue;
    }
    unreadable += 1;
    if (compareText(JSON.stringify(product), JSON.stringify(kept)) < 0)
      byId.set(product.id, product);
  }

  const providers = new Map<string, ReadProduct[]>();
  for (const product of byId.values()) {
    const group = providers.get(product.key) ?? [];
    group.push(product);
    providers.set(product.key, group);
  }
  const rows = [...providers].map(([key, products]) => providerOf(key, products, claims));
  // The raw products, and never fewer than the providers and the products that failed: the factory
  // refuses a body that says so. A product names one provider, so the raw products are the larger
  // today; the sum is what a reader that groups must say.
  return { rows, total: Math.max(items.length, rows.length + unreadable), unreadable, complete };
}

const COUNT_LABELS = [
  ["authorized", "FedRAMP Authorized"],
  ["ready", "FedRAMP Ready"],
  ["inProcess", "FedRAMP In Process"],
  ["agency", "Agency In Process"],
] as const;

/** How many offerings the provider has, by status; a status of none is left out. */
function countsSentence(counts: FedrampProvider["counts"]): string {
  const total = counts.authorized + counts.ready + counts.inProcess + counts.agency;
  const parts = COUNT_LABELS.filter(([field]) => counts[field] > 0).map(
    ([field, label]) => `${counts[field]} ${label}`,
  );
  const offerings = `${total} cloud offering${total === 1 ? "" : "s"}`;
  return `GSA's FedRAMP Marketplace data lists ${offerings} of it: ${parts.join(", ")}.`;
}

/** An offering as the list shows it; what the file does not say is left out. */
function itemOf(product: FedrampProduct): string {
  const agencies = `used by ${product.agencies} ${product.agencies === 1 ? "agency" : "agencies"}`;
  return [
    `"${product.cso}" (${product.id}), ${product.status} since ${product.day}`,
    product.impact === "" ? "" : `${product.impact} impact`,
    product.authType === "" ? "" : `${product.authType} authorisation`,
    product.agencies > 0 ? agencies : "",
  ]
    .filter((part) => part !== "")
    .join(", ");
}

/**
 * The text of a record: the list (S1), the provider (S2), what the marketplace holds of it by status
 * (S3), up to three of its offerings (S4) and the closing sentence, which says what a listing is
 * not. When the whole is longer than the limit, the third and then the second offering are left
 * out of S4; if one is still too long, the sentences before the closing one are cut (with the mark
 * of a cut) and the closing sentence stays whole and last. With every field at its limit the text
 * is 1,239 characters, so the limit is out of reach of the file.
 */
export function fedrampSummaryOf(row: FedrampProvider): string {
  const opening = [FIRST_SENTENCE, sentence("Provider", row.display), countsSentence(row.counts)];
  const listed = (shown: number): string =>
    shown === 0 ? "" : `Listed: ${row.products.slice(0, shown).map(itemOf).join("; ")}.`;
  for (let shown = row.products.length; shown > 1; shown -= 1) {
    const whole = joinSentences([...opening, listed(shown), CLOSING_SENTENCE]);
    if (whole.length <= RECORD_SUMMARY_MAX) return whole;
  }
  return summaryWithClosing(
    [...opening, listed(Math.min(row.products.length, 1))],
    CLOSING_SENTENCE,
    RECORD_SUMMARY_MAX,
  );
}

/**
 * The record of a provider. A registration number counts only beside a name (keys.ts), so a provider
 * with neither a name key (four characters or more) nor a host that qualifies makes no record at
 * all: that is no row that could not be read, and the sync does not count it.
 */
function recordsOf(row: FedrampProvider): ParsedRecord[] {
  const record = recordOf({
    id: row.id,
    type: "cloud_authorization_status",
    title: `${FEDRAMP_RECORD_MARK}: ${row.display}`,
    summary: fedrampSummaryOf(row),
    url: `${DOCUMENTATION_URL}?provider=${encodeURIComponent(row.id)}`,
    identifiers: { provider: row.display, packages: row.packages },
    names: row.names,
    domains: row.domains,
    regnos: row.ueis,
    publishedAt: row.publishedAt,
  });
  const carries = record.matchKeys.some(
    (key) => key.startsWith("name:") || key.startsWith("domain:"),
  );
  return carries ? [record] : [];
}

export const fedrampConnector: Connector = createFileConnector<FedrampProvider>({
  id: "fedramp",
  version: 1,
  root: "data.json",
  sortKey: (row) => row.id,
  files: [
    {
      url: DATA_URL,
      maxBytes: MAX_BYTES,
      // GitHub serves the file as text/plain.
      contentTypes: ["text/plain", "application/json"],
      timeoutMs: 120_000,
    },
  ],
  // The host is every repository's: the path is what pins the list to this one.
  pin: {
    hosts: ["raw.githubusercontent.com"],
    pathPrefixes: ["/FedRAMP/marketplace-fedramp-gov-data/"],
  },
  read,
  toRecords: (rows) => rows.flatMap(recordsOf),
  // The newest status day of the list: it moves when a status does, not with each daily upload.
  sourceVersion: (rows) =>
    rows.length === 0 ? null : newestDay(rows.map(({ publishedAt }) => publishedAt)),
});
