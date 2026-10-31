/**
 * The routine work of a research run, done by code before the model's first step.
 *
 * A model that starts from nothing spends its first turns on what every run needs: the news
 * searches for the two categories that search the news, and the vendor's own trust, security,
 * privacy and legal pages. The measured runs (docs/technical/infrastructure/web-research.md, "Why
 * these limits") spent a model turn of 2.5 to 3.3 seconds on each of them. So the code does that
 * work first, at once, and the model is told what was collected and spends its turns on what is
 * missing.
 *
 * It has three parts. The searches are the queries that work (`suggestedQueries` of queries.ts: the
 * name and one or two topic words, and one led by the vendor's first other name) for the news
 * categories that the run researches, and one more for each of them that the model's memory gave
 * (hints.ts, only ever a query). The best two
 * results of each news category are then read (`planNewsReads`), because a snippet is short and can
 * mislead and the page says what happened; the reads are made together with those of the site. The site is
 * read for the two categories that read the vendor's own pages: the pages its home page links to
 * (the check of the website, preflight.ts), the pages of its sitemap, and, only for a category
 * that these leave with fewer than two, the pages that sites usually have (`/security`, `/trust`,
 * `/privacy`, a `trust.` or `security.` subdomain, `/.well-known/security.txt`). At most three
 * pages are read for each category. Nothing here is a guess about the vendor: the pages are the
 * vendor's own, and a page that does not exist is a failed read like any other.
 *
 * The work goes through the run's web session, so that every rule of the session applies to it
 * (the address policy, `robots.txt`, the lookback window, relevance, one entry for one page), but
 * it is paid for apart: the code sets aside what it is about to do (`setCodeBudget`) and its calls
 * are made `by: "code"`, so the model keeps its own share and its own refunds. Only the sitemap is read outside the session, like the home page of the check: it
 * is a list of addresses, not a source, so it uses no budget and leaves nothing in the ledger.
 *
 * The site is not read when it is closed, when its home page redirected somewhere that is not the
 * vendor's website, or when the home page does not name the vendor (the domain may belong to
 * another company); the searches are made all the same.
 *
 * The records of the public databases come first, before any search. The vendor risk database
 * (vrdb/) gives those of the lists it keeps a copy of, with what it knows of each record, and the
 * lookup of records/ those of the databases that are asked during the run (only the ones the VRDB
 * does not keep while it is on). They go into the ledger before the results of the searches.
 *
 * Nothing here talks to a model or throws for what the web does: a search or a read that fails is
 * a result. The caller gets what the code did, in order, as the loop's observer is told about the
 * turns of the model, and the text for the loop's briefing.
 */
import {
  type CoverageLookup,
  type CoverageOutcome,
  RESEARCH_CATEGORIES,
  ResearchCategory,
  SOURCE_CATEGORIES,
} from "../../domain.layer/interfaces/i.vendorResearch";
import type { PageLink } from "../webResearch/pageText";
import { isOnDomain } from "../webResearch/publicUrl";
import { PageReadError, PageReader } from "../webResearch/readPage";
import { LoopTurn, traceOfRead, traceOfSearch } from "../webResearch/researchLoop";
import type { LedgerEntry, WebSession } from "../webResearch/webSession";
import { SITE_CATEGORIES } from "./categories";
import { createVendorMatcher, shortName } from "./identity";
import { localQueries } from "./market";
import {
  type RecordSourceId,
  type RecordsLookup,
  type RecordsOutcome,
  mergeSameAddress,
  sourcesBesideVrdb,
} from "./records";
import { RECORD_CATEGORY } from "./records/types";
import { suggestedQueries } from "./queries";
import type { ResearchRules } from "./schema";
import { classifySource } from "./sourceRegistry/classify";
import { type SourceTier, publisherKey, tierOf } from "./sourceTiers";
import { ResearchTarget } from "./target";
import { cutAtCodePoint } from "./text";
import { type WebsiteCheck, verifiedDomainsOf } from "./preflight";
import type { TraceStep } from "./trace";
import type { VrdbGate } from "./vrdb/gates";
import { vrdbSourceOf } from "./vrdb/sources";
import type { VrdbLookup, VrdbOutcome } from "./vrdb/types";

/** How long all of it may take: the sitemap, the searches and the reads. */
export const GATHER_TIMEOUT_MS = 30_000;
/** The pages of the vendor's own site that the code reads for each category that reads the site. */
export const MAX_SITE_READS_PER_CATEGORY = 3;
/** A category that the links and the sitemap leave with fewer pages than this gets the usual ones. */
export const MIN_CANDIDATES_BEFORE_GUESSING = 2;
/** The results of each news category that the code reads, once the searches are made. */
export const MAX_NEWS_READS_PER_CATEGORY = 2;
/** The rank of the first address of a sitemap: after any link of the home page. */
const SITEMAP_ORDER = 1000;
/** The addresses of a sitemap that are looked at. */
const MAX_SITEMAP_ADDRESSES = 5000;
/** The sources per category that the briefing lists. */
const MAX_LISTED_PER_CATEGORY = 6;
const MAX_LISTED_TITLE_CHARS = 100;

/** What the code did, as the observer of the loop is told a turn of the model (see researchLoop.ts). */
export type GatheredAction = Pick<
  LoopTurn<ResearchCategory>,
  | "tool"
  | "category"
  | "kind"
  | "query"
  | "usedQuery"
  | "url"
  | "outcome"
  | "reason"
  | "results"
  | "omitted"
  | "ms"
> & {
  /** The language of a search that was not made in English (see market.ts). */
  language?: string;
};

export interface GatherResult {
  /** The searches, then the reads, in the order they were asked for. */
  actions: GatheredAction[];
  /**
   * The read of the sitemap, which is outside the session; null when none was made. `urls` is the
   * number of addresses of the vendor's site that it listed.
   */
  sitemap: {
    url: string;
    outcome: "ok" | "failed";
    reason?: string;
    urls: number;
    ms: number;
  } | null;
  /**
   * What the lookups in the public databases found, one outcome for each database or list asked:
   * the lists of the vendor risk database first, then the databases of the lookup of records/.
   */
  records: RecordsOutcome[];
  /** What the vendor risk database gave, with the coverage of its lists; null without it. */
  vrdb: VrdbOutcome | null;
  /**
   * What each database that is asked beside the vendor risk database answered (see
   * `coverageOfLookups`), for the coverage of the run.
   */
  lookups: CoverageLookup[];
  /** What was collected, as text for the briefing of the loop; null when the code did nothing. */
  digest: string | null;
}

interface SiteTopic {
  category: ResearchCategory;
  pattern: RegExp;
  weight: number;
}

/**
 * What a page of the vendor's site is about, by the words of its address and of the text of the
 * link to it. The words of the address are separated first, so "security-overview" holds
 * "security". The best weight a page gets decides its category and its rank.
 */
const SITE_TOPICS: readonly SiteTopic[] = [
  { category: "certifications", pattern: /\btrust\b|\btrustcenter\b/i, weight: 5 },
  { category: "certifications", pattern: /\bsecurity\b/i, weight: 4 },
  {
    category: "certifications",
    pattern: /\bcompliance\b|\bcertifications?\b|\bsoc ?2\b|\biso ?27\d*\b|\bpentests?\b/i,
    weight: 3,
  },
  {
    category: "certifications",
    pattern: /\bvulnerabilit(?:y|ies)\b|\bdisclosure\b|\bbug bounty\b/i,
    weight: 2,
  },
  { category: "ai_specific", pattern: /\bsub ?processors?\b/i, weight: 5 },
  {
    category: "ai_specific",
    pattern: /\bdpa\b|\bdata processing\b|\bdata protection\b/i,
    weight: 4,
  },
  { category: "ai_specific", pattern: /\bprivacy\b/i, weight: 4 },
  {
    category: "ai_specific",
    pattern: /\bai\b|\bartificial intelligence\b|\bmachine learning\b|\bgenerative\b/i,
    weight: 3,
  },
  { category: "ai_specific", pattern: /\bterms\b|\blegal\b/i, weight: 2 },
];

/**
 * Paths that are not the vendor's statement of its terms, and files that cannot be read as a page.
 * A PDF can be read (see webResearch/pdfText.ts), so it is not among them.
 */
const NOT_A_SITE_PAGE =
  /^\/(?:blog|news|press|careers|jobs|customers|case-stud(?:y|ies)|events|webinars?|podcasts?)(?:\/|$)|\.(?:png|jpe?g|gif|svg|webp|zip|xml|json|css|js|mp4|docx?|xlsx?)$/i;

/** A PDF is the slower read and has no links, so a page of the same fit is read first. */
const isPdfAddress = (address: string): boolean => /\.pdf$/i.test(new URL(address).pathname);

/** The words of an address path, separated: "/legal/sub-processors" is "legal sub processors". */
const wordsOfPath = (pathname: string): string => pathname.replace(/[^a-z0-9]+/gi, " ").trim();

/**
 * The category a page of the vendor's site serves and how well it fits, from its address and the
 * text of the link to it; null when it serves none (a blog post, a file, a page about pricing).
 * Between categories of the same weight the first, `certifications`, wins.
 */
export function classifySitePage(
  address: string,
  linkText = "",
): { category: ResearchCategory; score: number } | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (NOT_A_SITE_PAGE.test(url.pathname)) return null;
  const words = `${linkText} ${wordsOfPath(url.pathname)}`;
  let best: { category: ResearchCategory; score: number } | null = null;
  for (const topic of SITE_TOPICS) {
    if (!topic.pattern.test(words)) continue;
    if (best === null || topic.weight > best.score) {
      best = { category: topic.category, score: topic.weight };
    }
  }
  return best;
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

/**
 * The addresses on the vendor's domains that a sitemap lists, in its order and once each. The
 * addresses of other sites, and those of other sitemaps (a sitemap index), are left out.
 */
export function sitemapAddresses(markup: string, domains: readonly string[]): string[] {
  const found = new Set<string>();
  // `[^<]*` reaches the next `<` at most: a `<loc>` that is never closed costs the stretch up to
  // the next tag. The white space around an address is left to `new URL`, which ignores it.
  for (const match of markup.matchAll(/<loc>([^<]*)<\/loc>/gi)) {
    if (found.size >= MAX_SITEMAP_ADDRESSES) break;
    const raw = match[1].replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]);
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (!domains.some((domain) => isOnDomain(url.hostname, domain))) continue;
    if (/\.xml$/i.test(url.pathname)) continue;
    url.hash = "";
    found.add(url.href);
  }
  return [...found];
}

/** The pages that sites usually have, for a category, when the site's own links did not give two. */
function usualPages(origin: string, base: string): Partial<Record<ResearchCategory, string[]>> {
  return {
    certifications: [
      `${origin}/security`,
      `${origin}/trust`,
      `https://trust.${base}/`,
      `https://security.${base}/`,
      `${origin}/compliance`,
      `${origin}/.well-known/security.txt`,
    ],
    ai_specific: [
      `${origin}/privacy`,
      `${origin}/legal/privacy`,
      `${origin}/privacy-policy`,
      `${origin}/terms`,
      `${origin}/legal/dpa`,
      `${origin}/subprocessors`,
    ],
  };
}

export interface SiteRead {
  category: ResearchCategory;
  url: string;
}

/** An address as a key: without its fragment and its trailing slash. */
function keyOf(address: string): string | null {
  try {
    const url = new URL(address);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * The pages of the vendor's site to read, for the categories that read it: up to
 * MAX_SITE_READS_PER_CATEGORY for each, `certifications` first. A page serves one category, the
 * one it fits best. The better fit comes before the worse, a page before a PDF of the same fit,
 * the pages the home page links to before those of the sitemap, then the shorter path before the
 * longer. A category left with
 * fewer than MIN_CANDIDATES_BEFORE_GUESSING pages gets the usual ones until it has three.
 *
 * @param input.origin The origin of the site as it answered (`https://www.acme.com`).
 * @param input.domains The vendor's domains: the recorded one, and the one it moved to.
 */
export function planSiteReads(input: {
  origin: string;
  domains: readonly string[];
  links: readonly PageLink[];
  sitemap: readonly string[];
  researchable: readonly ResearchCategory[];
}): SiteRead[] {
  const { origin, domains, links, sitemap, researchable } = input;
  const ranked = new Map<
    string,
    { url: string; category: ResearchCategory; score: number; order: number }
  >();
  const consider = (address: string, linkText: string, order: number) => {
    const key = keyOf(address);
    const fit = classifySitePage(address, linkText);
    if (key === null || fit === null || !researchable.includes(fit.category)) return;
    const earlier = ranked.get(key);
    if (earlier === undefined || fit.score > earlier.score) {
      ranked.set(key, {
        url: address,
        category: fit.category,
        score: fit.score,
        order: Math.min(order, earlier?.order ?? order),
      });
    }
  };
  links.forEach((link, index) => {
    if (domains.some((domain) => isOnDomain(hostOf(link.url), domain))) {
      consider(link.url, link.text, index);
    }
  });
  sitemap.forEach((address, index) => consider(address, "", SITEMAP_ORDER + index));

  const depth = (address: string) => new URL(address).pathname.split("/").filter(Boolean).length;
  const reads: SiteRead[] = [];
  const base = domains[0] ?? hostOf(origin);
  const usual = usualPages(origin, base);
  for (const category of RESEARCH_CATEGORIES) {
    if (!researchable.includes(category)) continue;
    const chosen = [...ranked.values()]
      .filter((entry) => entry.category === category)
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(isPdfAddress(a.url)) - Number(isPdfAddress(b.url)) ||
          Number(a.order >= SITEMAP_ORDER) - Number(b.order >= SITEMAP_ORDER) ||
          depth(a.url) - depth(b.url) ||
          a.order - b.order,
      )
      .slice(0, MAX_SITE_READS_PER_CATEGORY)
      .map((entry) => entry.url);
    if (chosen.length < MIN_CANDIDATES_BEFORE_GUESSING) {
      const taken = new Set([...ranked.keys(), ...chosen.map((address) => keyOf(address))]);
      for (const address of usual[category] ?? []) {
        if (chosen.length >= MAX_SITE_READS_PER_CATEGORY) break;
        const key = keyOf(address);
        if (key === null || taken.has(key)) continue;
        taken.add(key);
        chosen.push(address);
      }
    }
    for (const url of chosen) reads.push({ category, url });
  }
  // A page serves one category: the first category to take an address keeps it.
  const seen = new Set<string>();
  return reads.filter((read) => {
    const key = keyOf(read.url);
    if (key === null || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hostOf(address: string): string {
  try {
    return new URL(address).hostname;
  } catch {
    return "";
  }
}

export interface SearchPlan {
  category: ResearchCategory;
  query: string;
  /** Set for a search in the language of the vendor's market (see market.ts); absent for English. */
  language?: string;
}

/**
 * The news searches to make: the queries that work, for the news categories that are researched
 * (those in the language of the vendor's market say which), then the searches that the hints make
 * (see hints.ts), which the caller has already made distinct from these.
 */
export function planSearches(
  target: ResearchTarget,
  researchable: readonly ResearchCategory[],
  hints: readonly SearchPlan[] = [],
): SearchPlan[] {
  const suggested = suggestedQueries(target, researchable);
  const languageOf = new Map(
    localQueries(target, researchable).map((search) => [
      `${search.category}\n${search.query}`,
      search.language,
    ]),
  );
  const baseline = RESEARCH_CATEGORIES.flatMap((category) =>
    (suggested[category] ?? []).map((query): SearchPlan => {
      const language = languageOf.get(`${category}\n${query}`);
      return language === undefined ? { category, query } : { category, query, language };
    }),
  );
  return [...baseline, ...hints];
}

/** How much a source is worth reading, by its tier: the lower the better. */
const TIER_RANK: Record<SourceTier, number> = {
  official: 0,
  regulator_or_court: 0,
  major_publisher: 1,
  other: 2,
  aggregator: 3,
};

export interface NewsRead {
  category: ResearchCategory;
  url: string;
}

/**
 * The results of the news categories that are worth a read, once the searches are in the ledger:
 * the best two of each category (`MAX_NEWS_READS_PER_CATEGORY`), the categories in their order.
 * A result is better when its title names the vendor (the article is about it, not passing by),
 * then when its source is more credible, then when it is more recent (an undated one last), and
 * last by its place in the search. The credibility is the tier under the confidence rules (the
 * vendor's own notice, a regulator or a court, a major publisher, a site nobody knows, an
 * aggregator) and the registry category under the credibility rules (official, trusted press,
 * the vendor, unverified; see sourceRegistry/). Results of different publishers come before a second one of the same
 * publisher, since two independent publishers are what a confident finding needs. The pages that
 * were already read, and the categories that read the vendor's site, are no candidates.
 */
export function planNewsReads(input: {
  ledger: readonly LedgerEntry<ResearchCategory>[];
  target: ResearchTarget;
  researchable: readonly ResearchCategory[];
  /** The rules of the run, which say how a source's credibility is ranked; confidence by default. */
  rules?: ResearchRules;
}): NewsRead[] {
  const { ledger, target, researchable } = input;
  const namesVendor = createVendorMatcher(target);
  const credibilityOf = (entry: LedgerEntry<ResearchCategory>): number => {
    const source = { url: entry.url, onVendorSite: entry.onVendorSite };
    if (input.rules !== "credibility") return TIER_RANK[tierOf(source, target)];
    const text = `${entry.title} ${entry.content}`;
    return SOURCE_CATEGORIES.indexOf(classifySource({ ...source, text }, target).category);
  };
  const rankOf = (entry: LedgerEntry<ResearchCategory>, place: number) => {
    const published = entry.publishedAt === null ? Number.NaN : Date.parse(entry.publishedAt);
    return {
      entry,
      place,
      named: namesVendor({ title: entry.title, content: "" }) ? 0 : 1,
      tier: credibilityOf(entry),
      // The more recent first; a result with no usable date after all the dated ones.
      age: Number.isNaN(published) ? Number.POSITIVE_INFINITY : -published,
    };
  };

  return RESEARCH_CATEGORIES.flatMap((category) => {
    if (!researchable.includes(category) || SITE_CATEGORIES.includes(category)) return [];
    const ranked = ledger
      .map((entry, place) => ({ entry, place }))
      .filter(({ entry }) => entry.category === category && entry.kind === "result")
      .map(({ entry, place }) => rankOf(entry, place))
      .sort((a, b) => a.named - b.named || a.tier - b.tier || a.age - b.age || a.place - b.place);

    const picked: typeof ranked = [];
    const publishers = new Set<string>();
    const sameAgain: typeof ranked = [];
    for (const candidate of ranked) {
      if (picked.length >= MAX_NEWS_READS_PER_CATEGORY) break;
      const publisher = publisherKey(candidate.entry.url) ?? candidate.entry.url;
      if (publishers.has(publisher)) {
        sameAgain.push(candidate);
        continue;
      }
      publishers.add(publisher);
      picked.push(candidate);
    }
    for (const candidate of sameAgain) {
      if (picked.length >= MAX_NEWS_READS_PER_CATEGORY) break;
      picked.push(candidate);
    }
    return picked.map(({ entry }) => ({ category, url: entry.url }));
  });
}

/**
 * Where the site is read from, or null when it is not read: the origin it answered from and the
 * domains that are the vendor's. The links are those of the home page, for the plan.
 */
function siteToRead(
  website: WebsiteCheck,
  target: ResearchTarget,
): { origin: string; domains: string[]; links: PageLink[] } | null {
  const domain = target.domain;
  if (domain === null) return null;
  switch (website.status) {
    case "no_website":
    case "closed":
      return null;
    case "readable": {
      if (!website.namesVendor) return null;
      if (website.redirectedTo !== null && website.alias === null) return null;
      let origin = `https://${domain}`;
      try {
        origin = new URL(website.url).origin;
      } catch {
        // The origin of the recorded domain stands.
      }
      return {
        origin,
        domains: website.alias === null ? [domain] : [domain, website.alias],
        links: website.links,
      };
    }
    default:
      // Unreadable (a page built by a script) or unchecked: the domain is the one that was recorded.
      return { origin: `https://${domain}`, domains: [domain], links: [] };
  }
}

/** "1 result", "no results". */
const resultsOf = (count: number | undefined) =>
  count === undefined || count === 0 ? "no results" : count === 1 ? "1 result" : `${count} results`;

const dayOf = (date: string | null) => (date === null ? "no date" : date.slice(0, 10));

const RECORD_SOURCE_NAMES: Record<RecordSourceId, string> = {
  kev: "CISA Known Exploited Vulnerabilities catalog",
  // Its records are of the last 120 days when asked per run, and of up to 24 months when read
  // through the vendor risk database: each says its own date, so the name names no window.
  nvd: "National Vulnerability Database (critical vulnerabilities, each with its date)",
  hibp: "Have I Been Pwned (breaches of the vendor's domain)",
  sec: "SEC EDGAR (Form 8-K Item 1.05, the vendor's own reports of material cybersecurity incidents)",
  statuspage: "Status page of the vendor (the incident history it publishes)",
  ofac: "OFAC sanctions list of the US Treasury (entities that have the name of the vendor)",
  uk_sanctions:
    "UK Sanctions List of the FCDO (entities that have the name or the verified website of the vendor)",
  eu_fsf: "EU consolidated list of financial sanctions (entities that have the name of the vendor)",
  cve: "CVE Program records (critical vulnerabilities of the vendor's products)",
  un_sanctions: "UN Security Council Consolidated List (entities that have the name of the vendor)",
};

/** An address as the session keeps it, so that a record can be found among the sources. */
const canonicalUrl = (url: string): string => {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
};

/**
 * What was collected, as text for the briefing: the searches that were made and what they found,
 * and the sources of each category. The titles and the addresses are third parties' words, so the
 * loop escapes the briefing like a result. `categories` limits it to what was collected for those
 * categories, for a loop that researches only them; null when the code did nothing for them.
 */
export function describeGathered(
  allActions: readonly GatheredAction[],
  ledger: readonly LedgerEntry<ResearchCategory>[],
  categories: readonly ResearchCategory[] = RESEARCH_CATEGORIES,
  records: readonly RecordsOutcome[] = [],
): string | null {
  const actions = allActions.filter(
    (action) => action.category !== undefined && categories.includes(action.category),
  );
  // A record is about one category, and a loop for other categories is not told of it.
  const ofRecords = records.filter((outcome) =>
    categories.includes(RECORD_CATEGORY[outcome.source]),
  );
  if (actions.length === 0 && ofRecords.length === 0) return null;
  const lines = [
    "Before your first step the code made these searches and read these pages for you. Do not " +
      "repeat them: read the sources that matter, and use your steps for what is missing.",
  ];
  const searches = actions.filter((action) => action.tool === "search");
  if (searches.length > 0) {
    lines.push("", "Searches made (the news):");
    for (const action of searches) {
      const failed = action.outcome === "failed" || action.outcome === "refused";
      const language = action.language === undefined ? "" : ` (${action.language})`;
      lines.push(
        `- ${action.category}: ${action.usedQuery ?? action.query}${language} - ${
          failed ? "the search failed" : resultsOf(action.results)
        }`,
      );
    }
  }
  if (ofRecords.length > 0) {
    lines.push(
      "",
      "Records of public databases (looked up by the code with the name and the domain of the vendor):",
    );
    for (const { source, outcome, records: found } of ofRecords) {
      const count =
        found.length === 1
          ? "1 record"
          : found.length === 0
            ? "no records"
            : `${found.length} records`;
      // A source read through offers the records of its last answer when it cannot be asked again.
      const failed =
        found.length === 0
          ? "the database could not be reached"
          : `the database could not be reached; ${count} from its last answer`;
      lines.push(`- ${RECORD_SOURCE_NAMES[source]}: ${outcome === "failed" ? failed : count}`);
    }
  }
  const recordUrls = new Set(
    ofRecords.flatMap((o) => o.records.map((record) => canonicalUrl(record.url))),
  );
  const reads = actions.filter((action) => action.tool === "read");
  const ofSite = reads.filter(
    (action) => action.category !== undefined && SITE_CATEGORIES.includes(action.category),
  );
  const articles = reads.filter((action) => !ofSite.includes(action));
  const wasRead = (list: readonly GatheredAction[]) =>
    list.filter((action) => action.outcome === "ok").length;
  if (ofSite.length > 0) {
    lines.push(
      "",
      `Pages of the vendor's website: ${wasRead(ofSite)} of ${ofSite.length} were read; the others do not exist or could not be read.`,
    );
  }
  if (articles.length > 0) {
    lines.push(
      "",
      `Articles from the search results: ${wasRead(articles)} of ${articles.length} were read; the others could not be read.`,
    );
  }
  const listed = RESEARCH_CATEGORIES.filter((category) => categories.includes(category)).flatMap(
    (category) => {
      const entries = ledger.filter((entry) => entry.category === category);
      if (entries.length === 0) return [];
      return [
        `${category}:`,
        ...entries.slice(0, MAX_LISTED_PER_CATEGORY).map((entry) => {
          const title = cutAtCodePoint(entry.title || entry.url, MAX_LISTED_TITLE_CHARS);
          const kind = recordUrls.has(entry.url)
            ? "record"
            : entry.kind === "page"
              ? "page read"
              : "search result";
          return `- ${title} - ${entry.url} - ${dayOf(entry.publishedAt)} (${kind})`;
        }),
      ];
    },
  );
  if (listed.length > 0) lines.push("", "Sources collected:", ...listed);
  return lines.join("\n");
}

/**
 * The step of the trace for the read of the sitemap; null when none was made. It is a step of its
 * own, because the sitemap is read outside the session and so is no action of the code.
 */
export function traceStepOfSitemap(sitemap: GatherResult["sitemap"]): Omit<TraceStep, "n"> | null {
  if (sitemap === null) return null;
  return {
    by: "code",
    tool: "gather",
    url: sitemap.url,
    outcome: sitemap.outcome === "failed" ? "failed" : sitemap.urls === 0 ? "empty" : "ok",
    ...(sitemap.reason === undefined ? {} : { reason: sitemap.reason }),
    results: sitemap.urls,
    ms: sitemap.ms,
  };
}

/**
 * The step of the trace for the lookup in one public database. It holds the address that was
 * asked, the number of records and what was left out, and none of the text of a record.
 */
export function traceStepOfRecords(outcome: RecordsOutcome): Omit<TraceStep, "n"> {
  const omitted = Object.fromEntries(
    Object.entries(outcome.omitted).filter(([, count]) => (count ?? 0) > 0),
  ) as Record<string, number>;
  return {
    by: "code",
    tool: "gather",
    category: RECORD_CATEGORY[outcome.source],
    url: outcome.url,
    outcome: outcome.outcome,
    ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
    results: outcome.records.length,
    ...(Object.keys(omitted).length === 0 ? {} : { omitted }),
    ms: outcome.ms,
  };
}

/** What the coverage of a list that was asked says, as a lookup says it; none for one not asked. */
const OUTCOME_OF_COVERAGE: Partial<Record<CoverageOutcome, RecordsOutcome["outcome"]>> = {
  found: "ok",
  none: "empty",
  failed: "failed",
};

/**
 * The lists of the vendor risk database that were asked, as outcomes of a lookup, so that the
 * briefing and the trace name them like the databases: at the page that documents each list, and
 * with no time of their own, since one query of the database answered for all of them. A list
 * that was not asked (turned off, or of a category the run does not research) is none. The
 * records keep what the database knows of them.
 */
export function outcomesOfVrdb(outcome: VrdbOutcome): RecordsOutcome[] {
  return outcome.coverage.flatMap((list): RecordsOutcome[] => {
    const asked = OUTCOME_OF_COVERAGE[list.outcome];
    if (asked === undefined) return [];
    const listed = outcome.records.find((it) => it.source === list.id);
    return [
      {
        source: list.id,
        url: vrdbSourceOf(list.id).documentationUrl,
        outcome: asked,
        records: listed?.records ?? [],
        omitted: listed?.omitted ?? {},
        ms: 0,
      },
    ];
  });
}

/** What a lookup came to, as the coverage of a run says it. */
const COVERAGE_OF_OUTCOME: Record<RecordsOutcome["outcome"], CoverageOutcome> = {
  ok: "found",
  empty: "none",
  failed: "failed",
};

/**
 * What each database asked beside the vendor risk database answered (`sourcesBesideVrdb`; the NVD,
 * and the SEC once Q4 is open, are read through by the VRDB and in its coverage). All of them are
 * `off` without the lookup, which is how an operator turns the records off; one that the run did
 * not ask, because the run does not research its category or the vendor has nothing to ask it by
 * (a domain, a name, a CIK), is `not_researched`. `gates` is for the tests.
 */
export function coverageOfLookups(
  found: readonly RecordsOutcome[] | null,
  gates?: Readonly<Record<VrdbGate, boolean>>,
): CoverageLookup[] {
  return sourcesBesideVrdb(gates).map((id): CoverageLookup => {
    if (found === null) return { id, outcome: "off" };
    const asked = found.find((outcome) => outcome.source === id);
    return {
      id,
      outcome: asked === undefined ? "not_researched" : COVERAGE_OF_OUTCOME[asked.outcome],
    };
  });
}

export interface GatherInput {
  target: ResearchTarget;
  /** The categories this run may use. */
  researchable: readonly ResearchCategory[];
  /** The answer of the check of the website. */
  website: WebsiteCheck;
  /** The searches that the model's memory gave (see hints.ts), made after the baseline ones. */
  hints?: readonly SearchPlan[];
  /** Today, for the window of the lookup in the public databases; the current time by default. */
  now?: Date;
  /** The earliest day a source may have, by category (the lookback). */
  cutoffs?: Partial<Record<ResearchCategory, string>>;
  /** The rules of the run, for the order of the news reads; confidence by default. */
  rules?: ResearchRules;
  signal: AbortSignal;
}

export interface GatherDeps {
  session: WebSession<ResearchCategory>;
  /** The run's page reader, for the sitemap. */
  readPage: PageReader;
  /** The lookup in the public databases (see records/); none by default, which makes none. */
  records?: RecordsLookup;
  /** The lookup in the vendor risk database (see vrdb/); none by default, which makes none. */
  vrdb?: VrdbLookup;
}

/** Reads the sitemap of the site, outside the session; its failure is an answer, not an error. */
async function readSitemap(
  site: { origin: string; domains: string[] },
  readPage: PageReader,
  signal: AbortSignal,
): Promise<NonNullable<GatherResult["sitemap"]> & { addresses: string[] }> {
  const url = `${site.origin}/sitemap.xml`;
  const startedAt = performance.now();
  const took = () => Math.round(performance.now() - startedAt);
  try {
    const page = await readPage(url, signal);
    const addresses = sitemapAddresses(page.text, site.domains);
    return { url, outcome: "ok", urls: addresses.length, ms: took(), addresses };
  } catch (error) {
    // A page that cannot be read is an answer; anything else is a bug of the reader.
    if (!(error instanceof PageReadError)) throw error;
    return { url, outcome: "failed", reason: error.reason, urls: 0, ms: took(), addresses: [] };
  }
}

/**
 * Does the routine work of a run (see the module comment) and says what it did. It uses the
 * budget of the session only for what it adds to it, and never fails for what the web does.
 */
export async function gatherSources(input: GatherInput, deps: GatherDeps): Promise<GatherResult> {
  const { target, researchable, website, hints = [], signal } = input;
  const { session, readPage, records: lookup, vrdb } = deps;
  const now = input.now ?? new Date();

  // Started first: the databases answer while the sitemap is read. A lookup that breaks is a bug
  // and reaches the caller where it is awaited, not as a rejection nobody handles meanwhile. It
  // asks only the databases of the categories the run researches, each with the cutoff of its own.
  const lookedUp: Promise<RecordsOutcome[]> =
    lookup !== undefined
      ? lookup({
          target,
          researchable,
          cutoffs: input.cutoffs,
          now,
          signal,
          readPage,
        })
      : Promise.resolve([]);
  lookedUp.catch(() => undefined);
  // The vendor risk database answers from its copies, beside the lookup; a source it reads
  // through is asked within the run's signal.
  const listed: Promise<VrdbOutcome | null> =
    vrdb !== undefined
      ? vrdb({
          target,
          researchable,
          cutoffs: input.cutoffs,
          now,
          verifiedDomains: verifiedDomainsOf(website, target),
          signal,
          readPage,
        })
      : Promise.resolve(null);
  listed.catch(() => undefined);

  const searches = planSearches(target, researchable, hints);
  const site = siteToRead(website, target);
  let sitemap: GatherResult["sitemap"] = null;
  let reads: SiteRead[] = [];
  if (site !== null && researchable.some((category) => SITE_CATEGORIES.includes(category))) {
    const read = await readSitemap(site, readPage, signal);
    const { addresses, ...summary } = read;
    sitemap = summary;
    reads = planSiteReads({
      origin: site.origin,
      domains: site.domains,
      links: site.links,
      sitemap: addresses,
      researchable,
    });
  }

  // The records go into the ledger first, so that they come first among the sources of their
  // category and are the last the pack gives up when it is too big. They cost nothing. Those of the
  // vendor risk database come first of all, and a CVE that both its catalog and the NVD have is
  // one source, with the words of both.
  const [found, fromVrdb] = await Promise.all([lookedUp, listed]);
  const records = mergeSameAddress([
    ...(fromVrdb === null ? [] : outcomesOfVrdb(fromVrdb)),
    ...found,
  ]);
  for (const outcome of records) {
    session.addRecords(outcome.records, RECORD_CATEGORY[outcome.source], outcome.source);
  }

  // The work of the code is paid for apart, so that the model keeps its own share.
  session.setCodeBudget({ searches: searches.length, reads: reads.length });

  const actions: GatheredAction[] = [];
  const searched = await session.searchMany(
    searches.map((plan) => ({
      query: plan.query,
      kind: "news" as const,
      category: plan.category,
      by: "code" as const,
    })),
    signal,
  );
  searched.forEach(({ outcome, ms }, index) => {
    const { category, query, language } = searches[index];
    actions.push({
      tool: "search",
      category,
      kind: "news",
      query,
      ...(language === undefined ? {} : { language }),
      ...traceOfSearch(outcome),
      ms,
    });
  });

  // The best results of the searches are read together with the pages of the site, around the
  // names of the vendor, so that a long page is read where it speaks of it, also when it speaks of
  // the vendor by one of its other names.
  const articles = planNewsReads({
    ledger: session.snapshot().ledger,
    target,
    researchable,
    rules: input.rules,
  });
  session.setCodeBudget({ reads: articles.length });
  const focus = [target.name, ...(target.aliases ?? [])].map(shortName).join(" ");
  const planned: Array<{ category: ResearchCategory; url: string }> = [...reads, ...articles];
  const pages = await session.readMany(
    [
      ...reads.map((read) => ({ url: read.url, category: read.category, by: "code" as const })),
      ...articles.map((read) => ({ ...read, focus, by: "code" as const })),
    ],
    signal,
  );
  pages.forEach(({ outcome, ms }, index) => {
    const { category, url } = planned[index];
    actions.push({ tool: "read", category, url, ...traceOfRead(outcome), ms });
  });

  return {
    actions,
    sitemap,
    records,
    vrdb: fromVrdb,
    lookups: coverageOfLookups(lookup === undefined ? null : found),
    digest: describeGathered(actions, session.snapshot().ledger, undefined, records),
  };
}
