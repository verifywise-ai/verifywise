/**
 * The category of a source that a finding cites, decided by code from the source registry (see
 * entries.ts), with no model (spec D3.2). The address is read first: its host in lower case,
 * without "www." and a trailing dot. An address that cannot be read is unverified. Then the first
 * step that applies decides:
 *
 * 1. User content is unverified, on any host and before the vendor's own site (Q25): a host whose
 *    first label is one of the words of G11, or a path with one as a segment, and a page on a
 *    platform where users publish (G6–G9), except on the vendor's own subdomain of it (a blog at
 *    `acme.substack.com`). A page of a blocked host stays marked so.
 * 2. A page the research took for the vendor's own, for a vendor with a domain, is the vendor's,
 *    whatever its host: a vendor whose site is a registry host (Bloomberg on bloomberg.com) is
 *    still speaking for itself.
 * 3. The entry of the host: the longest host of a host entry, else the longest suffix. A host with
 *    no entry is unverified and unreviewed.
 * 4. A blocked entry is unverified, and marked so.
 * 5. An EDGAR filing under the CIK a person stored for the vendor is the vendor's, in the archive
 *    and in the SEC's viewers, when the vendor filed it (Q26, Q28). The address names the folder the
 *    filing is shown under, which is every party's: a Schedule 13G about the vendor and a Form 4
 *    for it are in the vendor's folder too. So the header of the filing says who filed it
 *    (edgarFiler.ts), and the answer comes with the source (`edgarFiler`). Only "vendor" makes the
 *    filing the vendor's; "other", and no answer, go on to step 6.
 * 6. A part of a site that is not its publisher's own word is unverified, and marked as
 *    downgraded: the entry's own rules on any entry (any other EDGAR filing on sec.gov, Q26), and
 *    the generic segments and host labels of G1 on a trusted press host only (Q11).
 * 7. A republisher's copy takes the class of the page it names as its canonical address, one
 *    level deep, when that page is on another registry entry that is no republisher and not on
 *    the vendor's own site; else it stays unverified. A court's judgment on a site that republishes
 *    it keeps the category of its entry. Both are marked as syndicated.
 * 8. A wire release is the vendor's word when it carries an e-mail address on the vendor's own
 *    domain, such as its media contact, else unverified (Q27): a link to the domain is not enough.
 * 9. Otherwise the category of the entry.
 *
 * A record of a public database is classified by its database, never by the host of its link
 * (`classifyRecord`): a KEV record links to nvd.nist.gov. Which pages of the vendor's site are its
 * statements (rule V) is decided here too (`isStatementPage`), so that the version of the registry
 * says how a label was reached.
 */
import type {
  RecordSourceId,
  SourceCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import { isOnDomain } from "../../webResearch/publicUrl";
import { storedCikOf } from "../records/sec";
import { publisherKey } from "./publisher";
import type { ResearchTarget } from "../target";
import {
  type DowngradeRule,
  GENERIC_DOWNGRADE_HOST_LABELS,
  GENERIC_DOWNGRADE_SEGMENTS,
  NEWSROOM_SECTIONS,
  REGISTRY,
  type RegistryEntry,
  STATEMENT_HOST_LABELS,
  STATEMENT_SECTIONS,
  USER_CONTENT_HOST_LABELS,
  USER_CONTENT_SECTIONS,
} from "./entries";

/**
 * Who filed an EDGAR filing under the CIK stored on the vendor, as the header of the filing says
 * (Q28, edgarFiler.ts): "vendor" when the stored CIK is a filer in it, "other" when it is only the
 * subject company or the issuer, or does not appear.
 */
export type EdgarFiler = "vendor" | "other";

/** What the classifier reads of a source. */
export interface ClassifiableSource {
  url: string;
  /** True when the research took the source for a page of the vendor's own site. */
  onVendorSite: boolean;
  /** The words of the source, its title and its text: a wire release names a domain there. */
  text?: string;
  /** The address on another site that the page claims as its own, as the session kept it. */
  canonicalUrl?: string;
  /**
   * For an EDGAR filing under the CIK stored on the vendor: who filed it (step 5). Absent when
   * nobody asked, or the SEC could not say: the filing is then the filer's document, as any other.
   */
  edgarFiler?: EdgarFiler;
}

export interface SourceClass {
  category: SourceCategory;
  /**
   * Who published the source: "vendor" for the vendor's own word, the entry id for a host entry
   * (one entry is one publisher, so bbc.com and bbc.co.uk are one), and the name label of the host
   * for a suffix and for an unknown host (two agencies on .gov are two publishers).
   */
  publisher: string;
  /** The id of the registry entry that decided, or null when none did. */
  entry: string | null;
  /** False for a host the registry does not know: nobody has reviewed it. */
  reviewed: boolean;
  downgraded?: true;
  syndicated?: true;
  blocked?: true;
  /** User content (Q25): a forum, a community or a platform where users publish. */
  userContent?: true;
  /** The name of a trusted publisher, for display, when its entry gives one. */
  publisherName?: string;
}

export type SourceClassifier = (source: ClassifiableSource, target: ResearchTarget) => SourceClass;

const VENDOR: SourceClass = {
  category: "vendor",
  publisher: "vendor",
  entry: null,
  reviewed: true,
};

/** The id of the SEC's entry, whose EDGAR archive holds filings under their parties' CIKs. */
const SEC_ENTRY = "sec";

/** The host of the SEC's entry, for an address read without the registry (`isStoredCikFiling`). */
const SEC_HOST = "sec.gov";

/** The path of a filing in EDGAR's archive, which names the CIK of the folder it is shown under. */
const EDGAR_FILING_PATH = /^\/?Archives\/edgar\/data\/(\d{1,10})(?:\/|$)/;

/**
 * The CIK of the folder an EDGAR filing is shown under at an address of the SEC: the segment after
 * /Archives/edgar/data/ in its path, in the `doc` parameter of a viewer (/ix, /ixviewer/ix.html),
 * or the `cik` parameter of /cgi-bin/viewer, as a number; null for any other address. It is a
 * party's CIK, not always the filer's (Q28).
 */
function edgarFolderCikOf(url: URL): number | null {
  const fromPath = (path: string | null): number | null => {
    const match = path === null ? null : EDGAR_FILING_PATH.exec(path);
    return match === null ? null : Number(match[1]);
  };
  if (/^\/ix(?:viewer\/ix\.html)?$/.test(url.pathname))
    return fromPath(url.searchParams.get("doc"));
  if (url.pathname === "/cgi-bin/viewer") {
    const cik = url.searchParams.get("cik") ?? "";
    return /^\d{1,10}$/.test(cik) ? Number(cik) : null;
  }
  return fromPath(url.pathname);
}

/** True when the address is an EDGAR filing in the folder of the CIK stored on the vendor. */
function isInStoredFolder(url: URL, target: ResearchTarget): boolean {
  const stored = storedCikOf(target);
  if (stored === null) return false;
  const folder = edgarFolderCikOf(url);
  return folder !== null && folder === Number(stored);
}

/**
 * True when the address is an EDGAR filing under the CIK stored on the vendor and the vendor filed
 * it, as the header says (step 5, Q28): the folder alone is every party's.
 */
function isVendorFiling(
  url: URL,
  target: ResearchTarget,
  edgarFiler: EdgarFiler | undefined,
): boolean {
  return edgarFiler === "vendor" && isInStoredFolder(url, target);
}

/**
 * True when the address is an EDGAR filing, on the SEC's host, under the CIK stored on the vendor:
 * a filing that step 5 asks the answer of `edgarFiler` for. The analysis asks the SEC who filed
 * those, and no other (analysis.ts). False for an address that cannot be read.
 */
export function isStoredCikFiling(address: string, target: ResearchTarget): boolean {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  return isOnDomain(normaliseHost(url.hostname), SEC_HOST) && isInStoredFolder(url, target);
}

/** A host as it is looked up: lower case, without a trailing dot and a leading "www.". */
function normaliseHost(hostname: string): string {
  const lower = hostname.toLowerCase();
  const bare = lower.endsWith(".") ? lower.slice(0, -1) : lower;
  return bare.startsWith("www.") ? bare.slice("www.".length) : bare;
}

function hostOf(url: string): string | null {
  try {
    return normaliseHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

/** The entry of the host itself or of the nearest domain above it: the longest match. */
function longestMatch(
  host: string,
  entries: ReadonlyMap<string, RegistryEntry>,
): RegistryEntry | undefined {
  let rest = host;
  for (;;) {
    const entry = entries.get(rest);
    if (entry !== undefined) return entry;
    const dot = rest.indexOf(".");
    if (dot < 0) return undefined;
    rest = rest.slice(dot + 1);
  }
}

/** The segments of a path in lower case, without the empty ones. */
const segmentsOf = (path: string): string[] =>
  path
    .toLowerCase()
    .split("/")
    .filter((segment) => segment !== "");

const startsWithSegments = (segments: readonly string[], prefix: string): boolean =>
  segmentsOf(prefix).every((segment, index) => segments[index] === segment);

function matchesRule(rule: DowngradeRule, host: string, segments: readonly string[]): boolean {
  if ("host" in rule) {
    return (
      isOnDomain(host, rule.host) &&
      (rule.pathPrefix === undefined || startsWithSegments(segments, rule.pathPrefix))
    );
  }
  if ("pathSegments" in rule) {
    return rule.pathSegments.every((wanted, index) => {
      const segment = segments[index];
      if (segment === undefined) return false;
      return wanted === "#" ? /^\d+$/.test(segment) : segment === wanted.toLowerCase();
    });
  }
  if ("pathSegment" in rule) return segments.includes(rule.pathSegment.toLowerCase());
  if ("pathPrefix" in rule) {
    return (
      startsWithSegments(segments, rule.pathPrefix) &&
      !(rule.unless !== undefined && startsWithSegments(segments, rule.unless))
    );
  }
  const slug = segments[segments.length - 1];
  if (slug === undefined) return false;
  if ("slugPrefix" in rule) return slug.startsWith(rule.slugPrefix.toLowerCase());
  if ("slugSuffix" in rule) return slug.endsWith(rule.slugSuffix.toLowerCase());
  return slug.includes(rule.slugContains.toLowerCase());
}

/**
 * True when the address is on a part of a site that is not its publisher's own word: the entry's
 * own rules, on any entry (Q26), and the generic segments and host labels of G1 on a trusted press
 * host only (Q11).
 */
function isDowngraded(entry: RegistryEntry, host: string, url: URL): boolean {
  const segments = segmentsOf(url.pathname);
  if (entry.category === "trusted_press") {
    if (GENERIC_DOWNGRADE_SEGMENTS.some((segment) => segments.includes(segment))) return true;
    if (GENERIC_DOWNGRADE_HOST_LABELS.some((label) => host.startsWith(`${label}.`))) return true;
  }
  return (entry.downgrade ?? []).some((rule) => matchesRule(rule, host, segments));
}

/** A character of the local part of an e-mail address, in lower case: `[a-z0-9._%+-]`. */
const isLocalChar = (char: string): boolean =>
  (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || "._%+-".includes(char);

/** A character of a host name, in lower case: `[a-z0-9.-]`. */
const isHostChar = (char: string): boolean =>
  (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || char === "." || char === "-";

/**
 * True when the text carries an e-mail address on the domain or on a subdomain of it
 * (`press@acme.com`, `x@mail.acme.com`), and not on a host that only starts or ends like it
 * (`x@acme.com.evil.com`, `x@notacme.com`). Case and a trailing dot do not count. The text is read
 * once, from one `@` to the next, with no regular expression, so a release of any length is read
 * in linear time.
 */
export function emailOnDomain(text: string, domain: string): boolean {
  const wanted = domain.toLowerCase();
  if (wanted === "") return false;
  const lower = text.toLowerCase();
  for (let at = lower.indexOf("@"); at >= 0; at = lower.indexOf("@", at + 1)) {
    if (at === 0 || !isLocalChar(lower[at - 1])) continue;
    let end = at + 1;
    while (end < lower.length && isHostChar(lower[end])) end += 1;
    const read = lower.slice(at + 1, end);
    const host = read.endsWith(".") ? read.slice(0, -1) : read;
    if (host === wanted || host.endsWith(`.${wanted}`)) return true;
  }
  return false;
}

/**
 * True when a page of a platform where users publish is on the vendor's own subdomain of it: a
 * vendor whose site is `acme.substack.com` speaks for itself there (Q25).
 */
function isOnOwnSubdomain(platform: RegistryEntry, host: string, target: ResearchTarget): boolean {
  if (target.domain === null) return false;
  const domain = normaliseHost(target.domain);
  return (
    isOnDomain(host, domain) &&
    platform.hosts.some((platformHost) => domain.endsWith(`.${platformHost}`))
  );
}

/** The separators that may follow the word of a section in a segment: `trust-center`, `privacy.html`. */
const SECTION_SEPARATORS = "-_.";

/** A segment of a path that is a locale: `en`, `en-us`, `pt_br`, `zh-hans`. */
const LOCALE_SEGMENT = /^[a-z]{2}(?:[-_][a-z]{2,4})?$/;

/**
 * The segments that only name the vendor's own part of a site, whole and not as the start of a
 * longer one: when a path starts with one (after its locale), its section is the segment after it
 * (`/company/trust`, `/about-us/legal`).
 */
const COMPANY_SEGMENTS: readonly string[] = ["company", "about", "about-us", "corporate"];

/** True when a segment is one of the words, alone or followed by a separator. */
const isSection = (segment: string, words: readonly string[]): boolean =>
  words.some(
    (word) =>
      segment.startsWith(word) &&
      (segment.length === word.length || SECTION_SEPARATORS.includes(segment[word.length])),
  );

/** How many leading segments only name the locale: `/en-us/` is one, `/intl/en-us/` two. */
function localeLength(segments: readonly string[]): number {
  if (segments[0] === "intl" && LOCALE_SEGMENT.test(segments[1] ?? "")) return 2;
  return LOCALE_SEGMENT.test(segments[0] ?? "") ? 1 : 0;
}

/**
 * The section of a page of the vendor's site, from the segments of its path: the first one after
 * the locale, or the one after that when the first is `company`, `about`, `about-us` or
 * `corporate`; undefined when the path has none. It reads four segments at most, whatever the
 * length of the path.
 */
function sectionOf(segments: readonly string[]): string | undefined {
  const start = localeLength(segments);
  const first = segments[start];
  return first !== undefined && COMPANY_SEGMENTS.includes(first) ? segments[start + 1] : first;
}

/**
 * True when an address of the vendor's own site is a page where the vendor states what binds it
 * or reports about itself (rule V, spec D5.4): a trust, security, legal, privacy, terms, policy,
 * compliance, subprocessor or status section (STATEMENT_SECTIONS), or a trust, security or status
 * host. The section is the first segment of the path, after a locale (`/en-us/`) or `intl` and a
 * locale (`/intl/en-us/`); when that segment is `company`, `about`, `about-us` or `corporate`, the
 * section is the one after it (`/company/trust`). A page of the newsroom is never one
 * (NEWSROOM_SECTIONS), with a segment of it at any depth, and the title is not read: what a vendor
 * announces, and the tagline of its pages, are claims. False for an address that cannot be read.
 */
export function isStatementPage(address: string): boolean {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  const segments = segmentsOf(url.pathname);
  if (segments.some((segment) => isSection(segment, NEWSROOM_SECTIONS))) return false;
  const host = normaliseHost(url.hostname);
  if (STATEMENT_HOST_LABELS.some((label) => host.startsWith(`${label}.`))) return true;
  const section = sectionOf(segments);
  return section !== undefined && isSection(section, STATEMENT_SECTIONS);
}

/** A classifier over a registry; the index of its hosts is built once. */
export function createSourceClassifier(registry: readonly RegistryEntry[]): SourceClassifier {
  const byHost = new Map<string, RegistryEntry>();
  const bySuffix = new Map<string, RegistryEntry>();
  for (const entry of registry) {
    for (const host of entry.hosts) (entry.suffix ? bySuffix : byHost).set(host, entry);
  }

  /** The entry of a host, and whether a host entry (not a suffix) decided. */
  const entryOf = (host: string): { entry: RegistryEntry; ofHost: boolean } | null => {
    const hosted = longestMatch(host, byHost);
    if (hosted !== undefined) return { entry: hosted, ofHost: true };
    const suffixed = longestMatch(host, bySuffix);
    return suffixed === undefined ? null : { entry: suffixed, ofHost: false };
  };

  /**
   * The class of the page a copy names as its canonical address, or null when the copy is not
   * credited with it: no address, one that cannot be read, one on the vendor's own site (the
   * vendor speaking is no publisher), on a host the registry does not know, or on an entry that
   * republishes too.
   */
  const creditOf = (
    source: ClassifiableSource,
    target: ResearchTarget,
    copy: RegistryEntry,
  ): SourceClass | null => {
    if (source.canonicalUrl === undefined) return null;
    const host = hostOf(source.canonicalUrl);
    if (host === null) return null;
    if (target.domain !== null && isOnDomain(host, target.domain)) return null;
    const named = entryOf(host);
    if (named === null || named.entry === copy || named.entry.flags?.includes("syndicated")) {
      return null;
    }
    const original = classify(
      { url: source.canonicalUrl, onVendorSite: false, text: source.text },
      target,
      false,
    );
    return { ...original, syndicated: true };
  };

  /**
   * The class of a page of user content (step 1, Q25), or null for another page: a host or a
   * section of G11, or a platform of G6–G9 unless the page is on the vendor's own subdomain of it.
   * A page of a blocked host stays blocked, so that it never enters the pack.
   */
  const userContentOf = (
    source: ClassifiableSource,
    url: URL,
    host: string,
    target: ResearchTarget,
  ): SourceClass | null => {
    const segments = segmentsOf(url.pathname);
    const ofG11 =
      USER_CONTENT_HOST_LABELS.some((label) => host.startsWith(`${label}.`)) ||
      segments.some((segment) => USER_CONTENT_SECTIONS.includes(segment));
    const found = longestMatch(host, byHost);
    const platform =
      found?.userContent === true && !isOnOwnSubdomain(found, host, target) ? found : null;
    if (platform === null && !ofG11) return null;
    const blocked = entryOf(host)?.entry.flags?.includes("blocked") === true;
    return {
      category: "unverified",
      publisher: platform?.id ?? publisherKey(source.url) ?? host,
      entry: platform?.id ?? null,
      reviewed: true,
      userContent: true,
      ...(blocked ? { blocked: true } : {}),
    };
  };

  const classify = (
    source: ClassifiableSource,
    target: ResearchTarget,
    followCanonical: boolean,
  ): SourceClass => {
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      return { category: "unverified", publisher: source.url, entry: null, reviewed: false };
    }
    const host = normaliseHost(url.hostname);
    const userContent = userContentOf(source, url, host, target);
    if (userContent !== null) return userContent;
    if (target.domain !== null && source.onVendorSite) return { ...VENDOR };
    const found = entryOf(host);
    if (found === null) {
      return {
        category: "unverified",
        publisher: publisherKey(source.url) ?? host,
        entry: null,
        reviewed: false,
      };
    }
    const { entry } = found;
    const own = {
      publisher: found.ofHost ? entry.id : (publisherKey(source.url) ?? host),
      entry: entry.id,
      reviewed: true,
    };
    if (entry.flags?.includes("blocked")) return { category: "unverified", ...own, blocked: true };
    if (entry.id === SEC_ENTRY && isVendorFiling(url, target, source.edgarFiler))
      return { ...VENDOR, entry: entry.id };
    if (isDowngraded(entry, host, url)) return { category: "unverified", ...own, downgraded: true };
    if (entry.syndicatedFrom === "canonical") {
      const credited = followCanonical ? creditOf(source, target, entry) : null;
      return credited ?? { category: "unverified", ...own, syndicated: true };
    }
    if (entry.syndicatedFrom === "issuer") {
      return { category: entry.category, ...own, syndicated: true };
    }
    if (entry.wire) {
      return target.domain !== null && emailOnDomain(source.text ?? "", target.domain)
        ? { ...VENDOR, entry: entry.id }
        : { category: "unverified", ...own };
    }
    return {
      category: entry.category,
      ...own,
      ...(entry.category === "trusted_press" && entry.publisher !== undefined
        ? { publisherName: entry.publisher }
        : {}),
    };
  };

  return (source, target) => classify(source, target, true);
}

/** The classifier over the registry of this version. */
export const classifySource: SourceClassifier = createSourceClassifier(REGISTRY);

/**
 * What each database's records are, and how surely a record is about the vendor: a KEV, NVD or
 * CVE record names the vendor's product, while a filing of the SEC or an entry of a sanctions list
 * (OFAC, UK, EU, UN) is found by the name alone and may be another company (Q3), unless the SEC was
 * asked by the CIK a person stored on the vendor (`recordMatchOf`). HIBP reports what a third party
 * says of a breach, and the status page is the vendor's own word.
 */
const RECORD_CLASSES: Readonly<
  Record<RecordSourceId, { category: SourceCategory; match: "strong" | "weak" | null }>
> = {
  kev: { category: "official", match: "strong" },
  nvd: { category: "official", match: "strong" },
  sec: { category: "official", match: "weak" },
  ofac: { category: "official", match: "weak" },
  uk_sanctions: { category: "official", match: "weak" },
  eu_fsf: { category: "official", match: "weak" },
  cve: { category: "official", match: "strong" },
  un_sanctions: { category: "official", match: "weak" },
  hibp: { category: "unverified", match: null },
  statuspage: { category: "vendor", match: null },
};

/** The class of a record, by its database: the database is the publisher. */
export function classifyRecord(id: RecordSourceId): SourceClass {
  const { category } = RECORD_CLASSES[id];
  return {
    category,
    publisher: category === "vendor" ? "vendor" : id,
    entry: null,
    reviewed: true,
  };
}

/**
 * How surely a record of the database is about the vendor; null for a database with no match. The
 * SEC is asked by the CIK a person stored on the vendor when there is one (records/index.ts), and
 * its records are then the vendor's own filings.
 */
export function recordMatchOf(
  id: RecordSourceId,
  target?: ResearchTarget,
): "strong" | "weak" | null {
  if (id === "sec" && target !== undefined && storedCikOf(target) !== null) return "strong";
  return RECORD_CLASSES[id].match;
}
