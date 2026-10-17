"""Make untrusted text safe for a log line.

Tool names, arguments, exception messages and anything the gateway sends back
(reasons, rule names, monitored details) can contain line breaks or terminal
escape sequences. Logged raw, they could forge extra log records or rewrite a
terminal. :func:`log_safe` turns any value into one printable line.
"""

from __future__ import annotations

import re
import traceback
from typing import Any

DEFAULT_LIMIT = 500

# CSI (ESC [ ... final), OSC (ESC ] ... BEL or ESC \), and two-character escapes.
_ANSI = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?|[@-Z\\-_])")
_ESCAPES = {"\n": "\\n", "\r": "\\r", "\t": "\\t"}


def _escape(ch: str) -> str:
    if ch in _ESCAPES:
        return _ESCAPES[ch]
    if ch.isprintable():
        return ch
    code = ord(ch)
    return f"\\x{code:02x}" if code < 0x100 else f"\\u{code:04x}" if code < 0x10000 else f"\\U{code:08x}"


def log_safe(value: Any, limit: int = DEFAULT_LIMIT) -> str:
    """``value`` as one printable line: ANSI escape sequences removed, CR, LF,
    tabs and other control or non-printable characters escaped (``\\n``,
    ``\\x1b``, ``\\u2028``), and cut to ``limit`` characters. Never raises."""
    try:
        text = value if isinstance(value, str) else str(value)
    except Exception:  # noqa: BLE001 - a hostile __str__ must not break logging
        text = f"<unprintable {type(value).__name__}>"
    text = _ANSI.sub("", text)
    extra = len(text) - limit
    if extra > 0:
        text = text[:limit]
    escaped = "".join(_escape(ch) for ch in text)
    return f"{escaped}...[{extra} more characters]" if extra > 0 else escaped


def safe_traceback(exc: BaseException, limit: int = 4000) -> str:
    """The exception's traceback as one escaped line, for an ERROR record."""
    try:
        text = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    except Exception:  # noqa: BLE001
        text = f"{type(exc).__name__}"
    return log_safe(text, limit)
