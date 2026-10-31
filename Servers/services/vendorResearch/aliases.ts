/**
 * The other names a vendor is known by. The record has one name, and the press may use another
 * ("Meta Platforms" is "Facebook" in an article), so a source that names the vendor only by that
 * other name would be taken for a source about someone else. A target holds the other names as
 * `aliases` (see target.ts), and the matcher of identity.ts reads them. They come from two places:
 *
 * - **A person**, who writes them in the vendor's record (`parseOtherNames`): trusted, whatever
 *   they are.
 * - **The vendor's home page** (`profileOf`), which gives the names its site uses for itself and
 *   the products it lists (see webResearch/siteIdentity.ts). A page is not trusted: a wrong domain
 *   would bring the names of another company in, so a name is taken only when the page names the
 *   vendor (the caller checks that) and when the name is built around the vendor's own brand, that
 *   is the first word of its name or the brand of its domain. A name that is only a part of the
 *   vendor's name ("Analytics" for "Acme Analytics") is a word that other companies use too and
 *   is left out, unless it is the brand of the vendor's domain.
 *
 * Products are never taken as names, because "Windows 11" does not make a source about Microsoft;
 * they are for the briefing, which tells the model what the site lists.
 */
import { VENDOR_VALIDATION_LIMITS } from "../../utils/validations/vendorValidation.utils";
import type { PageIdentity } from "../webResearch/siteIdentity";
import { brandOf, shortName } from "./identity";
import type { ResearchTarget } from "./target";
import { cleanText } from "./text";

/**
 * The limits of the other names are those the record of a vendor holds them to (see
 * `validateOtherNames`), so that a name a person can save is a name the research keeps.
 * The most other names a vendor has, the ones a person gave and the ones the page gave together:
 */
export const MAX_ALIASES = VENDOR_VALIDATION_LIMITS.OTHER_NAMES.MAX_NAMES;
/** The longest other name. */
export const MAX_ALIAS_CHARS = VENDOR_VALIDATION_LIMITS.OTHER_NAMES.MAX_NAME_CHARS;
const MIN_ALIAS_CHARS = VENDOR_VALIDATION_LIMITS.OTHER_NAMES.MIN_NAME_CHARS;
/** The most names, and the most products, that a home page adds. */
const MAX_PROFILE_NAMES = 4;
const MAX_PROFILE_PRODUCTS = 5;
/** The fewest letters a brand needs to be told from the many others that share it. */
const MIN_BRAND_CHARS = 3;

/** A name for comparing: lower case, letters and digits only ("Face-Book" and "facebook" are one). */
const compact = (name: string): string => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** The names once each, by their compact form, in the order they came. */
function distinct(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = compact(name);
    if (key === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The names in a text a person wrote: separated by commas, semicolons or line breaks, each cleaned
 * and trimmed. A name of fewer than two or more than MAX_ALIAS_CHARS characters, or with no letter
 * or digit in it, is passed over, a name is kept once however it is written, and at most
 * MAX_ALIASES are kept.
 */
export function parseOtherNames(text: string | null | undefined): string[] {
  if (typeof text !== "string") return [];
  const names = text
    .split(/[,;\n\r]+/)
    .map((part) => cleanText(part).replace(/\s+/g, " ").trim())
    .filter(
      (name) =>
        name.length >= MIN_ALIAS_CHARS &&
        name.length <= MAX_ALIAS_CHARS &&
        /[\p{L}\p{N}]/u.test(name),
    );
  return distinct(names).slice(0, MAX_ALIASES);
}

/**
 * The target with more other names, after the ones it has. The name of the vendor itself (also
 * without its legal form) and a name already there are not added again, and at most MAX_ALIASES are
 * kept. The target that comes back is the one that was given when nothing is added.
 */
export function withAliases(target: ResearchTarget, names: readonly string[]): ResearchTarget {
  const own = new Set([target.name, shortName(target.name)].map(compact));
  const current = target.aliases ?? [];
  const merged = distinct([...current, ...names])
    .filter((name) => !own.has(compact(name)))
    .slice(0, MAX_ALIASES);
  const unchanged =
    merged.length === current.length && merged.every((name, at) => name === current[at]);
  return unchanged ? target : { ...target, aliases: merged };
}

/** What a home page says about its site, as far as the run uses it. */
export interface SiteProfile {
  /** Other names of the vendor, to be added to the target (see `withAliases`). */
  names: string[];
  /** The products the site lists, for the briefing only. */
  products: string[];
}

const NO_PROFILE: SiteProfile = { names: [], products: [] };

/**
 * The profile of a home page that names the vendor (the caller makes sure it does): the names it
 * gives itself that are the vendor's (see the module comment), and the products it lists.
 */
export function profileOf(identity: PageIdentity | undefined, target: ResearchTarget): SiteProfile {
  if (identity === undefined) return NO_PROFILE;
  const short = shortName(target.name);
  const shortKey = compact(short);
  const domainBrand = target.domain === null ? "" : compact(brandOf(target.domain));
  const brands = [compact(short.split(/\s+/)[0] ?? ""), domainBrand].filter(
    (brand) => brand.length >= MIN_BRAND_CHARS,
  );
  const known = new Set(
    [target.name, ...(target.aliases ?? [])].flatMap((name) => [
      compact(name),
      compact(shortName(name)),
    ]),
  );

  const names = identity.names.filter((name) => {
    const key = compact(name);
    if (key === "" || known.has(key)) return false;
    if (!brands.some((brand) => key.includes(brand))) return false;
    const partOfTheName = key.length < shortKey.length && shortKey.includes(key);
    return !partOfTheName || key === domainBrand;
  });
  return {
    names: distinct(names).slice(0, MAX_PROFILE_NAMES),
    products: distinct(identity.products).slice(0, MAX_PROFILE_PRODUCTS),
  };
}
