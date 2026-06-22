"""
Hook-only matcher for require_approval guardrail rules.

Imported ONLY by mcp_hook.py — never by the shared scan_text / scan_tool_input.
Matches the serialized command string against active require_approval rules
(regex or keyword). The pattern compilation (with cache) and the ReDoS length
guard are SHARED with the content-filter scanner
(guardrail_service._get_compiled_pattern / _run_regex_safe / REDOS_SCAN_CAP) so
the two matchers can never diverge on what a pattern means or how far into a
command they scan.
"""

import json
import logging
from typing import Optional

from sqlalchemy import text

from database.db import get_db
from services.guardrail_service import (
    _get_compiled_pattern,
    _run_regex_safe,
    REDOS_SCAN_CAP,
)
from utils.mcp_tool_content import extract_scannable_content

logger = logging.getLogger("uvicorn")


def _serialize(arguments: dict) -> str:
    """Flatten tool arguments to scannable text. Mirrors scan_tool_input so the
    approval matcher and the guardrail scanner see the same string."""
    parts: list[str] = []
    for value in arguments.values():
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, (dict, list)):
            parts.append(json.dumps(value))
    return "\n".join(parts)


def _matches(config: dict, text_in: str) -> bool:
    filter_type = config.get("type", "keyword")
    pattern_str = config.get("pattern", "")
    if not pattern_str:
        return False
    # A command longer than the ReDoS cap is scanned only up to the cap, exactly
    # like the content filter. Log it so a require_approval bypass via length
    # padding is observable rather than silent.
    if len(text_in) > REDOS_SCAN_CAP:
        logger.warning(
            "require_approval scan truncated to %d chars (command is %d) — "
            "a matching token past the cap will not be detected",
            REDOS_SCAN_CAP,
            len(text_in),
        )
    compiled = _get_compiled_pattern(pattern_str, filter_type)
    if compiled is None:  # invalid pattern — already logged by the shared helper
        return False
    return bool(_run_regex_safe(compiled, text_in))


async def check_require_approval(org_id: int, tool_name: str, arguments: dict) -> Optional[dict]:
    """Return the first active require_approval rule matching the command, else None."""
    input_text = _serialize(extract_scannable_content(tool_name, arguments))
    if not input_text.strip():
        return None

    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT id, name, config
                FROM ai_gateway_mcp_guardrail_rules
                WHERE organization_id = :org_id
                  AND rule_type = 'require_approval'
                  AND is_active = true
                  AND (
                      applies_to_tools IS NULL
                      OR array_length(applies_to_tools, 1) IS NULL
                      OR :tool_name = ANY(applies_to_tools)
                  )
                ORDER BY created_at
            """),
            {"org_id": org_id, "tool_name": tool_name},
        )
        rules = [dict(r) for r in result.mappings().fetchall()]

    for rule in rules:
        if _matches(rule.get("config") or {}, input_text):
            return rule
    return None
