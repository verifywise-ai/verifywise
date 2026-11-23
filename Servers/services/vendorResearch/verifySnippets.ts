/**
 * The check, after the analysis, of a finding that rests on snippets.
 *
 * A snippet is what a search engine shows of a page: a few lines that it cut, joined or reworded
 * itself. The validation (see validation.ts) holds a quote to the snippet it cites, which proves
 * that the model copied the snippet right and nothing about the page. So a finding whose sources
 * are all search results, none of them a page that the research read, is checked once more before
 * it is stored: the page of its best source is read, and the quote has to be on it.
 *
 * - The best source is the most credible one, and of equals the one the model cited first: by its
 *   registry category (official, trusted press, the vendor, unverified; see sourceRegistry/).
 *   When its page cannot be read (the site refuses, the page is gone, the time is up), the next is
 *   tried, up to VERIFY_READS_PER_FINDING pages for a finding. The first page that can be read
 *   gives the verdict.
 * - A page that holds the quote confirms the finding, which is then kept exactly as it was.
 * - A page that does not hold it marks the finding `snippet_only`, and the verdict `not_on_page`
 *   goes to the credibility rule, which calls the source contradicted (credibility.ts). The search
 *   result said something the page does not, so the claim is the engine's and not the publisher's.
 * - A page that answered from another site than the one cited (a redirect off the host: an exit
 *   link of an agency, a moved article) is not the cited page: it neither confirms nor contradicts
 *   the finding, and the next source is tried as when a page cannot be read. The label of a source
 *   is decided by the address cited (credibility.ts), so a text another host served must not earn
 *   the label of the cited one. A redirect within the cited host, or between it and a host above
 *   or below it (`www.`), is the same site, and so is one to another domain of the same
 *   organisation in a short list written by hand (`bbc.co.uk` and `bbc.com`, `gc.ca` and
 *   `canada.ca`; see SAME_SITE_GROUPS). A page that answered from the vendor's own site is never the
 *   site of another that was cited, whatever the hosts or the groups say: what it holds is the
 *   vendor's word and must not earn the label of an official body or of the press.
 * - When no page can be read the finding is marked `snippet_only` and the verdict is `unread`:
 *   nothing was found against it, but nobody has seen the page either, and the person who reads the
 *   finding is told so.
 *
 * Only the findings that stay are checked (at most MAX_PER_RUN, see validation.ts), so the check
 * costs at most two reads for each. It uses the page reader of the run, which keeps to robots.txt
 * and the rules of the guarded fetch, and a deadline of VERIFY_TIMEOUT_MS for all the reads. It
 * never rejects and never drops a finding: it can only mark one, and the label is worked out
 * afterwards from the verdict.
 */
import {
  type EvidenceSource,
  type NewFinding,
  SOURCE_CATEGORIES,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { isOnDomain } from "../webResearch/publicUrl";
import { PageReadError, type PageReader } from "../webResearch/readPage";
import { classifySource } from "./sourceRegistry/classify";
import type { ResearchTarget } from "./target";
import type { TraceRecorder } from "./trace";
import { normaliseForQuote } from "./validation";

/** The most pages read for one finding: its best source and, when that cannot be read, the next. */
export const VERIFY_READS_PER_FINDING = 2;
/** One deadline for all the reads of a run's check. */
export const VERIFY_TIMEOUT_MS = 20_000;

/**
 * The marks that stand for text left out: an ellipsis, three dots or more, and the gap mark of a
 * page excerpt in brackets. A search engine cuts its snippets with them, and a quote can hold one.
 */
const GAP_MARK = /\[?…\]?|\.{3,}/;

/**
 * True when a page holds the quote, compared as the validation compares (case, spacing and quotation
 * marks are ignored). A quote with a gap mark in it is held when every part between the marks is on
 * the page: the part before and the part after need not be next to each other there. A quote that
 * is nothing but gap marks and spaces is on no page.
 */
export function quoteIsOnPage(quote: string, pageText: string): boolean {
  const parts = normaliseForQuote(quote)
    .split(GAP_MARK)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0) return false;
  const page = normaliseForQuote(pageText);
  return parts.every((part) => page.includes(part));
}

export interface VerifyInput {
  /** The findings that stay, after the caps. */
  findings: NewFinding[];
  /** The evidence the findings were made from: tells a page that was read from a search result. */
  pack: readonly EvidenceSource[];
  target: ResearchTarget;
  /** The reader of the run. */
  readPage: PageReader;
  /**
   * The domains that are the vendor's website too, beside `target.domain` (the session's alias
   * domains): a page that answered from one of them is the vendor's (see answeredOnCitedSite).
   */
  ownDomains?: readonly string[];
  /** Ends the reads; the deadline of VERIFY_TIMEOUT_MS when none is given. */
  signal?: AbortSignal;
  /** Told about each page that is read. */
  trace?: TraceRecorder;
}

/**
 * What a read of a page came to: its text and the address that answered, or the reason it could
 * not be read.
 */
type Read =
  | { ok: true; text: string; answeredUrl: string; ms: number }
  | { ok: false; reason: string; ms: number };

/** The reason in the trace of a page that answered from another site than the one cited. */
export const REDIRECTED_OFF_SITE = "redirected_off_site";

const hostOf = (address: string): string | null => {
  try {
    return new URL(address).hostname;
  } catch {
    return null;
  }
};

/**
 * The domains of one organisation that answer for each other: a page moved from one to another is
 * still the organisation's page. The list is written by hand and holds only groups known to be one
 * body. It is not drawn from the source registry, because one entry there can hold several bodies
 * of a kind (the data protection authorities: `datatilsynet.no` is Norway's and `datatilsynet.dk`
 * Denmark's) or every government under a suffix (`gov.de` beside `gc.ca`).
 * - The BBC publishes on `bbc.co.uk` and `bbc.com` (the registry entry `bbc`).
 * - ABC News moved from `abcnews.go.com` to `abcnews.com`, which the old host redirects to (the
 *   entry `abcnews`). Other sites under `go.com` are not ABC News, so only the one host is listed.
 * - The Government of Canada moved its sites from `gc.ca` to `canada.ca`, with redirects (the
 *   entries `gov-de-facto` and `gov-de-facto-q8`): both domains are held by the government alone.
 */
export const SAME_SITE_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["bbc.com", "bbc.co.uk"],
  ["abcnews.go.com", "abcnews.com"],
  ["canada.ca", "gc.ca"],
];

/** The categories whose label a page that answered from the organisation's other domain keeps. */
const PUBLISHER_CATEGORIES: ReadonlySet<string> = new Set(["official", "trusted_press"]);

const inGroup = (host: string, group: ReadonlyArray<string>): boolean =>
  group.some((domain) => isOnDomain(host, domain));

/**
 * True when the two hosts are on two domains of one organisation: both are in one group of
 * SAME_SITE_GROUPS (as the domain or under it), neither is on the vendor's own site, and the
 * registry still gives both addresses one category of an official body or of the trusted press,
 * neither of them a copy (`syndicated`), so that the label of the cited address is the label of
 * the page read. The vendor's own site is left out because its label is the vendor's, whatever
 * group its domain is in (a vendor on `bbc.co.uk` does not speak as the BBC on `bbc.com`).
 */
function onDomainsOfOneOrganisation(
  cited: string,
  citedHost: string,
  answered: string,
  answeredHost: string,
  target: ResearchTarget,
  isVendorHost: (host: string) => boolean,
): boolean {
  if (isVendorHost(citedHost) || isVendorHost(answeredHost)) return false;
  const group = SAME_SITE_GROUPS.find((domains) => inGroup(citedHost, domains));
  if (group === undefined || !inGroup(answeredHost, group)) return false;
  const [one, other] = [cited, answered].map((url) =>
    classifySource({ url, onVendorSite: false }, target),
  );
  return (
    PUBLISHER_CATEGORIES.has(one.category) &&
    other.category === one.category &&
    one.syndicated !== true &&
    other.syndicated !== true
  );
}

/**
 * True when the page that answered is on the site that was cited: the same host, or one within
 * the other (`www.acme.com` and `acme.com`, `news.acme.com` and `acme.com`), or, given the target,
 * another domain of the same organisation (`onDomainsOfOneOrganisation`: `bbc.co.uk` and `bbc.com`).
 *
 * Given the target, a page that answered from the vendor's own site (`target.domain` and the
 * `ownDomains` given, as the domain or under it) is on the cited site only when the cited address
 * is on the vendor's site too: a page of another publisher that moved to the vendor's site is the
 * vendor's word (`acme.com` cited, `trust.acme.com` the vendor's; `canada.ca` cited,
 * `tbs-sct.gc.ca` the vendor's).
 */
export function answeredOnCitedSite(
  cited: string,
  answered: string,
  target?: ResearchTarget,
  ownDomains: readonly string[] = [],
): boolean {
  const citedHost = hostOf(cited);
  const answeredHost = hostOf(answered);
  if (citedHost === null || answeredHost === null) return false;
  const vendorDomains = [target?.domain ?? null, ...ownDomains].filter(
    (domain): domain is string => typeof domain === "string" && domain !== "",
  );
  const isVendorHost = (host: string): boolean =>
    vendorDomains.some((domain) => isOnDomain(host, domain));
  if (isVendorHost(answeredHost) && !isVendorHost(citedHost)) return false;
  if (isOnDomain(answeredHost, citedHost) || isOnDomain(citedHost, answeredHost)) return true;
  return (
    target !== undefined &&
    onDomainsOfOneOrganisation(cited, citedHost, answered, answeredHost, target, isVendorHost)
  );
}

/**
 * What the check found for a finding that rests on snippets: the page at `url` holds the quote,
 * the page at `url` was read and does not hold it, or no page could be read.
 */
export type SnippetVerdict =
  | { outcome: "confirmed"; url: string }
  | { outcome: "not_on_page"; url: string }
  | { outcome: "unread" };

/**
 * A finding after the check, and its verdict: null for a finding that cites a page that was read,
 * which is not checked. The credibility of the finding reads the verdict (see credibility.ts).
 */
export interface SnippetCheck {
  finding: NewFinding;
  verdict: SnippetVerdict | null;
}

/**
 * Each finding after the check (see the header) with its verdict, one for each finding and in
 * their order. The findings are not changed: a finding that is marked is a copy.
 */
export async function checkSnippetFindings(input: VerifyInput): Promise<SnippetCheck[]> {
  const { pack, target, readPage, trace, ownDomains = [] } = input;
  const signal = input.signal ?? AbortSignal.timeout(VERIFY_TIMEOUT_MS);
  const sourceOf = new Map(pack.map((source): [string, EvidenceSource] => [source.url, source]));

  // A page is read once, however many findings cite it, and findings that cite it at the same
  // time wait for the one read.
  const reads = new Map<string, Promise<Read>>();
  const read = (url: string): Promise<Read> => {
    let started = reads.get(url);
    if (started === undefined) {
      started = (async (): Promise<Read> => {
        const startedAt = Date.now();
        try {
          const page = await readPage(url, signal);
          return { ok: true, text: page.text, answeredUrl: page.url, ms: Date.now() - startedAt };
        } catch (error) {
          // The reason is from a closed set; what else a reader throws is not repeated.
          const reason = error instanceof PageReadError ? error.reason : "unreachable";
          return { ok: false, reason, ms: Date.now() - startedAt };
        }
      })();
      reads.set(url, started);
    }
    return started;
  };

  const check = async (finding: NewFinding): Promise<SnippetCheck> => {
    const cited = finding.sources.map((citation) => ({
      citation,
      source: sourceOf.get(citation.url),
    }));
    if (cited.some(({ source }) => source?.kind === "page")) return { finding, verdict: null };

    const credibility = ({ citation, source }: (typeof cited)[number]) => {
      const onVendorSite = source?.onVendorSite ?? false;
      const text = source === undefined ? {} : { text: `${source.title} ${source.content}` };
      return SOURCE_CATEGORIES.indexOf(
        classifySource({ url: citation.url, onVendorSite, ...text }, target).category,
      );
    };
    const best = [...cited].sort((a, b) => credibility(a) - credibility(b));

    for (const { citation } of best.slice(0, VERIFY_READS_PER_FINDING)) {
      if (signal.aborted) break;
      const page = await read(citation.url);
      const step = {
        by: "verification",
        tool: "read",
        category: finding.category,
        url: citation.url,
      } as const;
      if (!page.ok) {
        trace?.step({ ...step, outcome: "failed", reason: page.reason, ms: page.ms });
        continue;
      }
      if (!answeredOnCitedSite(citation.url, page.answeredUrl, target, ownDomains)) {
        trace?.step({ ...step, outcome: "failed", reason: REDIRECTED_OFF_SITE, ms: page.ms });
        continue;
      }
      if (quoteIsOnPage(citation.quote, page.text)) {
        trace?.step({ ...step, outcome: "confirmed", ms: page.ms });
        return { finding, verdict: { outcome: "confirmed", url: citation.url } };
      }
      trace?.step({ ...step, outcome: "not_on_page", ms: page.ms });
      return {
        finding: { ...finding, snippet_only: true },
        verdict: { outcome: "not_on_page", url: citation.url },
      };
    }
    return { finding: { ...finding, snippet_only: true }, verdict: { outcome: "unread" } };
  };

  return Promise.all(input.findings.map(check));
}

/**
 * The findings, with the ones that rest on snippets checked (see the header). The findings come
 * back in their order and are not changed: a finding that is marked is a copy.
 */
export async function verifySnippetFindings(input: VerifyInput): Promise<NewFinding[]> {
  return (await checkSnippetFindings(input)).map((check) => check.finding);
}
