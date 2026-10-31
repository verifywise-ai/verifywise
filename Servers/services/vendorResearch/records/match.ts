/**
 * Who a record of a public database is about. A database names a vendor by one string (CISA: the
 * `vendorProject` of an entry; NVD: the vendor part of a CPE name; Have I Been Pwned: the domain of
 * the breached service; SEC: the name of a registrant), and a record is the vendor's only when that
 * string is a name the vendor is known by, letter for letter. A name that merely contains or begins with the vendor's name is
 * not a match: "Apache" is a project of the Apache Software Foundation and not of a staffing
 * company that has the word in its name.
 */
import { brandOf, shortName } from "../identity";
import { isSharedHost } from "../sharedHosts";
import type { ResearchTarget } from "../target";

const MIN_KEY_CHARS = 2;

/**
 * The brand of the vendor's domain, or null when it has none or the domain is a host where many
 * have pages (sharedHosts.ts): the brand of `linkedin.com` or `acme.github.io` is the platform's.
 */
const brandOfVendor = (target: ResearchTarget): string | null =>
  target.domain === null || isSharedHost(target.domain) ? null : brandOf(target.domain);

/** A name as letters and digits only: "D-Link" and "dlink" are one. */
export const compactName = (name: string): string =>
  name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * The names a database may use for the vendor, compact: its name and its other names, each as
 * written and without the legal form, and the brand of its domain (none for a host where many have
 * pages). In that order, once each.
 */
export function nameKeys(target: ResearchTarget): string[] {
  const names = [target.name, ...(target.aliases ?? [])].flatMap((name) => [name, shortName(name)]);
  const brand = brandOfVendor(target);
  if (brand !== null) names.push(brand);
  const keys = names.map(compactName).filter((key) => key.length >= MIN_KEY_CHARS);
  return [...new Set(keys)];
}

/** Whether the label of a database is one of the names of the vendor. */
export function matchesVendor(label: string, keys: readonly string[]): boolean {
  const key = compactName(label);
  return key !== "" && keys.includes(key);
}

/**
 * The vendor part of the CPE names of the vendor's products, as far as it can be told: the brand of
 * the domain, else the name without its legal form, as one word ("trendmicro"). A name that is not
 * the one NVD uses finds nothing, which is no harm; it never finds another vendor's records unless
 * that vendor has the same name.
 */
export function cpeVendorOf(target: ResearchTarget): string | null {
  const token = compactName(brandOfVendor(target) ?? shortName(target.name));
  return token.length >= MIN_KEY_CHARS ? token : null;
}
