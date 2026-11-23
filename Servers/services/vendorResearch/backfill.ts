/**
 * The backfill of the credibility label (spec D4.6, Rulings 3 to 6 of the M3 plan): the label a
 * finding of a run before the rule gets, from what its run stored. Nothing here reads or writes a
 * database; the backfill's script (scripts/vendorResearchBackfillCredibility.ts) does that.
 *
 * - **An accepted or dismissed finding** keeps the confidence the person decided it by, as a label
 *   carried over (`legacy_confidence`): a label of the new rule beside a decision made on the old
 *   one would say something the person never saw.
 * - **A pending finding** is decided by the rule's own parts (credibility.ts): the sources its run
 *   stored in the evidence pack, what the snippet check found (from the run's trace, Ruling 6; a
 *   finding that cites a page was never checked), and the records its per-run lookups cited, known
 *   by their addresses (Ruling 5, and the status page since the M3 final review) and by the pack's
 *   entry there, since those lookups kept no provenance. A cited address that the stored pack
 *   lacks reads as unconfirmed, so a run that kept no evidence gives no High. The rule is stored
 *   under the backfill's name (`backfill_official_record`), and the status job never decides it
 *   again (vrdb/relabel.ts).
 *
 * The backfill stays offline. Who filed an EDGAR filing is read from its header (edgarFiler.ts,
 * Q28), which a run asks the SEC for and the backfill does not, so a filing that a run read as a
 * page under the stored CIK becomes unverified here, since no filer is known: the run that had the
 * answer said the vendor's statement only when the vendor filed it. A per-run SEC record keeps the
 * strength it was stored with (Q3), which the address of its filing and the stored CIK give.
 */
import {
  type BackfilledCredibilityBasis,
  type CredibilityLabel,
  type CredibilitySource,
  type EvidenceSource,
  type FindingConfidence,
  type FindingSource,
  type LegacyCredibilityBasis,
  type ResearchCategory,
  CREDIBILITY_LABELS,
  LEGACY_CONFIDENCE_RULE,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { backfillRuleOf, decideCredibility, describeSources } from "./credibility";
import type { SourceProvenance } from "./evidence";
import { storedCikOf } from "./records/sec";
import { statusHostsOf } from "./records/statuspage";
import { RECORD_CATEGORY } from "./records/types";
import { REGISTRY_VERSION } from "./sourceRegistry/entries";
import type { ResearchTarget } from "./target";
import type { TraceStep } from "./trace";
import type { SnippetVerdict } from "./verifySnippets";

/** A finding as the backfill reads it from its row. */
export interface LegacyFinding {
  id: number;
  status: "pending" | "accepted" | "dismissed";
  category: ResearchCategory;
  sources: FindingSource[];
  snippet_only: boolean;
  confidence: FindingConfidence | null;
  /** When the run stored it, as an ISO 8601 time: the day its per-run lookups read their records. */
  created_at: string;
}

export interface BackfillInput {
  finding: LegacyFinding;
  /** The evidence pack the run's analysis read, as the run stored it; null for a run without it. */
  evidence: readonly EvidenceSource[] | null;
  /** The run's trace, as stored; null for a run without one. */
  trace: { steps?: readonly TraceStep[] } | null;
  /** The vendor as it is now (`buildTarget`). */
  target: ResearchTarget;
}

export interface BackfillLabel {
  credibility: CredibilityLabel;
  basis: BackfilledCredibilityBasis | LegacyCredibilityBasis;
}

type InferredRecord = NonNullable<CredibilitySource["record"]>;

/** An address longer than this is no address of a per-run record, and is not matched at all. */
const MAX_ADDRESS_CHARS = 2048;

// The addresses of the per-run records (Ruling 5), anchored and bounded, so each is read in linear
// time. The NVD page also stands for the per-run KEV records, which cited the same page.
const NVD_PAGE = /^https:\/\/nvd\.nist\.gov\/vuln\/detail\/(CVE-\d{4}-\d{4,19})$/;
const OFAC_ENTRY = /^https:\/\/sanctionssearch\.ofac\.treas\.gov\/Details\.aspx\?id=(\d{1,12})$/;
// A filing's folder is its accession number without the dashes (10, 2 and 6 digits).
const SEC_FILING =
  /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d{1,10})\/(\d{18})\/[^/?#\s]{1,200}$/;
const HIBP_BREACH = /^https:\/\/haveibeenpwned\.com\/api\/v3\/breach\/([A-Za-z0-9._-]{1,100})$/;
// The status page lookup's two (records/statuspage.ts): the history of a host and an incident.
const STATUS_PAGE = /^https:\/\/([a-z0-9.-]{1,253})\/(?:history|incidents\/[A-Za-z0-9]{1,40})$/;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day (YYYY-MM-DD, UTC) of an ISO 8601 time; null for anything else. */
function dayOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}

/**
 * The record a per-run lookup cited, from its address (Ruling 5): which database, how surely it is
 * the vendor's, and its id; active, as of `day`, the day the lookup read it. Null for any other
 * address. A lookup put its records into the ledger before the research, as pages under its
 * database's category, and the ledger holds an address once: an entry of the stored pack at the
 * address (`packed`) of another kind or category is one the research found itself, and is read as
 * any page, as at run time; without an entry, the address decides. An SEC filing is the vendor's
 * only under the CIK a person stored on the vendor; its id is the accession number, as the SEC
 * writes it. A status page is one of the hosts the lookup asks for the vendor's domain: its own
 * status host whoever read it, and the brand's hosts, which could be another company's, only as the
 * lookup stored its record, since the lookup kept a feed of them only when it named the vendor. Its
 * record has no id, as at run time.
 */
export function provenanceByAddress(
  url: string,
  target: ResearchTarget,
  day: string,
  packed?: EvidenceSource,
): InferredRecord | null {
  if (typeof url !== "string" || url.length > MAX_ADDRESS_CHARS) return null;
  const record = (
    source: InferredRecord["source"],
    match: InferredRecord["match"],
    id: string | null,
  ): InferredRecord | null =>
    packed === undefined || (packed.kind === "page" && packed.category === RECORD_CATEGORY[source])
      ? {
          source,
          match,
          status: "active",
          ...(id === null ? {} : { source_record_id: id }),
          ...(DAY.test(day) ? { as_of: day } : {}),
        }
      : null;

  const nvd = NVD_PAGE.exec(url);
  if (nvd !== null) return record("nvd", "strong", nvd[1]);
  const ofac = OFAC_ENTRY.exec(url);
  if (ofac !== null) return record("ofac", "weak", ofac[1]);
  const sec = SEC_FILING.exec(url);
  if (sec !== null) {
    const stored = storedCikOf(target);
    const vendors = stored !== null && Number(stored) === Number(sec[1]);
    const folder = sec[2];
    const accession = `${folder.slice(0, 10)}-${folder.slice(10, 12)}-${folder.slice(12)}`;
    return record("sec", vendors ? "strong" : "weak", accession);
  }
  const hibp = HIBP_BREACH.exec(url);
  if (hibp !== null) return record("hibp", null, hibp[1]);
  const status = STATUS_PAGE.exec(url);
  if (status !== null && target.domain !== null) {
    const host = statusHostsOf(target.domain).find((candidate) => candidate.host === status[1]);
    if (host !== undefined && (host.own || packed !== undefined)) {
      return record("statuspage", null, null);
    }
  }
  return null;
}

/** The checks of the snippet check that are the finding's: of its addresses and its category. */
function checksOf(finding: LegacyFinding, trace: BackfillInput["trace"]): TraceStep[] {
  const steps: unknown = trace !== null && typeof trace === "object" ? trace.steps : undefined;
  if (!Array.isArray(steps)) return [];
  const cited = new Set(finding.sources.map((source) => source.url));
  return steps.filter(
    (step): step is TraceStep =>
      step !== null &&
      typeof step === "object" &&
      step.by === "verification" &&
      step.tool === "read" &&
      typeof step.url === "string" &&
      cited.has(step.url) &&
      (step.category === undefined || step.category === finding.category),
  );
}

/**
 * What the snippet check found for a finding (Ruling 6), from the run's trace first. A finding that
 * cites a page the run read (`pack`, the stored pack's entries by address) was never checked and
 * has no verdict, as at run time: a check of one of its addresses was another finding's, since the
 * trace keeps no finding id. A snippet-only finding is contradicted when a check of its address
 * found the quote off the page, and unread when its checks found nothing; with no check in the
 * trace, the spec's rule decides (a stored `low` was contradicted, any other unread). Another
 * finding is confirmed when a check confirmed it, and otherwise has no verdict.
 */
export function verdictOf(
  finding: LegacyFinding,
  trace: BackfillInput["trace"],
  pack: ReadonlyMap<string, EvidenceSource>,
): SnippetVerdict | null {
  if (finding.sources.some((source) => pack.get(source.url)?.kind === "page")) return null;
  const checks = checksOf(finding, trace);
  if (finding.snippet_only === true) {
    const off = checks.find((step) => step.outcome === "not_on_page");
    if (off?.url !== undefined) return { outcome: "not_on_page", url: off.url };
    if (checks.length > 0) return { outcome: "unread" };
    const first = finding.sources[0]?.url;
    return finding.confidence === "low" && first !== undefined
      ? { outcome: "not_on_page", url: first }
      : { outcome: "unread" };
  }
  const confirmed = checks.find((step) => step.outcome === "confirmed");
  return confirmed?.url === undefined ? null : { outcome: "confirmed", url: confirmed.url };
}

const isLabel = (value: unknown): value is CredibilityLabel =>
  (CREDIBILITY_LABELS as readonly unknown[]).includes(value);

/**
 * The label the backfill gives a finding (see the header); null only for an accepted or dismissed
 * finding without a confidence, which has no label to keep. Pure, and it never throws.
 */
export function backfillCredibilityOf(input: BackfillInput): BackfillLabel | null {
  const finding: LegacyFinding = {
    ...input.finding,
    sources: Array.isArray(input.finding.sources)
      ? input.finding.sources.filter(
          (source) =>
            source !== null && typeof source === "object" && typeof source.url === "string",
        )
      : [],
  };
  if (finding.status !== "pending") {
    return isLabel(finding.confidence)
      ? { credibility: finding.confidence, basis: { rule: LEGACY_CONFIDENCE_RULE } }
      : null;
  }

  const day = dayOf(finding.created_at) ?? "";
  // A stored pack is read as stored: an entry that is not an object with an address is no source.
  const pack = Array.isArray(input.evidence)
    ? input.evidence.filter(
        (entry): entry is EvidenceSource =>
          entry !== null && typeof entry === "object" && typeof entry.url === "string",
      )
    : [];
  const packOf = new Map<string, EvidenceSource>();
  for (const entry of pack) if (!packOf.has(entry.url)) packOf.set(entry.url, entry);
  const records = new Map<string, InferredRecord>();
  for (const { url } of finding.sources) {
    const record = provenanceByAddress(url, input.target, day, packOf.get(url));
    if (record !== null && !records.has(url)) records.set(url, record);
  }
  const provenance = new Map<string, SourceProvenance>(
    [...records].map(([url, record]) => [url, { record: record.source }]),
  );
  const verdict = verdictOf(finding, input.trace, packOf);
  const sources = describeSources({
    finding,
    pack,
    provenance,
    verdict,
    target: input.target,
  }).map((source) => {
    const record = records.get(source.url);
    return record === undefined ? source : { ...source, record };
  });
  const { label, rule, nameOnly } = decideCredibility(sources, {
    contradicted: verdict?.outcome === "not_on_page",
  });
  return {
    credibility: label,
    basis: {
      rule: backfillRuleOf(rule),
      registry_version: REGISTRY_VERSION,
      name_only: nameOnly,
      sources,
    },
  };
}
