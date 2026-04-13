"""Bias audit PDF report generator.

Produces a self-contained PDF that can be read without access to the app.
Uses ReportLab's Platypus flowable API so page breaks, table splits and
long-content wrapping are handled automatically.

The report is intentionally structured around what an enterprise procurement
team actually needs to assess the audit: system definition, data description,
methodology, results, and a limitations section. It is NOT formatted as an
ISAE 3000 assurance report — it is a technical compliance artifact.
"""

import os
from datetime import datetime
from io import BytesIO
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.graphics.shapes import Drawing, Line, String
from reportlab.graphics.charts.barcharts import HorizontalBarChart

from .report_templates import get_template
from .report_templates.base import BiasAuditReportTemplate

# ------------------------------------------------------------------ colors
BRAND = colors.HexColor("#13715B")
BORDER = colors.HexColor("#d0d5dd")
BG_ACCENT = colors.HexColor("#f8fafc")
TEXT = colors.HexColor("#1f2937")
TEXT_MUTED = colors.HexColor("#6b7280")
FLAG_BG = colors.HexColor("#fee2e2")
FLAG_TEXT = colors.HexColor("#b91c1c")

VERDICT_GREEN = colors.HexColor("#E6F4EA")
VERDICT_GREEN_TEXT = colors.HexColor("#138A5E")
VERDICT_AMBER = colors.HexColor("#FFF3E0")
VERDICT_AMBER_TEXT = colors.HexColor("#E65100")
VERDICT_RED = colors.HexColor("#fee2e2")
VERDICT_RED_TEXT = colors.HexColor("#b91c1c")
CHECK_PASS = colors.HexColor("#138A5E")
CHECK_WARN = colors.HexColor("#E65100")
CHECK_INFO = colors.HexColor("#1565C0")


# ------------------------------------------------------------------ styles
def _styles() -> Dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Title"],
            fontSize=28,
            leading=34,
            textColor=BRAND,
            spaceAfter=20,
        ),
        "cover_subtitle": ParagraphStyle(
            "cover_subtitle",
            parent=base["Normal"],
            fontSize=14,
            leading=20,
            textColor=TEXT_MUTED,
            spaceAfter=8,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontSize=16,
            leading=22,
            textColor=BRAND,
            spaceBefore=20,
            spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontSize=13,
            leading=18,
            textColor=TEXT,
            spaceBefore=14,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontSize=10,
            leading=15,
            textColor=TEXT,
            spaceAfter=8,
        ),
        "muted": ParagraphStyle(
            "muted",
            parent=base["Normal"],
            fontSize=9,
            leading=13,
            textColor=TEXT_MUTED,
            spaceAfter=4,
        ),
        "label": ParagraphStyle(
            "label",
            parent=base["Normal"],
            fontSize=9,
            leading=13,
            textColor=TEXT_MUTED,
            fontName="Helvetica-Bold",
        ),
        "verdict_label": ParagraphStyle(
            "verdict_label",
            parent=base["Normal"],
            fontSize=12,
            leading=16,
            fontName="Helvetica-Bold",
        ),
        "verdict_narrative": ParagraphStyle(
            "verdict_narrative",
            parent=base["Normal"],
            fontSize=10,
            leading=15,
            textColor=TEXT,
            spaceAfter=12,
            spaceBefore=8,
        ),
        "checklist_pass": ParagraphStyle(
            "checklist_pass",
            parent=base["Normal"],
            fontSize=9,
            leading=13,
            textColor=CHECK_PASS,
            fontName="Helvetica-Bold",
        ),
        "checklist_warn": ParagraphStyle(
            "checklist_warn",
            parent=base["Normal"],
            fontSize=9,
            leading=13,
            textColor=CHECK_WARN,
            fontName="Helvetica-Bold",
        ),
        "checklist_info": ParagraphStyle(
            "checklist_info",
            parent=base["Normal"],
            fontSize=9,
            leading=13,
            textColor=CHECK_INFO,
            fontName="Helvetica-Bold",
        ),
        "action_item": ParagraphStyle(
            "action_item",
            parent=base["Normal"],
            fontSize=10,
            leading=15,
            textColor=TEXT,
            spaceAfter=6,
            leftIndent=18,
        ),
        "glossary_term": ParagraphStyle(
            "glossary_term",
            parent=base["Normal"],
            fontSize=10,
            leading=14,
            textColor=TEXT,
            fontName="Helvetica-Bold",
        ),
        "glossary_def": ParagraphStyle(
            "glossary_def",
            parent=base["Normal"],
            fontSize=9,
            leading=13,
            textColor=TEXT_MUTED,
            spaceAfter=8,
        ),
    }


# ------------------------------------------------------------------ helpers
def _pct(v: Optional[float]) -> str:
    if v is None:
        return "\u2014"
    return f"{v * 100:.1f}%"


def _num(v: Optional[float], places: int = 3) -> str:
    if v is None:
        return "\u2014"
    return f"{v:.{places}f}"


def _count(v: Optional[int]) -> str:
    if v is None:
        return "\u2014"
    return f"{v:,}"


def _independence_label(code: Optional[str]) -> str:
    if not code:
        return "Not declared"
    return {
        "self": "Self-declared (no independence)",
        "internal": "Internal (company employee, not the tool vendor)",
        "third_party": "Third-party (independent of tool vendor and deployer)",
    }.get(code, code)


def _key_value_table(rows: List[tuple], col_widths=(1.8 * inch, 4.7 * inch)) -> Table:
    """Two-column label/value table used for metadata blocks."""
    styles = _styles()
    data = []
    for label, value in rows:
        data.append([
            Paragraph(label, styles["label"]),
            Paragraph(value or "<i>not provided</i>", styles["body"]),
        ])
    t = Table(data, colWidths=list(col_widths))
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, BORDER),
    ]))
    return t


# ------------------------------------------------------------------ sections
def _cover_page(
    story: list, styles: Dict[str, ParagraphStyle], audit: Dict[str, Any]
) -> None:
    config = audit.get("config", {}) or {}
    results = audit.get("results", {}) or {}

    system_name = config.get("systemName") or "AI system"
    system_version = config.get("systemVersion") or ""
    preset_name = audit.get("presetName", "Custom")

    # Compute plain-English metric label
    metric = results.get("metric") or config.get("metric") or "selection_rate"
    metric_label = {
        "selection_rate": "Selection rate (4/5ths rule)",
        "scoring_rate": "Scoring rate (LL144 alternative)",
        "fairness_metrics": "Fairness metrics (TPR / FPR / equalized odds)",
    }.get(metric, metric)

    logo_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "utils",
        "verifywise_logo.png",
    )
    if os.path.exists(logo_path):
        story.append(Image(logo_path, width=1.4 * inch, height=0.42 * inch))
        story.append(Spacer(1, 0.8 * inch))
    else:
        story.append(Spacer(1, 1.2 * inch))

    story.append(Paragraph("Bias audit report", styles["cover_title"]))
    story.append(Paragraph(
        f"for <b>{system_name}</b>" + (f" (version {system_version})" if system_version else ""),
        styles["cover_subtitle"],
    ))
    story.append(Spacer(1, 0.4 * inch))
    story.append(_key_value_table([
        ("Compliance framework", preset_name),
        ("Metric", metric_label),
        ("Audit date", datetime.now().strftime("%B %d, %Y")),
        ("Auditor", config.get("auditorName") or "Not declared"),
        ("Auditor role", config.get("auditorRole") or "Not declared"),
        ("Independence", _independence_label(config.get("auditorIndependence"))),
    ]))
    story.append(Spacer(1, 0.3 * inch))

    # Prominent warning when the audit is self-declared
    if config.get("auditorIndependence") == "self":
        warning = Table([[Paragraph(
            "<b>Self-declared audit.</b> This report was produced by the tool "
            "vendor or system owner with no third-party independence. Receiving "
            "parties should weight the results accordingly.",
            ParagraphStyle("warn", parent=styles["body"], textColor=FLAG_TEXT),
        )]], colWidths=[6.5 * inch])
        warning.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), FLAG_BG),
            ("BOX", (0, 0), (-1, -1), 0.5, FLAG_TEXT),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(warning)

    story.append(PageBreak())


def _overall_assessment(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    results = audit.get("results", {}) or {}
    v = template.verdict(results)

    story.append(Paragraph("Overall assessment", styles["h1"]))

    color_map = {
        "green": (VERDICT_GREEN, VERDICT_GREEN_TEXT),
        "amber": (VERDICT_AMBER, VERDICT_AMBER_TEXT),
        "red": (VERDICT_RED, VERDICT_RED_TEXT),
    }

    # Disparate impact row
    di_bg, di_text = color_map.get(v.get("color", "green"), (VERDICT_GREEN, VERDICT_GREEN_TEXT))
    # Data completeness row
    dc = v.get("data_completeness", {})
    dc_bg, dc_text = color_map.get(dc.get("color", "green"), (VERDICT_GREEN, VERDICT_GREEN_TEXT))

    data = [
        [
            Paragraph("Disparate impact", styles["verdict_label"]),
            Paragraph(v.get("label", ""), ParagraphStyle("vl", parent=styles["verdict_label"], textColor=di_text)),
        ],
        [
            Paragraph("Data completeness", styles["verdict_label"]),
            Paragraph(dc.get("label", ""), ParagraphStyle("dcl", parent=styles["verdict_label"], textColor=dc_text)),
        ],
    ]

    t = Table(data, colWidths=[2.5 * inch, 4.0 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (1, 0), (1, 0), di_bg),
        ("BACKGROUND", (1, 1), (1, 1), dc_bg),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, 0), 0.25, BORDER),
    ]))
    story.append(t)

    narrative = v.get("narrative", "")
    if narrative:
        story.append(Paragraph(narrative, styles["verdict_narrative"]))


def _scope(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    config = audit.get("config", {}) or {}
    results = audit.get("results", {}) or {}

    story.append(Paragraph("Scope of this audit", styles["h1"]))

    in_items = template.scope_in(config, results)
    if in_items:
        story.append(Paragraph("<b>In scope</b>", styles["body"]))
        for item in in_items:
            story.append(Paragraph(f"\u2022 {item}", styles["body"]))

    out_items = template.scope_out()
    if out_items:
        story.append(Paragraph("<b>Out of scope</b>", styles["body"]))
        for item in out_items:
            story.append(Paragraph(f"\u2022 {item}", styles["body"]))


def _compliance_checklist(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    config = audit.get("config", {}) or {}
    results = audit.get("results", {}) or {}
    items = template.checklist(config, results)
    if not items:
        return

    story.append(Paragraph("Compliance checklist", styles["h1"]))

    status_symbols = {
        "pass": ("\u2713", "checklist_pass"),
        "warning": ("\u26A0", "checklist_warn"),
        "info": ("\u2139", "checklist_info"),
    }

    header = ["Requirement", "Status", "Notes"]
    body_rows: List[List[Any]] = [header]
    warning_rows: List[int] = []

    for idx, item in enumerate(items, start=1):
        status = item.get("status", "info")
        symbol, style_key = status_symbols.get(status, ("\u2139", "checklist_info"))
        body_rows.append([
            Paragraph(item.get("requirement", ""), styles["body"]),
            Paragraph(symbol, styles[style_key]),
            Paragraph(item.get("note", ""), styles["muted"]),
        ])
        if status == "warning":
            warning_rows.append(idx)

    t = Table(body_rows, colWidths=[2.5 * inch, 0.8 * inch, 3.2 * inch])
    style = _data_table_style()
    for wr in warning_rows:
        style.add("BACKGROUND", (0, wr), (-1, wr), VERDICT_AMBER)
    t.setStyle(style)
    story.append(t)
    story.append(Spacer(1, 0.15 * inch))


def _impact_ratio_chart(
    rows: List[Dict[str, Any]], threshold: float, title: str
) -> Optional[Drawing]:
    """Create a horizontal bar chart of impact ratios.

    Returns None if fewer than 2 non-excluded groups.
    """
    groups = []
    ratios = []
    for row in rows:
        if row.get("excluded", False):
            continue
        ratio = row.get("impact_ratio")
        if ratio is not None:
            groups.append(row.get("category_name", ""))
            ratios.append(ratio)

    if len(groups) < 2:
        return None

    drawing_height = max(80, len(groups) * 28 + 40)
    d = Drawing(460, drawing_height)

    chart = HorizontalBarChart()
    chart.x = 140
    chart.y = 20
    chart.width = 280
    chart.height = drawing_height - 40
    chart.data = [ratios]
    chart.categoryAxis.categoryNames = groups
    chart.categoryAxis.labels.fontSize = 8
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = max(max(ratios) * 1.1, threshold * 1.2)
    chart.valueAxis.labels.fontSize = 8
    chart.bars.strokeWidth = 0

    # Per-bar coloring
    for i, ratio in enumerate(ratios):
        if ratio >= threshold:
            chart.bars[(0, i)].fillColor = BRAND
        else:
            chart.bars[(0, i)].fillColor = FLAG_TEXT

    d.add(chart)

    # Threshold line (dashed red)
    line_x = chart.x + (threshold / chart.valueAxis.valueMax) * chart.width
    threshold_line = Line(line_x, 20, line_x, drawing_height - 20)
    threshold_line.strokeColor = FLAG_TEXT
    threshold_line.strokeDashArray = [4, 2]
    threshold_line.strokeWidth = 1
    d.add(threshold_line)

    # Threshold label
    label = String(line_x + 2, drawing_height - 16, f"Threshold ({threshold:.2f})")
    label.fontSize = 7
    label.fillColor = FLAG_TEXT
    d.add(label)

    return d


def _executive_summary(
    story: list, styles: Dict[str, ParagraphStyle], audit: Dict[str, Any]
) -> None:
    results = audit.get("results", {}) or {}
    config = audit.get("config", {}) or {}

    story.append(Paragraph("Executive summary", styles["h1"]))

    story.append(_key_value_table([
        ("Total records", _count(results.get("total_applicants"))),
        ("Total selected", _count(results.get("total_selected"))),
        ("Overall rate", _pct(results.get("overall_selection_rate"))),
        ("Flagged groups", str(results.get("flags_count", 0))),
        ("Excluded groups", str(results.get("excluded_count", 0))),
        ("Records with missing data", _count(results.get("unknown_count"))),
    ]))
    story.append(Spacer(1, 0.15 * inch))

    summary_text = results.get("summary") or "No summary available."
    story.append(Paragraph(summary_text, styles["body"]))

    # Impact ratio charts
    threshold = config.get("threshold", 0.80) or 0.80
    tables = results.get("tables") or []
    for tbl in tables:
        if tbl.get("category_key") == "intersectional":
            continue
        chart = _impact_ratio_chart(tbl.get("rows", []), threshold, tbl.get("title", ""))
        if chart is not None:
            story.append(Spacer(1, 0.1 * inch))
            story.append(Paragraph(tbl.get("title", ""), styles["h2"]))
            story.append(chart)


def _system_description(
    story: list, styles: Dict[str, ParagraphStyle], audit: Dict[str, Any]
) -> None:
    config = audit.get("config", {}) or {}

    story.append(Paragraph("System description", styles["h1"]))
    story.append(_key_value_table([
        ("Name", config.get("systemName", "")),
        ("Version", config.get("systemVersion", "")),
        ("Description", config.get("systemDescription", "")),
        ("Deployment context", config.get("deploymentContext", "")),
    ]))


def _data_description(
    story: list, styles: Dict[str, ParagraphStyle], audit: Dict[str, Any]
) -> None:
    config = audit.get("config", {}) or {}
    results = audit.get("results", {}) or {}

    story.append(Paragraph("Data description", styles["h1"]))

    date_range = ""
    start = config.get("dataDateRangeStart")
    end = config.get("dataDateRangeEnd")
    if start and end:
        date_range = f"{start} to {end}"
    elif start:
        date_range = f"from {start}"
    elif end:
        date_range = f"up to {end}"

    story.append(_key_value_table([
        ("Source", config.get("dataSource", "")),
        ("Date range", date_range),
        ("Total records", _count(results.get("total_applicants"))),
        ("Records with missing data", _count(results.get("unknown_count"))),
    ]))

    # Category breakdowns
    tables = results.get("tables", [])
    if tables:
        story.append(Spacer(1, 0.1 * inch))
        story.append(Paragraph("Records per demographic category", styles["h2"]))
        for tbl in tables:
            if tbl.get("category_key") == "intersectional":
                continue
            rows = [["Group", "Records", "Share"]]
            total = sum(r.get("applicant_count", 0) for r in tbl.get("rows", []))
            for row in tbl.get("rows", []):
                count = row.get("applicant_count", 0)
                share = (count / total * 100) if total else 0
                rows.append([
                    row.get("category_name", ""),
                    f"{count:,}",
                    f"{share:.1f}%",
                ])
            t = Table(rows, colWidths=[3.5 * inch, 1.5 * inch, 1.5 * inch])
            t.setStyle(_data_table_style())
            story.append(Paragraph(tbl.get("title", ""), styles["muted"]))
            story.append(t)
            story.append(Spacer(1, 0.1 * inch))


def _methodology(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    config = audit.get("config", {}) or {}
    results = audit.get("results", {}) or {}
    metric = results.get("metric") or config.get("metric") or "selection_rate"
    threshold = config.get("threshold", 0.80) or 0.80
    small_sample = config.get("smallSampleExclusion") or config.get("small_sample_exclusion")

    story.append(Paragraph("Methodology", styles["h1"]))

    method_text = {
        "selection_rate": (
            f"The audit uses the <b>selection rate</b> metric. For each demographic "
            f"group, the selection rate is computed as the number of selected "
            f"records divided by the total number of records in that group. "
            f"Each group's rate is then compared to the group with the highest "
            f"selection rate to produce an <b>impact ratio</b>."
        ),
        "scoring_rate": (
            f"The audit uses the <b>scoring rate</b> metric, the LL144-compliant "
            f"alternative for tools that output a continuous score. The rate for "
            f"each group is the proportion of records whose score is above the "
            f"overall median. Impact ratios are then computed relative to the "
            f"highest-rate group."
        ),
        "fairness_metrics": (
            f"The audit uses <b>confusion-matrix fairness metrics</b>. For each "
            f"group, the report computes true positive rate (TPR), false positive "
            f"rate (FPR), precision, and accuracy from the model's predictions "
            f"compared against ground truth. Cross-group differences are "
            f"summarized as equal opportunity difference (TPR gap), equalized "
            f"odds difference (max of TPR and FPR gaps), and predictive parity "
            f"difference (precision gap)."
        ),
    }.get(metric, "")

    story.append(Paragraph(method_text, styles["body"]))

    if metric in ("selection_rate", "scoring_rate"):
        explanation = template.threshold_explanation(threshold)
        story.append(Paragraph(explanation, styles["body"]))

    if small_sample:
        story.append(Paragraph(
            f"<b>Small-sample exclusion.</b> Groups representing fewer than "
            f"{small_sample * 100:.1f}% of the total records are excluded from "
            f"impact ratio calculations to avoid statistically unreliable results.",
            styles["body"],
        ))

    intersectional = config.get("intersectional") or {}
    if intersectional.get("required") and len(intersectional.get("cross", [])) >= 2:
        cross = " \u00d7 ".join(intersectional.get("cross", []))
        story.append(Paragraph(
            f"<b>Intersectional analysis</b> is included: compound groups formed "
            f"by combining {cross} are also evaluated against the same threshold.",
            styles["body"],
        ))


def _results(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    results = audit.get("results", {}) or {}
    config = audit.get("config", {}) or {}
    tables = results.get("tables") or []
    fairness = results.get("fairness_metrics_tables") or []
    distributions = results.get("score_distribution_tables") or []
    threshold = config.get("threshold", 0.80) or 0.80

    if not (tables or fairness or distributions):
        return

    story.append(Paragraph("Results", styles["h1"]))

    for tbl in tables:
        story.append(Paragraph(tbl.get("title", ""), styles["h2"]))
        if tbl.get("highest_group") and tbl.get("highest_rate") is not None:
            story.append(Paragraph(
                f"Highest-rate group: <b>{tbl['highest_group']}</b> ({tbl['highest_rate'] * 100:.1f}%)",
                styles["muted"],
            ))

        # Sort rows: non-excluded by impact_ratio ascending, excluded at end
        sorted_rows = sorted(
            tbl.get("rows", []),
            key=lambda r: (
                1 if r.get("excluded") else 0,
                r.get("impact_ratio") if r.get("impact_ratio") is not None else 999,
            ),
        )

        header = ["Group", "Records", "Selected", "Rate", "Impact ratio", "Status"]
        body_rows: List[List[Any]] = [header]
        flagged_rows: List[int] = []
        for idx, row in enumerate(sorted_rows, start=1):
            excluded = row.get("excluded")
            flagged = row.get("flagged")
            if flagged:
                flagged_rows.append(idx)
            status = "Excluded (<threshold)" if excluded else ("Flagged" if flagged else "Pass")
            body_rows.append([
                row.get("category_name", ""),
                f"{row.get('applicant_count', 0):,}",
                f"{row.get('selected_count', 0):,}",
                _pct(row.get("selection_rate")),
                "\u2014" if excluded else _num(row.get("impact_ratio")),
                status,
            ])
        t = Table(body_rows, colWidths=[2.0 * inch, 0.85 * inch, 0.85 * inch, 0.75 * inch, 1.0 * inch, 1.05 * inch])
        style = _data_table_style()
        for fr in flagged_rows:
            style.add("BACKGROUND", (0, fr), (-1, fr), FLAG_BG)
            style.add("TEXTCOLOR", (0, fr), (-1, fr), FLAG_TEXT)
        t.setStyle(style)
        story.append(t)

        # Flag explanations
        highest_group = tbl.get("highest_group", "")
        highest_rate = tbl.get("highest_rate", 0) or 0
        for row in sorted_rows:
            if row.get("flagged") and not row.get("excluded"):
                ratio = row.get("impact_ratio", 0) or 0
                explanation = template.flag_explanation(
                    group=row.get("category_name", ""),
                    ratio=ratio,
                    highest_group=highest_group,
                    highest_rate=highest_rate,
                    threshold=threshold,
                )
                story.append(Paragraph(explanation, styles["muted"]))

        story.append(Spacer(1, 0.15 * inch))

    for tbl in fairness:
        story.append(Paragraph(tbl.get("title", ""), styles["h2"]))
        diffs = []
        if tbl.get("equal_opportunity_difference") is not None:
            diffs.append(
                f"Equal opportunity difference: <b>{tbl['equal_opportunity_difference']:.3f}</b>"
            )
        if tbl.get("equalized_odds_difference") is not None:
            diffs.append(
                f"Equalized odds difference: <b>{tbl['equalized_odds_difference']:.3f}</b>"
            )
        if tbl.get("predictive_parity_difference") is not None:
            diffs.append(
                f"Predictive parity difference: <b>{tbl['predictive_parity_difference']:.3f}</b>"
            )
        if diffs:
            story.append(Paragraph(" &nbsp;\u00b7&nbsp; ".join(diffs), styles["muted"]))

        header = ["Group", "Count", "TPR", "FPR", "Precision", "Accuracy", "TP/FP/TN/FN"]
        body_rows = [header]
        for g in tbl.get("groups", []):
            body_rows.append([
                g.get("category_name", ""),
                f"{g.get('count', 0):,}",
                _pct(g.get("true_positive_rate")),
                _pct(g.get("false_positive_rate")),
                _pct(g.get("precision")),
                _pct(g.get("accuracy")),
                f"{g.get('true_positive', 0)}/{g.get('false_positive', 0)}/{g.get('true_negative', 0)}/{g.get('false_negative', 0)}",
            ])
        t = Table(body_rows, colWidths=[1.5 * inch, 0.7 * inch, 0.7 * inch, 0.7 * inch, 0.9 * inch, 0.9 * inch, 1.1 * inch])
        t.setStyle(_data_table_style())
        story.append(t)
        story.append(Spacer(1, 0.15 * inch))

    for tbl in distributions:
        story.append(Paragraph(tbl.get("title", ""), styles["h2"]))
        story.append(Paragraph(
            f"Overall mean: {tbl.get('overall_mean', 0):.3f} &nbsp;\u00b7&nbsp; "
            f"Overall median: {tbl.get('overall_median', 0):.3f}",
            styles["muted"],
        ))
        header = ["Group", "n", "Mean", "Median", "Std", "K-S stat", "K-S p-value"]
        body_rows = [header]
        for g in tbl.get("groups", []):
            body_rows.append([
                g.get("category_name", ""),
                f"{g.get('count', 0):,}",
                _num(g.get("mean")),
                _num(g.get("median")),
                _num(g.get("std")),
                _num(g.get("ks_statistic")),
                _num(g.get("ks_pvalue")),
            ])
        t = Table(body_rows, colWidths=[1.8 * inch, 0.6 * inch, 0.85 * inch, 0.85 * inch, 0.85 * inch, 0.85 * inch, 0.95 * inch])
        t.setStyle(_data_table_style())
        story.append(t)
        story.append(Spacer(1, 0.15 * inch))


def _recommended_actions(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    results = audit.get("results", {}) or {}
    has_flags = (results.get("flags_count", 0) or 0) > 0
    actions = template.recommended_actions(has_flags, results)
    if not actions:
        return

    story.append(Paragraph("Recommended actions", styles["h1"]))
    for i, action in enumerate(actions, start=1):
        story.append(Paragraph(f"{i}. {action}", styles["action_item"]))


def _regulatory_context(
    story: list,
    styles: Dict[str, ParagraphStyle],
    template: BiasAuditReportTemplate,
) -> None:
    paragraphs = template.regulatory_context()
    if not paragraphs:
        return

    story.append(Paragraph("Regulatory context", styles["h1"]))
    for para in paragraphs:
        story.append(Paragraph(para, styles["body"]))


def _glossary(
    story: list,
    styles: Dict[str, ParagraphStyle],
    template: BiasAuditReportTemplate,
) -> None:
    terms = template.glossary()
    if not terms:
        return

    story.append(Paragraph("Glossary", styles["h1"]))
    for term, definition in terms:
        story.append(Paragraph(term, styles["glossary_term"]))
        story.append(Paragraph(definition, styles["glossary_def"]))


def _conclusion(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    config = audit.get("config", {}) or {}
    results = audit.get("results", {}) or {}

    story.append(PageBreak())
    story.append(Paragraph("Conclusion", styles["h1"]))

    summary = template.conclusion_summary(config, results)
    if summary:
        story.append(Paragraph(summary, styles["body"]))

    story.append(Paragraph("Limitations", styles["h2"]))

    universal_limitations = [
        "The audit measures statistical disparity, not causation. A flagged "
        "group does not imply the tool is the cause of that disparity.",
        "Results are specific to the dataset provided. They do not automatically "
        "generalize to different deployment contexts, time periods, or populations.",
        "Compliance obligations vary by jurisdiction. A passing audit under one "
        "framework does not imply compliance with all applicable laws.",
        "The audit does not evaluate the quality, relevance, or job-relatedness "
        "of the underlying features used by the tool.",
        "Readers should consult qualified legal counsel for interpretation of "
        "these results in their specific regulatory context.",
    ]
    for item in universal_limitations:
        story.append(Paragraph(f"\u2022 {item}", styles["body"]))

    additional = template.additional_limitations()
    for item in additional:
        story.append(Paragraph(f"\u2022 {item}", styles["body"]))


def _data_table_style() -> TableStyle:
    return TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), TEXT),
        ("BACKGROUND", (0, 0), (-1, 0), BG_ACCENT),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, BORDER),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
    ])


def _footer(canvas, doc):
    """Page footer with page number and report identifier."""
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(0.75 * inch, 0.5 * inch, "VerifyWise bias audit report")
    canvas.drawRightString(7.75 * inch, 0.5 * inch, f"Page {doc.page}")
    canvas.restoreState()


# ------------------------------------------------------------------ entry point
def generate_pdf_report(audit: Dict[str, Any]) -> bytes:
    """Generate a PDF report for a completed bias audit.

    Args:
        audit: The full audit record as returned by get_bias_audit_results
            (must include status="completed", results, config).

    Returns:
        PDF bytes ready to serve as application/pdf.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Bias audit report",
        author="VerifyWise",
    )

    preset_name = audit.get("presetName") or audit.get("preset_name") or ""
    template = get_template(preset_name)

    styles = _styles()
    story: list = []

    _cover_page(story, styles, audit)
    _overall_assessment(story, styles, audit, template)
    _scope(story, styles, audit, template)
    _compliance_checklist(story, styles, audit, template)
    _executive_summary(story, styles, audit)
    _system_description(story, styles, audit)
    _data_description(story, styles, audit)
    _methodology(story, styles, audit, template)
    _results(story, styles, audit, template)
    _recommended_actions(story, styles, audit, template)
    _regulatory_context(story, styles, template)
    _glossary(story, styles, template)
    _conclusion(story, styles, audit, template)

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()
