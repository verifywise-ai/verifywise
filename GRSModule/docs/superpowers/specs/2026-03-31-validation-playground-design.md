# Validation Playground — Design Spec

**Date:** 2026-03-31
**Status:** Approved

---

## Problem

The semantic validation stage is a black box during development. When a scenario passes or fails, the only signal is a JSON result written to disk — there is no interactive way to send a scenario to the validator and read the model's reasoning directly. This makes it hard to build intuition about why scenarios pass, fail the realism gate, or receive specific governance trigger classifications.

A confirmed failure mode motivates this: cross-domain contamination scenarios (e.g., "clinical decision support assistant" at a "retail bank") pass the `realistic_scenario` check because the governance structure of the prompt is coherent even when the domain vocabulary is wrong. Inspecting the model's reasoning interactively would surface this kind of blind spot faster.

---

## Goal

Add a **Validation Playground** page to the existing Streamlit viewer (`viewer.py`) that lets a user:

1. Paste any scenario text into a text area
2. Optionally edit the system prompt (defaulting to the canonical `SYSTEM_PROMPT` from `semantic.py`)
3. Send the scenario to the configured model and see the full structured result — governance triggers, tension signals, realism verdict, and reasoning — rendered as readable cards

---

## Non-Goals

- Chat history / multi-turn sessions — single-turn only; each submission replaces the previous result
- Saving or exporting results
- Comparing two scenarios side-by-side
- Modifying `semantic.py` or any production pipeline code

---

## Architecture

### New file

`pages/2_Validation_Playground.py`

Registered in `viewer.py` as a third entry in `st.navigation`:

```python
st.Page("pages/2_Validation_Playground.py", title="Validation Playground", icon="🧪")
```

### Dependencies (all existing)

| Import | Source |
|--------|--------|
| `SemanticValidator`, `SemanticValidatorConfig`, `SYSTEM_PROMPT` | `src/validate/semantic.py` |
| `OpenRouterChatClient` | `src/llm/openrouter.py` |
| `MockChatClient` | `src/llm/mock.py` |

No new modules. No changes to existing pipeline code.

---

## UI Layout

### Sidebar

- **Model ID** — text input, default `"openai/gpt-4o-mini"`
- **Temperature** — slider, range `0.0–1.0`, step `0.05`, default `0.0` (matches production `SemanticValidatorConfig` default)
- **API key status** — read `OPENROUTER_API_KEY` from `os.environ`; display green `✓ API key set` or red `✗ OPENROUTER_API_KEY not set`. When the key is missing the Validate button is disabled.

### Main area — `st.columns([1, 1.2])`

**Left column — System Prompt**

- `st.text_area` labelled "System Prompt", pre-filled with `SYSTEM_PROMPT` from `semantic.py`, `height=420`
- "Reset to default" button below — restores `SYSTEM_PROMPT` using `st.session_state`

**Right column — Scenario + Result**

- `st.text_area` labelled "Scenario", placeholder `"Paste a scenario here…"`, `height=200`
- "▶ Validate" button — disabled when API key is missing or scenario text is empty
- Result panel rendered below the button after each submission (replaces previous on re-run)

---

## Result Panel

Rendered only after a successful call. Layout top-to-bottom:

### Verdict badges

Two inline badges using the existing `pill()` helper:

| Field | True | False |
|-------|------|-------|
| `valid_scenario` | green `VALID` | red `INVALID` |
| `realistic_scenario` | green `REALISTIC` | red `UNREALISTIC` |

### Governance triggers

Six pills rendered in two rows (active in blue `#1a6ab5`, inactive in grey `#ccc`), matching the style of `render_stage_4()` in `1_Scenario_Inspector.py`:

`authority_oversight` · `escalation` · `traceability_constraints` · `transparency_uncertainty` · `prohibited_practices` · `synthetic_disclosure`

### Tension signals

Three pills (active in purple `#6a4c93`, inactive in grey):

`pressure` · `uncertainty` · `constraint_or_bypass`

### Reasoning

Plain text block from `result.reasoning`.

### Raw JSON expander

Collapsed by default. Shows the full parsed response dict as `st.json(...)` for inspection.

---

## Error Handling

| Condition | Behaviour |
|-----------|-----------|
| `OPENROUTER_API_KEY` not set | `st.error` shown in sidebar; Validate button disabled |
| Scenario text empty | Validate button disabled |
| `SemanticParseError` | `st.warning` with label "LLM response could not be parsed" + raw response text in expander |
| Network / API exception | `st.error` with exception message |
| `MockChatClient` path | Not reachable from this page — `OpenRouterChatClient` is always instantiated directly; no heuristic fallback |

---

## Session State

Two keys managed via `st.session_state`:

| Key | Purpose |
|-----|---------|
| `playground_system_prompt` | Holds the (possibly edited) system prompt; initialised to `SYSTEM_PROMPT` on first load; restored by "Reset to default" |
| `playground_result` | Holds the last `SemanticResult` (or error dict); `None` on first load; replaced on each submission |

---

## File Checklist

| Action | File |
|--------|------|
| Create | `pages/2_Validation_Playground.py` |
| Edit | `viewer.py` — add third `st.Page` entry |
