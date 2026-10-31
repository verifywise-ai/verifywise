/**
 * How much a source can be trusted to confirm a claim about a vendor, decided from where it comes
 * from and with no model. Two things come out of it:
 *
 * - A **tier** for every source: the vendor's own website (`official`), a regulator or a court
 *   (`regulator_or_court`), a major publisher (`major_publisher`), a site that reposts the stories
 *   of others (`aggregator`), or anything else (`other`).
 * - A **publisher** for every source, so that one story on `bbc.co.uk` and on `bbc.com`, or on
 *   Reuters and on a page that copies it, is one source and not two.
 *
 * `confidenceCeiling` (validation.ts) uses both: `high` needs two independent publishers, one of
 * them in a credible tier. Every list below is a judgment, and the errors are not alike. A site
 * missing from a list of credible ones lowers a confidence (safe). A site wrongly on one raises it
 * a little, but never alone: it still needs a second publisher. A publisher key that merges two
 * publishers lowers a confidence (safe); one that splits a publisher in two would raise it, which
 * is why the key goes by the name of the site and ignores the top-level domain.
 */
import { EvidenceSource } from "../../domain.layer/interfaces/i.vendorResearch";
import { isOnDomain } from "../webResearch/publicUrl";
import { ResearchTarget } from "./target";

export type SourceTier =
  "official" | "regulator_or_court" | "major_publisher" | "aggregator" | "other";

export const SOURCE_TIERS: readonly SourceTier[] = [
  "official",
  "regulator_or_court",
  "major_publisher",
  "aggregator",
  "other",
];

/** The tiers whose word is enough, with a second publisher, for `high`. */
export const CREDIBLE_TIERS: ReadonlySet<SourceTier> = new Set<SourceTier>([
  "official",
  "regulator_or_court",
  "major_publisher",
]);

/** What these functions read of a source: its address and the research's mark for the vendor's own. */
export type TieredSource = Pick<EvidenceSource, "url" | "onVendorSite">;

// ---------------------------------------------------------------------------
// The publisher
// ---------------------------------------------------------------------------

/** The labels in front of a top-level domain that are not a name: bbc.co.uk and bbc.com are one. */
const SECOND_LEVEL_LABELS: ReadonlySet<string> = new Set([
  "co",
  "com",
  "org",
  "net",
  "gov",
  "ac",
  "edu",
]);

/**
 * The publisher behind an address: the name label of its host, without "www.", the top-level domain
 * and a second-level label such as "co" or "com". It is null for text that is not an address.
 *
 * It ignores the top-level domain on purpose, so `bbc.co.uk` and `bbc.com` are one publisher. That
 * also merges two organizations that share a name (`acme.com` and `acme.org`) and all the tenants
 * of a hosting platform (`a.github.io` and `b.github.io`), which can only lower a confidence.
 */
export function publisherKey(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const labels = host.split(".");
  if (labels.length < 2) return host;
  labels.pop();
  if (labels.length > 1 && SECOND_LEVEL_LABELS.has(labels[labels.length - 1])) labels.pop();
  return labels[labels.length - 1];
}

// ---------------------------------------------------------------------------
// The tiers
// ---------------------------------------------------------------------------

/**
 * Governments and international bodies, by the shape of the host: `.gov`, `.mil` and `.int`;
 * `gov.xx`, `govt.xx`, `gouv.xx`, `gob.xx` and `gv.xx` under a country code; `go.xx` under the few
 * country codes that use it (a plain `go.it` is a company); and a few national and European
 * portals. A label in front is needed, so `gov.uk` itself is not matched but `www.gov.uk` is.
 */
export const GOVERNMENT_HOST =
  /\.(?:gov|mil|int)$|\.(?:gov|govt|gouv|gob|gv)\.[a-z]{2}$|\.go\.(?:jp|kr|id|th|ke|tz|ug)$|\.(?:gov\.scot|gov\.wales|europa\.eu|admin\.ch|bund\.de|gc\.ca|canada\.ca)$/;

/**
 * Regulators and courts that are not on a government domain: the data protection authorities, the
 * financial conduct authorities and the court records that a lawsuit or a fine is looked up in.
 */
export const REGULATOR_AND_COURT_DOMAINS = [
  "ico.org.uk",
  "fca.org.uk",
  "cnil.fr",
  "garanteprivacy.it",
  "aepd.es",
  "dataprotection.ie",
  "autoriteitpersoonsgegevens.nl",
  "cnpd.pt",
  "datatilsynet.no",
  "datatilsynet.dk",
  "imy.se",
  "bafin.de",
  "bailii.org",
  "courtlistener.com",
  "supremecourt.uk",
  "judiciary.uk",
] as const;

/**
 * Sites that repost or republish what others wrote: news aggregators, social networks, forums and
 * platforms where anyone publishes, press-release wires, encyclopedias and web archives. A story
 * that is on one of them was published somewhere else first, so it never counts as a second
 * publisher.
 */
export const AGGREGATOR_DOMAINS = [
  "news.google.com",
  "yahoo.com",
  "msn.com",
  "bing.com",
  "flipboard.com",
  "newsbreak.com",
  "feedly.com",
  "smartnews.com",
  "apple.news",
  "ground.news",
  "techmeme.com",
  "newsnow.co.uk",
  "dailyhunt.in",
  "inshorts.com",
  "news.ycombinator.com",
  "reddit.com",
  "quora.com",
  "medium.com",
  "substack.com",
  "wordpress.com",
  "blogspot.com",
  "tumblr.com",
  "linkedin.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "t.co",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "pastebin.com",
  "wikipedia.org",
  "wikimedia.org",
  "archive.org",
  "archive.ph",
  "prnewswire.com",
  "businesswire.com",
  "globenewswire.com",
  "accesswire.com",
  "einpresswire.com",
  "prweb.com",
  "openpr.com",
  "24-7pressrelease.com",
] as const;

/**
 * News organizations with an editorial process, and the trade press of security and technology
 * that vendors' incidents are reported in. It is a list of well-known outlets, not a ranking, and
 * it matches the whole site, so a section that anyone can write for (a contributor network) is
 * trusted as much as the rest of its site.
 */
export const MAJOR_PUBLISHER_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "nytimes.com",
  "wsj.com",
  "ft.com",
  "bloomberg.com",
  "economist.com",
  "theguardian.com",
  "washingtonpost.com",
  "cnn.com",
  "nbcnews.com",
  "cbsnews.com",
  "abcnews.go.com",
  "npr.org",
  "pbs.org",
  "usatoday.com",
  "latimes.com",
  "time.com",
  "theatlantic.com",
  "newyorker.com",
  "axios.com",
  "cnbc.com",
  "marketwatch.com",
  "barrons.com",
  "forbes.com",
  "fortune.com",
  "politico.com",
  "politico.eu",
  "euronews.com",
  "euractiv.com",
  "aljazeera.com",
  "dw.com",
  "france24.com",
  "independent.co.uk",
  "telegraph.co.uk",
  "thetimes.co.uk",
  "news.sky.com",
  "cbc.ca",
  "theglobeandmail.com",
  "abc.net.au",
  "smh.com.au",
  "straitstimes.com",
  "scmp.com",
  "nikkei.com",
  "thehindu.com",
  "lemonde.fr",
  "lefigaro.fr",
  "spiegel.de",
  "zeit.de",
  "faz.net",
  "sueddeutsche.de",
  "handelsblatt.com",
  "heise.de",
  "golem.de",
  "elpais.com",
  "corriere.it",
  "repubblica.it",
  "nrc.nl",
  "techcrunch.com",
  "theverge.com",
  "wired.com",
  "arstechnica.com",
  "zdnet.com",
  "cnet.com",
  "venturebeat.com",
  "theinformation.com",
  "theregister.com",
  "bleepingcomputer.com",
  "therecord.media",
  "securityweek.com",
  "darkreading.com",
  "krebsonsecurity.com",
  "scworld.com",
  "cyberscoop.com",
  "helpnetsecurity.com",
  "thehackernews.com",
  "infosecurity-magazine.com",
  "bankinfosecurity.com",
  "iapp.org",
] as const;

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const isOnAny = (host: string, domains: readonly string[]): boolean =>
  domains.some((domain) => isOnDomain(host, domain));

/**
 * The tier of a source. A page the research marked as the vendor's own (see `isVendorsOwnPage` in
 * validation.ts: the mark, not the host, and only for a vendor with a domain) is `official`, then
 * the host decides: a regulator or a court, an aggregator, a major publisher, and `other` for the
 * rest. An aggregator is checked before a major publisher, so a section of a big site that only
 * reposts (`finance.yahoo.com`) is not credited with the name of its parent.
 */
export function tierOf(source: TieredSource, target: ResearchTarget): SourceTier {
  if (target.domain !== null && source.onVendorSite) return "official";
  const host = hostOf(source.url);
  if (host === null) return "other";
  if (GOVERNMENT_HOST.test(host) || isOnAny(host, REGULATOR_AND_COURT_DOMAINS)) {
    return "regulator_or_court";
  }
  if (isOnAny(host, AGGREGATOR_DOMAINS)) return "aggregator";
  if (isOnAny(host, MAJOR_PUBLISHER_DOMAINS)) return "major_publisher";
  return "other";
}

/** The key all the pages of the vendor's own site share: the vendor says a thing once. */
const VENDOR_PUBLISHER = "\0vendor";

/**
 * What a set of cited sources adds up to: how many independent publishers there are, and whether
 * one of them is in a credible tier. The pages of the vendor's own site are one publisher. An
 * aggregator is no publisher at all, whatever it cites, and neither is an address that cannot be
 * read.
 */
export function corroborationOf(
  sources: TieredSource[],
  target: ResearchTarget,
): { publishers: number; credible: boolean } {
  const publishers = new Set<string>();
  let credible = false;
  for (const source of sources) {
    const tier = tierOf(source, target);
    if (tier === "aggregator") continue;
    const key = tier === "official" ? VENDOR_PUBLISHER : publisherKey(source.url);
    if (key === null) continue;
    publishers.add(key);
    if (CREDIBLE_TIERS.has(tier)) credible = true;
  }
  return { publishers: publishers.size, credible };
}
