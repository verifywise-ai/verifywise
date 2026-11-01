/**
 * The keys by which a VRDB record is matched to a vendor (spec D4.4), with no model: a record
 * holds the keys of the names, domains, products and numbers its list gives, the vendor holds the
 * keys of its own, and a record is the vendor's when they share one. An identifier (an LEI, a
 * stored CIK), a verified domain or a vendor field of a vulnerability list (KEV, CVE, NVD) names
 * the vendor the way the list does and is a strong match; a registration number is strong only
 * beside the name, since a number is unique only within its register (Q1); a name alone is weak,
 * and too short a name (fewer than four characters) matches no sanctions list. A host where many
 * have pages (sharedHosts.ts) is no key on either side.
 */
import type { MatchMethod } from "../../../domain.layer/interfaces/i.vendorResearch";
import { isValidLei } from "../../../utils/validations/vendorValidation.utils";
import { shortName } from "../identity";
import { compactName, cpeVendorOf, nameKeys } from "../records/match";
import { isSharedHost } from "../sharedHosts";
import type { ResearchTarget } from "../target";

/** The shortest compact name that may match an entry of a sanctions list. */
const MIN_NAME_KEY_CHARS = 4;

/** The shortest registration number that is a key: a shorter one is too likely another's. */
const MIN_REGNO_CHARS = 6;

export const nameKey = (name: string): string => `name:${compactName(name)}`;

export const kevKey = (vendorProject: string): string => `kev:${compactName(vendorProject)}`;

/** An LEI without white space, in upper case. */
const leiText = (text: string): string => text.replace(/\s+/g, "").toUpperCase();

/** True for an LEI whose check digits match (ISO 17442), whatever its case and white space. */
export const isLei = (text: string): boolean => isValidLei(leiText(text));

export const leiKey = (lei: string): string => `lei:${leiText(lei)}`;

/** A registration number as letters and digits; null for one of fewer than six. */
export function regnoKey(number: string): string | null {
  const compact = compactName(number);
  return compact.length >= MIN_REGNO_CHARS ? `regno:${compact}` : null;
}

/** A CIK of ten digits, as the vendor form and the SEC's records give it. */
export const cikKey = (cik: string): string => `cik:${cik}`;

/** The vendor part of a CPE name (NVD). */
export const cpeKey = (token: string): string => `cpe:${token}`;

/** The vendor of an affected product of a CVE record. */
export const cveVendorKey = (vendor: string): string => `cve:${compactName(vendor)}`;

/**
 * The keys of the numbers a list gives an entry, or a person the vendor: a number that passes the
 * LEI check is a `lei:` key, any other of six or more letters and digits with a digit in it a
 * `regno:` key. Each is read whole and word by word, so that "1027700000000 (Example)" is also the
 * number alone. Once each, in order.
 */
export function identifierKeysOf(numbers: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const number of numbers) {
    for (const part of [number, ...number.split(/[^\p{L}\p{N}]+/u)]) {
      const key = regnoKey(part);
      if (key === null || !/\p{N}/u.test(part)) continue;
      keys.add(isLei(part) ? leiKey(part) : key);
    }
  }
  return [...keys];
}

/**
 * The compact names of a list entry that may match a vendor: each name as written and without its
 * legal form, of four characters or more, once each, in order.
 */
export function compactNamesOf(names: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const name of names) {
    for (const key of [compactName(name), compactName(shortName(name))]) {
      if (key.length >= MIN_NAME_KEY_CHARS) keys.add(key);
    }
  }
  return [...keys];
}

/** The name keys of a list entry (see `compactNamesOf`). */
export const nameKeysOf = (names: readonly string[]): string[] =>
  compactNamesOf(names).map((name) => `name:${name}`);

/** A host as a key: lower case, without "www." and a trailing dot. */
export function domainKey(host: string): string {
  const lower = host.toLowerCase();
  const bare = lower.endsWith(".") ? lower.slice(0, -1) : lower;
  return `domain:${bare.startsWith("www.") ? bare.slice("www.".length) : bare}`;
}

/**
 * The hosts of a website field of a list entry, which may name one site or several (separated by
 * white space, a comma or a semicolon), each with its scheme or without. A part without a scheme
 * that holds an `@` is an e-mail address: it names a mailbox, not a site, and gives no host. A
 * part with a scheme keeps its host whatever its path holds (`https://host/@name`). A name of one
 * label (`localhost`) is no site on the web and gives none. In the order of the field, lower case.
 */
export function hostsOf(field: string): string[] {
  return field
    .split(/[\s,;]+/)
    .filter((part) => part !== "")
    .flatMap((part) => {
      const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(part);
      if (!hasScheme && part.includes("@")) return [];
      try {
        const url = new URL(hasScheme ? part : `https://${part}`);
        return url.hostname.includes(".") ? [url.hostname] : [];
      } catch {
        return [];
      }
    });
}

/**
 * The keys of a vendor: each of its names and the brand of its domain as a KEV vendor and as the
 * vendor of a CVE record's affected product; the vendor part of its CPE names (records/match.ts
 * `cpeVendorOf`); each of its names, when long enough, as a name (a sanctions list is matched by
 * names only, never by the brand); each domain that the website check verified as the vendor's
 * (preflight.ts `verifiedDomainsOf`), unless it is a host where many have pages; and the keys of
 * its identifiers.
 */
export function vendorKeys(
  target: ResearchTarget,
  verifiedDomains: readonly string[] = [],
): string[] {
  const products = nameKeys(target);
  const names = nameKeys({ ...target, domain: null }).filter(
    (name) => name.length >= MIN_NAME_KEY_CHARS,
  );
  const cpe = cpeVendorOf(target);
  const { lei, registrationNumber, secCik } = target.identifiers ?? {};
  return [
    ...products.map((name) => `kev:${name}`),
    ...products.map(cveVendorKey),
    ...(cpe === null ? [] : [cpeKey(cpe)]),
    ...names.map((name) => `name:${name}`),
    ...verifiedDomains.filter((domain) => !isSharedHost(domain)).map(domainKey),
    ...(lei === undefined ? [] : [leiKey(lei)]),
    ...(registrationNumber === undefined ? [] : identifierKeysOf([registrationNumber])),
    ...(secCik === undefined ? [] : [cikKey(secCik)]),
  ];
}

/**
 * The kinds of key, the surest first. A registration number matches only beside a name the
 * record shares with the vendor (Q1).
 */
const KEY_KINDS: ReadonlyArray<{
  prefix: string;
  method: MatchMethod;
  strength: "strong" | "weak";
  withName?: true;
}> = [
  { prefix: "lei:", method: "identifier", strength: "strong" },
  { prefix: "domain:", method: "domain", strength: "strong" },
  { prefix: "cik:", method: "sec_cik", strength: "strong" },
  { prefix: "cpe:", method: "nvd_cpe_vendor", strength: "strong" },
  { prefix: "kev:", method: "kev_vendor", strength: "strong" },
  { prefix: "cve:", method: "cve_affected_vendor", strength: "strong" },
  { prefix: "regno:", method: "identifier", strength: "strong", withName: true },
  { prefix: "name:", method: "name_exact", strength: "weak" },
];

/**
 * How a record matches the vendor: by the surest key they share, or null when they share none. A
 * vendor key in `weakKeys` (a CIK found by the vendor's name, Q3) gives a weak match.
 */
export function matchOf(
  recordKeys: readonly string[],
  vendorKeys: readonly string[],
  weakKeys: ReadonlySet<string> = new Set(),
): { method: MatchMethod; strength: "strong" | "weak"; matchedKey: string } | null {
  const wanted = new Set(vendorKeys);
  const shared = (prefix: string) =>
    recordKeys.find((key) => key.startsWith(prefix) && wanted.has(key));
  for (const { prefix, method, strength, withName } of KEY_KINDS) {
    const matchedKey = shared(prefix);
    if (matchedKey === undefined) continue;
    if (withName === true && shared("name:") === undefined) continue;
    return { method, strength: weakKeys.has(matchedKey) ? "weak" : strength, matchedKey };
  }
  return null;
}
