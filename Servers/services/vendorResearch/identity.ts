/**
 * Who a source is about. The web feed answers a name it does not know with unrelated pages, and a
 * name that other companies share with pages about those companies, so a source counts for a
 * vendor only when its title, its text or its address names the vendor. This is the one matcher
 * for that: the web session uses it to keep a result that does not mention the vendor out of the
 * evidence, and the validation uses it to refuse a citation of such a source. Because both use it,
 * a source the search lets in is never one the validation will turn away for being about someone
 * else, and the other way round.
 *
 * The vendor is named by:
 *
 * - its name as the record writes it ("Acme Analytics, Inc.") and without the legal form and the
 *   article that a news article leaves out ("Acme Analytics"), as a whole word;
 * - its other names (a brand, the name the press uses; see aliases.ts), each in the same two forms;
 * - its domain ("acme-analytics.com") as a whole word, so `notacme-analytics.com` and
 *   `acme-analytics.org` are not it.
 *
 * A whole word is one that no letter and no digit, in any script, comes right before or after, so
 * "Acme" is not in "Acmeville". The caller may give the address of a search result as well: its
 * host and path are read as words ("news.example/acme-analytics-breach" holds "acme analytics
 * breach"). A caller that has the text of a page does not give it, because the address of a page
 * is the one that was asked for and the page can answer from somewhere else.
 */
import { ResearchTarget } from "./target";

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A case-insensitive matcher for `term` as a whole word, or null when the term holds nothing but
 * whitespace. The characters of the term are matched as they are written (C++, AT&T), and a run
 * of whitespace in a name matches any run of whitespace. An empty term has no matcher, because an
 * empty pattern matches everything.
 */
export function wholeWord(term: string): RegExp | null {
  const words = term.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return null;
  const pattern = words.map(escapeRegExp).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "iu");
}

/** The forms of a company that follow a name in a record and not in an article. */
const LEGAL_FORMS: ReadonlySet<string> = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "ag",
  "sa",
  "bv",
  "nv",
  "plc",
  "pty",
  "pte",
  "oy",
  "ab",
  "as",
  "sas",
  "sarl",
  "srl",
  "spa",
  "kk",
  "lp",
  "llp",
  "pvt",
]);

const bare = (token: string): string => token.toLowerCase().replace(/[.,]/g, "");

/**
 * The name without the article in front and the legal forms behind it; the name as it is written
 * when nothing would be left. It is how an article, and so a search, writes the vendor.
 */
export function shortName(name: string): string {
  const tokens = name
    .trim()
    .split(/[\s,]+/)
    .filter((token) => token !== "");
  if (tokens.length > 1 && bare(tokens[0]) === "the") tokens.shift();
  while (tokens.length > 1 && LEGAL_FORMS.has(bare(tokens[tokens.length - 1]))) tokens.pop();
  if (tokens.length === 0) return name.trim();
  tokens[tokens.length - 1] = tokens[tokens.length - 1].replace(/[.,]+$/, "");
  return tokens.join(" ");
}

/**
 * The terms that name a vendor, as the matcher takes them: its name and its other names, each as
 * written and trimmed and without the legal form, and the domain.
 */
function termsOf(target: ResearchTarget): string[] {
  const names = [target.name, ...(target.aliases ?? [])];
  const terms = [...names.flatMap((name) => [name, shortName(name)]), target.domain ?? ""];
  return [...new Set(terms.map((term) => term.trim()).filter((term) => term !== ""))];
}

/** Second-level labels that sit under a country code ("co" in acme.co.uk). */
const SECOND_LEVEL_LABELS: ReadonlySet<string> = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "net",
  "org",
]);

/** The brand of a host: the label before its suffix ("www.acme.co.uk" is "acme"). */
export function brandOf(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length < 2) return labels[0] ?? "";
  labels.pop();
  if (labels.length >= 2 && SECOND_LEVEL_LABELS.has(labels[labels.length - 1])) labels.pop();
  return labels[labels.length - 1];
}

/** The host and the path of an address as words: "news.example/acme-analytics-breach" is "news example acme analytics breach". */
function addressWords(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    let path = pathname;
    try {
      path = decodeURIComponent(pathname);
    } catch {
      // A path that is not valid percent-encoding is read as it is.
    }
    return `${hostname} ${path}`.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  } catch {
    return "";
  }
}

/** What the matcher reads of a source; the address only when the caller gives it. */
export interface SourceText {
  title: string;
  content: string;
  url?: string;
}

export type VendorMatcher = (source: SourceText) => boolean;

const matchers = new WeakMap<ResearchTarget, VendorMatcher>();

/** The matcher for a vendor. The same matcher comes back for the same target. */
export function createVendorMatcher(target: ResearchTarget): VendorMatcher {
  const known = matchers.get(target);
  if (known !== undefined) return known;
  const patterns = termsOf(target)
    .map(wholeWord)
    .filter((pattern): pattern is RegExp => pattern !== null);
  const matcher: VendorMatcher = (source) => {
    const texts = [source.title, source.content];
    if (source.url) texts.push(source.url, addressWords(source.url));
    return patterns.some((pattern) => texts.some((text) => pattern.test(text)));
  };
  matchers.set(target, matcher);
  return matcher;
}
