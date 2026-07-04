"""
Helpers for working with MCP tool-call arguments.

Approvals are scoped to the exact arguments of a call. To compare arguments
deterministically (regardless of key order), we hash a canonical JSON encoding.
"""

import hashlib
import json
from typing import Any


def hash_arguments(arguments: Any) -> str:
    """Return a stable SHA-256 hex digest of a tool call's arguments.

    Uses canonical JSON (sorted keys, no insignificant whitespace) so that two
    semantically identical argument sets produce the same hash regardless of key
    ordering. ``None`` is treated as an empty object so a missing-args call and
    an explicit ``{}`` call hash the same.
    """
    if arguments is None:
        arguments = {}
    canonical = json.dumps(arguments, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
