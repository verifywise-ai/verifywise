/**
 * The credibility of a finding: a label, low, medium or high, and the basis it was decided on,
 * computed by code from the sources the finding cites (spec D5,
 * `docs/superpowers/specs/2026-10-29-vendor-risk-database-design.md`). A model never sees, writes
 * or decides it. It says how well the sources establish the facts, not how likely or serious the
 * risk is.
 *
 * Each cited source is described first:
 *
 * - its class, by the source registry (see sourceRegistry/): a record by its database, any other
 *   source by its address, the vendor's mark, its words and the canonical address it claims;
 * - its reading: a page is `read`; a search result is `read` when the snippet check found the
 *   quote on its page, `contradicted` when the page it read does not hold the quote, and
 *   `unconfirmed` otherwise, as is a cited address the pack does not hold;
 * - for the vendor's own word (rule V, D5.4): a statement in an event category, on the status
 *   page, or on a trust, security, legal, privacy, terms, policy, compliance, subprocessor or
 *   status page of the vendor's site (`isStatementPage`: by its address, never by its title, and
 *   never a page of the newsroom), and a self-claim everywhere else, a wire release outside an
 *   event category included;
 * - for a record: its database, how surely it is the vendor's, and whether the database still
 *   stands by it (absent means active). A record of the vendor risk database gives all three from
 *   its lookup (`vrdb` of the provenance), with its id in the list, the day of the copy and whether
 *   the copy was out of date; another record is matched as its database's records are.
 *
 * A page is classified by the address that answered it, when it answered from another (a
 * redirect): the vendor's site is decided by that address too.
 *
 * Then the label, the first step that applies:
 *
 * 0. The snippet check found the quote missing from a page: low, `contradicted`, for the whole
 *    finding. Otherwise the supporting sources are the ones that are not contradicted and not an
 *    inactive record, and a record found by name only supports low at most.
 * 1. High, by the first of these rules that holds with a source that was read:
 *    `official_record` (an official record matched strongly), `official_page` (an official source
 *    that is not a record), `vendor_statement`, and `trusted_press_two` (trusted press of two or
 *    more registry entries, one entry being one publisher).
 * 2. Medium, `trusted_press_one`, for trusted press of exactly one publisher when one of its
 *    sources was read: what was read names the rule before what nobody could confirm.
 * 3. Medium, `capped_unconfirmed`, when one of the rules of high holds only with search results
 *    nobody could confirm.
 * 4. Medium, `trusted_press_one`, for trusted press of exactly one publisher that nobody read.
 * 5. Low: `name_only` (a record found by name), `unverified`, `self_claim`, `inactive`, and
 *    `unverified` when nothing else applies.
 *
 * The note `name_only` is set whenever a cited record matched by name only, whatever the label: a
 * weak record limits what it adds, not what the other sources earn (Q24).
 */
import {
  type BackfillRule,
  type CredibilityBasis,
  type CredibilityLabel,
  type CredibilityRule,
  type CredibilitySource,
  type EvidenceSource,
  type NewFinding,
  type ResearchCategory,
  type StoredCredibilityBasis,
  CREDIBILITY_RULES,
} from "../../domain.layer/interfaces/i.vendorResearch";
import type { SourceProvenance } from "./evidence";
import {
  classifyRecord,
  classifySource,
  isStatementPage,
  recordMatchOf,
} from "./sourceRegistry/classify";
import { REGISTRY_VERSION } from "./sourceRegistry/entries";
import type { ResearchTarget } from "./target";
import type { SnippetVerdict } from "./verifySnippets";

/**
 * The categories where a vendor's page cited for a risk reports an event of the vendor itself: an
 * incident, an outage, a legal matter or a financial event.
 */
export const EVENT_CATEGORIES: ReadonlySet<ResearchCategory> = new Set<ResearchCategory>([
  "security_incidents",
  "availability",
  "legal_regulatory",
  "financial_health",
]);

export interface CredibilityInput {
  finding: Pick<NewFinding, "category" | "sources">;
  /** The evidence the finding was made from. */
  pack: readonly EvidenceSource[];
  /** Where each source of the pack came from, by its address (see `provenanceOf`). */
  provenance: ReadonlyMap<string, SourceProvenance>;
  /** What the snippet check found for the finding; null when it was not checked. */
  verdict: SnippetVerdict | null;
  target: ResearchTarget;
}

export interface Credibility {
  label: CredibilityLabel;
  basis: CredibilityBasis;
}

/** The reading of a cited source, from its kind in the pack and the verdict of the snippet check. */
function readingOf(
  url: string,
  packed: EvidenceSource | undefined,
  verdict: SnippetVerdict | null,
): CredibilitySource["reading"] {
  if (packed === undefined) return "unconfirmed";
  if (packed.kind === "page") return "read";
  if (verdict !== null && verdict.outcome !== "unread" && verdict.url === url) {
    return verdict.outcome === "confirmed" ? "read" : "contradicted";
  }
  return "unconfirmed";
}

function describeSource(
  url: string,
  input: CredibilityInput,
  packOf: ReadonlyMap<string, EvidenceSource>,
): CredibilitySource {
  const { finding, provenance, verdict, target } = input;
  const packed = packOf.get(url);
  const origin = provenance.get(url);
  const record = origin?.record;
  const meta = origin?.vrdb;
  const address = origin?.answeredUrl ?? url;
  const found =
    record !== undefined
      ? classifyRecord(record)
      : classifySource(
          {
            url: address,
            onVendorSite: packed?.onVendorSite ?? false,
            ...(packed === undefined ? {} : { text: `${packed.title} ${packed.content}` }),
            ...(origin?.canonicalUrl === undefined ? {} : { canonicalUrl: origin.canonicalUrl }),
          },
          target,
        );
  const isStatement =
    EVENT_CATEGORIES.has(finding.category) ||
    record === "statuspage" ||
    (packed?.onVendorSite === true && target.domain !== null && isStatementPage(address));
  return {
    url,
    category: found.category,
    publisher: found.publisher,
    ...(found.publisherName === undefined ? {} : { publisher_name: found.publisherName }),
    entry: found.entry,
    reviewed: found.reviewed,
    reading: readingOf(url, packed, verdict),
    ...(found.category === "vendor"
      ? { vendor_kind: isStatement ? ("statement" as const) : ("self_claim" as const) }
      : {}),
    ...(record === undefined
      ? {}
      : {
          record: {
            source: record,
            match: meta?.strength ?? recordMatchOf(record, target),
            status: meta?.status ?? origin?.status ?? "active",
            ...(meta === undefined
              ? {}
              : {
                  source_record_id: meta.sourceRecordId,
                  as_of: meta.asOf,
                  ...(meta.stale ? { stale: true as const } : {}),
                }),
          },
        }),
    ...(found.downgraded ? { downgraded: true as const } : {}),
    ...(found.syndicated ? { syndicated: true as const } : {}),
    ...(found.blocked ? { blocked: true as const } : {}),
    ...(found.userContent ? { user_content: true as const } : {}),
  };
}

const isActive = (source: CredibilitySource): boolean =>
  source.record === undefined || source.record.status === "active";

/** The independent publishers of trusted press sources: one registry entry is one publisher. */
const publishersOf = (sources: readonly CredibilitySource[]): number =>
  new Set(sources.map((source) => source.entry ?? source.publisher)).size;

/** The rules of high, in the order they are tried, each with the sources it holds with. */
const HIGH_RULES: ReadonlyArray<{
  rule: CredibilityRule;
  holds: (sources: readonly CredibilitySource[]) => readonly CredibilitySource[] | null;
}> = [
  {
    rule: "official_record",
    holds: (sources) => {
      const found = sources.filter(
        (source) => source.category === "official" && source.record?.match === "strong",
      );
      return found.length > 0 ? found : null;
    },
  },
  {
    rule: "official_page",
    holds: (sources) => {
      const found = sources.filter(
        (source) => source.category === "official" && source.record === undefined,
      );
      return found.length > 0 ? found : null;
    },
  },
  {
    rule: "vendor_statement",
    holds: (sources) => {
      const found = sources.filter(
        (source) => source.category === "vendor" && source.vendor_kind === "statement",
      );
      return found.length > 0 ? found : null;
    },
  },
  {
    rule: "trusted_press_two",
    holds: (sources) => {
      const found = sources.filter((source) => source.category === "trusted_press");
      return publishersOf(found) >= 2 ? found : null;
    },
  },
];

/**
 * The label of described sources, the rule that decided it and the name-only note (see the header):
 * `contradicted` when the snippet check found the quote missing from a page. The status job
 * (vrdb/relabel.ts) decides a stored finding again by it from the sources its basis describes.
 * Pure, and it never throws.
 */
export function decideCredibility(
  sources: readonly CredibilitySource[],
  options: { contradicted: boolean },
): { label: CredibilityLabel; rule: CredibilityRule; nameOnly: boolean } {
  const nameOnly = sources.some((source) => source.record?.match === "weak");
  const decide = (label: CredibilityLabel, rule: CredibilityRule) => ({ label, rule, nameOnly });

  if (options.contradicted) return decide("low", "contradicted");
  const supporting = sources.filter(
    (source) => source.reading !== "contradicted" && isActive(source),
  );
  const strong = supporting.filter((source) => source.record?.match !== "weak");

  for (const { rule, holds } of HIGH_RULES) {
    const backing = holds(strong);
    if (backing?.some((source) => source.reading === "read")) return decide("high", rule);
  }
  const trusted = supporting.filter((source) => source.category === "trusted_press");
  const oneTrusted = publishersOf(trusted) === 1;
  if (oneTrusted && trusted.some((source) => source.reading === "read")) {
    return decide("medium", "trusted_press_one");
  }
  if (HIGH_RULES.some(({ holds }) => holds(strong) !== null)) {
    return decide("medium", "capped_unconfirmed");
  }
  if (oneTrusted) return decide("medium", "trusted_press_one");
  if (supporting.some((source) => source.record?.match === "weak"))
    return decide("low", "name_only");
  if (supporting.some((source) => source.category === "unverified")) {
    return decide("low", "unverified");
  }
  if (supporting.some((source) => source.vendor_kind === "self_claim")) {
    return decide("low", "self_claim");
  }
  if (sources.some((source) => !isActive(source))) return decide("low", "inactive");
  return decide("low", "unverified");
}

/** True for a rule of this rule set; false for a rule the backfill wrote or one it does not know. */
export const isCredibilityRule = (rule: string): rule is CredibilityRule =>
  (CREDIBILITY_RULES as readonly string[]).includes(rule);

/** True for a basis this rule decided, which the status job may decide again (M3 Ruling 8). */
export const isRuleBasis = (basis: StoredCredibilityBasis): basis is CredibilityBasis =>
  isCredibilityRule(basis.rule);

/** The name the backfill stores a rule under (spec D4.6: a rule that starts with backfill). */
export const backfillRuleOf = (rule: CredibilityRule): BackfillRule => `backfill_${rule}`;

/**
 * The cited sources of a finding as the rule sees them, in the order the finding cites them. The
 * backfill (backfill.ts) describes a stored finding's sources by it too. Pure, and it never throws.
 */
export function describeSources(input: CredibilityInput): CredibilitySource[] {
  const packOf = new Map<string, EvidenceSource>();
  for (const source of input.pack) if (!packOf.has(source.url)) packOf.set(source.url, source);
  return input.finding.sources.map((citation) => describeSource(citation.url, input, packOf));
}

/** The label of a finding and its basis (see the header). Pure, and it never throws. */
export function credibilityOf(input: CredibilityInput): Credibility {
  const sources = describeSources(input);
  const { label, rule, nameOnly } = decideCredibility(sources, {
    contradicted: input.verdict?.outcome === "not_on_page",
  });
  return {
    label,
    basis: { rule, registry_version: REGISTRY_VERSION, name_only: nameOnly, sources },
  };
}
