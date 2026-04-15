"""Colorado SB 21-169 (Insurance) bias audit report template.

Implements C.R.S. \u00a7 10-3-1104.9 and Colorado Division of Insurance
Regulation 10-1-1 quantitative testing requirements.

Key differences from NYC LL144:
- Uses rate-difference framing (percentage points) not impact-ratio framing
- Flags at 5 percentage point difference vs. White reference group
- Covers 4 BIFSG race categories only (White, Hispanic, Black, Asian/Pacific Islander)
- Does not test sex or intersectional combinations
"""

from typing import Any, Dict, List, Tuple

from .base import BiasAuditReportTemplate
from .helpers import (
    category_names_from_tables,
    count_evaluated_groups,
    has_category,
    min_impact_ratio,
)


class SB169Template(BiasAuditReportTemplate):
    """Colorado SB 21-169 (Insurance) compliance template."""

    @property
    def framework_name(self) -> str:
        return "Colorado SB 21-169 (Insurance)"

    # Uses base class verdict() \u2014 same green/amber/red threshold logic applies

    # --------------------------------------------------------------------- #
    # methodology

    def metric_label(self, metric: str) -> str:
        """SB 21-169 uses rate-difference framing, not 4/5ths rule language."""
        return {
            "selection_rate": "Approval/outcome rate (5 pp difference threshold)",
            "scoring_rate": "Premium rate (5 pp difference threshold)",
            "fairness_metrics": "Fairness metrics (TPR / FPR / equalized odds)",
        }.get(metric, metric)

    # --------------------------------------------------------------------- #
    # scope

    def scope_in(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[str]:
        items: List[str] = []

        line = config.get("lineOfBusiness") or config.get("line_of_business")
        if line:
            items.append(f"Line of business: {line}")
        else:
            items.append("Line of business: Life insurance (per Regulation 10-1-1)")

        decision_point = config.get("decisionPoint") or config.get("decision_point")
        if decision_point:
            items.append(f"Decision point tested: {decision_point}")

        ecdis = config.get("ecdisSources") or config.get("ecdis_sources")
        if ecdis:
            items.append(f"ECDIS sources: {ecdis}")

        items.append("Demographic test: race/ethnicity via BIFSG methodology")
        items.append(
            "Reference group: White (per Colorado DOI Quantitative Testing Regulation)"
        )
        items.append("Flagging threshold: 5 percentage point difference from White reference")

        start = config.get("dataDateRangeStart")
        end = config.get("dataDateRangeEnd")
        if start and end:
            items.append(f"Testing period: {start} to {end}")

        return items

    def scope_out(self) -> List[str]:
        return [
            "Does not implement BIFSG race/ethnicity estimation \u2014 insurer must provide race-coded data",
            "Does not test non-race protected classes (color, national origin, religion, sex, "
            "sexual orientation, disability, gender identity, gender expression) also covered by "
            "C.R.S. \u00a7 10-3-1104.9",
            "Does not perform second-level variable testing required when disparities are found",
            "Does not generate the DOI annual filing format \u2014 this report is supporting evidence",
            "Does not evaluate actuarial soundness of observed rate differences",
            "Not intended for compliance with legislation outside Colorado",
        ]

    # --------------------------------------------------------------------- #
    # checklist

    def checklist(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        items: List[Dict[str, str]] = []

        # 1. System description
        has_name = bool(config.get("systemName"))
        has_desc = bool(config.get("systemDescription"))
        if has_name and has_desc:
            items.append({
                "requirement": "Model and ECDIS source documented",
                "status": "pass",
                "note": "System name and description are documented.",
            })
        else:
            items.append({
                "requirement": "Model and ECDIS source documented",
                "status": "warning",
                "note": "Reg 10-1-1 requires ECDIS inventory and model documentation.",
            })

        # 2. Race/ethnicity category tested
        if has_category(results, "race") or has_category(results, "ethnicity"):
            items.append({
                "requirement": "Race/ethnicity testing performed",
                "status": "pass",
                "note": "Results include race/ethnicity analysis.",
            })
        else:
            items.append({
                "requirement": "Race/ethnicity testing performed",
                "status": "warning",
                "note": "Regulation 10-1-1 requires race/ethnicity disparity testing.",
            })

        # 3. Second-level testing reminder (conditional on flags)
        _, total_flagged = count_evaluated_groups(results)
        if total_flagged > 0:
            items.append({
                "requirement": "Second-level variable testing",
                "status": "warning",
                "note": (
                    f"{total_flagged} group(s) flagged \u2014 Regulation requires "
                    "second-level variable testing to identify contributing variables."
                ),
            })
        else:
            items.append({
                "requirement": "Second-level variable testing",
                "status": "info",
                "note": "No disparities above threshold \u2014 second-level testing not triggered.",
            })

        # 4. Governance framework (we can't verify this automatically; info only)
        items.append({
            "requirement": "Governance framework documented",
            "status": "info",
            "note": (
                "Reg 10-1-1 requires written governance policy, board oversight, "
                "cross-functional committee, vendor oversight, and remediation procedures. "
                "Document and maintain separately."
            ),
        })

        # 5. Annual filing reminder
        items.append({
            "requirement": "Annual DOI filing prepared",
            "status": "info",
            "note": (
                "Colorado DOI requires annual filing by April 1 covering the prior calendar "
                "year. Include this report as supporting evidence."
            ),
        })

        # 6. Auditor declaration
        auditor_name = config.get("auditorName")
        if auditor_name:
            items.append({
                "requirement": "Responsible party identified",
                "status": "pass",
                "note": f"Audit performed by {auditor_name}.",
            })
        else:
            items.append({
                "requirement": "Responsible party identified",
                "status": "warning",
                "note": "Reg 10-1-1 requires identification of accountable personnel.",
            })

        return items

    def required_categories(self) -> Dict[str, List[str]]:
        return {
            "race_ethnicity": [
                "White",
                "Hispanic",
                "Black",
                "Asian/Pacific Islander",
            ],
        }

    # --------------------------------------------------------------------- #
    # methodology

    def threshold_explanation(self, threshold: float) -> str:
        return (
            "The Colorado Division of Insurance Quantitative Testing Regulation under "
            "C.R.S. \u00a7 10-3-1104.9 and Regulation 10-1-1 requires insurers to test "
            "whether Hispanic, Black, and Asian/Pacific Islander applicants/insureds "
            "experience outcomes that differ from White applicants/insureds by "
            "<b>5 percentage points or more</b>. When such a difference is found, "
            "the insurer must conduct second-level variable testing to identify which "
            "specific variables contribute to the disparity. "
            "This report presents rate differences in percentage-point terms alongside "
            "impact ratios. An impact ratio below 0.95 is used as a conservative flagging "
            "heuristic; the precise 5-percentage-point rule is applied in the per-group "
            "findings below. Note that Colorado does not accept pure actuarial justification "
            "as a safe harbor \u2014 disparities require remediation rather than explanation alone."
        )

    # --------------------------------------------------------------------- #
    # results \u2014 override with rate-difference framing

    def flag_explanation(
        self,
        group: str,
        ratio: float,
        highest_group: str,
        highest_rate: float,
        threshold: float,
    ) -> str:
        group_rate = ratio * highest_rate
        rate_diff_pp = (highest_rate - group_rate) * 100
        severity = "substantially exceeds" if rate_diff_pp >= 10 else "exceeds"
        return (
            f"<b>{group}</b>: outcome rate {group_rate * 100:.1f}% vs. "
            f"{highest_group} reference rate {highest_rate * 100:.1f}% \u2014 a "
            f"<b>{rate_diff_pp:.1f} percentage point</b> difference, which "
            f"{severity} the 5 pp threshold. Colorado Regulation 10-1-1 requires "
            "second-level variable testing to identify contributing factors."
        )

    # --------------------------------------------------------------------- #
    # actions

    def recommended_actions(
        self, has_flags: bool, results: Dict[str, Any]
    ) -> List[str]:
        if has_flags:
            return [
                "Conduct <b>second-level variable testing</b> as required by Regulation 10-1-1 "
                "to identify which specific variables in the ECDIS or predictive model "
                "contribute to the observed rate differences.",
                "Document a <b>remediation plan</b> \u2014 Colorado does not accept pure actuarial "
                "justification as a safe harbor. Disparities of 5 percentage points or more "
                "require remedial measures, not just explanation.",
                "Escalate findings to the <b>governance committee</b> and board-level overseers "
                "per Reg 10-1-1 governance framework requirements.",
                "Consider whether the model or ECDIS source should be <b>suspended</b> pending "
                "remediation, particularly for applicants in the affected race/ethnicity groups.",
                "Include these findings and remediation actions in the <b>annual DOI filing</b> "
                "due April 1 (covering the prior calendar year).",
                "Update <b>third-party vendor oversight</b> records if the flagged model is "
                "provided by an external vendor.",
            ]
        return [
            "Document the testing methodology including BIFSG parameters, reference group "
            "selection, and decision points tested.",
            "Maintain <b>governance records</b> including board oversight sign-off, committee "
            "minutes, and ECDIS/model inventory per Regulation 10-1-1.",
            "Prepare the <b>annual narrative report</b> due to the Colorado DOI by April 1, "
            "attaching this quantitative report as supporting evidence.",
            "Continue <b>ongoing monitoring</b> at the cadence specified in your governance "
            "policy \u2014 disparities can emerge over time as data or model behavior changes.",
            "Maintain <b>third-party vendor documentation</b> for any ECDIS sources or models "
            "provided by external vendors.",
        ]

    # --------------------------------------------------------------------- #
    # context

    def regulatory_context(self) -> List[str]:
        return [
            (
                "<b>C.R.S. \u00a7 10-3-1104.9</b> (SB 21-169, enacted 2021) prohibits Colorado-licensed "
                "insurers from using External Consumer Data and Information Sources (ECDIS), "
                "or algorithms and predictive models that use ECDIS, in a way that results in "
                "unfair discrimination based on race, color, national or ethnic origin, religion, "
                "sex, sexual orientation, disability, gender identity, or gender expression."
            ),
            (
                "<b>Regulation 10-1-1</b> (effective November 14, 2023; amended October 15, 2025 "
                "to cover life, private passenger auto, and health benefit plan insurers) "
                "establishes the governance and risk management framework. Required components "
                "include board-level oversight, a written governance policy, a cross-functional "
                "governance committee, ECDIS and model inventory, ongoing monitoring, third-party "
                "vendor oversight, remediation procedures, and documentation retention."
            ),
            (
                "<b>Colorado DOI Quantitative Testing Regulation</b> requires annual testing "
                "using the <b>Bayesian Improved First Name Surname Geocoding (BIFSG)</b> "
                "methodology developed by the RAND Corporation to estimate race and ethnicity. "
                "Testing compares outcomes for Hispanic, Black, and Asian/Pacific Islander "
                "applicants/insureds against a White reference group across two areas: "
                "(1) application approval rates and (2) premium rates per $1,000 face amount. "
                "A statistical difference of <b>5 percentage points or more</b> triggers "
                "mandatory second-level variable testing."
            ),
            (
                "<b>No actuarial safe harbor.</b> Unlike traditional insurance anti-discrimination "
                "law, SB 21-169 does not accept actuarial soundness as a defense when ECDIS or "
                "algorithmic outcomes correlate with protected classes. Disparities must be "
                "remediated, not merely justified. Insurers must submit annual narrative reports "
                "and quantitative testing results to the Colorado DOI by April 1 each year, "
                "covering the prior calendar year."
            ),
        ]

    def glossary(self) -> List[Tuple[str, str]]:
        return [
            (
                "ECDIS (External Consumer Data and Information Sources)",
                "Any data about a consumer that is not traditional to the insurance industry "
                "or to actuarial science \u2014 for example, social media activity, educational "
                "attainment, purchase history, or biometric data. ECDIS includes the algorithms "
                "and predictive models that consume such data.",
            ),
            (
                "BIFSG (Bayesian Improved First Name Surname Geocoding)",
                "A RAND Corporation statistical methodology for estimating a person\u2019s race or "
                "ethnicity from their first name, surname, and geolocation. Used by Colorado "
                "DOI for testing where self-reported race data is not available.",
            ),
            (
                "Unfair discrimination (insurance)",
                "Under C.R.S. \u00a7 10-3-1104.9, use of ECDIS or models that results in a rate of "
                "adverse outcome for a protected class that differs materially from the rate "
                "for a reference class. Unlike traditional insurance law, actuarial soundness "
                "is not a defense.",
            ),
            (
                "First-level testing",
                "The initial quantitative comparison of outcome rates across race/ethnicity "
                "groups against the White reference group. A difference of 5 percentage points "
                "or more triggers second-level testing.",
            ),
            (
                "Second-level variable testing",
                "An analysis, required when first-level testing identifies a 5+ percentage "
                "point disparity, to determine which specific variables within the ECDIS or "
                "predictive model contribute to the observed difference. Required by Regulation "
                "10-1-1 and must be documented in the annual DOI filing.",
            ),
            (
                "Decision point",
                "A specific stage in the insurance workflow where an ECDIS-informed decision "
                "is made \u2014 for example, application approval, premium rating, rating class "
                "assignment, or declination. Each decision point must be tested separately.",
            ),
            (
                "Rate difference (percentage points)",
                "The absolute difference between two outcome rates, expressed in percentage "
                "points. For example, a 50% White approval rate and a 42% Black approval rate "
                "yield an 8 percentage point difference.",
            ),
        ]

    # --------------------------------------------------------------------- #
    # conclusion

    def conclusion_summary(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> str:
        system_name = config.get("systemName", "the tested model")
        total_applicants = results.get("total_applicants", 0)
        total_evaluated, total_flagged = count_evaluated_groups(results)

        if total_flagged == 0:
            return (
                f"This audit of {system_name} analyzed {total_applicants:,} records "
                "comparing outcomes across BIFSG-estimated race/ethnicity groups "
                "(Hispanic, Black, Asian/Pacific Islander) against the White reference "
                "group. No group showed a rate difference of 5 percentage points or "
                "more, meaning no groups triggered the Colorado DOI second-level "
                "variable testing requirement. This report supports but does not "
                "substitute for the annual DOI filing; governance framework compliance "
                "under Regulation 10-1-1 must be documented separately."
            )

        min_ratio, worst_group = min_impact_ratio(results)
        return (
            f"This audit of {system_name} analyzed {total_applicants:,} records. "
            f"{total_flagged} of {total_evaluated} evaluated groups showed rate "
            "differences that warrant investigation under Colorado Regulation 10-1-1. "
            f"The largest disparity was observed for {worst_group} (impact ratio: "
            f"{min_ratio:.3f}). Second-level variable testing is required to identify "
            "the contributing factors, and a remediation plan must be documented. "
            "Colorado does not accept actuarial soundness as a safe harbor; disparities "
            "must be remediated rather than merely explained."
        )

    def additional_limitations(self) -> List[str]:
        return [
            "Race and ethnicity must be estimated using the BIFSG methodology or equivalent "
            "where self-reported data is unavailable. Accuracy of outcome testing depends on "
            "the quality of name and geolocation data and on the BIFSG reference distribution. "
            "This report does not implement BIFSG; the insurer must produce BIFSG-estimated "
            "race values as input.",
            "This audit tests race/ethnicity only. C.R.S. \u00a7 10-3-1104.9 also prohibits "
            "discrimination based on color, national or ethnic origin, religion, sex, sexual "
            "orientation, disability, gender identity, and gender expression. The Colorado DOI "
            "currently mandates quantitative testing only for race in life insurance; insurers "
            "remain responsible for the broader statutory obligation.",
            "Second-level variable testing and DOI annual filing are separate activities not "
            "produced by this report. Use this report as supporting evidence within the "
            "insurer\u2019s own governance documentation and DOI submission.",
        ]
