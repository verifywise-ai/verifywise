/**
 * The check, after the analysis, of a finding that rests on snippets.
 *
 * A snippet is what a search engine shows of a page: a few lines that it cut, joined or reworded
 * itself. The validation (see validation.ts) holds a quote to the snippet it cites, which proves
 * that the model copied the snippet right and nothing about the page. So a finding whose sources
 * are all search results, none of them a page that the research read, is checked once more before
 * it is stored: the page of its best source is read, and the quote has to be on it.
 *
 * - The best source is the most credible one, and of equals the one the model cited first: by the
 *   tier of sourceTiers.ts under the confidence rules, and by the registry category (official,
 *   trusted press, the vendor, unverified; see sourceRegistry/) under the credibility rules. When its page cannot be read (the site refuses, the page is gone, the time
 *   is up), the next is tried, up to VERIFY_READS_PER_FINDING pages for a finding. The first page
 *   that can be read gives the verdict.
 * - A page that holds the quote confirms the finding, which is then kept exactly as it was.
 * - A page that does not hold it lowers the finding: `snippet_only`, and its confidence is `low`.
 *   The search result said something the page does not, so the claim is the engine's and not the
 *   publisher's.
 * - When no page can be read the finding is marked `snippet_only` and its confidence stays: nothing
 *   was found against it, but nobody has seen the page either, and the person who reads the finding
 *   is told so.
 *
 * Only the findings that stay are checked (at most MAX_PER_RUN, see validation.ts), so the check
 * costs at most two reads for each. It uses the page reader of the run, which keeps to robots.txt
 * and the rules of the guarded fetch, and a deadline of VERIFY_TIMEOUT_MS for all the reads. It
 * never rejects and never drops a finding: it can only mark one and lower its confidence, never
 * raise it.
 */
import {
  type EvidenceSource,
  type NewFinding,
  SOURCE_CATEGORIES,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { PageReadError, type PageReader } from "../webResearch/readPage";
import type { ResearchRules } from "./schema";
import { classifySource } from "./sourceRegistry/classify";
import { SOURCE_TIERS, tierOf } from "./sourceTiers";
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
  /** Ends the reads; the deadline of VERIFY_TIMEOUT_MS when none is given. */
  signal?: AbortSignal;
  /** Told about each page that is read. */
  trace?: TraceRecorder;
  /** Which order picks the best source (see the header); the confidence rules by default. */
  rules?: ResearchRules;
}

/** What a read of a page came to: its text, or the reason it could not be read. */
type Read = { ok: true; text: string; ms: number } | { ok: false; reason: string; ms: number };

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
  const { pack, target, readPage, trace } = input;
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
          return { ok: true, text: page.text, ms: Date.now() - startedAt };
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
      if (input.rules !== "credibility") {
        return SOURCE_TIERS.indexOf(tierOf({ url: citation.url, onVendorSite }, target));
      }
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
      if (quoteIsOnPage(citation.quote, page.text)) {
        trace?.step({ ...step, outcome: "confirmed", ms: page.ms });
        return { finding, verdict: { outcome: "confirmed", url: citation.url } };
      }
      trace?.step({ ...step, outcome: "not_on_page", ms: page.ms });
      return {
        finding: { ...finding, snippet_only: true, confidence: "low" },
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
