"""Unit tests for services.guardrail_service.

Content filters run for real (regex/keyword); Presidio PII is mocked. No spaCy
model is loaded and no live services are touched.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

import services.guardrail_service as gs  # noqa: E402
import services.presidio_engine as presidio_engine  # noqa: E402

KEYWORD_BLOCK = {
    "id": 1, "guardrail_type": "content_filter", "name": "codename",
    "config": {"type": "keyword", "pattern": "bluebird"}, "action": "block", "is_active": True,
}
REGEX_MASK = {
    "id": 2, "guardrail_type": "content_filter", "name": "tickets",
    "config": {"type": "regex", "pattern": r"TCK-\d+"}, "action": "mask", "is_active": True,
}
PII_RULE = {
    "id": 3, "guardrail_type": "pii", "name": "emails",
    "config": {"entities": {"EMAIL_ADDRESS": "mask"}, "language": "en"},
    "action": "mask", "is_active": True,
}


def _make_pii_available(monkeypatch, results=None, error=None):
    """Patch presidio_engine so _scan_pii uses the fake results/error."""
    monkeypatch.setattr(presidio_engine, "is_available", lambda: True)

    if error is not None:
        def fake_analyze(**_kwargs):
            raise error
    else:
        def fake_analyze(**_kwargs):
            return results or []
    monkeypatch.setattr(presidio_engine, "analyze_text", fake_analyze)


# ─── Content filters ─────────────────────────────────────────────────────────

def test_keyword_block_blocks():
    result = gs.scan_text("Ship bluebird on Friday", [KEYWORD_BLOCK], {})
    assert result.blocked
    assert result.block_reason == "content_filter: codename detected"
    assert any(d.action == "block" for d in result.detections)


def test_keyword_block_word_boundary():
    # "bluebirds" must not match the "bluebird" keyword rule.
    result = gs.scan_text("bluebirds are birds", [KEYWORD_BLOCK], {})
    assert not result.blocked


def test_regex_mask_masks_with_default_replacement():
    result = gs.scan_text("See TCK-123 today", [REGEX_MASK], {})
    assert not result.blocked
    assert result.masked_text == "See [REDACTED] today"


def test_regex_mask_uses_custom_replacement():
    settings = {"content_filter_replacement": "<REDACTED>"}
    result = gs.scan_text("See TCK-123 today", [REGEX_MASK], settings)
    assert result.masked_text == "See <REDACTED> today"


def test_inactive_rules_are_skipped():
    inactive = {**KEYWORD_BLOCK, "is_active": False}
    result = gs.scan_text("bluebird everywhere", [inactive], {})
    assert not result.blocked
    assert result.detections == []


def test_invalid_regex_blocks_when_on_error_is_block(monkeypatch):
    monkeypatch.delitem(gs._compiled_cache, ("[", "regex"), raising=False)
    bad = {**REGEX_MASK, "config": {"type": "regex", "pattern": "["}}
    result = gs.scan_text("anything", [bad], {"content_filter_on_error": "block"})
    assert result.blocked
    assert "tickets" in result.block_reason


def test_invalid_regex_allowed_when_on_error_is_allow(monkeypatch):
    monkeypatch.delitem(gs._compiled_cache, ("[", "regex"), raising=False)
    bad = {**REGEX_MASK, "config": {"type": "regex", "pattern": "["}}
    result = gs.scan_text("anything", [bad], {"content_filter_on_error": "allow"})
    assert not result.blocked
    assert result.detections == []


def test_nothing_to_scan_short_circuits():
    assert gs.scan_text("", [KEYWORD_BLOCK], {}).blocked is False
    assert gs.scan_text("hello", [], {}).blocked is False


def test_oversized_text_is_capped_by_redos_guard(monkeypatch):
    scanned_lengths = []
    real_get = gs._get_compiled_pattern

    class SpyPattern:
        """re.Pattern attributes are read-only; wrap instead of patching."""

        def __init__(self, compiled):
            self._compiled = compiled

        def finditer(self, text):
            scanned_lengths.append(len(text))
            return self._compiled.finditer(text)

    def spy_get(pattern_str, filter_type):
        compiled = real_get(pattern_str, filter_type)
        return None if compiled is None else SpyPattern(compiled)

    monkeypatch.setattr(gs, "_get_compiled_pattern", spy_get)
    gs.scan_text("x" * (gs.REDOS_SCAN_CAP + 1000), [REGEX_MASK], {})
    assert scanned_lengths and scanned_lengths[0] == gs.REDOS_SCAN_CAP


# ─── PII (Presidio mocked) ────────────────────────────────────────────────────

def test_pii_mask_replaces_with_entity_format(monkeypatch):
    _make_pii_available(monkeypatch, results=[
        {"entity_type": "EMAIL_ADDRESS", "text": "a@b.com", "start": 5, "end": 12, "score": 0.9},
    ])
    result = gs.scan_text("mail a@b.com now", [PII_RULE], {"pii_replacement_format": "<ENTITY_TYPE>"})
    assert not result.blocked
    assert result.masked_text == "mail <EMAIL_ADDRESS> now"
    det = result.detections[0]
    assert det.guardrail_type == "pii" and det.entity_type == "EMAIL_ADDRESS"


def test_pii_block_action_blocks(monkeypatch):
    block_rule = {**PII_RULE, "config": {"entities": {"EMAIL_ADDRESS": "block"}}}
    _make_pii_available(monkeypatch, results=[
        {"entity_type": "EMAIL_ADDRESS", "text": "a@b.com", "start": 0, "end": 7, "score": 0.9},
    ])
    result = gs.scan_text("a@b.com", [block_rule], {})
    assert result.blocked
    assert result.block_reason == "pii: EMAIL_ADDRESS detected"


def test_pii_entity_action_default_falls_back_to_rule_action(monkeypatch):
    rule = {**PII_RULE, "config": {"entities": {"EMAIL_ADDRESS": "not-a-real-action"}}, "action": "block"}
    _make_pii_available(monkeypatch, results=[
        {"entity_type": "EMAIL_ADDRESS", "text": "a@b.com", "start": 0, "end": 7, "score": 0.9},
    ])
    assert gs.scan_text("a@b.com", [rule], {}).blocked


def test_pii_unavailable_blocks_by_default(monkeypatch):
    monkeypatch.setattr(presidio_engine, "is_available", lambda: False)
    result = gs.scan_text("hello", [PII_RULE], {})
    assert result.blocked
    assert result.detections[0].entity_type == "SYSTEM_ERROR"


def test_pii_unavailable_allows_when_configured(monkeypatch):
    monkeypatch.setattr(presidio_engine, "is_available", lambda: False)
    result = gs.scan_text("hello", [PII_RULE], {"pii_on_error": "allow"})
    assert not result.blocked
    assert result.detections == []


def test_pii_engine_error_blocks_by_default(monkeypatch):
    _make_pii_available(monkeypatch, error=RuntimeError("engine exploded"))
    result = gs.scan_text("hello", [PII_RULE], {})
    assert result.blocked
    assert any(d.entity_type == "SYSTEM_ERROR" for d in result.detections)


def test_pii_engine_error_allows_when_configured(monkeypatch):
    _make_pii_available(monkeypatch, error=RuntimeError("engine exploded"))
    result = gs.scan_text("hello", [PII_RULE], {"pii_on_error": "allow"})
    assert not result.blocked


# ─── Off-loop wrapper ─────────────────────────────────────────────────────────

async def test_scan_text_async_matches_scan_text():
    rules = [KEYWORD_BLOCK, REGEX_MASK]
    text = "bluebird TCK-1"
    expected = gs.scan_text(text=text, guardrail_rules=rules, settings={})
    actual = await gs.scan_text_async(text=text, guardrail_rules=rules, settings={})
    assert actual.blocked == expected.blocked
    assert actual.detections == expected.detections


async def test_scan_text_async_empty_input_short_circuits(monkeypatch):
    def boom(**_kwargs):
        raise AssertionError("scan_text must not run when there is nothing to scan")

    monkeypatch.setattr(gs, "scan_text", boom)
    result = await gs.scan_text_async(text="", guardrail_rules=[KEYWORD_BLOCK], settings={})
    assert not result.blocked
