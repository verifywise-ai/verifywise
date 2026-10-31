/**
 * The report of an evaluation: one block per case with its measures, the gaps that are open (with
 * the roadmap idea meant to close them), and the two things that need a person: a target that is
 * missed and was not declared as a gap (a regression), and a declared gap that is met (to be
 * deleted from the case, so that the ratchet holds the gain).
 */
import { type CaseScore, missedTargets, scoreRun } from "./scorer";
import type { CaseRun } from "./runCase";
import type { Gaps, Targets } from "./types";

export interface CaseReport {
  id: string;
  title: string;
  score: CaseScore;
  /** The targets the score does not meet. */
  missed: Array<keyof Targets>;
  gaps: Gaps;
}

export function reportCase(run: CaseRun): CaseReport {
  const score = scoreRun(run);
  return {
    id: run.evalCase.id,
    title: run.evalCase.title,
    score,
    missed: missedTargets(score, run.evalCase.targets),
    gaps: run.evalCase.gaps,
  };
}

export function classify(report: Pick<CaseReport, "missed" | "gaps">): {
  regressions: Array<keyof Targets>;
  fixed: Array<keyof Targets>;
  open: Array<keyof Targets>;
} {
  const gapNames = Object.keys(report.gaps) as Array<keyof Targets>;
  return {
    regressions: report.missed.filter((name) => !(name in report.gaps)),
    fixed: gapNames.filter((name) => !report.missed.includes(name)),
    open: gapNames.filter((name) => report.missed.includes(name)),
  };
}

const number = (value: number | null) => (value === null ? "-" : value.toFixed(2));

function formatCase(report: CaseReport): string {
  const { score } = report;
  const { regressions, fixed, open } = classify(report);
  const lines = [
    `${report.id}: ${report.title}`,
    `  precision ${number(score.precision)}, recall ${number(score.recall)}, kept ${score.kept}, ` +
      `sources ${score.sources}, irrelevant ${score.irrelevantSources}, duplicates ${score.duplicateSources}, ` +
      `bad urls ${score.badUrls}, dated web ${score.datedWebResults}`,
    `  snippet-only ${score.snippetOnlyFindings}, overconfident ${score.overconfident}, ` +
      `mislabelled ${score.mislabelled}, cluster repeats ${score.duplicateClusters}, ` +
      `quotes rejected ${score.citationsRejected}, ` +
      `searches ${score.searches}, reads ${score.reads}, model calls ${score.modelCalls}, ` +
      `tokens ${score.tokens}, ms ${score.ms}`,
  ];
  for (const name of open) lines.push(`  gap ${name} (idea ${report.gaps[name]})`);
  for (const name of regressions) lines.push(`  REGRESSION ${name}`);
  for (const name of fixed) {
    lines.push(`  FIXED ${name} (idea ${report.gaps[name]}): remove it from gaps`);
  }
  return lines.join("\n");
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function formatReport(reports: CaseReport[]): string {
  const classified = reports.map(classify);
  const regressions = classified.reduce((sum, item) => sum + item.regressions.length, 0);
  const fixed = classified.reduce((sum, item) => sum + item.fixed.length, 0);
  return [
    ...reports.map(formatCase),
    "",
    `${plural(reports.length, "case", "cases")}, ${plural(regressions, "regression", "regressions")}, ` +
      `${plural(fixed, "fixed gap", "fixed gaps")}`,
  ].join("\n");
}

/** True when nothing needs a person: no regression, and no gap that is already met. */
export function isClean(reports: CaseReport[]): boolean {
  return reports.every((report) => {
    const { regressions, fixed } = classify(report);
    return regressions.length === 0 && fixed.length === 0;
  });
}
