"""The current agent run (session) id, kept in a context variable.

Every tool call checked inside ``with vw_session(...)`` is recorded under the same
run in Agent Control. Send the same id as the ``x-vw-agent-run-id`` header on model
calls through the AI Gateway to correlate model and tool calls.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

_current_session: ContextVar[str | None] = ContextVar("verifywise_session_id", default=None)


def new_session_id() -> str:
    return str(uuid.uuid4())


def current_session_id() -> str | None:
    """The session id set by the innermost ``vw_session``, or None."""
    return _current_session.get()


@contextmanager
def vw_session(session_id: str | None = None) -> Iterator[str]:
    """Group the tool calls made inside the block into one run.

    Args:
        session_id: The run id to use; a new uuid4 when omitted.

    The ``as`` target is the session id in effect inside the block.
    """
    value = session_id or new_session_id()
    token = _current_session.set(value)
    try:
        yield value
    finally:
        _current_session.reset(token)
