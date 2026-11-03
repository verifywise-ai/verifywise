/**
 * The queries of the research loop. The search feed answers a short query best: probed on
 * 2026-10-27, "Okta security incident" gave six news items and "Okta fine regulator GDPR" one; the
 * web feed gives the same ten results for a name it knows whatever topic words follow, and does not
 * understand `site:` or `inurl:` (`site:okta.com subprocessors` returned a café). So a query is
 * the vendor's name and at most three topic words, in that order, and nothing else.
 *
 * `normalizeQuery` makes any query the model writes that shape: the operators, the boolean words,
 * the quotation marks and brackets, the addresses and the small words are removed, the name is
 * put first (as a news article writes it, without the legal form of the record) and each word of
 * it is not repeated as a topic. A vendor can be known by other names (see aliases.ts): a query
 * that names it only by one of them keeps that name in front, since it is the name the press
 * writes, and a query that holds the vendor's name keeps the other names as topic words. The model
 * is told what was searched when that is not what it asked. `suggestedQueries` gives the model the
 * queries that work, for the categories that search the news, none of them one that the session
 * would refuse as a repeat of another; the other two read the vendor's own website.
 */
import { ResearchCategory } from "../../domain.layer/interfaces/i.vendorResearch";
import { REPEATED_QUERY_JACCARD, queryWords, similarity } from "../webResearch/queryMatch";
import { shortName, wholeWord } from "./identity";
import { localQueries, regulatorTopicsOf } from "./market";
import { ResearchTarget } from "./target";
import { cutAtCodePoint } from "./text";

/** The topic words a query keeps after the name. */
export const MAX_TOPIC_WORDS = 3;
const MAX_QUERY_CHARS = 200;

/** Search operators, written `name:value`, with or without a minus in front. */
const OPERATOR =
  /^-?(?:site|inurl|intitle|intext|allinurl|allintitle|allintext|filetype|ext|related|cache|link|define|info|source|before|after|loc|location|language|lang|feed|hasfeed|contains|ip|domain):\S*$/i;

/** An address, or the start of one, inside a text. */
const ADDRESS = /\b(?:https?:\/\/|www\.)\S*/gi;

const BOOLEAN_WORDS: ReadonlySet<string> = new Set(["or", "and", "not"]);

/** Words that dilute a query and say nothing about the topic. */
const SMALL_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "the",
  "of",
  "for",
  "in",
  "on",
  "at",
  "to",
  "by",
  "from",
  "with",
  "about",
  "any",
  "all",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "has",
  "have",
  "had",
  "that",
  "this",
  "what",
  "who",
  "when",
  "where",
  "why",
  "how",
  "which",
  "latest",
  "news",
]);

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu;

/** Removes every whole-word occurrence of `term` from `text`. */
function withoutTerm(text: string, term: string): string {
  const matcher = wholeWord(term);
  return matcher === null ? text : text.replace(new RegExp(matcher.source, "giu"), " ");
}

/** A name as the record writes it, then as an article does: without the legal form. */
const writtenForms = (name: string): string[] => [name, shortName(name)];

/** The words of a name, lower case: what a topic must not repeat. */
function wordsOf(name: string): string[] {
  return writtenForms(name).flatMap((form) => form.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

/** Where a name first stands in the text, as a whole word, in either form; null when it does not. */
function firstPlaceOf(text: string, name: string): number | null {
  const places = writtenForms(name).flatMap((form) => {
    const at = wholeWord(form)?.exec(text)?.index;
    return at === undefined ? [] : [at];
  });
  return places.length === 0 ? null : Math.min(...places);
}

/**
 * The name that leads a query: the vendor's name, unless the text names the vendor only by one of
 * its other names; then the one of them that stands first in the text.
 */
function leadOf(text: string, target: ResearchTarget): string {
  if (firstPlaceOf(text, target.name) !== null) return target.name;
  let lead = target.name;
  let leadAt = Number.POSITIVE_INFINITY;
  for (const alias of target.aliases ?? []) {
    const at = firstPlaceOf(text, alias);
    if (at !== null && at < leadAt) {
      lead = alias;
      leadAt = at;
    }
  }
  return lead;
}

/**
 * The query as the feed answers best: the vendor's name, then at most three topic words. The topic
 * words are the first ones the query had, once the operators, the boolean words, the addresses, the
 * words of the name and the small words are taken away.
 */
export function normalizeQuery(query: string, target: ResearchTarget): string {
  // The domain goes first: it holds the brand, which must not be taken for a name of the vendor.
  let text = withoutTerm(query.replace(ADDRESS, " "), target.domain ?? "");
  const lead = leadOf(text, target);
  for (const term of writtenForms(lead)) text = withoutTerm(text, term);
  // The words of the vendor's name are not topics, whichever name leads.
  const known = new Set([...wordsOf(target.name), ...wordsOf(lead)]);
  const topics: string[] = [];
  const seen = new Set<string>();
  for (const token of text.split(/\s+/)) {
    if (token === "" || OPERATOR.test(token) || (token.startsWith("-") && token.length > 1)) {
      continue;
    }
    const word = token.replace(EDGE_PUNCTUATION, "");
    const lower = word.toLowerCase();
    if (
      !LETTER_OR_DIGIT.test(word) ||
      BOOLEAN_WORDS.has(lower) ||
      SMALL_WORDS.has(lower) ||
      known.has(lower) ||
      seen.has(lower)
    ) {
      continue;
    }
    seen.add(lower);
    topics.push(word);
    if (topics.length >= MAX_TOPIC_WORDS) break;
  }
  return cutAtCodePoint([shortName(lead), ...topics].join(" "), MAX_QUERY_CHARS).trimEnd();
}

/** What a search of the news for the category looks for, after the vendor's name. */
const NEWS_TOPICS: Partial<Record<ResearchCategory, string[]>> = {
  security_incidents: ["data breach", "security incident"],
  legal_regulatory: ["lawsuit", "fined"],
  availability: ["outage"],
  financial_health: ["layoffs", "bankruptcy", "acquisition"],
};

/**
 * Words of the topics above that name no topic by themselves: an article about a software vendor
 * says "data" and "security" whatever it is about.
 */
const GENERIC_TOPIC_WORDS: ReadonlySet<string> = new Set(["data", "security"]);

/**
 * The English words that name what the news categories look for, as single lower-case words, each
 * once ("breach", "lawsuit", "outage"). A news engine that answers from one index of the vendor's
 * coverage (the GDELT engine) asks for the articles that name the vendor and any of these words.
 * The caller adds the authorities of the vendor's jurisdiction, `regulatorTopicsOf` in market.ts,
 * which depend on the vendor. The generic words are left out: an index of the best matches that
 * they filled would hold few articles of a topic.
 */
export const NEWS_TOPIC_WORDS: readonly string[] = [
  ...new Set(
    Object.values(NEWS_TOPICS).flatMap((topics) =>
      (topics ?? []).flatMap((topic) => topic.toLowerCase().split(" ")),
    ),
  ),
].filter((word) => !GENERIC_TOPIC_WORDS.has(word));

/**
 * Queries that work, for each of the categories that search the news. The categories that read
 * the vendor's own website (certifications, ai_specific) have none. A vendor with other names gets
 * one more query for each category: the first topic of the category, led by the first of its other
 * names that makes a query of its own, since the press may write about the vendor under that name
 * alone. A vendor in a market of another language (see market.ts) gets the queries in that
 * language last. No query repeats one before it as the web session tells a repeat (see
 * webResearch/queryMatch.ts), in any category, since the session would refuse it and the search
 * would not be made. They are compared as the engine is given them, once `normalizeQuery` has
 * shaped them. An other name that is the vendor's name with a legal form ("monday.com Ltd." for
 * "monday.com"), its domain, or its name with a word more or less gives the query of the name
 * again, so the next other name leads; a category whose other names all do that gets no query of
 * an other name.
 */
export function suggestedQueries(
  target: ResearchTarget,
  researchable: readonly ResearchCategory[],
): Partial<Record<ResearchCategory, string[]>> {
  const name = shortName(target.name);
  const local = localQueries(target, researchable);
  /** The words of the queries given so far, as the session compares them. */
  const given: Set<string>[] = [];
  /** Whether the session would ask `query` after the ones given so far; a query it would ask is given. */
  const isNew = (query: string): boolean => {
    const words = queryWords(normalizeQuery(query, target));
    if (given.some((earlier) => similarity(earlier, words) >= REPEATED_QUERY_JACCARD)) return false;
    given.push(words);
    return true;
  };
  const suggested: Partial<Record<ResearchCategory, string[]>> = {};
  for (const category of researchable) {
    const topics = NEWS_TOPICS[category];
    if (topics === undefined) continue;
    // The legal and regulatory news also names the authority of the vendor's jurisdiction.
    const regulators = category === "legal_regulatory" ? regulatorTopicsOf(target) : [];
    const ofName = [...topics, ...regulators].map((topic) => `${name} ${topic}`).filter(isNew);
    // The first other name whose query is not one given already: the vendor's name with a legal
    // form, its domain or its name with a word more makes the query of the name again.
    const ofOtherName = (target.aliases ?? [])
      .map((alias) => `${shortName(alias)} ${topics[0]}`)
      .find(isNew);
    suggested[category] = [
      ...ofName,
      ...(ofOtherName === undefined ? [] : [ofOtherName]),
      ...local
        .filter((search) => search.category === category)
        .map((search) => search.query)
        .filter(isNew),
    ];
  }
  return suggested;
}
