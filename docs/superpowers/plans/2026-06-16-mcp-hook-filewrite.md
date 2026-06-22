# Field-Aware File-Write Gating (Phase 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate file-write tools (Write, Edit, MultiEdit, NotebookEdit) by scanning only the content being written, via a content-extraction helper that both the guardrail scanner and the approval matcher call before serializing.

**Architecture:** New `extract_scannable_content(tool_name, arguments)` helper returns the written-content subset for file-write tools (per a hardcoded map) and the full args for everything else (Bash, MCP, unknown). `scan_tool_input` and `check_require_approval` extract before serializing. Audit and arg-hash keep using the FULL arguments. The hook router doesn't change. The adapter is renamed to reflect it gates all tools.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async; pytest (live-HTTP E2E); Bash adapter.

**Spec:** `docs/superpowers/specs/2026-06-16-mcp-hook-filewrite-design.md`
**Branch:** `feat/mcp-hook-filewrite` (already created, off `feat/mcp-hook-approval`)

---

## Key facts (verified on this branch)

- `scan_tool_input(org_id, tool_name, arguments)` (`services/mcp_guardrail_service.py:55`) loops `for value in arguments.values()` serializing str/dict/list. It HAS `tool_name` in scope.
- `_serialize(arguments)` (`services/mcp_approval_match.py:29`) does the same loop. It does NOT have `tool_name`; its caller `check_require_approval(org_id, tool_name, arguments)` (`:62`) does.
- `mcp_hook.py` passes the FULL `arguments` to `scan_tool_input`, `check_require_approval`, `hash_arguments`, and `log_tool_call`. None of that changes — field-awareness lives inside the two scanners.
- Test scaffolding (from `tests/test_14`): `api` fixture posts to Express `/api/ai-gateway/...`; agent-key create returns the full key under `data.plain_key`; guardrail create takes `{name, rule_type, action?, config}`.

---

## File Structure

- **Create:** `AIGateway/src/utils/mcp_tool_content.py` — `FILE_WRITE_CONTENT_FIELDS` map + `extract_scannable_content`.
- **Modify:** `AIGateway/src/services/mcp_guardrail_service.py` — extract in `scan_tool_input`.
- **Modify:** `AIGateway/src/services/mcp_approval_match.py` — extract in `check_require_approval`.
- **Rename:** `scripts/vw-bash-hook.sh` → `scripts/vw-tool-hook.sh`; `scripts/vw-bash-hook.README.md` → `scripts/vw-tool-hook.README.md`.
- **Create:** `AIGateway/tests/test_15_mcp_hook_filewrite.py`.

---

## Task 1: The content-extraction helper

**Files:**
- Create: `AIGateway/src/utils/mcp_tool_content.py`

- [ ] **Step 1: Write the helper**

Create `AIGateway/src/utils/mcp_tool_content.py`:

```python
"""
Field-aware content extraction for tool-call scanning.

For file-write tools we want guardrails to scan only what is being WRITTEN
(content / new_string), not what is being removed (old_string) or where it goes
(file_path). Scanning old_string would block an agent from deleting a line that
contains PII; scanning file_path causes false positives on paths.

For every other tool (Bash, MCP-proxied tools, unknown tools) we return the full
arguments unchanged, preserving existing behavior and over-scanning rather than
under-scanning when we do not recognize a tool.

Only the SCAN uses this subset. Audit logging and approval argument-hashing keep
using the full arguments (the path is part of a call's identity and record).
"""

from typing import Any

# tool_name -> list of argument keys whose values are "written content".
# Hardcoded: covers the file-write tools coding agents expose today.
FILE_WRITE_CONTENT_FIELDS: dict[str, list[str]] = {
    "Write": ["content"],
    "Edit": ["new_string"],
    "NotebookEdit": ["new_source"],
}


def extract_scannable_content(tool_name: str, arguments: dict) -> dict:
    """Return the subset of `arguments` that should be scanned for content.

    File-write tools -> only the written-content fields.
    MultiEdit -> the new_string of every edit (its content lives in a list).
    Everything else (Bash, MCP, unknown) -> the full arguments, unchanged.
    """
    if not isinstance(arguments, dict):
        return {}

    if tool_name == "MultiEdit":
        edits = arguments.get("edits")
        new_strings: list[Any] = []
        if isinstance(edits, list):
            for edit in edits:
                if isinstance(edit, dict) and "new_string" in edit:
                    new_strings.append(edit["new_string"])
        return {"new_strings": new_strings}

    fields = FILE_WRITE_CONTENT_FIELDS.get(tool_name)
    if fields is None:
        # Unknown / non-file-write tool: scan everything (preserves Bash + MCP).
        return arguments

    return {k: arguments[k] for k in fields if k in arguments}
```

- [ ] **Step 2: Verify the helper logic (no DB needed)**

```bash
cd /Users/gorkemcetin/verifywise/AIGateway && source venv/bin/activate && cd src && python -c "
from utils.mcp_tool_content import extract_scannable_content as ex
# Bash: full args unchanged
assert ex('Bash', {'command':'rm -rf /'}) == {'command':'rm -rf /'}
# Write: only content
assert ex('Write', {'file_path':'/tmp/x','content':'hi'}) == {'content':'hi'}
# Edit: only new_string (old_string + file_path dropped)
assert ex('Edit', {'file_path':'/tmp/x','old_string':'a','new_string':'b'}) == {'new_string':'b'}
# MultiEdit: new_strings list only
assert ex('MultiEdit', {'file_path':'/tmp/x','edits':[{'old_string':'a','new_string':'b'},{'old_string':'c','new_string':'d'}]}) == {'new_strings':['b','d']}
# NotebookEdit
assert ex('NotebookEdit', {'notebook_path':'/x.ipynb','new_source':'print(1)'}) == {'new_source':'print(1)'}
# Unknown tool: full args (over-scan, no gap)
assert ex('SomeNewTool', {'a':'1','b':'2'}) == {'a':'1','b':'2'}
# Missing field: empty (nothing to scan)
assert ex('Write', {'file_path':'/tmp/x'}) == {}
# Non-dict args: empty
assert ex('Write', None) == {}
print('helper logic ok')
"
```
Expected: `helper logic ok`.

- [ ] **Step 3: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add AIGateway/src/utils/mcp_tool_content.py && git commit -m "feat(ai-gateway): add field-aware tool content extractor"
```

---

## Task 2: Use the extractor in the guardrail scanner

**Files:**
- Modify: `AIGateway/src/services/mcp_guardrail_service.py` (import + the serialize loop in `scan_tool_input`)

- [ ] **Step 1: Add the import**

Near the top of `mcp_guardrail_service.py`, with the other local imports, add:
```python
from utils.mcp_tool_content import extract_scannable_content
```

- [ ] **Step 2: Extract before serializing**

In `scan_tool_input` (around lines 63-70), change the serialize loop to iterate the extracted subset. Replace:
```python
    # Serialize arguments to scannable text
    text_parts: list[str] = []
    for value in arguments.values():
        if isinstance(value, str):
            text_parts.append(value)
        elif isinstance(value, (dict, list)):
            text_parts.append(json.dumps(value))
    input_text = "\n".join(text_parts)
```
with:
```python
    # Scan only the content the tool actually writes (file-write tools expose
    # written content under specific fields); full args for everything else.
    scannable = extract_scannable_content(tool_name, arguments)
    text_parts: list[str] = []
    for value in scannable.values():
        if isinstance(value, str):
            text_parts.append(value)
        elif isinstance(value, (dict, list)):
            text_parts.append(json.dumps(value))
    input_text = "\n".join(text_parts)
```

- [ ] **Step 3: Verify it imports**

```bash
cd /Users/gorkemcetin/verifywise/AIGateway && source venv/bin/activate && cd src && python -c "from services.mcp_guardrail_service import scan_tool_input; print('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add AIGateway/src/services/mcp_guardrail_service.py && git commit -m "feat(ai-gateway): scan only written content in guardrail scanner"
```

---

## Task 3: Use the extractor in the approval matcher

**Files:**
- Modify: `AIGateway/src/services/mcp_approval_match.py` (import + extract in `check_require_approval`)

- [ ] **Step 1: Add the import**

Near the top of `mcp_approval_match.py`, with the other local imports, add:
```python
from utils.mcp_tool_content import extract_scannable_content
```

- [ ] **Step 2: Extract before serializing**

`_serialize` has no `tool_name`, but its caller `check_require_approval` does. In `check_require_approval` (around line 64), change:
```python
    input_text = _serialize(arguments)
```
to:
```python
    input_text = _serialize(extract_scannable_content(tool_name, arguments))
```
Leave `_serialize` itself unchanged (it still takes a dict and serializes its values).

- [ ] **Step 3: Verify it imports**

```bash
cd /Users/gorkemcetin/verifywise/AIGateway && source venv/bin/activate && cd src && python -c "from services.mcp_approval_match import check_require_approval; print('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add AIGateway/src/services/mcp_approval_match.py && git commit -m "feat(ai-gateway): scan only written content in approval matcher"
```

---

## Task 4: E2E tests (the proof, incl. the killer case)

**Files:**
- Create: `AIGateway/tests/test_15_mcp_hook_filewrite.py`

- [ ] **Step 1: Write the tests**

Create `AIGateway/tests/test_15_mcp_hook_filewrite.py`:

```python
"""E2E: field-aware file-write gating via /v1/mcp/hook.

Proves the gateway scans only WRITTEN content for file-write tools:
deleting PII is allowed, writing PII is denied. Audit keeps the full call.
"""

import os
import httpx
import pytest
from conftest import set_state, get_state

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8100")
_client = httpx.Client(timeout=30.0)


def _hook(key, tool_name, arguments):
    return _client.post(
        f"{GATEWAY_URL}/v1/mcp/hook",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"tool_name": tool_name, "arguments": arguments},
    )


def test_setup(api):
    key_res = api.post("/mcp/agent-keys", json={"name": "E2E FileWrite Key"})
    assert key_res.status_code in (200, 201), key_res.text
    set_state("fw_key", key_res.json()["data"]["plain_key"])

    rule_res = api.post("/mcp/guardrails", json={
        "name": "E2E FileWrite PII",
        "rule_type": "pii",
        "action": "block",
        "config": {"entities": {"EMAIL_ADDRESS": "block"}, "score_thresholds": {"ALL": 0.7}, "language": "en"},
    })
    assert rule_res.status_code in (200, 201), rule_res.text
    set_state("fw_pii_rule_id", rule_res.json()["data"]["id"])

    appr_res = api.post("/mcp/guardrails", json={
        "name": "E2E FileWrite Approve Keys",
        "rule_type": "require_approval",
        "config": {"type": "regex", "pattern": r"BEGIN [A-Z ]*PRIVATE KEY"},
    })
    assert appr_res.status_code in (200, 201), appr_res.text
    set_state("fw_appr_rule_id", appr_res.json()["data"]["id"])


# ── The killer test: written content is scanned, removed content is not ──

def test_edit_writing_pii_is_denied(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "Edit", {"file_path": "/tmp/x", "old_string": "x", "new_string": "contact me@evil.com"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "deny"


def test_edit_deleting_pii_is_allowed(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    # PII is only in old_string (being removed). new_string is clean -> allow.
    res = _hook(key, "Edit", {"file_path": "/tmp/x", "old_string": "contact me@evil.com", "new_string": "contact removed"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "allow"


# ── Write / MultiEdit / path / clean coverage ──

def test_write_pii_content_is_denied(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "Write", {"file_path": "/tmp/x", "content": "contact me@evil.com"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "deny"


def test_write_clean_content_is_allowed(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "Write", {"file_path": "/tmp/x", "content": "hello world"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "allow"


def test_multiedit_pii_in_new_string_is_denied(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "MultiEdit", {"file_path": "/tmp/x", "edits": [
        {"old_string": "a", "new_string": "clean"},
        {"old_string": "b", "new_string": "leak me@evil.com"},
    ]})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "deny"


def test_multiedit_pii_only_in_old_string_is_allowed(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "MultiEdit", {"file_path": "/tmp/x", "edits": [
        {"old_string": "remove me@evil.com", "new_string": "removed"},
    ]})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "allow"


def test_pii_in_file_path_is_not_scanned(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    # Email-like string in the PATH, clean content -> path not scanned -> allow.
    res = _hook(key, "Write", {"file_path": "/home/me@evil.com/notes.txt", "content": "hello"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "allow"


def test_require_approval_on_written_content(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "Write", {"file_path": "/tmp/key.pem", "content": "-----BEGIN RSA PRIVATE KEY-----"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "approval_required"


def test_audit_keeps_full_arguments(api):
    """A denied Write's audit row must contain the full call (path + content),
    not just the scanned subset."""
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "Write", {"file_path": "/tmp/audit-check.txt", "content": "leak me@evil.com"})
    assert res.json()["decision"] == "deny"
    logs = api.get("/mcp/audit/logs?limit=10")
    assert logs.status_code == 200, logs.text
    rows = logs.json()["data"]
    match = next((r for r in rows if r.get("arguments", {}).get("file_path") == "/tmp/audit-check.txt"), None)
    assert match is not None, "denied Write not found in audit logs"
    # Full args preserved: both path and content present in the audit record.
    assert match["arguments"].get("content") == "leak me@evil.com"


def test_cleanup(api):
    for sid in ("fw_pii_rule_id", "fw_appr_rule_id"):
        rid = get_state(sid)
        if rid:
            api.delete(f"/mcp/guardrails/{rid}")
```

- [ ] **Step 2: Restart the gateway (loads Tasks 1-3) and run the suite**

Restart the running gateway on port 8100 so the new code loads, then:
```bash
cd /Users/gorkemcetin/verifywise/AIGateway && VW_PASSWORD='Verifywise#1' python -m pytest tests/test_15_mcp_hook_filewrite.py -v
```
Expected: all pass. If `test_edit_deleting_pii_is_allowed` returns `deny`, the extractor isn't being used by the scanner (re-check Task 2). If `test_audit_keeps_full_arguments` fails on the content assertion, the hook is auditing the extracted subset instead of full args (it shouldn't — verify `mcp_hook.py` passes full `arguments` to `log_tool_call`).

- [ ] **Step 3: Regression — Phase 1 + Phase 2 suites still pass**

```bash
cd /Users/gorkemcetin/verifywise/AIGateway && VW_PASSWORD='Verifywise#1' python -m pytest tests/test_13_mcp_hook.py tests/test_14_mcp_hook_approval.py -q
```
Expected: all pass (proves the full-args fallback preserves Bash + approval behavior).

- [ ] **Step 4: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add AIGateway/tests/test_15_mcp_hook_filewrite.py && git commit -m "test(ai-gateway): E2E for field-aware file-write gating"
```

---

## Task 5: Rename the adapter to vw-tool-hook

**Files:**
- Rename: `scripts/vw-bash-hook.sh` → `scripts/vw-tool-hook.sh`
- Rename: `scripts/vw-bash-hook.README.md` → `scripts/vw-tool-hook.README.md`

- [ ] **Step 1: git mv both files**

```bash
cd /Users/gorkemcetin/verifywise
git mv scripts/vw-bash-hook.sh scripts/vw-tool-hook.sh
git mv scripts/vw-bash-hook.README.md scripts/vw-tool-hook.README.md
```

- [ ] **Step 2: Update the script header comment**

In `scripts/vw-tool-hook.sh`, change the top comment line:
```bash
# VerifyWise Bash gate — Claude Code PreToolUse hook.
```
to (no em dash, per house style):
```bash
# VerifyWise tool gate, a Claude Code PreToolUse hook.
```
Leave all logic and env-var docs unchanged (the script is already tool-agnostic).

- [ ] **Step 3: Reframe the README + multi-matcher config**

In `scripts/vw-tool-hook.README.md`:
- Retitle from "Bash gate" to "tool gate" wording in the heading and intro (it gates Bash plus file-write tools).
- Update the wiring example's matcher and command:
  ```json
  { "hooks": { "PreToolUse": [
    { "matcher": "Bash|Edit|Write|MultiEdit",
      "hooks": [{ "type": "command", "command": "scripts/vw-tool-hook.sh" }] } ] } }
  ```
- Add one line to the behavior section: file-write tools (Write, Edit, MultiEdit) are gated on the content being written; guardrail and approval rules apply to that content. (Keep it short, no marketing copy.)
- Replace any remaining `vw-bash-hook.sh` references with `vw-tool-hook.sh`.

- [ ] **Step 4: Verify the script still runs (syntax + a fail-open path, no gateway needed)**

```bash
cd /Users/gorkemcetin/verifywise
bash -n scripts/vw-tool-hook.sh && echo "syntax ok"
VW_GATEWAY_URL=http://localhost:59999 VW_AGENT_KEY=sk-mcp-x VW_TIMEOUT=2 \
  bash -c 'echo "{\"tool_name\":\"Write\",\"tool_input\":{\"content\":\"hi\"}}" | scripts/vw-tool-hook.sh'; echo "exit=$?"
```
Expected: `syntax ok`, then `exit=0` (fail-open default) with a `gateway unreachable` warning — confirms it handles a Write-shaped payload identically to Bash.

- [ ] **Step 5: Live allow/deny against the gateway** (gateway + backend up; PII rule from Task 4 setup present, or recreate one)

Mint a key + a PII rule (as in Task 4 setup), then:
```bash
cd /Users/gorkemcetin/verifywise
# allow: clean Write
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x","content":"hello"}}' | VW_GATEWAY_URL=http://localhost:8100 VW_AGENT_KEY=$KEY scripts/vw-tool-hook.sh; echo "exit=$?"
# deny: Write with PII
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x","content":"me@evil.com"}}' | VW_GATEWAY_URL=http://localhost:8100 VW_AGENT_KEY=$KEY scripts/vw-tool-hook.sh; echo "exit=$?"
```
Expected: first `exit=0`; second `exit=2` with `Blocked by VerifyWise: ...` on stderr.

- [ ] **Step 6: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add scripts/ && git commit -m "feat(ai-gateway): rename adapter to vw-tool-hook; document file-write matchers"
```

---

## Self-review notes

- **Spec coverage:** content-extraction helper + hardcoded map + unknown-tool fallback → Task 1; scanner uses it → Task 2; approval matcher uses it → Task 3; killer test + Write/MultiEdit/path/clean/approval/audit-full-args + regression → Task 4; adapter rename + matcher docs + live verify → Task 5. All spec sections covered.
- **Audit/arg-hash use full args:** unchanged — `mcp_hook.py` is not modified; the helper only affects the two scanners. Task 4's `test_audit_keeps_full_arguments` enforces this.
- **Type consistency:** `extract_scannable_content(tool_name, arguments) -> dict` defined in Task 1, called identically in Tasks 2 and 3. Returns a dict in every branch (subset, `{"new_strings": [...]}`, full args, or `{}`), so both call sites' `.values()` serialization works.
- **MultiEdit:** returns `{"new_strings": [...]}` (a list value) — serialized via the existing `json.dumps` list branch in both scanners. Verified in Task 1 Step 2.
- **No placeholders:** every edit shows exact before/after; line numbers approximate, each task greps/reads to locate.
- **Stack note:** `mcp_guardrail_service.py` + `mcp_approval_match.py` are also Phase 2 files; this branch is off Phase 2 so they already have the Phase 2 versions shown above — no conflict within the stack.
```
