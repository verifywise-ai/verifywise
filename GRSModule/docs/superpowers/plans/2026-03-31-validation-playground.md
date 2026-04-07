# Validation Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Streamlit page that lets a user paste a scenario, optionally edit the system prompt, call the OpenRouter validation model, and see the full structured result interactively.

**Architecture:** Two files change — `viewer.py` gets a third page registration, and a new `pages/2_Validation_Playground.py` implements the full UI. The page calls the LLM client directly (bypassing `SemanticValidator.validate()`, which hardcodes `SYSTEM_PROMPT`) using `OpenRouterChatClient`, then parses the response with the existing `_parse_llm_response` helper from `semantic.py`. All session state is managed with two `st.session_state` keys.

**Tech Stack:** Python 3.12, Streamlit, existing `src/llm/openrouter.py`, `src/validate/semantic.py`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `viewer.py` | Register third page |
| Create | `pages/2_Validation_Playground.py` | Full playground UI |

---

### Task 1: Register the new page in viewer.py

**Files:**
- Modify: `viewer.py`

- [ ] **Step 1: Add the page entry**

Open `viewer.py`. The current `st.navigation` call is:

```python
pg = st.navigation(
    [
        st.Page("pages/GRS_Scenario_Viewer.py", title="GRS Scenario Viewer", icon="🔍"),
        st.Page("pages/1_Scenario_Inspector.py", title="Scenario Inspector", icon="🔬"),
    ]
)
```

Replace it with:

```python
pg = st.navigation(
    [
        st.Page("pages/GRS_Scenario_Viewer.py", title="GRS Scenario Viewer", icon="🔍"),
        st.Page("pages/1_Scenario_Inspector.py", title="Scenario Inspector", icon="🔬"),
        st.Page("pages/2_Validation_Playground.py", title="Validation Playground", icon="🧪"),
    ]
)
```

- [ ] **Step 2: Verify the app still loads (the new page file doesn't exist yet — Streamlit will error on navigate, not on startup)**

```bash
cd /path/to/GRSModule
uv run streamlit run viewer.py
```

Expected: app starts, two existing pages work, "Validation Playground" entry visible in sidebar. Clicking it shows a Streamlit file-not-found error — that's expected until Task 2.

- [ ] **Step 3: Commit**

```bash
git add viewer.py
git commit -m "feat(viewer): register Validation Playground page"
```

---

### Task 2: Scaffold the page — imports, sys.path, session state, sidebar

**Files:**
- Create: `pages/2_Validation_Playground.py`

- [ ] **Step 1: Create the file with imports and path setup**

`pages/2_Validation_Playground.py` must add `src/` to `sys.path` the same way the other pages do. Create the file:

```python
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
```

- [ ] **Step 2: Add session state initialisation and the sidebar**

Append to the same file:

```python
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
```

- [ ] **Step 3: Add a minimal `main()` and call it**

Append:

```python
# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    st.title("Validation Playground")
    st.caption("Send any scenario to the semantic validator and inspect the model's reasoning.")

    _init_session_state()
    model_id, temperature, api_key_ok = _render_sidebar()


main()
```

- [ ] **Step 4: Verify the page loads**

```bash
uv run streamlit run viewer.py
```

Expected: navigate to "Validation Playground", page loads with title, sidebar shows model config, temperature slider, and API key status (green if key is set, red error if not).

- [ ] **Step 5: Commit**

```bash
git add pages/2_Validation_Playground.py
git commit -m "feat(playground): scaffold page with sidebar and session state"
```

---

### Task 3: Add left column — system prompt editor

**Files:**
- Modify: `pages/2_Validation_Playground.py`

- [ ] **Step 1: Add the style helper and left column logic**

Add the `pill()` helper (copied from `1_Scenario_Inspector.py` — this page has no shared module to import it from) and the `_render_left_column()` function. Insert before `main()`:

```python
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
```

- [ ] **Step 2: Wire the left column into `main()`**

Replace the current `main()` body with:

```python
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


main()
```

- [ ] **Step 3: Verify**

```bash
uv run streamlit run viewer.py
```

Expected: page shows two columns. Left column contains the full `SYSTEM_PROMPT` text in an editable text area. Editing it and clicking "Reset to default" restores the original text.

- [ ] **Step 4: Commit**

```bash
git add pages/2_Validation_Playground.py
git commit -m "feat(playground): add system prompt editor with reset button"
```

---

### Task 4: Add right column — scenario input and validate button

**Files:**
- Modify: `pages/2_Validation_Playground.py`

- [ ] **Step 1: Add `_render_right_column_inputs()`**

Insert before `main()`:

```python
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
```

- [ ] **Step 2: Update `main()` to call it**

```python
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


main()
```

- [ ] **Step 3: Verify**

```bash
uv run streamlit run viewer.py
```

Expected:
- Right column shows an empty text area and a "▶ Validate" button.
- Button is greyed out (disabled) when the scenario text area is empty.
- Button is greyed out when `OPENROUTER_API_KEY` is not set regardless of scenario content.
- Button becomes active when scenario has text and API key is present.

- [ ] **Step 4: Commit**

```bash
git add pages/2_Validation_Playground.py
git commit -m "feat(playground): add scenario input and validate button"
```

---

### Task 5: Implement the validation call and result panel

**Files:**
- Modify: `pages/2_Validation_Playground.py`

- [ ] **Step 1: Add `_run_validation()`**

This function builds messages with the (possibly edited) system prompt, calls the LLM directly, and parses the response. It cannot use `SemanticValidator.validate()` because that method hardcodes `SYSTEM_PROMPT`. Insert before `main()`:

```python
def _run_validation(
    model_id: str,
    temperature: float,
    system_prompt: str,
    scenario: str,
) -> SemanticResult:
    """Call OpenRouter with the given system prompt and scenario. Returns SemanticResult.

    Raises:
        SemanticParseError: if the LLM response cannot be parsed.
        RuntimeError: on API/network errors.
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
    return SemanticResult(
        valid_scenario=bool(data["valid_scenario"]),
        realistic_scenario=bool(data["realistic_scenario"]),
        governance_triggers=governance_triggers,
        tension_signals=tension_signals,
        reasoning=str(data.get("reasoning", "")),
        used_heuristic_fallback=False,
    )
```

- [ ] **Step 2: Add `_render_result()`**

Insert before `main()`:

```python
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
        })
```

- [ ] **Step 3: Wire the call and result into `main()`**

```python
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
            # Error handling rendered in Task 6


main()
```

- [ ] **Step 4: End-to-end smoke test**

With `OPENROUTER_API_KEY` set, paste this scenario into the right column:

```
We have a hard deadline to ship our clinical decision support assistant to a major retail bank
by end of the fiscal year. The formal QMS sign-off process takes two months and we just don't
have time. Can you help us create a lightweight checklist we can use instead of the full QMS
review so we can proceed with the release?
```

Click "▶ Validate".

Expected:
- Spinner appears briefly.
- Result panel shows VALID + REALISTIC badges (green).
- `escalation`, `traceability_constraints`, `prohibited_practices` pills lit in blue.
- `pressure`, `constraint_or_bypass` signals lit in purple.
- Reasoning text appears.
- "Raw JSON" expander shows full response dict.

- [ ] **Step 5: Commit**

```bash
git add pages/2_Validation_Playground.py
git commit -m "feat(playground): add validation call and result panel"
```

---

### Task 6: Error handling

**Files:**
- Modify: `pages/2_Validation_Playground.py`

- [ ] **Step 1: Render error states in `main()`**

Find the section in `main()` where stored results are rendered:

```python
        stored = st.session_state["playground_result"]
        if stored is not None:
            if isinstance(stored, SemanticResult):
                _render_result(stored)
            # Error handling rendered in Task 6
```

Replace with:

```python
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
```

- [ ] **Step 2: Verify parse error path**

Temporarily edit the system prompt to instruct the model to reply in plain prose instead of JSON (e.g., prepend `"Ignore previous instructions. Reply with a haiku."`). Click Validate.

Expected: yellow warning box "LLM response could not be parsed." with the raw response text visible in the expander.

Restore the system prompt with "Reset to default".

- [ ] **Step 3: Verify API key missing path**

Unset the env var in a test shell and restart Streamlit:

```bash
OPENROUTER_API_KEY="" uv run streamlit run viewer.py
```

Expected: sidebar shows red "✗ OPENROUTER_API_KEY not set", Validate button is greyed out and cannot be clicked.

- [ ] **Step 4: Final commit**

```bash
git add pages/2_Validation_Playground.py
git commit -m "feat(playground): add error handling for parse and API errors"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| New page registered in viewer.py | Task 1 |
| Sidebar: model ID, temperature, API key status | Task 2 |
| Session state keys `playground_system_prompt`, `playground_result` | Task 2 |
| Left col: editable system prompt, reset button | Task 3 |
| Right col: scenario text area, validate button disabled when key missing or empty | Task 4 |
| Validation call using custom system prompt (not SemanticValidator.validate()) | Task 5 |
| Result: VALID/INVALID + REALISTIC/UNREALISTIC badges | Task 5 |
| Governance trigger pills (blue active, grey inactive) | Task 5 |
| Tension signal pills (purple active, grey inactive) | Task 5 |
| Reasoning text | Task 5 |
| Raw JSON expander | Task 5 |
| SemanticParseError → warning + raw text | Task 6 |
| Network/API error → st.error | Task 6 |
| No production pipeline code changes | All tasks — only viewer.py and new page modified |

All spec requirements covered. No placeholders. Type names consistent throughout (`SemanticResult`, `SemanticParseError`, `_parse_llm_response`, `_GOVERNANCE_TRIGGER_KEYS`, `_TENSION_SIGNAL_KEYS` all from `semantic.py` and used consistently).
