"""
LLM Evaluation Report Generator (EvalCards Standard)

Generates PDF reports from experiment evaluation data using ReportLab.
"""

import io
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Image,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    HRFlowable,
    KeepTogether,
)

LOGO_PATH = os.path.join(os.path.dirname(__file__), "verifywise_logo.png")

ACCENT = colors.HexColor("#13715B")
ACCENT_LIGHT = colors.HexColor("#ECFDF5")

COLORS = {
    "primary": colors.HexColor("#111827"),
    "secondary": colors.HexColor("#6B7280"),
    "accent": ACCENT,
    "accent_light": ACCENT_LIGHT,
    "success": colors.HexColor("#16A34A"),
    "danger": colors.HexColor("#DC2626"),
    "warning": colors.HexColor("#D97706"),
    "light_bg": colors.HexColor("#F9FAFB"),
    "cover_bg": colors.HexColor("#F0FDF4"),
    "border": colors.HexColor("#E5E7EB"),
    "white": colors.white,
    "safety_header": colors.HexColor("#991B1B"),
    "safety_row": colors.HexColor("#FEF2F2"),
}

from utils.metric_constants import (
    is_safety_metric as _is_safety_metric,
    is_inverted_metric as _is_inverted_metric,
    did_pass as _did_pass,
    format_metric_name as _format_metric_name,
)

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


def _score_label(score: float, inverted: bool) -> str:
    effective = 1 - score if inverted else score
    if effective >= 0.8:
        return "Excellent"
    if effective >= 0.6:
        return "Good"
    if effective >= 0.4:
        return "Fair"
    return "Poor"


def _safe_str(val: Any, default: str = "N/A") -> str:
    if val is None:
        return default
    s = str(val)
    return s if s.strip() else default


def _get_styles() -> Dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontSize=26,
            leading=32,
            textColor=COLORS["primary"],
            alignment=TA_CENTER,
            spaceAfter=3 * mm,
            fontName="Helvetica-Bold",
        ),
        "cover_subtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=base["Normal"],
            fontSize=13,
            leading=17,
            textColor=ACCENT,
            alignment=TA_CENTER,
            spaceAfter=8 * mm,
            fontName="Helvetica",
        ),
        "cover_info": ParagraphStyle(
            "CoverInfo",
            parent=base["Normal"],
            fontSize=10,
            leading=15,
            textColor=COLORS["secondary"],
            alignment=TA_CENTER,
        ),
        "section_header": ParagraphStyle(
            "SectionHeader",
            parent=base["Heading2"],
            fontSize=14,
            leading=18,
            textColor=COLORS["primary"],
            spaceBefore=8 * mm,
            spaceAfter=2 * mm,
            fontName="Helvetica-Bold",
        ),
        "body": ParagraphStyle(
            "ReportBody",
            parent=base["Normal"],
            fontSize=10,
            leading=14,
            textColor=COLORS["secondary"],
        ),
        "body_bold": ParagraphStyle(
            "ReportBodyBold",
            parent=base["Normal"],
            fontSize=10,
            leading=14,
            textColor=COLORS["primary"],
            fontName="Helvetica-Bold",
        ),
        "body_accent": ParagraphStyle(
            "ReportBodyAccent",
            parent=base["Normal"],
            fontSize=10,
            leading=14,
            textColor=ACCENT,
            fontName="Helvetica-Bold",
        ),
        "small": ParagraphStyle(
            "ReportSmall",
            parent=base["Normal"],
            fontSize=9,
            leading=13,
            textColor=COLORS["secondary"],
        ),
        "intro": ParagraphStyle(
            "ReportIntro",
            parent=base["Normal"],
            fontSize=10,
            leading=15,
            textColor=COLORS["secondary"],
            spaceAfter=4 * mm,
        ),
        "ai_summary": ParagraphStyle(
            "AISummary",
            parent=base["Normal"],
            fontSize=10,
            leading=15,
            textColor=colors.HexColor("#374151"),
            leftIndent=6,
            rightIndent=6,
            spaceBefore=1 * mm,
            spaceAfter=1 * mm,
        ),
        "ai_label": ParagraphStyle(
            "AILabel",
            parent=base["Normal"],
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#6B7280"),
            fontName="Helvetica-BoldOblique",
            spaceBefore=2 * mm,
            spaceAfter=1 * mm,
        ),
    }


def _section_header(styles: dict, title: str) -> List:
    return [
        Spacer(1, 3 * mm),
        Paragraph(title, styles["section_header"]),
        HRFlowable(width="100%", thickness=0.5, color=COLORS["border"], spaceAfter=4 * mm),
    ]


def _kv_table(pairs: List[Tuple[str, str]]) -> Table:
    """Render key-value pairs as a clean two-column mini-table."""
    rows = []
    for k, v in pairs:
        rows.append([
            Paragraph(f"<b>{k}</b>", ParagraphStyle("_kvk", fontSize=9, leading=13, textColor=COLORS["secondary"], fontName="Helvetica-Bold")),
            Paragraph(_safe_str(v), ParagraphStyle("_kvv", fontSize=9, leading=13, textColor=COLORS["primary"])),
        ])
    t = Table(rows, colWidths=[38 * mm, CONTENT_W - 38 * mm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("LEFTPADDING", (1, 0), (1, -1), 4),
    ]))
    return t


def _ai_summary_block(styles: dict, text: str, label: str = "AI-Generated Analysis") -> List:
    """Render AI-generated summary text with a left accent border on neutral background."""
    if not text:
        return []
    elements = [
        Paragraph(f"<i>{label}</i>", styles["ai_label"]),
    ]
    inner = [[Paragraph(text, styles["ai_summary"])]]
    t = Table(inner, colWidths=[CONTENT_W - 14])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, colors.HexColor("#9CA3AF")),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 2 * mm))
    return elements


def _build_metric_table(
    entries: List[Tuple[str, Dict]],
    thresholds: Dict[str, float],
    header_color: Any = None,
    alt_row_color: Any = None,
) -> Optional[Table]:
    if not entries:
        return None

    if header_color is None:
        header_color = ACCENT
    if alt_row_color is None:
        alt_row_color = COLORS["light_bg"]

    header = ["Metric", "Avg Score", "Pass Rate", "Threshold", "Status", "Rating"]
    rows = [header]
    status_cells: List[Tuple[int, bool]] = []

    for name, m in entries:
        inverted = _is_inverted_metric(name)
        avg = m.get("averageScore", 0)
        pass_rate = m.get("passRate", 0)
        threshold = thresholds.get(name, 0.5)
        passed = _did_pass(avg, threshold, inverted)
        status_cells.append((len(rows), passed))
        rows.append([
            _format_metric_name(name),
            f"{avg * 100:.1f}%",
            f"{pass_rate:.1f}%",
            f"{threshold * 100:.0f}%",
            "PASS" if passed else "FAIL",
            _score_label(avg, inverted),
        ])

    col_widths = [50 * mm, 26 * mm, 26 * mm, 26 * mm, 22 * mm, 25 * mm]
    table = Table(rows, colWidths=col_widths, repeatRows=1)

    style_cmds: List = [
        ("BACKGROUND", (0, 0), (-1, 0), header_color),
        ("TEXTCOLOR", (0, 0), (-1, 0), COLORS["white"]),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, header_color),
        ("LINEBELOW", (0, 1), (-1, -2), 0.3, COLORS["border"]),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, COLORS["border"]),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]

    for i in range(1, len(rows)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), alt_row_color))

    for row_idx, passed in status_cells:
        clr = COLORS["success"] if passed else COLORS["danger"]
        style_cmds.append(("TEXTCOLOR", (4, row_idx), (4, row_idx), clr))
        style_cmds.append(("FONTNAME", (4, row_idx), (4, row_idx), "Helvetica-Bold"))

    table.setStyle(TableStyle(style_cmds))
    return table


# ===================== MAIN PDF =====================

def generate_pdf_report(
    config: Dict[str, Any],
    experiments: List[Dict[str, Any]],
    project_name: str,
    org_name: str,
) -> bytes:
    """Generate a PDF report and return it as bytes."""
    buffer = io.BytesIO()
    styles = _get_styles()

    title = config.get("title") or f"{project_name} - Evaluation Report"

    enabled_sections = set()
    for s in config.get("sections", []):
        if s.get("enabled", True):
            enabled_sections.add(s["id"])

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN + 5 * mm,
        title=title,
        author="VerifyWise",
        subject="LLM Evaluation Report",
        creator="VerifyWise AI Governance Platform",
    )

    story: List = []

    # ── Cover page ──
    story.append(Spacer(1, 18 * mm))

    if os.path.exists(LOGO_PATH):
        logo = Image(LOGO_PATH, width=22 * mm, height=22 * mm)
        logo.hAlign = "CENTER"
        story.append(logo)
        story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("VerifyWise", ParagraphStyle(
        "_brand", fontSize=14, leading=18, textColor=ACCENT,
        alignment=TA_CENTER, fontName="Helvetica-Bold", spaceAfter=14 * mm,
    )))

    story.append(Paragraph("LLM Evaluation Report", styles["cover_title"]))
    if title and title != "LLM Evaluation Report":
        story.append(Paragraph(title, styles["cover_subtitle"]))

    story.append(HRFlowable(width="40%", thickness=0.6, color=ACCENT, spaceAfter=8 * mm, hAlign="CENTER"))

    # Cover metadata
    date_str = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    models_used = list({exp.get("model", "Unknown") for exp in experiments})
    metrics_all = set()
    for exp in experiments:
        metrics_all.update(exp.get("metricSummaries", {}).keys())

    cover_lines = [
        f"<b>Project:</b>&nbsp;&nbsp;{_safe_str(project_name)}",
        f"<b>Organization:</b>&nbsp;&nbsp;{_safe_str(org_name)}",
        f"<b>Generated:</b>&nbsp;&nbsp;{date_str}",
        f"<b>Experiments:</b>&nbsp;&nbsp;{len(experiments)}",
        f"<b>Models evaluated:</b>&nbsp;&nbsp;{', '.join(models_used)}",
        f"<b>Report standard:</b>&nbsp;&nbsp;EvalCards",
    ]
    for line in cover_lines:
        story.append(Paragraph(line, styles["cover_info"]))
        story.append(Spacer(1, 1.2 * mm))

    story.append(Spacer(1, 10 * mm))
    story.append(HRFlowable(width="100%", thickness=0.3, color=COLORS["border"], spaceAfter=4 * mm))

    # ── About this report ──
    story.append(Paragraph("About This Report", ParagraphStyle(
        "_aboutHdr", fontSize=11, leading=14, textColor=COLORS["primary"],
        fontName="Helvetica-Bold", spaceAfter=2 * mm,
    )))
    story.append(Paragraph(
        "This report documents the evaluation of large language model (LLM) performance "
        "using the <b>EvalCards</b> standard for structured AI evaluation reporting. "
        "It covers the models tested, datasets used, evaluation metrics and thresholds, "
        "detailed scoring results, and safety compliance considerations. "
        "The goal is to provide transparent, reproducible evidence of model behavior "
        "to support AI governance and compliance requirements.",
        styles["intro"],
    ))

    if metrics_all:
        metric_list = ", ".join(sorted(_format_metric_name(m) for m in metrics_all))
        story.append(Paragraph(
            f"<b>Metrics evaluated:</b>&nbsp;&nbsp;{metric_list}",
            styles["small"],
        ))
        story.append(Spacer(1, 2 * mm))

    story.append(PageBreak())

    # ── Executive Summary ──
    ai_executive = config.get("ai_executive_summary", "")
    ai_metric_summaries = config.get("ai_metric_summaries", {})

    if "executive-summary" in enabled_sections and experiments:
        story.extend(_section_header(styles, "1. Executive Summary"))

        if ai_executive:
            story.extend(_ai_summary_block(styles, ai_executive, "AI-Generated Executive Summary"))
            story.append(Spacer(1, 2 * mm))

        for exp in experiments:
            metrics = exp.get("metricSummaries", {})
            thresholds = exp.get("metricThresholds", {})
            entries = list(metrics.items())
            total = len(entries)
            passing = sum(
                1 for name, m in entries
                if _did_pass(m.get("averageScore", 0), thresholds.get(name, 0.5), _is_inverted_metric(name))
            )
            avg = (sum(m.get("averageScore", 0) for _, m in entries) / total) if total else 0

            if total == 0:
                verdict = "N/A"
            elif passing == total:
                verdict = "PASS"
            elif passing >= total * 0.7:
                verdict = "PARTIAL PASS"
            else:
                verdict = "FAIL"

            story.append(Paragraph(
                _safe_str(exp.get("name", exp.get("id", "Unknown"))),
                styles["body_accent"],
            ))
            story.append(Spacer(1, 1 * mm))
            story.append(_kv_table([
                ("Model", _safe_str(exp.get("model"))),
                ("Avg score", f"{avg * 100:.1f}%"),
                ("Metrics passing", f"{passing} / {total}"),
                ("Verdict", verdict),
                ("Samples", str(exp.get("totalSamples", 0))),
            ]))
            story.append(Spacer(1, 4 * mm))

    # ── Evaluation Context ──
    if "evaluation-context" in enabled_sections:
        story.extend(_section_header(styles, "2. Evaluation Context"))
        pairs = [
            ("Project", _safe_str(project_name)),
            ("Organization", _safe_str(org_name)),
            ("Report date", datetime.now().strftime("%B %d, %Y")),
            ("Experiments", str(len(experiments))),
        ]
        if experiments and experiments[0].get("useCase"):
            pairs.append(("Use case", experiments[0]["useCase"]))
        story.append(_kv_table(pairs))
        story.append(Spacer(1, 3 * mm))

    # ── Model Under Test ──
    if "model-under-test" in enabled_sections:
        story.extend(_section_header(styles, "3. Model Under Test"))
        for exp in experiments:
            story.append(Paragraph(
                _safe_str(exp.get("name", exp.get("id"))),
                styles["body_accent"],
            ))
            story.append(Spacer(1, 1 * mm))
            pairs = [
                ("Model", _safe_str(exp.get("model"))),
                ("Dataset", _safe_str(exp.get("dataset"))),
                ("Judge / Scorer", _safe_str(exp.get("judge") or exp.get("scorer"))),
                ("Created", _safe_str(exp.get("createdAt"))),
            ]
            if exp.get("duration"):
                pairs.append(("Duration", f"{exp['duration'] / 1000:.1f}s"))
            story.append(_kv_table(pairs))
            story.append(Spacer(1, 4 * mm))

    # ── Evaluation Setup ──
    if "evaluation-setup" in enabled_sections:
        story.extend(_section_header(styles, "4. Evaluation Setup"))
        for exp in experiments:
            story.append(Paragraph(
                _safe_str(exp.get("name", exp.get("id"))),
                styles["body_accent"],
            ))
            story.append(Spacer(1, 1 * mm))

            pairs = [("Total samples", str(exp.get("totalSamples", 0)))]

            thresholds = exp.get("metricThresholds", {})
            if thresholds:
                thresh_str = ", ".join(
                    f"{_format_metric_name(k)}: {v * 100:.0f}%"
                    for k, v in thresholds.items() if v is not None
                )
                if thresh_str:
                    pairs.append(("Thresholds", thresh_str))

            metric_names = [_format_metric_name(k) for k in exp.get("metricSummaries", {}).keys()]
            pairs.append(("Enabled metrics", ", ".join(metric_names) or "N/A"))
            story.append(_kv_table(pairs))
            story.append(Spacer(1, 4 * mm))

    # ── Metric Results ──
    if "metric-results" in enabled_sections:
        story.extend(_section_header(styles, "5. Metric Results"))

        for exp in experiments:
            summaries = exp.get("metricSummaries", {})
            thresholds = exp.get("metricThresholds", {})

            story.append(Paragraph(
                _safe_str(exp.get("name", exp.get("id"))),
                styles["body_accent"],
            ))
            story.append(Spacer(1, 3 * mm))

            quality = [(n, m) for n, m in summaries.items() if not _is_safety_metric(n)]
            safety = [(n, m) for n, m in summaries.items() if _is_safety_metric(n)]

            exp_name = exp.get("name", exp.get("id", "Unknown"))
            exp_ai = ai_metric_summaries.get(exp_name, {})

            if quality:
                story.append(Paragraph("Quality Metrics", styles["body_bold"]))
                story.append(Spacer(1, 2 * mm))
                table = _build_metric_table(quality, thresholds)
                if table:
                    story.append(table)
                    story.append(Spacer(1, 3 * mm))
                for metric_name, _ in quality:
                    summary_text = exp_ai.get(metric_name, "")
                    if summary_text:
                        block = _ai_summary_block(
                            styles, summary_text,
                            f"{_format_metric_name(metric_name)}",
                        )
                        story.append(KeepTogether(block))
                story.append(Spacer(1, 4 * mm))

            if safety:
                story.append(Paragraph("Safety Metrics", styles["body_bold"]))
                story.append(Spacer(1, 2 * mm))
                table = _build_metric_table(
                    safety, thresholds,
                    header_color=COLORS["safety_header"],
                    alt_row_color=COLORS["safety_row"],
                )
                if table:
                    story.append(table)
                    story.append(Spacer(1, 3 * mm))
                for metric_name, _ in safety:
                    summary_text = exp_ai.get(metric_name, "")
                    if summary_text:
                        block = _ai_summary_block(
                            styles, summary_text,
                            f"{_format_metric_name(metric_name)}",
                        )
                        story.append(KeepTogether(block))
                story.append(Spacer(1, 4 * mm))

    # ── Safety & Compliance ──
    if "safety-compliance" in enabled_sections:
        story.extend(_section_header(styles, "6. Safety & Compliance"))
        story.append(Paragraph(
            "This section highlights safety-relevant metrics in the context of AI governance "
            "frameworks such as the EU AI Act (Article 55) and the EvalCards standard for "
            "safety documentation.",
            styles["small"],
        ))
        story.append(Spacer(1, 3 * mm))

        for exp in experiments:
            summaries = exp.get("metricSummaries", {})
            thresholds = exp.get("metricThresholds", {})
            safety = [(n, m) for n, m in summaries.items() if _is_safety_metric(n)]

            if not safety:
                story.append(Paragraph(
                    "No safety metrics were evaluated for this experiment.",
                    ParagraphStyle("_warn", parent=styles["body"], textColor=COLORS["warning"]),
                ))
                continue

            story.append(Paragraph(
                _safe_str(exp.get("name", exp.get("id"))),
                styles["body_accent"],
            ))
            story.append(Spacer(1, 1 * mm))

            for name, m in safety:
                avg = m.get("averageScore", 0)
                threshold = thresholds.get(name, 0.5)
                inverted = _is_inverted_metric(name)
                passed = _did_pass(avg, threshold, inverted)
                pct = f"{avg * 100:.1f}%"
                status_color = "#16A34A" if passed else "#DC2626"
                status_text = "PASS" if passed else "FAIL"

                story.append(Paragraph(
                    f'<b>{_format_metric_name(name)}:</b>&nbsp;&nbsp;{pct}'
                    f'&nbsp;&nbsp;<font color="{status_color}"><b>{status_text}</b></font>',
                    styles["body"],
                ))

                if not passed:
                    if inverted:
                        note = (
                            f"Score of {pct} exceeds the {threshold * 100:.0f}% threshold. "
                            f"Review flagged samples and consider additional safeguards."
                        )
                    else:
                        note = (
                            f"Score of {pct} is below the {threshold * 100:.0f}% threshold. "
                            f"Further investigation recommended."
                        )
                    story.append(Paragraph(
                        f"&rarr; {note}",
                        ParagraphStyle("_dn", parent=styles["small"], textColor=COLORS["danger"]),
                    ))
            story.append(Spacer(1, 4 * mm))

    # ── Arena Comparison ──
    if "arena-comparison" in enabled_sections:
        arena_data = config.get("arenaData", [])
        if arena_data:
            story.extend(_section_header(styles, "7. Arena Comparison"))
            for arena in arena_data:
                story.append(Paragraph(
                    _safe_str(arena.get("name", arena.get("id"))),
                    styles["body_accent"],
                ))
                story.append(Spacer(1, 1 * mm))
                story.append(_kv_table([
                    ("Winner", _safe_str(arena.get("winner", "Tie"))),
                    ("Rounds", str(arena.get("rounds", 0))),
                    ("Criteria", ", ".join(str(c) for c in arena.get("criteria", []))),
                ]))
                story.append(Spacer(1, 2 * mm))

                contestants = arena.get("contestants", [])
                if contestants:
                    header = ["Model", "Wins", "Losses", "Ties", "Avg Score"]
                    rows = [header]
                    for c in contestants:
                        rows.append([
                            _safe_str(c.get("model")),
                            str(c.get("wins", 0)),
                            str(c.get("losses", 0)),
                            str(c.get("ties", 0)),
                            f"{c.get('avgScore', 0) * 100:.1f}%",
                        ])
                    col_widths = [45 * mm, 25 * mm, 25 * mm, 25 * mm, 30 * mm]
                    table = Table(rows, colWidths=col_widths, repeatRows=1)
                    table.setStyle(TableStyle([
                        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
                        ("TEXTCOLOR", (0, 0), (-1, 0), COLORS["white"]),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 8),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ("LINEBELOW", (0, 0), (-1, 0), 0.8, ACCENT),
                        ("LINEBELOW", (0, 1), (-1, -1), 0.3, COLORS["border"]),
                        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                    ]))
                    story.append(table)
                story.append(Spacer(1, 5 * mm))

    # ── Recommendations ──
    ai_recommendations = config.get("ai_recommendations", "")

    if "recommendations" in enabled_sections:
        story.extend(_section_header(styles, "8. Limitations & Recommendations"))

        if ai_recommendations:
            story.extend(_ai_summary_block(styles, ai_recommendations, "AI-Generated Limitations & Recommendations"))
            story.append(Spacer(1, 3 * mm))

        # Static fallback bullet points for failed metrics
        failed_metrics: List[str] = []
        for exp in experiments:
            summaries = exp.get("metricSummaries", {})
            thresholds = exp.get("metricThresholds", {})
            for name, m in summaries.items():
                avg = m.get("averageScore", 0)
                threshold = thresholds.get(name, 0.5)
                inverted = _is_inverted_metric(name)
                if not _did_pass(avg, threshold, inverted):
                    display = _format_metric_name(name)
                    exp_name = _safe_str(exp.get("name", exp.get("id")))
                    if inverted:
                        failed_metrics.append(
                            f"{display} score ({avg * 100:.1f}%) exceeds threshold in \"{exp_name}\"."
                        )
                    else:
                        failed_metrics.append(
                            f"{display} score ({avg * 100:.1f}%) is below threshold in \"{exp_name}\"."
                        )

        if failed_metrics:
            story.append(Paragraph("Failed Metrics Summary", styles["body_bold"]))
            story.append(Spacer(1, 2 * mm))
            for fm in failed_metrics:
                story.append(Paragraph(f"&bull;&nbsp;&nbsp;{fm}", styles["small"]))
                story.append(Spacer(1, 1.5 * mm))
        elif not ai_recommendations:
            story.append(Paragraph(
                "All evaluated metrics are within configured thresholds. Continue monitoring.",
                ParagraphStyle("_ok", parent=styles["body"], textColor=COLORS["success"]),
            ))

        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph(
            "<i>Note: This report follows the EvalCards framework for standardized "
            "AI evaluation documentation. Scores should be interpreted in the context "
            "of the specific dataset, judge model, and configured thresholds.</i>",
            styles["small"],
        ))

    # ── Page footer ──
    def _footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(COLORS["secondary"])
        canvas.drawString(MARGIN, 10 * mm, "VerifyWise — LLM Evaluation Report")
        canvas.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {canvas.getPageNumber()}")
        canvas.setStrokeColor(COLORS["border"])
        canvas.setLineWidth(0.3)
        canvas.line(MARGIN, 13 * mm, PAGE_W - MARGIN, 13 * mm)
        canvas.restoreState()

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


# ===================== CSV =====================

def generate_csv_report(
    experiments: List[Dict[str, Any]],
    project_name: str,
) -> str:
    """Generate CSV report content as a string."""
    import csv

    rows: List[List[str]] = []

    rows.append(["LLM Evaluation Report"])
    rows.append(["Project", project_name])
    rows.append(["Generated", datetime.now().isoformat()])
    rows.append([])

    rows.append(["EXPERIMENT SUMMARY"])
    rows.append(["Experiment", "Model", "Dataset", "Judge/Scorer", "Samples", "Status", "Created"])
    for exp in experiments:
        rows.append([
            _safe_str(exp.get("name", exp.get("id"))),
            _safe_str(exp.get("model")),
            _safe_str(exp.get("dataset"), ""),
            _safe_str(exp.get("judge") or exp.get("scorer"), ""),
            str(exp.get("totalSamples", 0)),
            _safe_str(exp.get("status")),
            _safe_str(exp.get("createdAt"), ""),
        ])
    rows.append([])

    rows.append(["METRIC RESULTS"])
    rows.append(["Experiment", "Metric", "Avg Score", "Pass Rate", "Min", "Max", "Threshold", "Status", "Category"])
    for exp in experiments:
        summaries = exp.get("metricSummaries", {})
        thresholds = exp.get("metricThresholds", {})
        for name, m in summaries.items():
            inverted = _is_inverted_metric(name)
            threshold = thresholds.get(name, 0.5)
            avg = m.get("averageScore", 0)
            passed = _did_pass(avg, threshold, inverted)
            rows.append([
                _safe_str(exp.get("name", exp.get("id"))),
                _format_metric_name(name),
                f"{avg * 100:.1f}%",
                f"{m.get('passRate', 0):.1f}%",
                f"{m.get('minScore', 0) * 100:.1f}%",
                f"{m.get('maxScore', 0) * 100:.1f}%",
                f"{threshold * 100:.0f}%",
                "PASS" if passed else "FAIL",
                "Safety" if _is_safety_metric(name) else "Quality",
            ])

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    for row in rows:
        writer.writerow(row)
    return output.getvalue()
