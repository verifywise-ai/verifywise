"""GRS Scenario Viewer — overview page."""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "src"))

from io_utils.jsonl import read_jsonl  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DATASETS_DIR = ROOT / "datasets"
DIMENSIONS = [
    "boundary_management",
    "constraint_adherence",
    "clarity_and_questions",
    "escalation_and_controls",
]
DIMENSION_LABELS = {
    "boundary_management": "Boundary",
    "constraint_adherence": "Constraint",
    "clarity_and_questions": "Clarity",
    "escalation_and_controls": "Escalation",
}

# ---------------------------------------------------------------------------
# Data loading (cached)
# ---------------------------------------------------------------------------


def _normalize(sc: dict) -> dict:
    """Ensure scenario always has a 'scenario_id' key (base scenarios use base_scenario_id)."""
    if "scenario_id" not in sc:
        sc = {**sc, "scenario_id": sc.get("base_scenario_id", "")}
    return sc


def _dir_fingerprint(version: str) -> float:
    """Return max mtime of all .jsonl files in the version directory for cache invalidation."""
    version_dir = DATASETS_DIR / version
    if not version_dir.exists():
        return 0.0
    return max(
        (p.stat().st_mtime for p in version_dir.rglob("*.jsonl")),
        default=0.0,
    )


def _find_scenarios_path(version: str) -> tuple[Path, str]:
    """Return (path, label) for the best available scenario file."""
    final_path = DATASETS_DIR / version / "final" / "scenarios.jsonl"
    if final_path.exists():
        return final_path, "final"
    inter_path = DATASETS_DIR / version / "intermediate" / "base_scenarios_deduped.jsonl"
    if inter_path.exists():
        return inter_path, "intermediate"
    return final_path, "final"  # will simply be empty


@st.cache_data(show_spinner="Loading dataset…")
def load_dataset(version: str, model_stem: str, mtime: float) -> list[dict]:
    """Merge scenarios, responses, and judge scores into flat rows."""
    scenarios_path, _ = _find_scenarios_path(version)
    scenarios: dict[str, dict] = {}
    if scenarios_path.exists():
        for r in read_jsonl(scenarios_path):
            r = _normalize(r)
            scenarios[r["scenario_id"]] = r

    responses: dict[str, dict] = {}
    if model_stem:
        resp_path = DATASETS_DIR / version / "final" / "responses" / f"{model_stem}.jsonl"
        if resp_path.exists():
            responses = {r["scenario_id"]: r for r in read_jsonl(resp_path)}

    judge_scores: dict[str, dict] = {}
    if model_stem:
        judge_path = DATASETS_DIR / version / "final" / "judge_scores" / f"{model_stem}.jsonl"
        if judge_path.exists():
            judge_scores = {r["scenario_id"]: r for r in read_jsonl(judge_path)}

    rows: list[dict] = []
    for sid, sc in scenarios.items():
        resp = responses.get(sid, {})
        judge = judge_scores.get(sid, {})

        # Flatten dimension scores
        dim_map: dict[str, dict] = {}
        for ds in judge.get("dimension_scores", []):
            dim_map[ds["dimension_id"]] = ds

        mutation_family = ""
        mutations = sc.get("mutation_trace", {}).get("mutations", [])
        if mutations:
            mutation_family = mutations[0].get("family", "")

        raw = resp.get("raw", {})
        usage = raw.get("usage", {})

        row = {
            "scenario_id": sid,
            "domain": sc.get("domain", ""),
            "industry": sc.get("industry", ""),
            "risk_level": sc.get("risk_level", ""),
            "mutation_family": mutation_family,
            "grs_score": judge.get("grs_score"),
            **{f"score_{d}": dim_map.get(d, {}).get("score") for d in DIMENSIONS},
            # --- full objects for the detail panel ---
            "_scenario": sc,
            "_response": resp,
            "_judge": judge,
            "_dim_map": dim_map,
            # --- response stats ---
            "latency_ms": raw.get("latency_ms"),
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "total_tokens": usage.get("total_tokens"),
            "cost": usage.get("cost"),
        }
        rows.append(row)

    return rows


# ---------------------------------------------------------------------------
# Discovery helpers
# ---------------------------------------------------------------------------


def discover_versions() -> list[str]:
    if not DATASETS_DIR.exists():
        return []
    return sorted(d.name for d in DATASETS_DIR.iterdir() if d.is_dir())


def discover_models(version: str) -> list[str]:
    resp_dir = DATASETS_DIR / version / "final" / "responses"
    if not resp_dir.exists():
        return []
    return sorted(
        f.stem
        for f in resp_dir.glob("*.jsonl")
        if not f.name.endswith(".failures.jsonl")
    )


# ---------------------------------------------------------------------------
# Styling helpers
# ---------------------------------------------------------------------------


def risk_badge(risk: str) -> str:
    colors = {"low": "#2d7a2d", "medium": "#b8860b", "high": "#b22222"}
    bg = colors.get(risk, "#555")
    return f'<span style="background:{bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.8em">{risk.upper()}</span>'


def grs_color(score: float | None) -> str:
    if score is None:
        return "#888"
    if score < 1.5:
        return "#b22222"
    if score < 2.5:
        return "#b8860b"
    return "#2d7a2d"


def pill(text: str, color: str) -> str:
    return (
        f'<span style="background:{color};color:#fff;padding:2px 10px;'
        f'border-radius:12px;font-size:0.8em;margin:2px;display:inline-block">{text}</span>'
    )


# ---------------------------------------------------------------------------
# Detail panel
# ---------------------------------------------------------------------------


def render_detail(row: dict) -> None:
    sc: dict = row["_scenario"]
    resp: dict = row["_response"]
    judge: dict = row["_judge"]
    dim_map: dict[str, dict] = row["_dim_map"]

    st.markdown(f"### Scenario `{row['scenario_id']}`")
    col1, col2, col3 = st.columns(3)
    if row["risk_level"]:
        col1.markdown(risk_badge(row["risk_level"]), unsafe_allow_html=True)
    else:
        col1.markdown("*risk level not yet assigned*")
    col2.markdown(f"**Domain:** {row['domain']}")
    if row["industry"]:
        col3.markdown(f"**Industry:** {row['industry']}")

    tab_sc, tab_resp, tab_eval, tab_trace = st.tabs(
        ["Scenario", "Response", "Evaluation", "Trace"]
    )

    # ------------------------------------------------------------------
    # Scenario tab
    # ------------------------------------------------------------------
    with tab_sc:
        role_ctx = sc.get("role_context", {})
        st.markdown("#### Role Context")
        st.markdown(f"**Assistant role:** {role_ctx.get('assistant_role', '—')}")
        st.markdown(f"**User role:** {role_ctx.get('user_role', '—')}")
        st.markdown(f"**Org context:** {role_ctx.get('org_context', '—')}")

        st.markdown("#### Prompt")
        st.text_area("Prompt", value=sc.get("prompt", ""), height=200, disabled=True, label_visibility="collapsed")

        constraints = sc.get("constraints", {})
        if constraints:
            st.markdown("#### Constraints")
            musts = constraints.get("must", [])
            must_nots = constraints.get("must_not", [])

            if musts:
                st.markdown("**MUST**")
                pills_html = " ".join(pill(m, "#2d7a2d") for m in musts)
                st.markdown(pills_html, unsafe_allow_html=True)
            if must_nots:
                st.markdown("**MUST NOT**")
                pills_html = " ".join(pill(m, "#b22222") for m in must_nots)
                st.markdown(pills_html, unsafe_allow_html=True)

            fmt = constraints.get("format", {})
            if fmt.get("required"):
                st.markdown(f"**Format required:** {fmt.get('type', '')} — {fmt.get('notes', '')}")

        triggers = sc.get("governance_triggers", {})
        if triggers:
            st.markdown("#### Governance Triggers")
            active = [k for k, v in triggers.items() if v]
            inactive = [k for k, v in triggers.items() if not v]
            if active:
                st.markdown(" ".join(pill(t.replace("_", " "), "#1a6ab5") for t in active), unsafe_allow_html=True)
            if inactive:
                inactive_html = " ".join(
                    f'<span style="background:#ccc;color:#555;padding:2px 10px;border-radius:12px;font-size:0.8em;margin:2px;display:inline-block">{t.replace("_", " ")}</span>'
                    for t in inactive
                )
                st.markdown(inactive_html, unsafe_allow_html=True)

        metadata = sc.get("metadata", {})
        tension_signals = metadata.get("tension_signals", {})
        if tension_signals:
            active_sig = [k for k, v in tension_signals.items() if v]
            inactive_sig = [k for k, v in tension_signals.items() if not v]
            st.markdown("#### Tension Signals")
            sig_html = ""
            if active_sig:
                sig_html += " ".join(pill(s.replace("_", " "), "#6a4c93") for s in active_sig)
            if inactive_sig:
                sig_html += " " + " ".join(
                    f'<span style="background:#ccc;color:#555;padding:2px 10px;border-radius:12px;'
                    f'font-size:0.8em;margin:2px;display:inline-block">{s.replace("_", " ")}</span>'
                    for s in inactive_sig
                )
            if sig_html:
                st.markdown(sig_html, unsafe_allow_html=True)

        reasoning = metadata.get("semantic_reasoning", "")
        used_fallback = metadata.get("used_heuristic_fallback", False)
        if reasoning or used_fallback:
            with st.expander("Semantic validation details"):
                if used_fallback:
                    st.info("Validated via heuristic fallback (MockChatClient — no LLM call).")
                if reasoning:
                    st.markdown(f"**Reasoning:** {reasoning}")

        reasons = sc.get("risk_reasons", [])
        if reasons:
            st.markdown("#### Risk Reasons")
            st.markdown(", ".join(f"`{r}`" for r in reasons))

        render_vars = sc.get("render_vars", {})
        if render_vars:
            st.markdown("#### Render Vars")
            st.json(render_vars)

    # ------------------------------------------------------------------
    # Response tab
    # ------------------------------------------------------------------
    with tab_resp:
        if not resp:
            st.info("No response recorded for this scenario.")
        else:
            st.markdown(f"**Model:** `{resp.get('model_id', '—')}`")
            st.markdown(f"**Provider:** {resp.get('provider', '—')}")
            finish_reason = resp.get('raw', {}).get('finish_reason', '—')
            st.markdown(f"**Finish reason:** {finish_reason}")
            if finish_reason == "length":
                reasoning_tokens = resp.get("raw", {}).get("usage", {}).get("completion_tokens_details", {}).get("reasoning_tokens", 0)
                st.warning(
                    f"⚠️ **Response was cut off** (`finish_reason=length`). "
                    f"The model hit the `max_tokens` limit before finishing its response. "
                    + (f"Reasoning tokens consumed: **{reasoning_tokens}** of the budget. " if reasoning_tokens else "")
                    + "Re-run inference with a higher `--max-tokens` value."
                )

            col_a, col_b, col_c, col_d = st.columns(4)
            col_a.metric("Latency", f"{row['latency_ms']} ms" if row["latency_ms"] else "—")
            col_b.metric("Prompt tokens", row["prompt_tokens"] or "—")
            col_c.metric("Completion tokens", row["completion_tokens"] or "—")
            col_d.metric("Cost", f"${row['cost']:.6f}" if row["cost"] is not None else "—")

            st.markdown("#### Model Output")
            st.text_area("Model Output", value=resp.get("output_text", ""), height=300, disabled=True, label_visibility="collapsed")

    # ------------------------------------------------------------------
    # Evaluation tab
    # ------------------------------------------------------------------
    with tab_eval:
        if not judge:
            st.info("No evaluation recorded for this scenario.")
        else:
            grs = row["grs_score"]
            color = grs_color(grs)
            st.markdown(
                f'<p style="font-size:2.5em;font-weight:bold;color:{color}">'
                f"GRS {grs:.2f} <span style='font-size:0.5em;color:#888'>/ 4.00</span></p>",
                unsafe_allow_html=True,
            )
            st.progress(min(grs / 4.0, 1.0))

            st.markdown(f"**Judge model:** `{judge.get('judge_model_id', '—')}`")

            st.markdown("#### Dimension Scores")
            for dim in DIMENSIONS:
                ds = dim_map.get(dim, {})
                score = ds.get("score")
                rationale = ds.get("rationale", "")
                label = DIMENSION_LABELS.get(dim, dim)
                if score is not None:
                    st.markdown(f"**{label}** — {score}/4")
                    st.progress(score / 4.0)
                else:
                    st.markdown(f"**{label}** — N/A")
                if rationale:
                    with st.expander("Rationale"):
                        st.markdown(rationale)

            flags = judge.get("flags", {})
            if flags:
                st.markdown("#### Flags")
                st.json(flags)

    # ------------------------------------------------------------------
    # Trace tab
    # ------------------------------------------------------------------
    with tab_trace:
        mutation_trace = sc.get("mutation_trace", {})
        seed_trace = sc.get("seed_trace", {})

        if mutation_trace:
            st.markdown("#### Mutation Chain")
            base_id = mutation_trace.get("base_scenario_id", "—")
            st.markdown(f"**Base scenario:** `{base_id}` → `{row['scenario_id']}`")

            mutations = mutation_trace.get("mutations", [])
            if mutations:
                for m in mutations:
                    st.markdown(
                        f"- **Family:** `{m.get('family', '—')}` | **ID:** `{m.get('mutation_id', '—')}`"
                    )
                    params = m.get("params", {})
                    if params:
                        st.json(params)
            else:
                st.markdown("_No mutations recorded._")
        else:
            st.markdown("#### Base Scenario")
            st.markdown(f"**ID:** `{sc.get('base_scenario_id', sc.get('scenario_id', '—'))}`")
            st.markdown(f"**Obligation:** `{sc.get('obligation_id', '—')}`")
            st.markdown(f"**Template:** `{sc.get('template_id', '—')}`")

        if seed_trace:
            st.markdown("#### Obligation Sources")
            sources = seed_trace.get("sources", [])
            obl_ids = seed_trace.get("obligation_ids", [])
            if obl_ids:
                st.markdown(f"**Obligation IDs:** {', '.join(f'`{o}`' for o in obl_ids)}")
            if sources:
                for src in sources:
                    st.markdown(
                        f"- **{src.get('source_type', '?')}** — {src.get('source_ref', '?')} "
                        f"(excerpt `{src.get('excerpt_id', '?')}`)"
                    )


# ---------------------------------------------------------------------------
# Page
# ---------------------------------------------------------------------------


def main() -> None:
    st.title("GRS Scenario Viewer")

    # ------------------------------------------------------------------
    # Sidebar — selectors & filters
    # ------------------------------------------------------------------
    with st.sidebar:
        st.header("Dataset")

        versions = discover_versions()
        if not versions:
            st.error(f"No dataset versions found in `{DATASETS_DIR}`.")
            st.stop()

        version = st.selectbox("Version", versions, index=len(versions) - 1)

        models = discover_models(version)
        if models:
            model_stem = st.selectbox("Model", models)
        else:
            model_stem = ""
            _, stage = _find_scenarios_path(version)
            if stage == "intermediate":
                st.info("Showing base scenarios (render stage). Run `make validate` and `make infer` for full results.")
            else:
                st.info("No inference results yet. Run `make infer` to add model responses.")

        st.divider()
        st.header("Filters")

    # ------------------------------------------------------------------
    # Load data
    # ------------------------------------------------------------------
    rows = load_dataset(version, model_stem, _dir_fingerprint(version))

    if not rows:
        st.warning("No scenarios found. Run `make render` (or `make validate`) to generate them.")
        st.stop()

    # Derive filter options from the data
    all_risks = sorted({r["risk_level"] for r in rows if r["risk_level"]})
    all_domains = sorted({r["domain"] for r in rows if r["domain"]})
    scored_rows = [r for r in rows if r["grs_score"] is not None]

    with st.sidebar:
        risk_filter = st.multiselect("Risk level", all_risks, default=all_risks)
        domain_filter = st.multiselect("Domain", all_domains, default=all_domains)
        if scored_rows:
            grs_range = st.slider(
                "GRS score range",
                min_value=0.0,
                max_value=4.0,
                value=(0.0, 4.0),
                step=0.1,
            )
        else:
            grs_range = (0.0, 4.0)

    # ------------------------------------------------------------------
    # Apply filters
    # ------------------------------------------------------------------
    filtered: list[dict] = []
    for r in rows:
        if all_risks and r["risk_level"] not in risk_filter:
            continue
        if all_domains and r["domain"] not in domain_filter:
            continue
        grs = r["grs_score"]
        if grs is not None and not (grs_range[0] <= grs <= grs_range[1]):
            continue
        filtered.append(r)

    st.markdown(f"**{len(filtered)}** of **{len(rows)}** scenarios")

    if not filtered:
        st.info("No scenarios match the current filters.")
        st.stop()

    # ------------------------------------------------------------------
    # Overview table
    # ------------------------------------------------------------------
    import pandas as pd

    table_data = []
    for r in filtered:
        def _fmt_score(v):
            return f"{v:.0f}" if v is not None else "—"

        table_data.append(
            {
                "ID": r["scenario_id"],
                "Domain": r["domain"],
                "Risk": r["risk_level"] or "—",
                "Mutation family": r["mutation_family"] or "—",
                "GRS": f"{r['grs_score']:.2f}" if r["grs_score"] is not None else "—",
                "Boundary": _fmt_score(r.get("score_boundary_management")),
                "Constraint": _fmt_score(r.get("score_constraint_adherence")),
                "Clarity": _fmt_score(r.get("score_clarity_and_questions")),
                "Escalation": _fmt_score(r.get("score_escalation_and_controls")),
            }
        )

    df = pd.DataFrame(table_data)

    st.markdown("### Overview")

    scenario_ids = [r["scenario_id"] for r in filtered]

    if len(scenario_ids) > 20:
        selected_id = st.selectbox("Select scenario", scenario_ids)
    else:
        st.dataframe(df, width="stretch", hide_index=True)
        selected_id = st.radio(
            "Select scenario for details",
            scenario_ids,
            horizontal=True,
        )

    selected_row = next((r for r in filtered if r["scenario_id"] == selected_id), None)

    st.divider()

    if selected_row:
        render_detail(selected_row)
    else:
        st.info("Select a scenario above to view details.")


main()
