"""GRS Validation Playground — interactive semantic validator.

Launch (from GRSModule/):
    uv run streamlit run viewer.py
Then navigate to "Validation Playground" in the sidebar.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "src"))

from validate.semantic import (  # noqa: E402
    SYSTEM_PROMPT,
    SemanticParseError,
    SemanticResult,
    _parse_llm_response,
    _GOVERNANCE_TRIGGER_KEYS,
    _TENSION_SIGNAL_KEYS,
)
from llm.openrouter import OpenRouterChatClient  # noqa: E402
from llm.retry import retry_with_backoff, RetryConfig  # noqa: E402


# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------

def _init_session_state() -> None:
    if "playground_system_prompt" not in st.session_state:
        st.session_state["playground_system_prompt"] = SYSTEM_PROMPT
    if "playground_result" not in st.session_state:
        st.session_state["playground_result"] = None


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------

def _render_sidebar() -> tuple[str, float, bool]:
    """Render sidebar config. Returns (model_id, temperature, api_key_ok)."""
    with st.sidebar:
        st.header("Model Config")
        model_id = st.text_input("Model ID", value="openai/gpt-4o-mini")
        temperature = st.slider(
            "Temperature",
            min_value=0.0,
            max_value=1.0,
            value=0.0,
            step=0.05,
        )
        st.divider()
        api_key = os.environ.get("OPENROUTER_API_KEY", "")
        if api_key:
            st.markdown(
                '<span style="color:#2d7a2d">✓ API key set</span>',
                unsafe_allow_html=True,
            )
            api_key_ok = True
        else:
            st.error("✗ OPENROUTER_API_KEY not set")
            api_key_ok = False
    return model_id, temperature, api_key_ok


# ---------------------------------------------------------------------------
# Style helpers
# ---------------------------------------------------------------------------

def pill(text: str, color: str) -> str:
    return (
        f'<span style="background:{color};color:#fff;padding:2px 10px;'
        f'border-radius:12px;font-size:0.8em;margin:2px;display:inline-block">{text}</span>'
    )


# ---------------------------------------------------------------------------
# Column renderers
# ---------------------------------------------------------------------------

def _render_left_column() -> str:
    """Render system prompt editor. Returns current system prompt text."""
    st.subheader("System Prompt")
    if st.button("Reset to default"):
        st.session_state["playground_system_prompt"] = SYSTEM_PROMPT
        if "playground_system_prompt_area" in st.session_state:
            del st.session_state["playground_system_prompt_area"]

    system_prompt = st.text_area(
        label="system_prompt",
        value=st.session_state["playground_system_prompt"],
        height=420,
        label_visibility="collapsed",
        key="playground_system_prompt_area",
    )
    # Keep session state in sync with the text area value
    st.session_state["playground_system_prompt"] = system_prompt
    return system_prompt


def _render_right_column_inputs(api_key_ok: bool) -> tuple[str, bool]:
    """Render scenario text area and validate button. Returns (scenario_text, submitted)."""
    scenario = st.text_area(
        label="scenario",
        placeholder="Paste a scenario here…",
        height=200,
        label_visibility="collapsed",
    )

    button_disabled = not api_key_ok or not scenario.strip()
    submitted = st.button(
        "▶ Validate",
        disabled=button_disabled,
        type="primary",
    )
    return scenario, submitted


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _run_validation(
    model_id: str,
    temperature: float,
    system_prompt: str,
    scenario: str,
) -> SemanticResult:
    """Call OpenRouter with the given system prompt and scenario. Returns SemanticResult.

    Raises:
        SemanticParseError: if the LLM response cannot be parsed.
        RuntimeError: on OpenRouter API HTTP errors (4xx/5xx).
        Exception: other network/transport errors propagated from retry_with_backoff.
    """
    client = OpenRouterChatClient(model_id=model_id)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": scenario},
    ]
    result = retry_with_backoff(
        lambda: client.chat(
            messages=messages,
            temperature=temperature,
            max_tokens=400,
        ),
        RetryConfig(),
    )
    data = _parse_llm_response(result.text)
    governance_triggers = {k: bool(data["governance_triggers"][k]) for k in _GOVERNANCE_TRIGGER_KEYS}
    tension_signals = {k: bool(data["tension_signals"][k]) for k in _TENSION_SIGNAL_KEYS}
    # Recompute valid_scenario from detected signals, mirroring SemanticValidator.validate()
    # so the playground badge matches production validation behaviour.
    valid_scenario = any(governance_triggers.values()) and any(tension_signals.values())
    return SemanticResult(
        valid_scenario=valid_scenario,
        realistic_scenario=bool(data["realistic_scenario"]),
        governance_triggers=governance_triggers,
        tension_signals=tension_signals,
        reasoning=str(data.get("reasoning", "")),
        used_heuristic_fallback=False,
    )


def _render_result(result: SemanticResult) -> None:
    """Render the structured SemanticResult as badges, pills, reasoning, and raw JSON."""
    st.divider()

    # Verdict badges
    valid_color = "#2d7a2d" if result.valid_scenario else "#b22222"
    valid_label = "VALID" if result.valid_scenario else "INVALID"
    realistic_color = "#2d7a2d" if result.realistic_scenario else "#b22222"
    realistic_label = "REALISTIC" if result.realistic_scenario else "UNREALISTIC"
    st.markdown(
        pill(valid_label, valid_color) + "&nbsp;&nbsp;" + pill(realistic_label, realistic_color),
        unsafe_allow_html=True,
    )

    st.markdown("**Governance triggers:**")
    trigger_html = " ".join(
        pill(k.replace("_", " "), "#1a6ab5") if v
        else f'<span style="background:#ccc;color:#555;padding:2px 10px;border-radius:12px;'
             f'font-size:0.8em;margin:2px;display:inline-block">{k.replace("_", " ")}</span>'
        for k, v in result.governance_triggers.items()
    )
    st.markdown(trigger_html, unsafe_allow_html=True)

    st.markdown("**Tension signals:**")
    signal_html = " ".join(
        pill(k.replace("_", " "), "#6a4c93") if v
        else f'<span style="background:#ccc;color:#555;padding:2px 10px;border-radius:12px;'
             f'font-size:0.8em;margin:2px;display:inline-block">{k.replace("_", " ")}</span>'
        for k, v in result.tension_signals.items()
    )
    st.markdown(signal_html, unsafe_allow_html=True)

    if result.reasoning:
        st.markdown("**Reasoning:**")
        st.markdown(result.reasoning)

    with st.expander("Raw JSON"):
        st.json({
            "valid_scenario": result.valid_scenario,
            "realistic_scenario": result.realistic_scenario,
            "governance_triggers": result.governance_triggers,
            "tension_signals": result.tension_signals,
            "reasoning": result.reasoning,
            "used_heuristic_fallback": result.used_heuristic_fallback,
        })


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    st.title("Validation Playground")
    st.caption("Send any scenario to the semantic validator and inspect the model's reasoning.")

    _init_session_state()
    model_id, temperature, api_key_ok = _render_sidebar()

    left_col, right_col = st.columns([1, 1.2])

    with left_col:
        system_prompt = _render_left_column()

    with right_col:
        st.subheader("Scenario")
        scenario, submitted = _render_right_column_inputs(api_key_ok)

        if submitted:
            with st.spinner("Calling model…"):
                try:
                    result = _run_validation(model_id, temperature, system_prompt, scenario)
                    st.session_state["playground_result"] = result
                except SemanticParseError as exc:
                    st.session_state["playground_result"] = {"error": "parse", "detail": str(exc)}
                except Exception as exc:
                    st.session_state["playground_result"] = {"error": "api", "detail": str(exc)}

        stored = st.session_state["playground_result"]
        if stored is not None:
            if isinstance(stored, SemanticResult):
                _render_result(stored)
            elif isinstance(stored, dict) and stored.get("error") == "parse":
                st.warning("LLM response could not be parsed.")
                with st.expander("Raw response"):
                    st.text(stored.get("detail", ""))
            elif isinstance(stored, dict) and stored.get("error") == "api":
                st.error(f"API error: {stored.get('detail', '')}")


main()
