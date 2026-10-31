"""
Guardrail scanning service.

Executes PII detection and content filter checks on text.
Returns structured detection results with block/mask actions.
"""

import asyncio
import contextvars
import functools
import logging
import re
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

SCAN_THREAD_PREFIX = "guardrail-scan"

# Regex pattern cache to avoid recompilation on every request
_compiled_cache: dict[tuple[str, str], "re.Pattern | None"] = {}


@dataclass
class Detection:
    guardrail_id: int | None
    guardrail_type: str  # "pii" | "content_filter"
    entity_type: str  # "EMAIL_ADDRESS", keyword name, regex name
    action: str  # "block" | "mask"
    matched_text: str
    start: int
    end: int
    score: float = 1.0


@dataclass
class ScanResult:
    blocked: bool = False
    block_reason: str = ""
    detections: list[Detection] = field(default_factory=list)
    masked_text: str | None = None
    execution_time_ms: int = 0
    # Names of the rules that were scanned, by id. Set by the MCP scanner so a
    # caller can record which rule caused a block without another query.
    rule_names: dict[int, str] = field(default_factory=dict)


def _get_compiled_pattern(pattern_str: str, filter_type: str) -> re.Pattern | None:
    """Get or compile a regex pattern (cached)."""
    key = (pattern_str, filter_type)
    if key not in _compiled_cache:
        try:
            escaped = re.escape(pattern_str)
            if filter_type == "keyword":
                raw = r"\b" + escaped + r"\b" if " " not in pattern_str else escaped
            else:
                raw = pattern_str  # raw regex, don't escape
            _compiled_cache[key] = re.compile(raw, re.IGNORECASE)
        except re.error as e:
            logger.warning(f"Invalid regex pattern '{pattern_str[:50]}': {e}")
            _compiled_cache[key] = None
    return _compiled_cache[key]


REDOS_SCAN_CAP = 50000  # max chars scanned by a single regex (ReDoS guard)


def _run_regex_safe(compiled: re.Pattern, text: str) -> list[re.Match]:
    """Run regex with length guard against ReDoS."""
    scan_text = text[:REDOS_SCAN_CAP] if len(text) > REDOS_SCAN_CAP else text
    try:
        return list(compiled.finditer(scan_text))
    except Exception as e:
        logger.warning(f"Regex execution failed: {e}")
        return []


def _merge_spans(spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Merge overlapping spans to prevent double-masking."""
    if not spans:
        return []
    sorted_spans = sorted(spans, key=lambda s: s[0])
    merged = [sorted_spans[0]]
    for start, end in sorted_spans[1:]:
        if start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _scan_pii(
    text: str,
    guardrail_rules: list[dict],
    settings: dict,
) -> list[Detection]:
    """Run Presidio PII scan."""
    from services.presidio_engine import analyze_text, is_available

    if not is_available():
        if settings.get("pii_on_error", "block") == "block":
            return [
                Detection(
                    guardrail_id=None,
                    guardrail_type="pii",
                    entity_type="SYSTEM_ERROR",
                    action="block",
                    matched_text="Presidio not available",
                    start=0,
                    end=0,
                )
            ]
        return []

    detections = []

    for rule in guardrail_rules:
        if rule.get("guardrail_type") != "pii" or not rule.get("is_active", True):
            continue

        config = rule.get("config", {})
        entities_config = config.get("entities", {})
        score_thresholds = config.get("score_thresholds", {})
        language = config.get("language", "en")

        # Only scan for configured entity types
        entity_types = list(entities_config.keys()) if entities_config else None

        try:
            results = analyze_text(
                text=text,
                entities=entity_types,
                language=language,
                score_thresholds=score_thresholds,
            )
        except Exception as e:
            logger.error(f"Presidio analysis failed: {e}")
            if settings.get("pii_on_error", "block") == "block":
                detections.append(
                    Detection(
                        guardrail_id=rule.get("id"),
                        guardrail_type="pii",
                        entity_type="SYSTEM_ERROR",
                        action="block",
                        matched_text="PII scan failed",
                        start=0,
                        end=0,
                    )
                )
            continue

        for r in results:
            entity_action = entities_config.get(r["entity_type"], "mask")
            # Use rule-level action as default, entity-level overrides
            action = entity_action if entity_action in ("block", "mask") else rule.get("action", "block")

            detections.append(
                Detection(
                    guardrail_id=rule.get("id"),
                    guardrail_type="pii",
                    entity_type=r["entity_type"],
                    action=action,
                    matched_text=r["text"],
                    start=r["start"],
                    end=r["end"],
                    score=r["score"],
                )
            )

    return detections


def _scan_content_filter(
    text: str,
    guardrail_rules: list[dict],
    settings: dict,
) -> list[Detection]:
    """Run content filter (keywords + regex) scan."""
    detections = []
    for rule in guardrail_rules:
        if rule.get("guardrail_type") != "content_filter" or not rule.get("is_active", True):
            continue

        config = rule.get("config", {})
        filter_type = config.get("type", "keyword")
        pattern_str = config.get("pattern", "")
        action = rule.get("action", "block")
        rule_name = rule.get("name", "unnamed")

        if not pattern_str:
            continue

        try:
            compiled = _get_compiled_pattern(pattern_str, filter_type)
            if compiled is None:
                if settings.get("content_filter_on_error", "allow") == "block":
                    detections.append(
                        Detection(
                            guardrail_id=rule.get("id"),
                            guardrail_type="content_filter",
                            entity_type=rule_name,
                            action="block",
                            matched_text=f"Invalid pattern: {pattern_str[:30]}",
                            start=0,
                            end=0,
                        )
                    )
                continue

            matches = _run_regex_safe(compiled, text)
            for m in matches:
                detections.append(
                    Detection(
                        guardrail_id=rule.get("id"),
                        guardrail_type="content_filter",
                        entity_type=rule_name,
                        action=action,
                        matched_text=m.group(),
                        start=m.start(),
                        end=m.end(),
                    )
                )

        except Exception as e:
            logger.warning(f"Content filter rule '{rule_name}' failed: {e}")
            if settings.get("content_filter_on_error", "allow") == "block":
                detections.append(
                    Detection(
                        guardrail_id=rule.get("id"),
                        guardrail_type="content_filter",
                        entity_type=rule_name,
                        action="block",
                        matched_text=f"Rule execution error",
                        start=0,
                        end=0,
                    )
                )

    return detections


def _apply_mask(
    text: str,
    detections: list[Detection],
    settings: dict,
) -> str:
    """Apply MASK replacements to text, processing right-to-left to preserve positions."""
    mask_detections = [d for d in detections if d.action == "mask"]
    if not mask_detections:
        return text

    # Build span-to-detection map, then merge overlapping spans
    spans_with_det = [(d.start, d.end, d) for d in mask_detections]
    spans_with_det.sort(key=lambda s: s[0])

    # Merge overlapping spans, keeping the first detection for replacement type
    merged: list[tuple[int, int, Detection]] = []
    for start, end, det in spans_with_det:
        if merged and start <= merged[-1][1]:
            # Overlapping — extend the span, keep the first detection
            merged[-1] = (merged[-1][0], max(merged[-1][1], end), merged[-1][2])
        else:
            merged.append((start, end, det))

    # Process right-to-left to preserve character positions
    result = text
    for start, end, detection in reversed(merged):
        if detection.guardrail_type == "pii":
            fmt = settings.get("pii_replacement_format", "<ENTITY_TYPE>")
            replacement = fmt.replace("ENTITY_TYPE", detection.entity_type)
        else:
            replacement = settings.get("content_filter_replacement", "[REDACTED]")

        result = result[:start] + replacement + result[end:]

    return result


def _nothing_to_scan(text: str, guardrail_rules: list[dict]) -> bool:
    return not text or not guardrail_rules


def scan_text(
    text: str,
    guardrail_rules: list[dict],
    settings: dict,
) -> ScanResult:
    """
    Main entry point. Scans text against all active guardrail rules.

    Args:
        text: The text to scan (last user message)
        guardrail_rules: List of guardrail rule dicts from DB
        settings: Org guardrail settings dict

    Returns:
        ScanResult with blocked status, detections, and optionally masked text
    """
    start_time = time.time()

    if _nothing_to_scan(text, guardrail_rules):
        return ScanResult()

    all_detections: list[Detection] = []

    # Run PII scan
    pii_rules = [r for r in guardrail_rules if r.get("guardrail_type") == "pii"]
    if pii_rules:
        all_detections.extend(_scan_pii(text, pii_rules, settings))

    # Run content filter
    cf_rules = [r for r in guardrail_rules if r.get("guardrail_type") == "content_filter"]
    if cf_rules:
        all_detections.extend(_scan_content_filter(text, cf_rules, settings))

    # Check for BLOCK detections
    block_detections = [d for d in all_detections if d.action == "block"]
    if block_detections:
        first_block = block_detections[0]
        return ScanResult(
            blocked=True,
            block_reason=f"{first_block.guardrail_type}: {first_block.entity_type} detected",
            detections=all_detections,
            execution_time_ms=int((time.time() - start_time) * 1000),
        )

    # Apply MASK to text
    masked_text = None
    mask_detections = [d for d in all_detections if d.action == "mask"]
    if mask_detections:
        masked_text = _apply_mask(text, mask_detections, settings)

    return ScanResult(
        blocked=False,
        detections=all_detections,
        masked_text=masked_text,
        execution_time_ms=int((time.time() - start_time) * 1000),
    )


# ---------------------------------------------------------------------------
# Off-loop scanning
# ---------------------------------------------------------------------------
#
# scan_text is CPU-bound and synchronous (Presidio + spaCy NER for PII, regex
# for content filters). Called straight from a coroutine it stalls the event
# loop, and with it every other gateway request, for as long as the scan (or
# the first-use spaCy model load) takes.
#
# Async callers use scan_text_async, which runs scan_text on ONE dedicated
# worker thread. One thread, not a pool: Presidio and spaCy are not documented
# as safe to use from several threads at once, and every analysis then happens
# on the same thread, so the shared engine is never used concurrently. Scans
# queue behind each other on that thread. That is intended: throughput is the
# same as the serial, on-loop behaviour before, but the loop stays free.

_scan_executor: ThreadPoolExecutor | None = None
_scan_executor_lock = threading.Lock()


def get_scan_executor() -> ThreadPoolExecutor:
    """The single guardrail scan thread, created on first use."""
    global _scan_executor
    with _scan_executor_lock:
        if _scan_executor is None:
            _scan_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix=SCAN_THREAD_PREFIX)
        return _scan_executor


def shutdown_scan_executor() -> None:
    """Stop taking new work on the scan thread at app shutdown, without waiting.
    Scans already queued still run, so no awaiting caller sees a cancellation;
    Python joins the thread at interpreter exit, as it does for any executor."""
    global _scan_executor
    with _scan_executor_lock:
        executor, _scan_executor = _scan_executor, None
    if executor is not None:
        executor.shutdown(wait=False)


async def scan_text_async(
    text: str,
    guardrail_rules: list[dict],
    settings: dict,
) -> ScanResult:
    """scan_text, run on the dedicated scan thread so the event loop is not blocked.
    Same arguments and result as scan_text."""
    if _nothing_to_scan(text, guardrail_rules):
        # Answer at once instead of queueing behind other scans.
        return ScanResult()
    loop = asyncio.get_running_loop()
    # run_in_executor does not carry contextvars; copy them so log lines from
    # the scan thread keep the request id.
    ctx = contextvars.copy_context()
    return await loop.run_in_executor(
        get_scan_executor(),
        functools.partial(ctx.run, scan_text, text=text, guardrail_rules=guardrail_rules, settings=settings),
    )


def _preload_pii_engine() -> None:
    """Load Presidio and the spaCy model. Runs on the scan thread."""
    from services import presidio_engine

    try:
        presidio_engine.warm_up()
    except Exception as e:
        # The lazy path loads it again on the first PII scan and reports the error there.
        logger.error(f"PII engine preload failed: {e}")


def preload_pii_engine() -> Future:
    """Start loading the PII engine on the scan thread and return without waiting,
    so the first PII scan does not pay for the spaCy model load."""
    return get_scan_executor().submit(_preload_pii_engine)
