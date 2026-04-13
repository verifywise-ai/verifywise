"""NYC Local Law 144 bias audit report template."""

from typing import Any, Dict, List, Tuple

from .base import BiasAuditReportTemplate
from .helpers import (
    min_impact_ratio,
    category_names_from_tables,
    count_evaluated_groups,
    has_category,
)


class LL144Template(BiasAuditReportTemplate):
    """NYC Local Law 144 compliance template."""

    @property
    def framework_name(self) -> str:
        return "NYC Local Law 144"

    # Uses base class verdict() — same 0.80/0.50 threshold logic

    # --------------------------------------------------------------------- #
    # scope_in
    # --------------------------------------------------------------------- #

    def scope_in(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[str]:
        items: List[str] = []

        # Categories tested
        categories = category_names_from_tables(results)
        if categories:
            items.append(f"Categories tested: {', '.join(categories)}")

        # Intersectional analysis
        intersectional = config.get("intersectional", {})
        if intersectional.get("required", False):
            dims = intersectional.get("cross") or intersectional.get("dimensions") or []
            dim_str = " \u00d7 ".join(dims) if dims else "configured dimensions"
            items.append(f"Intersectional analysis: {dim_str}")

        # Metric used
        metric_map = {
            "selection_rate": "Selection rate (4/5ths rule)",
            "scoring_rate": "Scoring rate (LL144 alternative)",
            "fairness_metrics": "Fairness metrics (TPR / FPR / equalized odds)",
        }
        metric_key = config.get("metric", "selection_rate")
        items.append(f"Metric used: {metric_map.get(metric_key, metric_key)}")

        # Threshold
        threshold = config.get("threshold", 0.80)
        items.append(f"Threshold value: {threshold}")

        # Data period
        start = config.get("dataDateRangeStart", "")
        end = config.get("dataDateRangeEnd", "")
        if start or end:
            items.append(f"Data period: {start} to {end}")

        return items

    # --------------------------------------------------------------------- #
    # scope_out
    # --------------------------------------------------------------------- #

    def scope_out(self) -> List[str]:
        return [
            "Does not certify the assessed tool as \u201cbias-free\u201d",
            "Does not test categories beyond those provided in the dataset",
            "Does not determine whether the system is an AEDT under LL144",
            "Not intended for compliance with other legislation",
        ]

    # --------------------------------------------------------------------- #
    # checklist
    # --------------------------------------------------------------------- #

    def checklist(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        items: List[Dict[str, str]] = []

        # 1. System description
        has_name = bool(config.get("systemName"))
        has_desc = bool(config.get("systemDescription"))
        if has_name and has_desc:
            items.append({
                "requirement": "System description provided",
                "status": "pass",
                "note": "System name and description are documented.",
            })
        elif has_name:
            items.append({
                "requirement": "System description provided",
                "status": "warning",
                "note": "System name provided but description is missing.",
            })
        else:
            items.append({
                "requirement": "System description provided",
                "status": "warning",
                "note": "System name and description are not provided.",
            })

        # 2. Sex / gender category
        if has_category(results, "sex") or has_category(results, "gender"):
            items.append({
                "requirement": "Sex/gender category tested",
                "status": "pass",
                "note": "Results include sex/gender analysis.",
            })
        else:
            items.append({
                "requirement": "Sex/gender category tested",
                "status": "warning",
                "note": "LL144 requires testing by sex category.",
            })

        # 3. Race / ethnicity category
        if has_category(results, "race") or has_category(results, "ethnicity"):
            items.append({
                "requirement": "Race/ethnicity category tested",
                "status": "pass",
                "note": "Results include race/ethnicity analysis.",
            })
        else:
            items.append({
                "requirement": "Race/ethnicity category tested",
                "status": "warning",
                "note": "LL144 requires testing by race/ethnicity category.",
            })

        # 4. Intersectional analysis
        intersectional = config.get("intersectional", {})
        if intersectional.get("required", False):
            items.append({
                "requirement": "Intersectional analysis performed",
                "status": "pass",
                "note": "Intersectional analysis was included.",
            })
        else:
            items.append({
                "requirement": "Intersectional analysis performed",
                "status": "warning",
                "note": "LL144 requires intersectional analysis.",
            })

        # 5. Auditor independence
        auditor_type = (config.get("auditorIndependence") or config.get("auditorType") or "").lower()
        if auditor_type in ("third_party", "internal"):
            items.append({
                "requirement": "Auditor independence",
                "status": "pass",
                "note": f"Auditor type: {auditor_type}.",
            })
        elif auditor_type == "self":
            items.append({
                "requirement": "Auditor independence",
                "status": "warning",
                "note": "LL144 requires an independent auditor.",
            })
        else:
            items.append({
                "requirement": "Auditor independence",
                "status": "warning",
                "note": "Auditor independence not declared.",
            })

        # 6. Timeliness
        items.append({
            "requirement": "Audit timeliness",
            "status": "info",
            "note": "Ensure this audit is no more than 1 year old at time of AEDT use.",
        })

        return items

    # --------------------------------------------------------------------- #
    # required_categories
    # --------------------------------------------------------------------- #

    def required_categories(self) -> Dict[str, List[str]]:
        return {
            "sex": ["Male", "Female"],
            "race_ethnicity": [
                "White",
                "Black or African American",
                "Hispanic or Latino",
                "Asian",
                "American Indian or Alaska Native",
                "Native Hawaiian or Other Pacific Islander",
                "Two or more races",
            ],
        }

    # --------------------------------------------------------------------- #
    # threshold_explanation
    # --------------------------------------------------------------------- #

    def threshold_explanation(self, threshold: float) -> str:
        return (
            f"This audit uses a threshold of <b>{threshold}</b>, "
            "derived from the <b>4/5ths rule</b> (also known as the "
            "EEOC adverse impact standard). Under this rule, a selection rate "
            "for any demographic group that is less than four-fifths (80%) of "
            "the rate for the group with the highest selection rate is generally "
            "regarded as evidence of adverse impact. "
            f"A threshold of {threshold} means that any group whose impact "
            f"ratio falls below {threshold} is flagged for further review. "
            "A flag does not automatically indicate a legal violation; it is a "
            "statistical indicator that warrants closer examination. "
            "Reference: Uniform Guidelines on Employee Selection Procedures "
            "(1978), 29 C.F.R. Part 1607, \u00a7 60-3.4.D."
        )

    # Uses base class flag_explanation() — same format for all threshold-based frameworks

    # --------------------------------------------------------------------- #
    # recommended_actions
    # --------------------------------------------------------------------- #

    def recommended_actions(
        self, has_flags: bool, results: Dict[str, Any]
    ) -> List[str]:
        if has_flags:
            return [
                "Investigate root causes of the observed disparities in selection or scoring rates.",
                (
                    "Document any business necessity defense for the continued use of the tool "
                    "(see 42 U.S.C. \u00a7\u00a02000e-2(k))."
                ),
                "Consider alternative selection procedures with less adverse impact.",
                (
                    "Ensure the audit summary is publicly posted on the employer\u2019s website "
                    "(NYC Admin Code \u00a7\u00a020-871(b)(3))."
                ),
                (
                    "Provide notice to candidates at least 10 business days before the tool\u2019s use "
                    "(6 RCNY \u00a7\u00a05-303)."
                ),
            ]

        return [
            "Document this audit as compliance evidence for NYC Local Law 144.",
            (
                "Schedule the next annual audit before the current one expires "
                "(NYC Admin Code \u00a7\u00a020-871(b)(2))."
            ),
            "Continue monitoring selection and scoring rates for emerging disparities.",
            (
                "Ensure the audit summary is publicly posted on the employer\u2019s website "
                "(NYC Admin Code \u00a7\u00a020-871(b)(3))."
            ),
            (
                "Provide notice to candidates at least 10 business days before the tool\u2019s use "
                "(6 RCNY \u00a7\u00a05-303)."
            ),
        ]

    # --------------------------------------------------------------------- #
    # regulatory_context
    # --------------------------------------------------------------------- #

    def regulatory_context(self) -> List[str]:
        return [
            (
                "NYC Local Law 144 (Int. 1894-A), codified at NYC Admin Code "
                "\u00a7\u00a7 20-870 through 20-874, requires employers and "
                "employment agencies in New York City that use an automated employment "
                "decision tool (AEDT) to conduct an annual bias audit, publicly post "
                "the audit summary on their website, and provide notice to candidates "
                "before the tool is used."
            ),
            (
                "An \u201cindependent auditor\u201d under LL144 is a person or entity "
                "that is not involved in using or developing the AEDT and that exercises "
                "objective and impartial judgment in conducting the bias audit "
                "(6 RCNY \u00a7 5-300)."
            ),
            (
                "The <b>4/5ths rule</b> originates from the EEOC Uniform "
                "Guidelines on Employee Selection Procedures (1978), "
                "\u00a7 60-3.4.D. It states that a selection rate for any "
                "demographic group that is less than four-fifths of the rate for the "
                "group with the highest rate is generally regarded as evidence of "
                "adverse impact."
            ),
            (
                "A flag in this audit is a <b>statistical indicator</b> "
                "that a particular group\u2019s selection or scoring rate falls below "
                "the established threshold relative to the highest-performing group. "
                "It does not automatically constitute a legal violation or proof of "
                "intentional discrimination."
            ),
        ]

    # --------------------------------------------------------------------- #
    # glossary
    # --------------------------------------------------------------------- #

    def glossary(self) -> List[Tuple[str, str]]:
        return [
            (
                "AEDT (Automated Employment Decision Tool)",
                "A computational process, derived from machine learning, statistical "
                "modeling, data analytics, or artificial intelligence, that issues "
                "simplified output to substantially assist or replace discretionary "
                "decision making for employment decisions (NYC Admin Code \u00a7\u00a020-870).",
            ),
            (
                "Adverse impact",
                "A substantially different rate of selection in hiring, promotion, or "
                "other employment decision that works to the disadvantage of members "
                "of a protected group.",
            ),
            (
                "Impact ratio",
                "The ratio of a demographic group\u2019s selection or scoring rate to "
                "the rate of the group with the highest rate. A ratio below the "
                "threshold indicates potential adverse impact.",
            ),
            (
                "Selection rate",
                "The proportion of applicants or candidates in a demographic group who "
                "are selected (hired, promoted, or advanced) by the tool.",
            ),
            (
                "Scoring rate",
                "The proportion of applicants or candidates in a demographic group who "
                "receive a score above the median score, as reported to the employer.",
            ),
            (
                "4/5ths rule",
                "A guideline from the EEOC Uniform Guidelines (1978) stating that a "
                "selection rate below 80% of the highest group\u2019s rate is generally "
                "regarded as evidence of adverse impact.",
            ),
            (
                "Intersectional analysis",
                "An analysis that examines the combined effect of two or more "
                "demographic categories (e.g., race \u00d7 sex) rather than each "
                "category independently.",
            ),
        ]

    # --------------------------------------------------------------------- #
    # conclusion_summary
    # --------------------------------------------------------------------- #

    def conclusion_summary(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> str:
        system_name = config.get("systemName", "the assessed system")
        total_records = results.get("total_applicants", 0)
        categories = category_names_from_tables(results)
        category_str = ", ".join(categories) if categories else "the provided categories"
        total_evaluated, total_flagged = count_evaluated_groups(results)

        if total_flagged == 0:
            return (
                f"This audit of {system_name} analyzed {total_records:,} records "
                f"across {category_str}. No demographic group was found to have an "
                "impact ratio below the 0.80 threshold. While this result is favorable, "
                "it does not guarantee the absence of bias. Continued monitoring and "
                "periodic re-auditing are recommended to ensure ongoing compliance "
                "with NYC Local Law 144."
            )

        min_ratio, worst_group = min_impact_ratio(results)
        return (
            f"This audit of {system_name} analyzed {total_records:,} records "
            f"across {category_str}. {total_flagged} of {total_evaluated} "
            "evaluated groups were flagged as having an impact ratio below the "
            f"threshold. The most significant disparity was observed for "
            f"{worst_group} (impact ratio: {min_ratio:.3f}). "
            "These findings warrant further investigation and may require "
            "remedial action to ensure compliance with NYC Local Law 144."
        )

    # --------------------------------------------------------------------- #
    # additional_limitations
    # --------------------------------------------------------------------- #

    def additional_limitations(self) -> List[str]:
        return [
            (
                "This audit is scoped to NYC Local Law 144 and the EEOC 4/5ths rule. "
                "It does not evaluate compliance with other federal, state, or local "
                "anti-discrimination laws, nor does it assess the tool\u2019s validity "
                "or job-relatedness under the Uniform Guidelines on Employee Selection "
                "Procedures."
            ),
        ]
