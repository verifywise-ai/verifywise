import { groupValue, isBlankValue } from "./groupValue";
import { RECORD_KEYS } from "./recordKeys";
import { round6 } from "./round";
import type { AuditRecord, ConfusionMatrixGroupResult, FairnessMetricsTable } from "./types";

export interface FairnessMetricsArgs {
  records: AuditRecord[];
  categoryKey: string;
  categoryLabel: string;
  totalApplicants: number;
  smallSampleExclusion: number | null;
}

/**
 * Per-group confusion matrices and cross-group fairness gaps.
 *
 * Ported from EvalServer's `_compute_fairness_metrics_table`. Two preserved
 * behaviours worth naming:
 *
 *  - the literal keys `prediction` and `ground_truth` are read, not the
 *    configured column names, so a caller must map its columns to those keys
 *    before calling (the Python has the same constraint);
 *  - the cross-group differences are computed across INCLUDED groups only, so
 *    a small-sample exclusion changes the reported gaps.
 */
export function computeFairnessMetricsTable(args: FairnessMetricsArgs): FairnessMetricsTable {
  const { records, categoryKey, categoryLabel, totalApplicants, smallSampleExclusion } = args;

  const groups = new Map<string, AuditRecord[]>();
  for (const record of records) {
    const name = groupValue(record, categoryKey);
    if (name === null) continue;
    // A record without both values cannot be placed in a confusion matrix.
    // The Python checks only that the keys exist, so a null value counted as
    // a negative; here a blank value excludes the record, as everywhere else.
    if (isBlankValue(record[RECORD_KEYS.prediction])) continue;
    if (isBlankValue(record[RECORD_KEYS.groundTruth])) continue;
    const list = groups.get(name) ?? [];
    list.push(record);
    groups.set(name, list);
  }

  const groupResults: ConfusionMatrixGroupResult[] = [];
  for (const groupName of [...groups.keys()].sort()) {
    const groupRecords = groups.get(groupName)!;
    const count = groupRecords.length;

    let tp = 0;
    let fp = 0;
    let tn = 0;
    let fn = 0;
    for (const r of groupRecords) {
      const pred = Boolean(r.prediction);
      const truth = Boolean(r.ground_truth);
      if (pred && truth) tp += 1;
      else if (pred && !truth) fp += 1;
      else if (!pred && !truth) tn += 1;
      else fn += 1;
    }

    const positives = tp + fn;
    const negatives = fp + tn;
    const predictedPositives = tp + fp;

    const tpr = positives > 0 ? tp / positives : 0;
    const fpr = negatives > 0 ? fp / negatives : 0;
    const fnr = positives > 0 ? fn / positives : 0;
    const tnr = negatives > 0 ? tn / negatives : 0;
    const precision = predictedPositives > 0 ? tp / predictedPositives : 0;
    const accuracy = count > 0 ? (tp + tn) / count : 0;

    let excluded = false;
    if (smallSampleExclusion && totalApplicants > 0) {
      if (count / totalApplicants < smallSampleExclusion) excluded = true;
    }

    groupResults.push({
      categoryType: categoryKey,
      categoryName: groupName,
      count,
      truePositive: tp,
      falsePositive: fp,
      trueNegative: tn,
      falseNegative: fn,
      truePositiveRate: round6(tpr),
      falsePositiveRate: round6(fpr),
      falseNegativeRate: round6(fnr),
      trueNegativeRate: round6(tnr),
      precision: round6(precision),
      accuracy: round6(accuracy),
      excluded,
    });
  }

  // Cross-group differences, across included groups only.
  const included = groupResults.filter((g) => !g.excluded);
  let equalOpportunityDifference: number | null = null;
  let equalizedOddsDifference: number | null = null;
  let predictiveParityDifference: number | null = null;
  let tprMaxGroup: string | null = null;
  let tprMinGroup: string | null = null;
  let fprMaxGroup: string | null = null;
  let fprMinGroup: string | null = null;

  if (included.length >= 2) {
    const tprSorted = [...included].sort((a, b) => a.truePositiveRate - b.truePositiveRate);
    const fprSorted = [...included].sort((a, b) => a.falsePositiveRate - b.falsePositiveRate);
    const precSorted = [...included].sort((a, b) => a.precision - b.precision);

    const tprGap = tprSorted[tprSorted.length - 1].truePositiveRate - tprSorted[0].truePositiveRate;
    const fprGap =
      fprSorted[fprSorted.length - 1].falsePositiveRate - fprSorted[0].falsePositiveRate;
    const precGap = precSorted[precSorted.length - 1].precision - precSorted[0].precision;

    equalOpportunityDifference = round6(tprGap);
    equalizedOddsDifference = round6(Math.max(tprGap, fprGap));
    predictiveParityDifference = round6(precGap);
    tprMaxGroup = tprSorted[tprSorted.length - 1].categoryName;
    tprMinGroup = tprSorted[0].categoryName;
    fprMaxGroup = fprSorted[fprSorted.length - 1].categoryName;
    fprMinGroup = fprSorted[0].categoryName;
  }

  return {
    title: `Fairness metrics by ${categoryLabel.toLowerCase()}`,
    categoryKey,
    groups: groupResults,
    equalOpportunityDifference,
    equalizedOddsDifference,
    predictiveParityDifference,
    tprMaxGroup,
    tprMinGroup,
    fprMaxGroup,
    fprMinGroup,
  };
}
