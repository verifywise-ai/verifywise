/**
 * Scores the golden set (spec D6.4): the runs of each labelled vendor with the VENDOR_RESEARCH_VRDB
 * flag off and on against what a person expects of it, and the bars the runs with the flag on must
 * meet before the flag is on by default.
 *
 * A finding matches an expected risk as in the replay cases (eval/scorer.ts): the same category and
 * any of the risk's words in its risk description, case ignored. A finding that matches a trap is a
 * false positive, whatever else it matches. The label of a finding with the flag on is compared
 * with the labeller's only when the finding matched a risk, since an unmatched finding has no
 * label to be held to.
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

/** The bars of D6.4 for turning the flag on by default, beside recall, which the flag-off run sets. */
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
 * Scores the runs of the labelled vendors: `off` holds the first completed run of each vendor row
 * with the flag off, `on` the one with it on; a vendor's run of a flag is the one of its row of that
 * flag (the first such run in each list counts).
 */
export function scoreGoldenSet(
  labels: readonly GoldenVendor[],
  off: readonly GoldenRun[],
  on: readonly GoldenRun[],
): GoldenReport {
  const report: GoldenReport = {
    vendors: labels.length,
    off: totalsOf([]),
    on: totalsOf([]),
    compared: 0,
    agreed: 0,
    agreement: null,
    baselineAgreement: null,
    highRatedLow: [],
    sanctionsAsFact: [],
    coverageMissing: [],
    coverageFailed: [],
    missingRuns: [],
    afterEarlier: [],
    lines: [],
  };
  const offScores: RunScore[] = [];
  const onScores: RunScore[] = [];
  let baselineCompared = 0;
  let baselineAgreed = 0;

  for (const vendor of labels) {
    const offRef = { vendorId: vendor.vendorIds.off, name: vendor.name };
    const ref = { vendorId: vendor.vendorIds.on, name: vendor.name };
    const offRun = off.find((run) => run.vendorId === vendor.vendorIds.off);
    const onRun = on.find((run) => run.vendorId === vendor.vendorIds.on);
    if (offRun === undefined) report.missingRuns.push({ ...offRef, flag: "off" });
    if (onRun === undefined) report.missingRuns.push({ ...ref, flag: "on" });
    for (const [flag, run, at] of [
      ["off", offRun, offRef],
      ["on", onRun, ref],
    ] as const) {
      if (run !== undefined && run.earlier > 0) {
        report.afterEarlier.push({ ...at, flag, earlier: run.earlier });
      }
    }

    const offScored = offRun === undefined ? null : scoreRun(vendor, offRun);
    const onScored = onRun === undefined ? null : scoreRun(vendor, onRun);
    let compared = 0;
    let agreed = 0;

    if (offScored !== null) {
      offScores.push(offScored.score);
      for (const { finding, expected } of offScored.matches) {
        baselineCompared += 1;
        if (finding.confidence === expected.label) baselineAgreed += 1;
      }
    }

    if (onRun !== undefined && onScored !== null) {
      onScores.push(onScored.score);
      for (const { finding, expected } of onScored.matches) {
        compared += 1;
        if (finding.credibility === expected.label) agreed += 1;
        if (finding.credibility === "high" && expected.label === "low") {
          report.highRatedLow.push({ ...ref, finding: finding.risk_description });
        }
      }
      for (const finding of onRun.findings) {
        if (citesNameOnlySanctionsEntry(finding) && !ENTITY_NAMED.test(finding.risk_description)) {
          report.sanctionsAsFact.push({ ...ref, finding: finding.risk_description });
        }
      }
      const coverage = onRun.coverage;
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
    report.lines.push({
      vendorIds: vendor.vendorIds,
      name: vendor.name,
      profile: vendor.profile,
      off: offScored?.score ?? null,
      on: onScored?.score ?? null,
      compared,
      agreed,
    });
  }

  report.off = totalsOf(offScores);
  report.on = totalsOf(onScores);
  report.agreement = ratio(report.agreed, report.compared);
  report.baselineAgreement = ratio(baselineAgreed, baselineCompared);
  return report;
}

const fixed = (value: number) => value.toFixed(2);
const percent = (value: number) => `${Math.round(value * 100)} %`;
/** "1 vendor has", "2 vendors have". */
const vendorsHave = (count: number) => (count === 1 ? "1 vendor has" : `${count} vendors have`);
const namesOf = (refs: ReadonlyArray<{ name: string }>) => refs.map((ref) => ref.name).join(", ");

/** The bars of D6.4: which the report misses, in words. */
export function meetsBars(report: GoldenReport): GoldenVerdict {
  if (report.vendors === 0) return { ok: false, reasons: ["no labelled vendor"] };
  const reasons: string[] = [];

  for (const flag of ["off", "on"] as const) {
    const missing = report.missingRuns.filter((run) => run.flag === flag);
    if (missing.length > 0) {
      reasons.push(
        `${vendorsHave(missing.length)} no completed run with the flag ${flag} (${namesOf(missing)})`,
      );
    }
  }
  const afterEarlier = report.afterEarlier;
  if (afterEarlier.length > 0) {
    const which = afterEarlier.map((ref) => `${ref.name}, flag ${ref.flag}`).join("; ");
    reasons.push(
      `${afterEarlier.length === 1 ? "1 run was" : `${afterEarlier.length} runs were`} compared with earlier findings or risks of its vendor row, which hid what it found (${which}): research each flag on a fresh vendor row`,
    );
  }
  const { precision, recall } = report.on;
  if (precision !== null && precision < GOLDEN_BARS.precision) {
    reasons.push(
      `precision ${fixed(precision)} with the flag on, below ${fixed(GOLDEN_BARS.precision)}`,
    );
  }
  if (recall !== null && report.off.recall !== null && recall < report.off.recall) {
    reasons.push(
      `recall ${fixed(recall)} with the flag on, below ${fixed(report.off.recall)} with it off`,
    );
  }
  if (report.agreement === null) {
    if (report.on.expected > 0) {
      reasons.push("no finding with the flag on matched a labelled risk, so no label was compared");
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
      `${vendorsHave(report.coverageMissing.length)} no coverage with the flag on (${namesOf(report.coverageMissing)})`,
    );
  }
  const failed = report.coverageFailed;
  if (failed.length > 0) {
    const which = failed.map((ref) => `${ref.name}: ${ref.sources.join(", ")}`).join("; ");
    reasons.push(
      failed.length === 1
        ? `1 vendor's run with the flag on could not check every list (${which})`
        : `${failed.length} vendors' runs with the flag on could not check every list (${which})`,
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

function runPart(flag: "off" | "on", score: RunScore | null): string {
  if (score === null) return `${flag} no run`;
  const traps = score.traps === 0 ? "" : `, ${plural(score.traps, "trap")}`;
  return `${flag} ${score.matched}/${score.findings} matched, ${score.recalled}/${score.expected} recalled${traps}`;
}

/** The report as text, for the command line. Names and findings are printed as they were stored. */
export function formatGoldenReport(report: GoldenReport, verdict: GoldenVerdict): string {
  const lines = [
    `Golden set: ${plural(report.vendors, "vendor")}`,
    totalsLine("Flag off", report.off),
    totalsLine("Flag on", report.on),
    `Label agreement: ${orNone(report.agreement, percent)} (${report.agreed} of ${report.compared})`,
    `Confidence with the flag off, for the record: ${orNone(report.baselineAgreement, percent)}`,
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
    "No coverage with the flag on",
    report.coverageMissing.map((item) => item.name),
  );
  listed(
    "Lists not checked with the flag on",
    report.coverageFailed.map((item) => `${item.name}: ${item.sources.join(", ")}`),
  );
  listed(
    "Missing runs",
    report.missingRuns.map((item) => `${item.name}: flag ${item.flag}`),
  );
  listed(
    "Runs after earlier findings or risks of their vendor row",
    report.afterEarlier.map(
      (item) =>
        `${item.name}: flag ${item.flag} (vendor ${item.vendorId}, ${item.earlier} earlier)`,
    ),
  );
  lines.push("", "Vendors:");
  for (const line of report.lines) {
    const agree = line.on === null ? "" : `, ${line.agreed}/${line.compared} labels agree`;
    lines.push(
      `#${line.profile} ${line.name} (vendors ${line.vendorIds.off} off, ${line.vendorIds.on} on): ${runPart("off", line.off)}; ${runPart("on", line.on)}${agree}`,
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
 * Checks a labels file as a person filled it in, and names every field that is missing or wrong;
 * `labels` is the file when nothing is.
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
  value.vendors.forEach((vendor: unknown, index: number) => {
    const at = `vendors[${index}]`;
    if (!isRecord(vendor)) {
      problems.push(`${at} must be an object`);
      return;
    }
    if (!isWholeAbove(vendor.profile, 1) || vendor.profile > 24) {
      problems.push(`${at}.profile must be one of 1 to 24`);
    }
    const ids = vendor.vendorIds;
    if (!isRecord(ids)) {
      problems.push(
        `${at}.vendorIds must give the vendor row researched with the flag off and the one with it on`,
      );
    } else {
      for (const flag of ["off", "on"] as const) {
        const id = ids[flag];
        if (!isWholeAbove(id, 1)) {
          problems.push(`${at}.vendorIds.${flag} must be a positive whole number`);
        } else if (flag === "on" && id === ids.off) {
          problems.push(`${at}.vendorIds.on must be another vendor row than vendorIds.off`);
        } else if (seen.has(id)) {
          problems.push(`${at}.vendorIds.${flag} ${id} is labelled twice`);
        } else {
          seen.add(id);
        }
      }
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
  });

  return { labels: problems.length === 0 ? (value as unknown as GoldenLabels) : null, problems };
}
