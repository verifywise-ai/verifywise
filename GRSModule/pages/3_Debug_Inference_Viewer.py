"""Debug Dataset & Inference Viewer.

Visualises the stratified debug sample and side-by-side model responses
from the inference stage (Bedrock models: Llama 3, Mistral Large, etc.)

Launch (from GRSModule/):
    uv run streamlit run viewer.py
Then navigate to "Debug Inference Viewer" in the sidebar.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "src"))

from io_utils.jsonl import read_jsonl  # noqa: E402

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

DEBUG_DIR = ROOT / "datasets" / "debug"
MANIFEST_PATH = DEBUG_DIR / "grs_debug_manifest.json"
SAMPLE_PATH = DEBUG_DIR / "grs_debug_sample.jsonl"
RESPONSES_DIR = DEBUG_DIR / "final" / "responses"
JUDGE_SCORES_DIR = DEBUG_DIR / "final" / "judge_scores"

DIMENSIONS = [
    "boundary_management",
    "constraint_adherence",
    "clarity_and_questions",
    "escalation_and_controls",
]
DIMENSION_LABELS = {
    "boundary_management": "Boundary Management",
    "constraint_adherence": "Constraint Adherence",
    "clarity_and_questions": "Clarity & Questions",
    "escalation_and_controls": "Escalation & Controls",
}

# ---------------------------------------------------------------------------
# Data loading (cached)
# ---------------------------------------------------------------------------


@st.cache_data(show_spinner="Loading manifest…")
def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        return {}
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


@st.cache_data(show_spinner="Loading debug sample…")
def load_sample() -> list[dict]:
    if not SAMPLE_PATH.exists():
        return []
    return list(read_jsonl(SAMPLE_PATH))


@st.cache_data(show_spinner="Loading responses…")
def load_responses() -> dict[str, dict[str, dict]]:
    """Returns {model_stem: {scenario_id: response_record}}."""
    if not RESPONSES_DIR.exists():
        return {}
    out: dict[str, dict[str, dict]] = {}
    for f in sorted(RESPONSES_DIR.glob("*.jsonl")):
        if f.name.endswith(".failures.jsonl"):
            continue
        stem = f.stem
        out[stem] = {r["scenario_id"]: r for r in read_jsonl(f)}
    return out


@st.cache_data(show_spinner="Loading judge scores…")
def load_judge_scores() -> dict[str, dict[str, dict]]:
    """Returns {model_stem: {scenario_id: judge_record}}."""
    if not JUDGE_SCORES_DIR.exists():
        return {}
    out: dict[str, dict[str, dict]] = {}
    for f in sorted(JUDGE_SCORES_DIR.glob("*.jsonl")):
        if f.name.endswith(".failures.jsonl"):
            continue
        stem = f.stem
        out[stem] = {r["scenario_id"]: r for r in read_jsonl(f)}
    return out


def grs_color(score: float | None) -> str:
    if score is None:
        return "#888"
    if score < 1.5:
        return "#b22222"
    if score < 2.5:
        return "#b8860b"
    return "#2d7a2d"


@st.cache_data(show_spinner="Loading failures…")
def load_failures() -> dict[str, list[dict]]:
    """Returns {model_stem: [failure_record, …]}."""
    if not RESPONSES_DIR.exists():
        return {}
    out: dict[str, list[dict]] = {}
    for f in sorted(RESPONSES_DIR.glob("*.failures.jsonl")):
        stem = f.stem.replace(".failures", "")
        out[stem] = list(read_jsonl(f))
    return out


# ---------------------------------------------------------------------------
# Styling helpers
# ---------------------------------------------------------------------------


def _pass_badge(passed: bool) -> str:
    if passed:
        return '<span style="background:#2d7a2d;color:#fff;padding:2px 10px;border-radius:4px;font-size:0.85em">PASS</span>'
    return '<span style="background:#b22222;color:#fff;padding:2px 10px;border-radius:4px;font-size:0.85em">FAIL</span>'


def risk_badge(risk: str) -> str:
    colors = {"low": "#2d7a2d", "medium": "#b8860b", "high": "#b22222"}
    bg = colors.get(risk, "#555")
    return f'<span style="background:{bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.8em">{risk.upper()}</span>'


def source_badge(source: str) -> str:
    colors = {"gpt": "#10a37f", "gemini": "#1a73e8", "claude": "#c96442"}
    bg = colors.get(source, "#555")
    return f'<span style="background:{bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.8em">{source.upper()}</span>'


# ---------------------------------------------------------------------------
# Tab 1 — Sample Overview
# ---------------------------------------------------------------------------


def render_overview(manifest: dict, scenarios: list[dict]) -> None:
    if not manifest:
        st.warning(f"Manifest not found at `{MANIFEST_PATH}`.")
        return

    # ---- Top-line metrics ------------------------------------------------
    final = manifest.get("final_sample", {})
    phase1 = manifest.get("phase1", {})
    phase2 = manifest.get("phase2", {})
    audit = manifest.get("audit", {})

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total scenarios", final.get("total_scenarios", "—"))
    col2.metric("Obligations covered", phase1.get("obligations_covered", "—"))
    col3.metric("Phase-1 drawn", phase1.get("scenarios_drawn", "—"))
    col4.metric("Phase-2 drawn", phase2.get("scenarios_drawn", "—"))

    # ---- Audit checks ----------------------------------------------------
    st.markdown("### Audit Results")
    checks = {
        "Sample size": audit.get("sample_size", {}),
        "ID uniqueness": audit.get("id_uniqueness", {}),
        "Source balance": audit.get("source_balance", {}),
        "Obligation coverage": audit.get("obligation_coverage", {}),
        "Dimension coverage": audit.get("dimension_coverage", {}),
    }
    cols = st.columns(len(checks))
    for col, (label, check) in zip(cols, checks.items()):
        passed = check.get("pass", False)
        note = check.get("note", "")
        col.markdown(f"**{label}**")
        col.markdown(_pass_badge(passed), unsafe_allow_html=True)
        if note:
            col.caption(note)

    overall = audit.get("overall_pass", False)
    st.markdown(
        f"**Overall:** {_pass_badge(overall)}",
        unsafe_allow_html=True,
    )

    st.divider()

    # ---- Source distribution (chart + phase breakdown) -------------------
    st.markdown("### Source Distribution")

    src_dist = final.get("source_distribution", {})
    if src_dist:
        src_df = pd.DataFrame(
            [{"Source": k.upper(), "Count": v} for k, v in src_dist.items()]
        )
        chart = (
            alt.Chart(src_df)
            .mark_bar()
            .encode(
                x=alt.X("Source:N", sort="-y", axis=alt.Axis(labelAngle=0)),
                y=alt.Y("Count:Q"),
                color=alt.Color(
                    "Source:N",
                    scale=alt.Scale(
                        domain=["GPT", "GEMINI", "CLAUDE"],
                        range=["#10a37f", "#1a73e8", "#c96442"],
                    ),
                    legend=None,
                ),
                tooltip=["Source", "Count"],
            )
            .properties(height=200)
        )
        st.altair_chart(chart, width="stretch")

        p1_src = phase1.get("source_distribution", {})
        p2_src = phase2.get("source_distribution", {})
        phase_df = pd.DataFrame(
            [
                {"Source": s.upper(), "Phase 1": p1_src.get(s, 0), "Phase 2": p2_src.get(s, 0)}
                for s in src_dist
            ]
        )
        st.dataframe(phase_df, hide_index=True, width="stretch")

    st.divider()

    # ---- Obligation coverage map -----------------------------------------
    st.markdown("### Obligation Coverage")
    coverage_map = phase1.get("coverage_map", {})
    if coverage_map:
        cov_rows = []
        for obl_id, src_sid in coverage_map.items():
            source, sid = src_sid.split(":") if ":" in src_sid else ("?", src_sid)
            cov_rows.append({"Obligation ID": obl_id, "Source": source.upper(), "Scenario ID": sid})
        cov_df = pd.DataFrame(cov_rows)
        st.dataframe(cov_df, hide_index=True, width="stretch")

    st.divider()

    # ---- Dimension distribution from scenarios --------------------------
    st.markdown("### Dimension Distribution (in sample)")
    if scenarios:
        dim_counts: dict[str, int] = {}
        for s in scenarios:
            d = s.get("primary_dimension", "")
            if d:
                dim_counts[d] = dim_counts.get(d, 0) + 1

        if dim_counts:
            dim_df = pd.DataFrame(
                [{"Dimension": k, "Count": v} for k, v in sorted(dim_counts.items(), key=lambda x: -x[1])]
            )
            dim_chart = (
                alt.Chart(dim_df)
                .mark_bar(color="#6a4c93")
                .encode(
                    x=alt.X("Dimension:N", sort="-y", axis=alt.Axis(labelAngle=-30)),
                    y="Count:Q",
                    tooltip=["Dimension", "Count"],
                )
                .properties(height=200)
            )
            st.altair_chart(dim_chart, width="stretch")

            dim_audit = audit.get("dimension_coverage", {})
            missing = dim_audit.get("missing_dimensions", [])
            if missing:
                st.warning(f"Missing dimensions in sample: {', '.join(f'`{m}`' for m in missing)}")

    st.divider()

    # ---- Domain / Risk breakdown ----------------------------------------
    st.markdown("### Domain & Risk Breakdown")
    if scenarios:
        domain_counts: dict[str, int] = {}
        risk_counts: dict[str, int] = {}
        for s in scenarios:
            d = s.get("domain", "unknown")
            domain_counts[d] = domain_counts.get(d, 0) + 1
            r = s.get("risk_level", "unknown")
            risk_counts[r] = risk_counts.get(r, 0) + 1

        col_a, col_b = st.columns(2)

        with col_a:
            st.markdown("**By domain**")
            dom_df = pd.DataFrame(
                [{"Domain": k, "Count": v} for k, v in sorted(domain_counts.items(), key=lambda x: -x[1])]
            )
            dom_chart = (
                alt.Chart(dom_df)
                .mark_bar(color="#1a6ab5")
                .encode(
                    x=alt.X("Count:Q"),
                    y=alt.Y("Domain:N", sort="-x"),
                    tooltip=["Domain", "Count"],
                )
                .properties(height=max(150, len(domain_counts) * 30))
            )
            st.altair_chart(dom_chart, width="stretch")

        with col_b:
            st.markdown("**By risk level**")
            risk_color_map = {"low": "#2d7a2d", "medium": "#b8860b", "high": "#b22222", "unknown": "#888"}
            risk_df = pd.DataFrame(
                [{"Risk": k, "Count": v, "color": risk_color_map.get(k, "#888")}
                 for k, v in sorted(risk_counts.items(), key=lambda x: -x[1])]
            )
            risk_chart = (
                alt.Chart(risk_df)
                .mark_arc(innerRadius=50)
                .encode(
                    theta="Count:Q",
                    color=alt.Color(
                        "Risk:N",
                        scale=alt.Scale(
                            domain=list(risk_color_map.keys()),
                            range=list(risk_color_map.values()),
                        ),
                    ),
                    tooltip=["Risk", "Count"],
                )
                .properties(height=200)
            )
            st.altair_chart(risk_chart, width="stretch")


# ---------------------------------------------------------------------------
# Tab 2 — Model Comparison
# ---------------------------------------------------------------------------


def render_model_comparison(scenarios: list[dict], all_responses: dict[str, dict[str, dict]]) -> None:
    if not scenarios:
        st.warning("No scenarios found in the debug sample.")
        return

    model_stems = sorted(all_responses.keys())

    # ---- Sidebar-style controls -----------------------------------------
    scenario_ids = [s["scenario_id"] for s in scenarios]
    sc_by_id = {s["scenario_id"]: s for s in scenarios}

    col_filter, col_select = st.columns([1, 2])

    with col_filter:
        all_sources = sorted({s.get("source", "") for s in scenarios if s.get("source")})
        all_risks = sorted({s.get("risk_level", "") for s in scenarios if s.get("risk_level")})
        source_filter = st.multiselect("Filter by source", all_sources, default=all_sources)
        risk_filter = st.multiselect("Filter by risk", all_risks, default=all_risks)

    filtered_ids = [
        sid for sid in scenario_ids
        if sc_by_id[sid].get("source", "") in source_filter
        and sc_by_id[sid].get("risk_level", "") in risk_filter
    ]

    with col_select:
        if not filtered_ids:
            st.warning("No scenarios match the current filters.")
            return
        selected_id = st.selectbox(
            f"Scenario ({len(filtered_ids)} matching)",
            filtered_ids,
            format_func=lambda sid: f"{sid}  [{sc_by_id[sid].get('source','?').upper()} · {sc_by_id[sid].get('risk_level','?')}]",
        )

    scenario = sc_by_id[selected_id]

    # ---- Scenario header -------------------------------------------------
    st.divider()
    c1, c2, c3, c4 = st.columns(4)
    c1.markdown(f"**ID:** `{selected_id}`")
    c2.markdown(source_badge(scenario.get("source", "?")), unsafe_allow_html=True)
    c3.markdown(risk_badge(scenario.get("risk_level", "")), unsafe_allow_html=True)
    c4.markdown(f"**Domain:** {scenario.get('domain', '—')}")

    # Obligation + mutation type pills
    obl_id = scenario.get("obligation_id", "")
    sc_type = scenario.get("scenario_type", "")
    mut_type = scenario.get("mutation_type", "")
    prim_dim = scenario.get("primary_dimension", "")
    if any([obl_id, sc_type, mut_type, prim_dim]):
        meta_parts = []
        if obl_id:
            meta_parts.append(f"`{obl_id}`")
        if sc_type:
            meta_parts.append(f"type: **{sc_type}**")
        if mut_type:
            meta_parts.append(f"mutation: **{mut_type}**")
        if prim_dim:
            meta_parts.append(f"dimension: **{prim_dim}**")
        st.markdown("  ·  ".join(meta_parts))

    # ---- Prompt ----------------------------------------------------------
    with st.expander("Prompt", expanded=False):
        st.text_area(
            label="prompt",
            value=scenario.get("prompt", ""),
            height=200,
            disabled=True,
            label_visibility="collapsed",
        )

    # ---- Governance triggers & constraints -------------------------------
    triggers = scenario.get("governance_triggers", {})
    if triggers:
        active = [k.replace("_", " ") for k, v in triggers.items() if v]
        if active:
            pills_html = " ".join(
                f'<span style="background:#1a6ab5;color:#fff;padding:2px 10px;'
                f'border-radius:12px;font-size:0.8em;margin:2px;display:inline-block">{t}</span>'
                for t in active
            )
            st.markdown(f"**Governance triggers:** {pills_html}", unsafe_allow_html=True)

    constraints = scenario.get("constraints", {})
    musts = constraints.get("must", [])
    must_nots = constraints.get("must_not", [])
    if musts or must_nots:
        with st.expander("Constraints"):
            if musts:
                st.markdown("**MUST:** " + " · ".join(f"`{m}`" for m in musts))
            if must_nots:
                st.markdown("**MUST NOT:** " + " · ".join(f"`{m}`" for m in must_nots))

    st.divider()

    # ---- Model responses side-by-side (2 panels with dropdowns) --------
    if not model_stems:
        st.info("No inference results found in `datasets/debug/final/responses/`.")
        return

    st.markdown("### Model Responses")

    col_left, col_right = st.columns(2)

    with col_left:
        model_left = st.selectbox(
            "Model",
            model_stems,
            index=0,
            key="compare_model_left",
        )
        resp_left = all_responses.get(model_left, {}).get(selected_id)
        if resp_left is None:
            st.warning("No response for this scenario.")
        else:
            raw = resp_left.get("raw", {})
            usage = raw.get("usage", {})
            in_tok = usage.get("inputTokens") or usage.get("prompt_tokens") or "—"
            out_tok = usage.get("outputTokens") or usage.get("completion_tokens") or "—"
            stop = raw.get("stopReason") or raw.get("finish_reason") or "—"
            st.caption(f"In: {in_tok} tok · Out: {out_tok} tok · Stop: {stop}")
            st.text_area(
                label=model_left,
                value=resp_left.get("output_text", ""),
                height=500,
                disabled=True,
                label_visibility="collapsed",
                key=f"compare_text_left_{selected_id}_{model_left}",
            )

    with col_right:
        model_right = st.selectbox(
            "Model",
            model_stems,
            index=min(1, len(model_stems) - 1),
            key="compare_model_right",
        )
        resp_right = all_responses.get(model_right, {}).get(selected_id)
        if resp_right is None:
            st.warning("No response for this scenario.")
        else:
            raw = resp_right.get("raw", {})
            usage = raw.get("usage", {})
            in_tok = usage.get("inputTokens") or usage.get("prompt_tokens") or "—"
            out_tok = usage.get("outputTokens") or usage.get("completion_tokens") or "—"
            stop = raw.get("stopReason") or raw.get("finish_reason") or "—"
            st.caption(f"In: {in_tok} tok · Out: {out_tok} tok · Stop: {stop}")
            st.text_area(
                label=model_right,
                value=resp_right.get("output_text", ""),
                height=500,
                disabled=True,
                label_visibility="collapsed",
                key=f"compare_text_right_{selected_id}_{model_right}",
            )


# ---------------------------------------------------------------------------
# Tab 3 — Failures
# ---------------------------------------------------------------------------


def render_failures(all_failures: dict[str, list[dict]]) -> None:
    total = sum(len(v) for v in all_failures.values())
    if total == 0:
        st.success("No failures recorded across all models.")
        return

    st.metric("Total failures", total)

    for stem, failures in sorted(all_failures.items()):
        if not failures:
            continue
        with st.expander(f"`{stem}` — {len(failures)} failure(s)"):
            for f in failures:
                st.markdown(f"**Scenario:** `{f.get('scenario_id', '—')}`")
                st.markdown(f"**Error type:** `{f.get('error_type', '—')}`")
                st.markdown(f"**Error:** {f.get('error', '—')}")
                tb = f.get("traceback", "")
                if tb:
                    st.code(tb, language="python")
                st.divider()


# ---------------------------------------------------------------------------
# Tab 4 — Evaluation
# ---------------------------------------------------------------------------


def render_evaluation(
    scenarios: list[dict],
    all_responses: dict[str, dict[str, dict]],
    all_judge_scores: dict[str, dict[str, dict]],
) -> None:
    if not scenarios:
        st.warning("No scenarios found in the debug sample.")
        return

    if not all_judge_scores:
        st.info(f"No judge scores found in `{JUDGE_SCORES_DIR.relative_to(ROOT)}`. Run the judge stage first.")
        return

    model_stems = sorted(all_judge_scores.keys())
    scenario_ids = [s["scenario_id"] for s in scenarios]
    sc_by_id = {s["scenario_id"]: s for s in scenarios}

    # ---- Filters + scenario selector ------------------------------------
    col_filter, col_select = st.columns([1, 2])

    with col_filter:
        all_sources = sorted({s.get("source", "") for s in scenarios if s.get("source")})
        all_risks = sorted({s.get("risk_level", "") for s in scenarios if s.get("risk_level")})
        source_filter = st.multiselect("Filter by source", all_sources, default=all_sources, key="eval_source")
        risk_filter = st.multiselect("Filter by risk", all_risks, default=all_risks, key="eval_risk")

    filtered_ids = [
        sid for sid in scenario_ids
        if sc_by_id[sid].get("source", "") in source_filter
        and sc_by_id[sid].get("risk_level", "") in risk_filter
    ]

    with col_select:
        if not filtered_ids:
            st.warning("No scenarios match the current filters.")
            return
        selected_id = st.selectbox(
            f"Scenario ({len(filtered_ids)} matching)",
            filtered_ids,
            format_func=lambda sid: f"{sid}  [{sc_by_id[sid].get('source','?').upper()} · {sc_by_id[sid].get('risk_level','?')}]",
            key="eval_scenario",
        )

    scenario = sc_by_id[selected_id]

    # ---- Scenario header ------------------------------------------------
    st.divider()
    c1, c2, c3, c4 = st.columns(4)
    c1.markdown(f"**ID:** `{selected_id}`")
    c2.markdown(source_badge(scenario.get("source", "?")), unsafe_allow_html=True)
    c3.markdown(risk_badge(scenario.get("risk_level", "")), unsafe_allow_html=True)
    c4.markdown(f"**Domain:** {scenario.get('domain', '—')}")

    with st.expander("Prompt", expanded=False):
        st.text_area(
            label="prompt",
            value=scenario.get("prompt", ""),
            height=200,
            disabled=True,
            label_visibility="collapsed",
            key=f"eval_prompt_{selected_id}",
        )

    st.divider()

    # ---- Per-model evaluation cards -------------------------------------
    st.markdown("### Evaluation Results")

    cols = st.columns(len(model_stems))
    for col, stem in zip(cols, model_stems):
        judge = all_judge_scores.get(stem, {}).get(selected_id)
        resp = all_responses.get(stem, {}).get(selected_id)

        with col:
            st.markdown(f"**`{stem}`**")

            if judge is None:
                st.warning("No judge score for this scenario.")
            else:
                grs = judge.get("grs_score")
                color = grs_color(grs)
                st.markdown(
                    f'<p style="font-size:2em;font-weight:bold;color:{color}">'
                    f'GRS {grs:.2f} <span style="font-size:0.5em;color:#888">/ 4.00</span></p>',
                    unsafe_allow_html=True,
                )
                if grs is not None:
                    st.progress(min(grs / 4.0, 1.0))

                st.caption(f"Judge: `{judge.get('judge_model_id', '—')}`")

                st.markdown("**Dimension Scores**")
                dim_map = {d["dimension_id"]: d for d in judge.get("dimension_scores", [])}
                for dim_id in DIMENSIONS:
                    ds = dim_map.get(dim_id, {})
                    score = ds.get("score")
                    label = DIMENSION_LABELS.get(dim_id, dim_id)
                    rationale = ds.get("rationale", "")
                    evidence = ds.get("evidence", [])

                    if score is not None:
                        st.markdown(f"_{label}_ — **{score}/4**")
                        st.progress(score / 4.0)
                    else:
                        st.markdown(f"_{label}_ — N/A")

                    if rationale or evidence:
                        with st.expander("Rationale"):
                            if rationale:
                                st.markdown(rationale)
                            if evidence:
                                st.markdown("**Evidence**")
                                for e in evidence:
                                    st.markdown(f"- {e}")

                flags = {k: v for k, v in (judge.get("flags") or {}).items() if v}
                if flags:
                    with st.expander("Flags"):
                        st.json(flags)

            st.divider()

            # Response text beneath the scores
            st.markdown("**Response**")
            if resp is None:
                st.warning("No response recorded.")
            else:
                st.text_area(
                    label=stem,
                    value=resp.get("output_text", ""),
                    height=300,
                    disabled=True,
                    label_visibility="collapsed",
                    key=f"eval_resp_{selected_id}_{stem}",
                )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    st.title("Debug Dataset & Inference Viewer")
    st.caption(
        f"Sample: `{SAMPLE_PATH.relative_to(ROOT)}`  ·  "
        f"Responses: `{RESPONSES_DIR.relative_to(ROOT)}`"
    )

    manifest = load_manifest()
    scenarios = load_sample()
    all_responses = load_responses()
    all_failures = load_failures()
    all_judge_scores = load_judge_scores()

    model_stems = sorted(all_responses.keys())
    n_with_resp = sum(
        1 for s in scenarios
        if any(s["scenario_id"] in all_responses.get(stem, {}) for stem in model_stems)
    )
    n_with_scores = sum(
        1 for s in scenarios
        if any(s["scenario_id"] in all_judge_scores.get(stem, {}) for stem in all_judge_scores)
    )

    # Top-line header metrics
    hc1, hc2, hc3, hc4 = st.columns(4)
    hc1.metric("Scenarios in sample", len(scenarios))
    hc2.metric("Models with responses", len(model_stems))
    hc3.metric("Scenarios with ≥1 response", n_with_resp)
    hc4.metric("Scenarios with judge scores", n_with_scores)

    st.divider()

    tab_overview, tab_compare, tab_eval, tab_failures = st.tabs(
        ["Sample Overview", "Model Comparison", "Evaluation", "Failures"]
    )

    with tab_overview:
        render_overview(manifest, scenarios)

    with tab_compare:
        render_model_comparison(scenarios, all_responses)

    with tab_eval:
        render_evaluation(scenarios, all_responses, all_judge_scores)

    with tab_failures:
        render_failures(all_failures)


main()
