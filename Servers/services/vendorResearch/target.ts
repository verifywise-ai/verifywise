/**
 * Who a research run is about: the vendor's name, the domain of its website, what it provides and
 * the identifiers a person gave it.
 *
 * The domain is the identity anchor. A search for a common name finds other companies too, so the
 * two categories that read the vendor's own pages are tied to its domain, and a run without a
 * domain skips them.
 */
import { IVendor } from "../../domain.layer/interfaces/i.vendor";
import { parseOtherNames, withAliases } from "./aliases";

export interface ResearchTarget {
  name: string;
  /** The vendor's host name in ASCII, without scheme, port, path or "www."; null when it has none. */
  domain: string | null;
  provides: string;
  /**
   * The other names the vendor is known by (a brand, a former name, the name the press uses): the
   * ones a person gave, then the ones its home page gave itself (see aliases.ts). Absent when there
   * are none.
   */
  aliases?: string[];
  /** The identifiers a person gave the vendor (spec Q1); absent when it has none. */
  identifiers?: VendorIdentifiers;
}

/**
 * The identifiers of a vendor, as the vendor form stores them: the country it is registered in
 * (ISO 3166-1 alpha-2, upper case), its company registration number, its LEI (ISO 17442) and its
 * SEC CIK (ten digits). Each is absent when the vendor has none.
 */
export interface VendorIdentifiers {
  country?: string;
  registrationNumber?: string;
  lei?: string;
  secCik?: string;
}

/**
 * A scheme is a name followed by a colon that does not start a port, as in "https:" or "mailto:".
 * "acme.com:8443/path" has none: what follows its colon is a port number.
 */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** One label of a host name: letters, digits and inner hyphens, at most 63 characters. */
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const MAX_DOMAIN_LENGTH = 253;

/**
 * True for a name such as "acme.com". That needs two or more valid labels and a top-level domain
 * with a letter in it. The last rule is what tells "acme.com" from the dotted form of an IPv4
 * address, which the URL parser produces for every spelling of one (0x7f.1, 2130706433, ...).
 * "localhost" has one label and "[::1]" is not a label at all.
 */
function isPublicDomainName(host: string): boolean {
  if (host.length > MAX_DOMAIN_LENGTH) return false;
  const labels = host.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => DOMAIN_LABEL.test(label))) return false;
  return /[a-z]/.test(labels[labels.length - 1]);
}

/**
 * The domain of a website address, or null when there is no public domain name in it.
 *
 * "https://www.Acme.com/security?x=1" and "acme.com:8443/path" both give "acme.com", and an
 * internationalised name comes back in its ASCII (punycode) form. Only the "www." in front is
 * removed, so "trust.acme.com" stays as it is. A website with a scheme other than http or https,
 * an IP address, "localhost" and text that is not an address all give null.
 *
 * It never throws. Anything that is not a string gives null.
 */
export function normaliseDomain(website: string | null | undefined): string | null {
  if (typeof website !== "string") return null;
  const text = website.trim();

  let host: string;
  try {
    const url = new URL(HAS_SCHEME.test(text) ? text : `https://${text}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }

  host = host.replace(/\.$/, "").replace(/^www\./, "");
  return isPublicDomainName(host) ? host : null;
}

/** The identifiers of a vendor record that hold a value; undefined when none does. */
function identifiersOf(
  vendor: Partial<Pick<IVendor, "country" | "registration_number" | "lei" | "sec_cik">>,
): VendorIdentifiers | undefined {
  const fields: Array<[keyof VendorIdentifiers, string | null | undefined]> = [
    ["country", vendor.country],
    ["registrationNumber", vendor.registration_number],
    ["lei", vendor.lei],
    ["secCik", vendor.sec_cik],
  ];
  const given = fields.flatMap(([field, value]) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text === "" ? [] : [[field, text] as const];
  });
  return given.length === 0 ? undefined : Object.fromEntries(given);
}

/**
 * The target of a vendor record: its name, its domain, what it provides and, when a person wrote
 * any, the other names it is known by (see aliases.ts) and its identifiers.
 */
export function buildTarget(
  vendor: Pick<IVendor, "vendor_name" | "website" | "vendor_provides"> &
    Partial<Pick<IVendor, "other_names" | "country" | "registration_number" | "lei" | "sec_cik">>,
): ResearchTarget {
  const identifiers = identifiersOf(vendor);
  const target: ResearchTarget = {
    name: vendor.vendor_name.trim(),
    domain: normaliseDomain(vendor.website),
    provides: vendor.vendor_provides.trim(),
    ...(identifiers === undefined ? {} : { identifiers }),
  };
  return withAliases(target, parseOtherNames(vendor.other_names));
}
