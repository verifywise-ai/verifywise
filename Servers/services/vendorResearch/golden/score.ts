/**
 * Scores the golden set (spec D6.4): the one run of each labelled vendor against what a person
 * expects of it, and the bars the runs must meet before the golden set passes.
 *
 * A finding matches an expected risk as in the replay cases (eval/scorer.ts): the same category and
 * any of the risk's words in its risk description, case ignored. A finding that matches a trap is a
 * false positive, whatever else it matches. The label of a finding is compared with the labeller's
 * only when the finding matched a risk, since an unmatched finding has no label to be held to.
 *
 * The bars are precision, label agreement, no High that the labeller rates Low, no sanctions match
 * stated as a fact, and a coverage with no list that failed. Recall is reported and has no bar:
 * a run keeps at most three findings of a category and eight of a run, so it cannot recall every
 * risk a careful analyst would raise.
 */
import {
  CREDIBILITY_LABELS,
  RESEARCH_CATEGORIES,
  type VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import type {
  GoldenExpectation,
  GoldenFinding,
  GoldenLabels,
  GoldenReport,
  GoldenRun,
  GoldenVendor,
  GoldenVerdict,
  RunScore,
  RunTotals,
} from "./types";

/** The bars of D6.4 that are a measure: precision and label agreement. Recall has none. */
export const GOLDEN_BARS = { precision: 0.9, agreement: 0.8 } as const;

/** The lists whose record matched by name may be another company (spec, risk A). */
const SANCTIONS_LISTS: ReadonlySet<string> = new Set<VrdbSourceId>([
  "ofac",
  "uk_sanctions",
  "eu_fsf",
]);

/**
 * The words the credibility prompt asks for (since vr-9) an entry matched by name only, which keep
 * the match from reading as a fact: "An entity named … is on …".
 */
const ENTITY_NAMED = /\ban entity named\b.+\bis on\b/i;

const hasAny = (text: string, words: readonly string[]): boolean => {
  const lower = text.toLowerCase();
  return words.some((word) => word.trim() !== "" && lower.includes(word.toLowerCase()));
};

const trapOf = (finding: GoldenFinding, vendor: GoldenVendor) =>
  vendor.traps.find(
    (trap) =>
      (trap.category === undefined || trap.category === finding.category) &&
      hasAny(finding.risk_description, trap.anyOf),
  );

/** The first expected risk a finding matches; none for a finding that matches a trap. */
const expectationOf = (
  finding: GoldenFinding,
  vendor: GoldenVendor,
): GoldenExpectation | undefined =>
  trapOf(finding, vendor) !== undefined
    ? undefined
    : vendor.expected.find(
        (expected) =>
          expected.category === finding.category &&
          hasAny(finding.risk_description, expected.anyOf),
      );

interface ScoredRun {
  score: RunScore;
  matches: Array<{ finding: GoldenFinding; expected: GoldenExpectation }>;
}

function scoreRun(vendor: GoldenVendor, run: GoldenRun): ScoredRun {
  const matches = run.findings.flatMap((finding) => {
    const expected = expectationOf(finding, vendor);
    return expected === undefined ? [] : [{ finding, expected }];
  });
  return {
    score: {
      findings: run.findings.length,
      matched: matches.length,
      traps: run.findings.filter((finding) => trapOf(finding, vendor) !== undefined).length,
      expected: vendor.expected.length,
      recalled: new Set(matches.map((match) => match.expected)).size,
    },
    matches,
  };
}

const ratio = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole);

function totalsOf(scores: readonly RunScore[]): RunTotals {
  const sum = (key: keyof RunScore) => scores.reduce((total, score) => total + score[key], 0);
  const findings = sum("findings");
  const matched = sum("matched");
  const expected = sum("expected");
  const recalled = sum("recalled");
  return {
    findings,
    matched,
    traps: sum("traps"),
    expected,
    recalled,
    precision: ratio(matched, findings),
    recall: ratio(recalled, expected),
  };
}

/** True when a finding cites the entry of a sanctions list that matched the vendor by name only. */
const citesNameOnlySanctionsEntry = (finding: GoldenFinding): boolean =>
  (Array.isArray(finding.sources) ? finding.sources : []).some(
    (source) =>
      source?.record !== undefined &&
      SANCTIONS_LISTS.has(source.record.source_id) &&
      source.record.match_strength === "weak",
  );

/**
 * Scores the runs of the labelled vendors: a vendor's run is the one of its vendor row (the first
 * such run in `runs` counts), and a vendor without one is listed.
 */
export function scoreGoldenSet(
  labels: readonly GoldenVendor[],
  runs: readonly GoldenRun[],
): GoldenReport {
  const report: GoldenReport = {
    vendors: labels.length,
    totals: totalsOf([]),
    compared: 0,
    agreed: 0,
    agreement: null,
    highRatedLow: [],
    sanctionsAsFact: [],
    coverageMissing: [],
    coverageFailed: [],
    missingRuns: [],
    afterEarlier: [],
    lines: [],
  };
  const scores: RunScore[] = [];

  for (const vendor of labels) {
    const ref = { vendorId: vendor.vendorId, name: vendor.name };
    const found = runs.find((candidate) => candidate.vendorId === vendor.vendorId);
    let score: RunScore | null = null;
    let compared = 0;
    let agreed = 0;

    if (found === undefined) {
      report.missingRuns.push(ref);
    } else {
      if (found.earlier > 0) report.afterEarlier.push({ ...ref, earlier: found.earlier });
      const scored = scoreRun(vendor, found);
      score = scored.score;
      scores.push(scored.score);
      for (const { finding, expected } of scored.matches) {
        compared += 1;
        if (finding.credibility === expected.label) agreed += 1;
        if (finding.credibility === "high" && expected.label === "low") {
          report.highRatedLow.push({ ...ref, finding: finding.risk_description });
        }
      }
      for (const finding of found.findings) {
        if (citesNameOnlySanctionsEntry(finding) && !ENTITY_NAMED.test(finding.risk_description)) {
          report.sanctionsAsFact.push({ ...ref, finding: finding.risk_description });
        }
      }
      const coverage = found.coverage;
      if (coverage === null || typeof coverage !== "object") {
        report.coverageMissing.push(ref);
      } else {
        const failed = (Array.isArray(coverage.sources) ? coverage.sources : [])
          .filter((source) => source?.outcome === "failed")
          .map((source) => source.id);
        if (failed.length > 0) report.coverageFailed.push({ ...ref, sources: failed });
      }
    }

    report.compared += compared;
    report.agreed += agreed;
    report.lines.push({ ...ref, profile: vendor.profile, run: score, compared, agreed });
  }

  report.totals = totalsOf(scores);
  report.agreement = ratio(report.agreed, report.compared);
  return report;
}

const fixed = (value: number) => value.toFixed(2);
const percent = (value: number) => `${Math.round(value * 100)} %`;
/** "1 vendor has", "2 vendors have". */
const vendorsHave = (count: number) => (count === 1 ? "1 vendor has" : `${count} vendors have`);
const namesOf = (refs: ReadonlyArray<{ name: string }>) => refs.map((ref) => ref.name).join(", ");

/**
 * The bars of D6.4: which the report misses, in words. A vendor without a run, a run that
 * followed earlier findings of its row and a run without coverage miss too, since the measures
 * would not be those of a run of the vendor. Recall has no bar.
 */
export function meetsBars(report: GoldenReport): GoldenVerdict {
  if (report.vendors === 0) return { ok: false, reasons: ["no labelled vendor"] };
  const reasons: string[] = [];

  const missing = report.missingRuns;
  if (missing.length > 0) {
    reasons.push(`${vendorsHave(missing.length)} no completed run (${namesOf(missing)})`);
  }
  const afterEarlier = report.afterEarlier;
  if (afterEarlier.length > 0) {
    reasons.push(
      `${afterEarlier.length === 1 ? "1 run was" : `${afterEarlier.length} runs were`} compared with earlier findings or risks of its vendor row, which hid what it found (${namesOf(afterEarlier)}): research each vendor on a fresh vendor row`,
    );
  }
  const { precision } = report.totals;
  if (precision !== null && precision < GOLDEN_BARS.precision) {
    reasons.push(`precision ${fixed(precision)}, below ${fixed(GOLDEN_BARS.precision)}`);
  }
  if (report.agreement === null) {
    if (report.totals.expected > 0) {
      reasons.push("no finding matched a labelled risk, so no label was compared");
    }
  } else if (report.agreement < GOLDEN_BARS.agreement) {
    reasons.push(
      `label agreement ${percent(report.agreement)}, below ${percent(GOLDEN_BARS.agreement)}`,
    );
  }
  const highRatedLow = report.highRatedLow.length;
  if (highRatedLow > 0) {
    reasons.push(
      highRatedLow === 1
        ? "1 finding labelled High is Low for the labeller"
        : `${highRatedLow} findings labelled High are Low for the labeller`,
    );
  }
  const asFact = report.sanctionsAsFact.length;
  if (asFact > 0) {
    reasons.push(
      asFact === 1
        ? '1 sanctions finding does not say "An entity named … is on …" of an entry matched by name only'
        : `${asFact} sanctions findings do not say "An entity named … is on …" of an entry matched by name only`,
    );
  }
  if (report.coverageMissing.length > 0) {
    reasons.push(
      `${vendorsHave(report.coverageMissing.length)} no coverage (${namesOf(report.coverageMissing)})`,
    );
  }
  const failed = report.coverageFailed;
  if (failed.length > 0) {
    const which = failed.map((ref) => `${ref.name}: ${ref.sources.join(", ")}`).join("; ");
    reasons.push(
      failed.length === 1
        ? `1 vendor's run could not check every list (${which})`
        : `${failed.length} vendors' runs could not check every list (${which})`,
    );
  }
  return { ok: reasons.length === 0, reasons };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const orNone = (value: number | null, format: (value: number) => string) =>
  value === null ? "n/a" : format(value);

function totalsLine(label: string, totals: RunTotals): string {
  return `${label}: precision ${orNone(totals.precision, fixed)}, recall ${orNone(totals.recall, fixed)} (${plural(totals.findings, "finding")}, ${totals.matched} matched, ${plural(totals.traps, "trap")})`;
}

function runPart(score: RunScore | null): string {
  if (score === null) return "no run";
  const traps = score.traps === 0 ? "" : `, ${plural(score.traps, "trap")}`;
  return `${score.matched}/${score.findings} matched, ${score.recalled}/${score.expected} recalled${traps}`;
}

/** The report as text, for the command line. Names and findings are printed as they were stored. */
export function formatGoldenReport(report: GoldenReport, verdict: GoldenVerdict): string {
  const lines = [
    `Golden set: ${plural(report.vendors, "vendor")}`,
    totalsLine("Runs", report.totals),
    "Recall is reported only: it has no bar.",
    `Label agreement: ${orNone(report.agreement, percent)} (${report.agreed} of ${report.compared})`,
  ];
  const listed = (title: string, items: string[]) =>
    lines.push(
      items.length === 0 ? `${title}: none` : `${title}:`,
      ...items.map((item) => `  - ${item}`),
    );
  listed(
    "High rated Low",
    report.highRatedLow.map((item) => `${item.name}: ${item.finding}`),
  );
  listed(
    "Sanctions stated as a fact",
    report.sanctionsAsFact.map((item) => `${item.name}: ${item.finding}`),
  );
  listed(
    "No coverage",
    report.coverageMissing.map((item) => item.name),
  );
  listed(
    "Lists not checked",
    report.coverageFailed.map((item) => `${item.name}: ${item.sources.join(", ")}`),
  );
  listed(
    "Missing runs",
    report.missingRuns.map((item) => `${item.name} (vendor ${item.vendorId})`),
  );
  listed(
    "Runs after earlier findings or risks of their vendor row",
    report.afterEarlier.map(
      (item) => `${item.name} (vendor ${item.vendorId}, ${item.earlier} earlier)`,
    ),
  );
  lines.push("", "Vendors:");
  for (const line of report.lines) {
    const agree = line.run === null ? "" : `, ${line.agreed}/${line.compared} labels agree`;
    lines.push(
      `#${line.profile} ${line.name} (vendor ${line.vendorId}): ${runPart(line.run)}${agree}`,
    );
  }
  lines.push(
    "",
    `Bars met: ${verdict.ok ? "yes" : "no"}`,
    ...verdict.reasons.map((reason) => `  - ${reason}`),
  );
  return lines.join("\n");
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isWholeAbove = (value: unknown, minimum: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;

const isWords = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((word) => typeof word === "string" && word.trim() !== "");

const isDay = (value: unknown): boolean => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
};

const CATEGORIES: ReadonlySet<unknown> = new Set(RESEARCH_CATEGORIES);
const LABELS: ReadonlySet<unknown> = new Set(CREDIBILITY_LABELS);

/**
 * The vendor row a labelled vendor was researched on, and the field of the file it is read from:
 * its `vendorId`, or, in a file of the earlier shape (a row for each flag), the `on` of its
 * `vendorIds`, which is the row the run of the vendor risk database was made on. A `vendorId` that
 * is there is never replaced by the earlier shape's. Null when the vendor names neither.
 */
function vendorRowOf(vendor: Record<string, unknown>): { field: string; value: unknown } | null {
  if (vendor.vendorId !== undefined) return { field: "vendorId", value: vendor.vendorId };
  if (isRecord(vendor.vendorIds)) return { field: "vendorIds.on", value: vendor.vendorIds.on };
  return null;
}

/**
 * Checks a labels file as a person filled it in, and names every field that is missing or wrong;
 * `labels` is the file when nothing is. A file of the earlier shape, with a vendor row for each
 * flag, is read: the row researched with the flag on becomes the vendor's `vendorId`, the flag-off
 * row is ignored, and `labels` holds no `vendorIds`.
 */
export function checkGoldenLabels(value: unknown): {
  labels: GoldenLabels | null;
  problems: string[];
} {
  if (!isRecord(value)) {
    return {
      labels: null,
      problems: [
        "the file must be an object with organizationId, labelledBy, labelledOn and vendors",
      ],
    };
  }
  const problems: string[] = [];
  if (!isWholeAbove(value.organizationId, 1)) {
    problems.push("organizationId must be a positive whole number");
  }
  if (typeof value.labelledBy !== "string" || value.labelledBy.trim() === "") {
    problems.push("labelledBy must name the person who labelled");
  }
  if (!isDay(value.labelledOn)) problems.push("labelledOn must be a day (YYYY-MM-DD)");
  if (!Array.isArray(value.vendors)) {
    problems.push("vendors must be a list");
    return { labels: null, problems };
  }

  const seen = new Set<number>();
  const vendors: unknown[] = [];
  value.vendors.forEach((vendor: unknown, index: number) => {
    const at = `vendors[${index}]`;
    if (!isRecord(vendor)) {
      problems.push(`${at} must be an object`);
      return;
    }
    if (!isWholeAbove(vendor.profile, 1) || vendor.profile > 24) {
      problems.push(`${at}.profile must be one of 1 to 24`);
    }
    const row = vendorRowOf(vendor);
    if (row === null) {
      problems.push(`${at}.vendorId must give the vendor row that was researched`);
    } else if (!isWholeAbove(row.value, 1)) {
      problems.push(`${at}.${row.field} must be a positive whole number`);
    } else if (seen.has(row.value)) {
      problems.push(`${at}.${row.field} ${row.value} is labelled twice`);
    } else {
      seen.add(row.value);
    }
    if (typeof vendor.name !== "string" || vendor.name.trim() === "") {
      problems.push(`${at}.name must be the vendor's name`);
    }
    if (!Array.isArray(vendor.expected)) {
      problems.push(`${at}.expected must be a list`);
    } else {
      vendor.expected.forEach((expected: unknown, item: number) => {
        const field = `${at}.expected[${item}]`;
        if (!isRecord(expected)) {
          problems.push(`${field} must be an object`);
          return;
        }
        if (!CATEGORIES.has(expected.category)) {
          problems.push(`${field}.category is not a research category`);
        }
        if (!isWords(expected.anyOf)) problems.push(`${field}.anyOf must hold at least one word`);
        if (!LABELS.has(expected.label))
          problems.push(`${field}.label must be low, medium or high`);
      });
    }
    if (!Array.isArray(vendor.traps)) {
      problems.push(`${at}.traps must be a list`);
    } else {
      vendor.traps.forEach((trap: unknown, item: number) => {
        const field = `${at}.traps[${item}]`;
        if (!isRecord(trap)) {
          problems.push(`${field} must be an object`);
          return;
        }
        if (trap.category !== undefined && !CATEGORIES.has(trap.category)) {
          problems.push(`${field}.category is not a research category`);
        }
        if (!isWords(trap.anyOf)) problems.push(`${field}.anyOf must hold at least one word`);
      });
    }
    // The shape that `GoldenVendor` has: the earlier shape's rows for the flags are not carried on.
    const kept: Record<string, unknown> = { ...vendor, vendorId: row?.value };
    delete kept.vendorIds;
    vendors.push(kept);
  });

  return {
    labels: problems.length === 0 ? ({ ...value, vendors } as unknown as GoldenLabels) : null,
    problems,
  };
}
