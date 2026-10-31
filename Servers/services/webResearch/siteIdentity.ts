/**
 * What a page says about the site it belongs to, read from its data and not from its text: the
 * names the site gives itself and the products it lists.
 *
 * The home page of a vendor is where the vendor tells who it is, and the name in the record is not
 * always the one the press uses ("Meta Platforms" is "Facebook" in an article). Three places carry
 * the names, none of which a script has to run to read:
 *
 * - the meta tags `og:site_name` and `application-name`;
 * - JSON-LD nodes of an organization type (`name`, `alternateName`, `legalName`) and of a
 *   `WebSite` (`name`, `alternateName`);
 * - JSON-LD nodes of a product type (`Product`, `SoftwareApplication`, `WebApplication`,
 *   `MobileApplication`, `Service`) for the products.
 *
 * Only the node's own fields are read. An organization that a node names inside itself (a parent,
 * a member, a brand) is not the site's own name, so it is never taken.
 *
 * What the page says about itself is a claim of a third party, so it is read with care: a name is a
 * text of 2 to 80 characters with a letter in it that is not an address, markup or a tagline
 * ("Acme | Cloud hosting for teams"), a name is kept once however it is written, and at most
 * MAX_IDENTITY_NAMES names and MAX_IDENTITY_PRODUCTS products are kept. The data is bounded like
 * any other data of a page (see scriptedText.ts), and a script is searched through for at most
 * MAX_NODES nodes and a few levels of `@graph`.
 */
import { decodeEntities, parseAttributes, tidyText } from "./pageText";
import { jsonLdBlocks } from "./scriptedText";

export const MAX_IDENTITY_NAMES = 8;
export const MAX_IDENTITY_PRODUCTS = 12;

export interface PageIdentity {
  /** The names the site gives itself, in the order of how sure they are: the site, the application, the data. */
  names: string[];
  /** The names of the products and services the data lists. */
  products: string[];
}

const MIN_NAME_CHARS = 2;
const MAX_NAME_CHARS = 80;
const MAX_META_TAGS = 200;
/** The nodes of one script that are looked at, and how many levels of `@graph` and lists are entered. */
const MAX_NODES = 500;
const MAX_DEPTH = 4;

const META_TAG = /<meta\b([^<>]{0,4096})>/gi;

const ORGANIZATION_TYPES: ReadonlySet<string> = new Set([
  "organization",
  "corporation",
  "localbusiness",
  "ngo",
  "onlinebusiness",
  "onlinestore",
  "educationalorganization",
  "governmentorganization",
  "medicalorganization",
  "newsmediaorganization",
  "airline",
  "store",
]);
const WEBSITE_TYPES: ReadonlySet<string> = new Set(["website"]);
const PRODUCT_TYPES: ReadonlySet<string> = new Set([
  "product",
  "softwareapplication",
  "webapplication",
  "mobileapplication",
  "service",
]);

/** Something after which a title goes on with a slogan: "Acme | Cloud hosting", "Acme - Cloud hosting". */
const TAGLINE = /\s[-\u2013\u2014|:\u2022\u00b7\u00bb]\s|[|\u2022\u00bb]/;

/** A name as a text, or null when it is not one (see the module comment). */
function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = tidyText(decodeEntities(raw)).replace(/\s+/g, " ").trim();
  if (name.length < MIN_NAME_CHARS || name.length > MAX_NAME_CHARS) return null;
  if (!/\p{L}/u.test(name) || /[<>]/.test(name) || TAGLINE.test(name)) return null;
  if (name.includes("://") || name.startsWith("//")) return null;
  return name;
}

/** A name or a list of them, as the cleaned names; what is not a text is passed over. */
function namesIn(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((entry) => cleanName(entry) ?? []);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The types of a node, lower case and without the address in front of them: "https://schema.org/Corporation" is "corporation". */
function typesOf(node: Record<string, unknown>): string[] {
  const raw = node["@type"];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((type): type is string => typeof type === "string")
    .map((type) =>
      type.slice(Math.max(type.lastIndexOf("/"), type.lastIndexOf("#")) + 1).toLowerCase(),
    );
}

/**
 * The nodes of a JSON-LD block in the order of the document: the block itself, the members of a
 * list and the members of a `@graph`. The walk keeps its own stack, visits at most MAX_NODES values
 * and goes down MAX_DEPTH levels, so that a block written to be slow to read cannot be.
 */
function nodesOf(block: unknown): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  const stack: Array<{ value: unknown; depth: number }> = [{ value: block, depth: 0 }];
  let visited = 0;
  while (stack.length > 0 && visited < MAX_NODES) {
    const { value, depth } = stack.pop() as { value: unknown; depth: number };
    visited += 1;
    let members: unknown[] = [];
    if (Array.isArray(value)) {
      members = value;
    } else if (isRecord(value)) {
      nodes.push(value);
      if (Array.isArray(value["@graph"])) members = value["@graph"];
    }
    if (depth < MAX_DEPTH) {
      // Pushed last first, so that the first member is the next to come off the stack.
      for (let index = Math.min(members.length, MAX_NODES) - 1; index >= 0; index -= 1) {
        stack.push({ value: members[index], depth: depth + 1 });
      }
    }
  }
  return nodes;
}

/** The value of the first meta tag that names `key` in its `property` or its `name`; null when none does. */
function metaContents(html: string, keys: readonly string[]): Map<string, string> {
  const found = new Map<string, string>();
  let metas = 0;
  for (const match of html.matchAll(META_TAG)) {
    if (metas >= MAX_META_TAGS) break;
    metas += 1;
    const attributes = parseAttributes(match[1]);
    const key = [attributes.get("property"), attributes.get("name")]
      .map((value) => value?.trim().toLowerCase())
      .find((value) => value !== undefined && keys.includes(value));
    if (key !== undefined && !found.has(key)) found.set(key, attributes.get("content") ?? "");
  }
  return found;
}

/** The distinct values, whatever their case, in the order they came, at most `limit` of them. */
function distinct(values: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(value);
    if (kept.length >= limit) break;
  }
  return kept;
}

export function extractPageIdentity(html: string): PageIdentity {
  const metas = metaContents(html, ["og:site_name", "application-name"]);
  const names: string[] = [
    ...namesIn(metas.get("og:site_name")),
    ...namesIn(metas.get("application-name")),
  ];
  const products: string[] = [];

  for (const block of jsonLdBlocks(html)) {
    for (const node of nodesOf(block)) {
      const types = typesOf(node);
      const isOrganization = types.some((type) => ORGANIZATION_TYPES.has(type));
      const isWebsite = types.some((type) => WEBSITE_TYPES.has(type));
      if (isOrganization || isWebsite) {
        names.push(...namesIn(node.name), ...namesIn(node.alternateName));
        if (isOrganization) names.push(...namesIn(node.legalName));
      }
      if (types.some((type) => PRODUCT_TYPES.has(type))) products.push(...namesIn(node.name));
    }
  }

  return {
    names: distinct(names, MAX_IDENTITY_NAMES),
    products: distinct(products, MAX_IDENTITY_PRODUCTS),
  };
}
