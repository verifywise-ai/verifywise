/**
 * The plain words of the research findings section: what a person who does not know how the
 * research works reads before they open anything. The summary above the list, the one line of a
 * row, its cautions, and the tags of its sources.
 *
 * The facts are the ones `vendorResearchText.ts` words for the details (the sentence of a
 * credibility rule, the names of the databases): this file says them once, as sentences about
 * what they mean for the reader, and leaves the counters and the names of the rules to the
 * details. Every sentence is a whole template, translated with `t()` and filled by name.
 */

import { fill } from "../../i18n/fill";
import type {
  FindingSource,
  RecordStatus,
  SourceCategory,
  StoredCredibilityBasis,
  VendorRiskFinding,
} from "../../domain/interfaces/i.vendorResearch";
import type { PendingSummary } from "./vendorResearchList";
import {
  categoryLabel,
  credibilityLabel,
  credibilityRationale,
  nameOnlyNote,
} from "./vendorResearchText";

type Translate = (key: string) => string;

/** An own key of a label map only, so that "constructor" and the like are not labels. */
const labelFor = <K extends string>(labels: Record<K, string>, key: unknown): string | undefined =>
  typeof key === "string" && Object.prototype.hasOwnProperty.call(labels, key)
    ? labels[key as K]
    : undefined;

// ── The summary above the list ───────────────────────────────────────────────

/**
 * How many findings wait for a decision and how many of them are high risk. When the server holds
 * more findings than it sent, only the count: the rest would describe a part of them.
 */
export function pendingSentence(summary: PendingSummary, t: Translate): string {
  const { total, high } = summary;
  const count = fill(
    t(total === 1 ? "1 possible risk to review." : "{count} possible risks to review."),
    { count: total },
  );
  if (!summary.complete || high === 0) return count;
  if (high === total) {
    return `${count} ${t(total === 1 ? "It is high risk." : "All are high risk.")}`;
  }
  return `${count} ${fill(t(high === 1 ? "1 is high risk." : "{count} are high risk."), {
    count: high,
  })}`;
}

/** The categories most of the findings are about; null when there are none to name. */
export function topicsSentence(summary: PendingSummary, t: Translate): string | null {
  if (!summary.complete || summary.topics.length === 0) return null;
  return fill(t("Most are about: {topics}."), {
    topics: summary.topics
      .map(({ category, count }) => `${categoryLabel(category, t)} (${count})`)
      .join(", "),
  });
}

/**
 * What the latest run could not check, as a sentence that says what it means for the reader. The
 * names are the ones the coverage of the run gives (`coverageLines().unchecked`). Null when
 * everything was checked.
 */
export function uncheckedSentence(names: readonly string[], t: Translate): string | null {
  if (names.length === 0) return null;
  const sources = names.join(", ");
  return names.length === 1
    ? fill(t("One source could not be checked, so results may be incomplete: {sources}."), {
        sources,
      })
    : fill(t("{count} sources could not be checked, so results may be incomplete: {sources}."), {
        count: names.length,
        sources,
      });
}

/**
 * The one line that explains the asterisk of the rows whose credibility is an earlier estimate
 * (see `credibilityLine`). Said once above the list, not on every row. Null when no row has one.
 */
export function earlierLegend(count: number, t: Translate): string | null {
  if (count <= 0) return null;
  return count === 1
    ? t(
        "* Earlier estimate: 1 of these findings was rated before the current rules for rating sources.",
      )
    : fill(
        t(
          "* Earlier estimate: {count} of these findings were rated before the current rules for rating sources.",
        ),
        { count },
      );
}

// ── A row ────────────────────────────────────────────────────────────────────

/**
 * Where a source points, when it points somewhere safe. A source URL is text from the open
 * web: only http and https become a link, so `javascript:`, `data:` and the like never do.
 * `href` is the normalized address, and the host is what the link says.
 */
export function readSourceLink(url: string): { href: string; host: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.hostname === "") return null;
    return { href: parsed.href, host: parsed.hostname };
  } catch {
    return null;
  }
}

const BACKFILL_PREFIX = "backfill_";

/** The rule that decided a label, whether the run or the backfill applied it; "" for none. */
const decidedRule = (basis: StoredCredibilityBasis | null | undefined): string => {
  const rule = typeof basis === "object" && basis !== null ? String(basis.rule) : "";
  return rule.startsWith(BACKFILL_PREFIX) ? rule.slice(BACKFILL_PREFIX.length) : rule;
};

/** The hosts of the sources, each once, in the order of the sources. */
const hostsOf = (sources: readonly FindingSource[]): string[] => [
  ...new Set(
    sources.flatMap((source) => {
      const link = typeof source?.url === "string" ? readSourceLink(source.url) : null;
      return link === null ? [] : [link.host];
    }),
  ),
];

/**
 * The line of a finding whose label is its earlier confidence: the source rules did not decide
 * it, so the line says what the finding has, its sources. The asterisk points at the legend above
 * the list (`earlierLegend`).
 */
function earlierLine(label: string, sources: readonly FindingSource[], t: Translate): string {
  if (sources.length === 0) return `${label}*`;
  const hosts = hostsOf(sources).join(", ");
  if (sources.length === 1) {
    return hosts === ""
      ? fill(t("{label}*: one source reports it."), { label })
      : fill(t("{label}*: one source reports it ({host})."), { label, host: hosts });
  }
  return hosts === ""
    ? fill(t("{label}*: {count} sources report it."), { label, count: sources.length })
    : fill(t("{label}*: {count} sources report it ({hosts})."), {
        label,
        count: sources.length,
        hosts,
      });
}

export interface CredibilityLine {
  text: string;
  /** True when the label is the finding's earlier confidence: the text carries the asterisk. */
  earlier: boolean;
}

/**
 * The one line that says how well the sources establish a finding. It starts with the label
 * ("High: …"), so the row needs no chip beside it.
 *
 * A label the source rules decided reads the sentence of its rule, with the day of an out-of-date
 * copy. That a label was rated again later is left out unless `full` is asked for: it is true of
 * every older row once the labels have been recomputed, so a row says it only where the reader
 * has opened it. A label that is the earlier confidence counts the sources instead. A label with
 * no basis, or with one this screen cannot word, is shown alone. Null for a finding with no
 * label, or with one this screen does not know.
 */
export function credibilityLine(
  finding: VendorRiskFinding,
  t: Translate,
  lang: string,
  options: { full?: boolean } = {},
): CredibilityLine | null {
  const label = credibilityLabel(finding.credibility, t);
  if (label === null) return null;
  const basis = finding.credibility_basis ?? null;
  if (basis !== null && typeof basis === "object" && basis.rule === "legacy_confidence") {
    const sources = Array.isArray(finding.sources) ? finding.sources : [];
    return { text: earlierLine(label, sources, t), earlier: true };
  }
  const worded =
    options.full === true || basis === null || typeof basis !== "object"
      ? basis
      : ({ ...basis, rule: decidedRule(basis) } as StoredCredibilityBasis);
  const words = credibilityRationale(worded, t, lang);
  const text = [words.sentence, words.stale ?? ""].filter((sentence) => sentence !== "").join(" ");
  return { text: text === "" ? label : text, earlier: false };
}

/** The rules whose own sentence already says that only search results show the finding. */
const SAYS_SEARCH_RESULTS_ONLY: ReadonlySet<string> = new Set([
  "capped_unconfirmed",
  "contradicted",
]);

/** What became of a cited record its database no longer stands by, in the order they are said. */
const INACTIVE_RECORD_CAUTIONS: Record<Exclude<RecordStatus, "active">, string> = {
  withdrawn: "A cited record was withdrawn by its source.",
  rejected: "A cited record was rejected by its source.",
  delisted: "A cited record was removed from its list.",
};

/**
 * What a reader should know before trusting a row, one sentence each: the finding rests on search
 * results only, a record matched the vendor by name only, a cited record is no longer stood by.
 * A caution the credibility line of the row already makes is not made again.
 */
export function rowCautions(finding: VendorRiskFinding, t: Translate): string[] {
  const basis = finding.credibility_basis ?? null;
  const rule = decidedRule(basis);
  const cautions: string[] = [];

  if (finding.snippet_only === true && !SAYS_SEARCH_RESULTS_ONLY.has(rule)) {
    cautions.push(
      t("Based on search results only: it could not be confirmed on the source pages."),
    );
  }
  const nameOnly = nameOnlyNote(basis, t);
  if (nameOnly !== null) cautions.push(nameOnly);
  if (rule !== "inactive") {
    const statuses = new Set(
      (Array.isArray(finding.sources) ? finding.sources : []).map(
        (source) => source?.record?.status,
      ),
    );
    for (const status of Object.keys(INACTIVE_RECORD_CAUTIONS) as Array<
      keyof typeof INACTIVE_RECORD_CAUTIONS
    >) {
      if (statuses.has(status)) cautions.push(t(INACTIVE_RECORD_CAUTIONS[status]));
    }
  }
  return cautions;
}

const SOURCE_TAGS: Record<SourceCategory, string> = {
  official: "Official source",
  trusted_press: "Trusted publisher",
  vendor: "Vendor's own page",
  unverified: "Unverified source",
};

const RECORD_TAGS: Record<Exclude<RecordStatus, "active">, string> = {
  withdrawn: "Record withdrawn",
  rejected: "Record rejected",
  delisted: "Removed from the list",
};

/** What kind of source a cited source is; null for none, or for a kind this file does not know. */
export function sourceTag(
  category: SourceCategory | null | undefined,
  t: Translate,
): string | null {
  const words = labelFor(SOURCE_TAGS, category);
  return words === undefined ? null : t(words);
}

/** What became of a cited record its database no longer stands by; null for an active record. */
export function recordTag(status: RecordStatus | null | undefined, t: Translate): string | null {
  const words = labelFor(RECORD_TAGS, status);
  return words === undefined ? null : t(words);
}

/** The two scales the risk level is computed from, on one quiet line. */
export function scalesLine(finding: VendorRiskFinding, t: Translate): string {
  return fill(t("Severity: {severity} · Likelihood: {likelihood}"), {
    severity: t(finding.risk_severity),
    likelihood: t(finding.likelihood),
  });
}
