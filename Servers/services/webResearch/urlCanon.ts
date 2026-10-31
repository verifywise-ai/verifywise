/**
 * One address for one page. The same article reaches a search result and a model under many
 * spellings: with the tracking parameters of a newsletter, as an amp page, with a quotation mark
 * that the model copied from its own text. Each spelling that is kept as an address of its own
 * puts the same text into the evidence again and spends a read on it, so the web session takes
 * every address through `resolveAddress` and keeps one entry per canonical form.
 *
 * `resolveAddress` is the URL policy (`parsePublicUrl`) plus three cleanings that cannot change
 * which page is meant:
 *
 * - the parameters that only say who sent the reader (utm_*, click ids, mail campaign ids) and
 *   the markers of an amp page that sit in the query are removed, the others are kept as they
 *   were written and in their order;
 * - the address that the Google amp viewer and the amp cache wrap around a page is unwrapped;
 * - an address that ends in a quotation mark or a bracket is refused: nobody can open it, and a
 *   site that answers it anyway answers with its landing page.
 *
 * What the address of a page is not guessed from: an `m.` or `amp.` host and a path that ends in
 * `/amp` are left as they are, because a guess can name another site (`m.media-amazon.com`) or
 * another page (a product called Amp). The page says what its canonical address is
 * (`<link rel="canonical">`), and `acceptCanonical` takes that claim only when it is the same
 * document on the same site; a page cannot claim the address of someone else's.
 */
import { UnsafeUrlError, parsePublicUrl } from "./publicUrl";

export type AddressRefusal = "not_allowed" | "bad_address";

export type AddressResult = { ok: true; url: URL } | { ok: false; reason: AddressRefusal };

/** Parameters that say who sent the reader, never which page: the names are matched in lower case. */
const TRACKING_PARAMETERS: ReadonlySet<string> = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "yclid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "__hstc",
  "__hssc",
  "__hsfp",
  "hsctatracking",
  "igshid",
  "mkt_tok",
  "oly_enc_id",
  "oly_anon_id",
  "vero_id",
  "vero_conv",
  "_ga",
  "_gl",
  "ref_src",
  "ref_url",
  "s_cid",
  "cmpid",
  "ncid",
  "ocid",
  "spm",
  "wt.mc_id",
  "xtor",
  "ito",
  "trk",
  "trkcampaign",
  "cvid",
  // What the Google amp viewer adds to the address of the page it shows.
  "amp_js_v",
  "amp_gsa",
  "usqp",
]);

/** Names that mark an amp page when their value says so: `amp=1`, `outputType=amp`. */
const AMP_MARKERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["amp", new Set(["", "1", "true"])],
  ["outputtype", new Set(["amp"])],
  ["output", new Set(["amp"])],
]);

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return text;
  }
}

/** True for one `name=value` pair of a query that says nothing about which page is meant. */
function isNoise(pair: string): boolean {
  const separator = pair.indexOf("=");
  const name = decoded(separator < 0 ? pair : pair.slice(0, separator)).toLowerCase();
  const value = decoded(separator < 0 ? "" : pair.slice(separator + 1)).toLowerCase();
  if (name.startsWith("utm_") || TRACKING_PARAMETERS.has(name)) return true;
  return AMP_MARKERS.get(name)?.has(value) ?? false;
}

/** The query without its noise, as it was written otherwise; "" when nothing is left. */
function cleanQuery(search: string): string {
  if (search.length <= 1) return "";
  const kept = search
    .slice(1)
    .split("&")
    .filter((pair) => pair !== "" && !isNoise(pair));
  return kept.length === 0 ? "" : `?${kept.join("&")}`;
}

/** The page behind the wrapper that the Google amp viewer or the amp cache puts around it, if any. */
function unwrapAmp(url: URL): string | null {
  const host = url.hostname;
  if (host === "www.google.com" && url.pathname.startsWith("/amp/s/")) {
    return `https://${url.pathname.slice("/amp/s/".length)}${url.search}`;
  }
  if (host.endsWith(".cdn.ampproject.org")) {
    const wrapped = /^\/[cv]\/s\/(.+)$/.exec(url.pathname);
    if (wrapped) return `https://${wrapped[1]}${url.search}`;
  }
  return null;
}

/**
 * The end of an address that cannot be one: a quotation mark (straight, curly or a guillemet), an
 * angle bracket, or a quote that the URL parser left as it was. A closing round bracket is not in
 * the list: Wikipedia addresses end in one.
 */
const ENDS_IN_STRAY_MARK =
  /(?:%22|%27|%E2%80%98|%E2%80%99|%E2%80%9C|%E2%80%9D|%C2%AB|%C2%BB|%3C|%3E|')\/?$/i;

/**
 * The canonical form of an address, or the reason it cannot be used: `not_allowed` when the URL
 * policy refuses it, `bad_address` when it ends in a stray mark.
 */
export function resolveAddress(raw: string): AddressResult {
  let url: URL;
  try {
    url = parsePublicUrl(raw);
    const wrapped = unwrapAmp(url);
    if (wrapped !== null) url = parsePublicUrl(wrapped);
  } catch (error) {
    if (error instanceof UnsafeUrlError) return { ok: false, reason: "not_allowed" };
    throw error;
  }
  // The tail as it was written, and as it is left once the noise is gone: a quotation mark that a
  // reader copied along stands at the end of the first, and a path that ends in one at the end of
  // the second.
  const writtenTail = url.pathname + url.search;
  url.search = cleanQuery(url.search);
  if (ENDS_IN_STRAY_MARK.test(writtenTail) || ENDS_IN_STRAY_MARK.test(url.pathname + url.search)) {
    return { ok: false, reason: "bad_address" };
  }
  return { ok: true, url };
}

/** The host without one leading label that only says which edition of the site it is. */
const EDITION_LABELS: ReadonlySet<string> = new Set(["www", "m", "mobile", "amp"]);

function siteOf(host: string): string {
  const bare = host.endsWith(".") ? host.slice(0, -1) : host;
  const labels = bare.toLowerCase().split(".");
  if (labels.length > 2 && EDITION_LABELS.has(labels[0])) labels.shift();
  return labels.join(".");
}

/** The path with the forms that do not change the document taken out: amp, index files, slashes. */
function documentPath(pathname: string): string {
  const path = pathname
    .replace(/\.amp(\.html?)?$/i, (_match, extension: string | undefined) => extension ?? "")
    .replace(/^(.+)\/amp\/?$/i, "$1")
    .replace(/^\/amp(?=\/.)/i, "")
    .replace(/\/(?:index|default)\.(?:html?|php|aspx?)$/i, "/")
    .replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

/**
 * True when two addresses name one document: the same site (the edition label, `www`, `m`,
 * `mobile` or `amp`, and the scheme do not count), the same path (an amp form, an index file and
 * a trailing slash do not count) and the same query. A page of a list is not the list, and two
 * pages of a site are not one page.
 */
export function sameDocument(a: URL, b: URL): boolean {
  return (
    siteOf(a.hostname) === siteOf(b.hostname) &&
    documentPath(a.pathname) === documentPath(b.pathname) &&
    a.search === b.search
  );
}

/**
 * One key for the document an address names, for a memory of the pages that were read: the site,
 * the path of the document and the query, in that order, with no scheme and no fragment. Two
 * addresses have the same key when `sameDocument` sees them as one document, after the cleanings
 * of `resolveAddress`. It is null for an address that cannot be used, which a memory cannot hold.
 */
export function sourceKey(raw: string): string | null {
  const resolved = resolveAddress(raw);
  if (!resolved.ok) return null;
  const { hostname, pathname, search } = resolved.url;
  return `${siteOf(hostname)}${documentPath(pathname)}${search}`;
}

/**
 * The address a page claims for itself (`<link rel="canonical">`, else `og:url`), when it can be
 * trusted as the address of this page: it is allowed, it is not a stray mark, and it is the same
 * document as the address that was asked for or the one that answered after the redirects. A page
 * is whatever its author writes, so a claim on another site, or on another page of the same site
 * (the home page, which a template that names it on every page claims), is not taken.
 */
export function acceptCanonical(input: {
  asked: URL;
  answered: string;
  claimed: string | null;
}): URL | null {
  const { asked, answered, claimed } = input;
  if (claimed === null || claimed.trim() === "") return null;
  const resolved = resolveAddress(claimed);
  if (!resolved.ok || resolved.url.href === asked.href) return null;
  if (sameDocument(asked, resolved.url)) return resolved.url;
  let landed: URL;
  try {
    landed = new URL(answered);
  } catch {
    return null;
  }
  return sameDocument(landed, resolved.url) ? resolved.url : null;
}

/**
 * The address on another site that a page claims for itself, when it is an address that may be
 * read: cleaned as every address is, and on another site (`siteOf`) than the page that answered.
 * It is null for no claim, a blank one, one the policy refuses, a site's home page (a page that
 * names one claims a site, not a story), or one on the same site, which `acceptCanonical` decides
 * on. The claim is the page's own word and is never followed: a page
 * that republishes a story names the story's first publisher this way, and the session keeps that
 * name beside the page for the provenance of the source only (see webSession.ts).
 */
export function crossSiteCanonical(input: {
  answered: string;
  claimed: string | null;
}): string | null {
  const { answered, claimed } = input;
  if (claimed === null || claimed.trim() === "") return null;
  const resolved = resolveAddress(claimed);
  if (!resolved.ok) return null;
  let landed: URL;
  try {
    landed = new URL(answered);
  } catch {
    return null;
  }
  if (resolved.url.pathname === "/" || resolved.url.pathname === "") return null;
  return siteOf(landed.hostname) === siteOf(resolved.url.hostname) ? null : resolved.url.href;
}
