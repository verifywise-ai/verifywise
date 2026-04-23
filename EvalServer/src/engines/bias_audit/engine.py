"""
Bias audit computation engine.

Supports three metric modes:
- selection_rate: binary outcome, impact ratios via 4/5ths rule
- scoring_rate: continuous score, impact ratio based on rate above overall median
- fairness_metrics: confusion-matrix metrics (TPR/FPR/equalized odds) when
  predictions and ground truth are both supplied

All modes also compute intersectional analysis when the preset requires it.
Score distribution analysis runs whenever a score column is present.
"""

import math
import statistics
from typing import Dict, List, Optional
from collections import defaultdict

from .models import (
    BiasAuditConfig,
    BiasAuditResult,
    CategoryTable,
    ConfusionMatrixGroupResult,
    FairnessMetricsTable,
    GroupResult,
    ScoreDistributionBin,
    ScoreDistributionGroup,
    ScoreDistributionTable,
)


def compute_bias_audit(
    records: List[Dict],
    config: BiasAuditConfig,
    unknown_count: int = 0,
) -> BiasAuditResult:
    """
    Run the full bias audit computation.

    Dispatches on config.metric:
    - "selection_rate" (default): requires "selected" bool on each record
    - "scoring_rate": requires "score" float on each record
    - "fairness_metrics": requires "prediction" bool and "ground_truth" bool
    """
    total_applicants = len(records)
    metric = config.metric or "selection_rate"

    tables: List[CategoryTable] = []
    score_distribution_tables: List[ScoreDistributionTable] = []
    fairness_metrics_tables: List[FairnessMetricsTable] = []
    total_flags = 0
    total_excluded = 0
    total_selected = 0
    overall_rate = 0.0

    if metric == "selection_rate":
        total_selected = sum(1 for r in records if r.get("selected"))
        overall_rate = total_selected / total_applicants if total_applicants > 0 else 0.0

        for category_key, category_config in config.categories.items():
            table = _compute_category_table(
                records=records,
                category_key=category_key,
                category_label=category_config.label,
                total_applicants=total_applicants,
                threshold=config.threshold,
                small_sample_exclusion=config.small_sample_exclusion,
                rate_of=lambda r: bool(r.get("selected")),
            )
            tables.append(table)
            total_flags += sum(1 for r in table.rows if r.flagged)
            total_excluded += sum(1 for r in table.rows if r.excluded)

        if config.intersectional.required and len(config.intersectional.cross) >= 2:
            intersectional_table = _compute_intersectional_table(
                records=records,
                cross_keys=config.intersectional.cross,
                total_applicants=total_applicants,
                threshold=config.threshold,
                small_sample_exclusion=config.small_sample_exclusion,
                rate_of=lambda r: bool(r.get("selected")),
            )
            tables.append(intersectional_table)
            total_flags += sum(1 for r in intersectional_table.rows if r.flagged)
            total_excluded += sum(1 for r in intersectional_table.rows if r.excluded)

    elif metric == "scoring_rate":
        scores = [r.get("score") for r in records if r.get("score") is not None]
        if not scores:
            raise ValueError("Scoring rate mode requires a score column with numeric values.")
        overall_median = statistics.median(scores)
        total_selected = sum(1 for s in scores if s > overall_median)
        overall_rate = total_selected / len(scores) if scores else 0.0

        def _above_median(r: Dict) -> bool:
            score = r.get("score")
            return score is not None and score > overall_median

        for category_key, category_config in config.categories.items():
            table = _compute_category_table(
                records=records,
                category_key=category_key,
                category_label=category_config.label,
                total_applicants=total_applicants,
                threshold=config.threshold,
                small_sample_exclusion=config.small_sample_exclusion,
                rate_of=_above_median,
                title_prefix="Scoring rate impact ratios",
            )
            tables.append(table)
            total_flags += sum(1 for r in table.rows if r.flagged)
            total_excluded += sum(1 for r in table.rows if r.excluded)

        if config.intersectional.required and len(config.intersectional.cross) >= 2:
            intersectional_table = _compute_intersectional_table(
                records=records,
                cross_keys=config.intersectional.cross,
                total_applicants=total_applicants,
                threshold=config.threshold,
                small_sample_exclusion=config.small_sample_exclusion,
                rate_of=_above_median,
                title="Scoring rate impact ratios by intersectional category",
            )
            tables.append(intersectional_table)
            total_flags += sum(1 for r in intersectional_table.rows if r.flagged)
            total_excluded += sum(1 for r in intersectional_table.rows if r.excluded)

    elif metric == "fairness_metrics":
        if not any("prediction" in r and "ground_truth" in r for r in records):
            raise ValueError(
                "Fairness metrics mode requires both prediction and ground_truth columns."
            )
        total_selected = sum(1 for r in records if r.get("prediction"))
        overall_rate = total_selected / total_applicants if total_applicants > 0 else 0.0

        for category_key, category_config in config.categories.items():
            table = _compute_fairness_metrics_table(
                records=records,
                category_key=category_key,
                category_label=category_config.label,
                total_applicants=total_applicants,
                small_sample_exclusion=config.small_sample_exclusion,
            )
            fairness_metrics_tables.append(table)
            total_excluded += sum(1 for g in table.groups if g.excluded)

    else:
        raise ValueError(f"Unknown metric mode: {metric}")

    # Score distributions run whenever score data is present, regardless of metric
    if any(r.get("score") is not None for r in records):
        for category_key, category_config in config.categories.items():
            dist_table = _compute_score_distribution_table(
                records=records,
                category_key=category_key,
                category_label=category_config.label,
            )
            if dist_table.groups:
                score_distribution_tables.append(dist_table)

    summary_parts = [
        f"Audit analyzed {total_applicants:,} applicants "
        f"(overall rate: {overall_rate:.1%}).",
    ]
    if unknown_count > 0:
        summary_parts.append(f"{unknown_count:,} rows excluded due to missing data.")
    if metric in ("selection_rate", "scoring_rate"):
        if total_flags > 0:
            summary_parts.append(
                f"{total_flags} group(s) flagged with impact ratio below "
                f"{config.threshold or 0.80:.2f} threshold."
            )
        else:
            summary_parts.append("No adverse impact flags detected.")
    if total_excluded > 0:
        summary_parts.append(
            f"{total_excluded} group(s) excluded from calculations "
            f"due to small sample size."
        )

    return BiasAuditResult(
        metric=metric,
        tables=tables,
        score_distribution_tables=score_distribution_tables,
        fairness_metrics_tables=fairness_metrics_tables,
        overall_selection_rate=round(overall_rate, 6),
        total_applicants=total_applicants,
        total_selected=total_selected,
        unknown_count=unknown_count,
        flags_count=total_flags,
        excluded_count=total_excluded,
        summary=" ".join(summary_parts),
    )


def _compute_category_table(
    records: List[Dict],
    category_key: str,
    category_label: str,
    total_applicants: int,
    threshold: Optional[float],
    small_sample_exclusion: Optional[float],
    rate_of,
    title_prefix: str = "Impact ratios",
) -> CategoryTable:
    """Compute rates and impact ratios for a single category.

    The ``rate_of`` callable determines whether a record counts toward the
    numerator. For selection rate, that's the ``selected`` bool; for scoring
    rate, it's whether score > overall median.
    """
    groups: Dict[str, Dict] = defaultdict(lambda: {"applicants": 0, "selected": 0})
    for record in records:
        group_name = record.get(category_key, "")
        if not group_name:
            continue
        groups[group_name]["applicants"] += 1
        if rate_of(record):
            groups[group_name]["selected"] += 1

    group_results: List[GroupResult] = []
    highest_rate = 0.0
    highest_group = ""

    for group_name, counts in sorted(groups.items()):
        applicants = counts["applicants"]
        selected = counts["selected"]
        rate = selected / applicants if applicants > 0 else 0.0

        if rate > highest_rate:
            highest_rate = rate
            highest_group = group_name

        group_results.append(GroupResult(
            category_type=category_key,
            category_name=group_name,
            applicant_count=applicants,
            selected_count=selected,
            selection_rate=round(rate, 6),
        ))

    for result in group_results:
        if small_sample_exclusion and total_applicants > 0:
            proportion = result.applicant_count / total_applicants
            if proportion < small_sample_exclusion:
                result.excluded = True
                result.impact_ratio = None
                continue

        if highest_rate > 0:
            ratio = result.selection_rate / highest_rate
            result.impact_ratio = round(ratio, 6)
            if threshold is not None and ratio < threshold:
                result.flagged = True
        else:
            result.impact_ratio = None

    return CategoryTable(
        title=f"{title_prefix} by {category_label.lower()}",
        category_key=category_key,
        rows=group_results,
        highest_group=highest_group,
        highest_rate=round(highest_rate, 6) if highest_rate > 0 else None,
    )


def _compute_intersectional_table(
    records: List[Dict],
    cross_keys: List[str],
    total_applicants: int,
    threshold: Optional[float],
    small_sample_exclusion: Optional[float],
    rate_of,
    title: str = "Impact ratios by intersectional category",
) -> CategoryTable:
    """Compute intersectional cross-tabulation."""
    groups: Dict[str, Dict] = defaultdict(lambda: {"applicants": 0, "selected": 0})

    for record in records:
        parts = []
        skip = False
        for key in cross_keys:
            value = record.get(key, "")
            if not value:
                skip = True
                break
            parts.append(value)
        if skip:
            continue

        compound_name = " - ".join(parts)
        groups[compound_name]["applicants"] += 1
        if rate_of(record):
            groups[compound_name]["selected"] += 1

    group_results: List[GroupResult] = []
    highest_rate = 0.0
    highest_group = ""

    for group_name, counts in sorted(groups.items()):
        applicants = counts["applicants"]
        selected = counts["selected"]
        rate = selected / applicants if applicants > 0 else 0.0

        if rate > highest_rate:
            highest_rate = rate
            highest_group = group_name

        group_results.append(GroupResult(
            category_type="intersectional",
            category_name=group_name,
            applicant_count=applicants,
            selected_count=selected,
            selection_rate=round(rate, 6),
        ))

    for result in group_results:
        if small_sample_exclusion and total_applicants > 0:
            proportion = result.applicant_count / total_applicants
            if proportion < small_sample_exclusion:
                result.excluded = True
                result.impact_ratio = None
                continue

        if highest_rate > 0:
            ratio = result.selection_rate / highest_rate
            result.impact_ratio = round(ratio, 6)
            if threshold is not None and ratio < threshold:
                result.flagged = True
        else:
            result.impact_ratio = None

    return CategoryTable(
        title=title,
        category_key="intersectional",
        rows=group_results,
        highest_group=highest_group,
        highest_rate=round(highest_rate, 6) if highest_rate > 0 else None,
    )


def _compute_score_distribution_table(
    records: List[Dict],
    category_key: str,
    category_label: str,
    bins: int = 20,
) -> ScoreDistributionTable:
    """Compute per-group histograms and a K-S test against the overall distribution.

    The K-S statistic is computed from empirical CDFs without SciPy. For
    p-values we use the standard Kolmogorov two-sample asymptotic formula,
    which is accurate for moderate sample sizes.
    """
    overall_scores = [r["score"] for r in records if r.get("score") is not None]
    if not overall_scores:
        return ScoreDistributionTable(
            title=f"Score distributions by {category_label.lower()}",
            category_key=category_key,
            groups=[],
        )

    overall_mean = statistics.mean(overall_scores)
    overall_median = statistics.median(overall_scores)
    lo, hi = min(overall_scores), max(overall_scores)
    if hi == lo:
        hi = lo + 1.0  # avoid zero-width bins
    bin_width = (hi - lo) / bins

    grouped: Dict[str, List[float]] = defaultdict(list)
    for record in records:
        score = record.get("score")
        if score is None:
            continue
        group_name = record.get(category_key, "")
        if not group_name:
            continue
        grouped[group_name].append(score)

    group_results: List[ScoreDistributionGroup] = []
    sorted_overall = sorted(overall_scores)

    for group_name, scores in sorted(grouped.items()):
        if not scores:
            continue
        counts = [0] * bins
        for s in scores:
            idx = int((s - lo) / bin_width)
            if idx >= bins:
                idx = bins - 1
            if idx < 0:
                idx = 0
            counts[idx] += 1

        bin_models = [
            ScoreDistributionBin(
                lower=round(lo + i * bin_width, 6),
                upper=round(lo + (i + 1) * bin_width, 6),
                count=counts[i],
            )
            for i in range(bins)
        ]

        ks_stat, ks_p = _ks_two_sample(sorted(scores), sorted_overall)

        group_results.append(ScoreDistributionGroup(
            category_type=category_key,
            category_name=group_name,
            count=len(scores),
            mean=round(statistics.mean(scores), 6),
            median=round(statistics.median(scores), 6),
            std=round(statistics.pstdev(scores) if len(scores) > 1 else 0.0, 6),
            bins=bin_models,
            ks_statistic=round(ks_stat, 6) if ks_stat is not None else None,
            ks_pvalue=round(ks_p, 6) if ks_p is not None else None,
        ))

    return ScoreDistributionTable(
        title=f"Score distributions by {category_label.lower()}",
        category_key=category_key,
        groups=group_results,
        overall_mean=round(overall_mean, 6),
        overall_median=round(overall_median, 6),
    )


def _ks_two_sample(a_sorted: List[float], b_sorted: List[float]):
    """Two-sample Kolmogorov-Smirnov statistic and asymptotic p-value.

    Uses an O(n + m) merge-style traversal. Returns (D, p) or (None, None)
    if either sample is empty.
    """
    n, m = len(a_sorted), len(b_sorted)
    if n == 0 or m == 0:
        return None, None

    i = j = 0
    d = 0.0
    while i < n and j < m:
        if a_sorted[i] <= b_sorted[j]:
            i += 1
        else:
            j += 1
        cdf_a = i / n
        cdf_b = j / m
        diff = abs(cdf_a - cdf_b)
        if diff > d:
            d = diff

    # Asymptotic p-value via the Kolmogorov distribution.
    en = math.sqrt(n * m / (n + m))
    lam = (en + 0.12 + 0.11 / en) * d
    p = _ks_p(lam)
    return d, p


def _ks_p(lam: float) -> float:
    """Kolmogorov distribution survival function (Numerical Recipes form)."""
    if lam < 0.001:
        return 1.0
    eps1 = 0.001
    eps2 = 1.0e-8
    a2 = -2.0 * lam * lam
    total = 0.0
    term_prev = 0.0
    for j in range(1, 101):
        term = 2.0 * ((-1) ** (j - 1)) * math.exp(a2 * j * j)
        total += term
        if abs(term) <= eps1 * term_prev or abs(term) <= eps2 * total:
            return max(0.0, min(1.0, total))
        term_prev = abs(term)
    return 1.0


def _compute_fairness_metrics_table(
    records: List[Dict],
    category_key: str,
    category_label: str,
    total_applicants: int,
    small_sample_exclusion: Optional[float],
) -> FairnessMetricsTable:
    """Compute per-group confusion matrices and cross-group fairness gaps."""
    groups: Dict[str, List[Dict]] = defaultdict(list)
    for record in records:
        group_name = record.get(category_key, "")
        if not group_name:
            continue
        if "prediction" not in record or "ground_truth" not in record:
            continue
        groups[group_name].append(record)

    group_results: List[ConfusionMatrixGroupResult] = []
    for group_name, group_records in sorted(groups.items()):
        count = len(group_records)
        tp = sum(1 for r in group_records if r["prediction"] and r["ground_truth"])
        fp = sum(1 for r in group_records if r["prediction"] and not r["ground_truth"])
        tn = sum(1 for r in group_records if not r["prediction"] and not r["ground_truth"])
        fn = sum(1 for r in group_records if not r["prediction"] and r["ground_truth"])

        positives = tp + fn
        negatives = fp + tn
        predicted_positives = tp + fp

        tpr = tp / positives if positives > 0 else 0.0
        fpr = fp / negatives if negatives > 0 else 0.0
        fnr = fn / positives if positives > 0 else 0.0
        tnr = tn / negatives if negatives > 0 else 0.0
        precision = tp / predicted_positives if predicted_positives > 0 else 0.0
        accuracy = (tp + tn) / count if count > 0 else 0.0

        excluded = False
        if small_sample_exclusion and total_applicants > 0:
            if count / total_applicants < small_sample_exclusion:
                excluded = True

        group_results.append(ConfusionMatrixGroupResult(
            category_type=category_key,
            category_name=group_name,
            count=count,
            true_positive=tp,
            false_positive=fp,
            true_negative=tn,
            false_negative=fn,
            true_positive_rate=round(tpr, 6),
            false_positive_rate=round(fpr, 6),
            false_negative_rate=round(fnr, 6),
            true_negative_rate=round(tnr, 6),
            precision=round(precision, 6),
            accuracy=round(accuracy, 6),
            excluded=excluded,
        ))

    # Cross-group differences (only across included groups)
    included = [g for g in group_results if not g.excluded]
    eq_opp = eq_odds = pred_parity = None
    tpr_max = tpr_min = fpr_max = fpr_min = None
    if len(included) >= 2:
        tpr_sorted = sorted(included, key=lambda g: g.true_positive_rate)
        fpr_sorted = sorted(included, key=lambda g: g.false_positive_rate)
        prec_sorted = sorted(included, key=lambda g: g.precision)

        tpr_gap = tpr_sorted[-1].true_positive_rate - tpr_sorted[0].true_positive_rate
        fpr_gap = fpr_sorted[-1].false_positive_rate - fpr_sorted[0].false_positive_rate
        prec_gap = prec_sorted[-1].precision - prec_sorted[0].precision

        eq_opp = round(tpr_gap, 6)
        eq_odds = round(max(tpr_gap, fpr_gap), 6)
        pred_parity = round(prec_gap, 6)
        tpr_max = tpr_sorted[-1].category_name
        tpr_min = tpr_sorted[0].category_name
        fpr_max = fpr_sorted[-1].category_name
        fpr_min = fpr_sorted[0].category_name

    return FairnessMetricsTable(
        title=f"Fairness metrics by {category_label.lower()}",
        category_key=category_key,
        groups=group_results,
        equal_opportunity_difference=eq_opp,
        equalized_odds_difference=eq_odds,
        predictive_parity_difference=pred_parity,
        tpr_max_group=tpr_max,
        tpr_min_group=tpr_min,
        fpr_max_group=fpr_max,
        fpr_min_group=fpr_min,
    )
