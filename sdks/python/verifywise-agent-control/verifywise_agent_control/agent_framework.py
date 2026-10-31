"""Microsoft Agent Framework adapter: function middleware that governs every tool call.

    from agent_framework import Agent
    from verifywise_agent_control.agent_framework import VerifyWiseFunctionMiddleware

    agent = Agent(client=chat_client, tools=tools, middleware=[VerifyWiseFunctionMiddleware()])

Uses ``FunctionMiddleware.process(context, call_next)``, which wraps every
function the agent's function-calling loop invokes. Behaviour verified against
agent-framework-core 1.21.0:

- A refused call sets ``context.result`` to the refusal text and does not call
  ``call_next``, so the tool does not run, the model gets
  ``Blocked by VerifyWise policy: <reason>`` as the function result, and the
  agent continues.
- With ``on_deny="raise"`` the middleware raises
  :class:`VerifyWiseAgentFrameworkDenied`, a ``VerifyWiseDenied`` that is also
  the framework's ``MiddlewareFailure``, the one exception the loop does not
  turn into a tool-error result, so ``agent.run()`` raises it. Only the
  middleware's own check raises it: a ``VerifyWiseDenied`` raised inside the
  tool (say, by a governed function the tool calls) is the tool failing and
  becomes a normal tool-error result.
- A tool exception reaches the middleware through ``call_next``; it is recorded
  and re-raised unchanged, and the framework turns it into an error result.

Run id: the active ``vw_session`` id, else the ``AgentSession.session_id`` passed
to ``agent.run(..., session=...)``, else the middleware client's own id.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from agent_framework import FunctionInvocationContext, FunctionMiddleware, MiddlewareFailure

from ._core import arun_governed, async_client_for, default_async_client
from .client import AgentControlClient, AsyncAgentControlClient
from .decision import Decision, VerifyWiseDenied
from .session import current_session_id


class VerifyWiseAgentFrameworkDenied(VerifyWiseDenied, MiddlewareFailure):
    """``VerifyWiseDenied`` that stops the agent run (``on_deny="raise"``)."""

    def __init__(self, tool_name: str, decision: Decision):
        VerifyWiseDenied.__init__(self, tool_name, decision)


def _arguments(context: FunctionInvocationContext) -> Any:
    """The function's arguments as checked: a pydantic arguments model is
    dumped in Python mode (field values unchanged, nested models as dicts), so
    a value JSON can't represent exactly makes the check refuse the call
    rather than send a converted copy."""
    arguments = context.arguments
    if hasattr(arguments, "model_dump"):
        return arguments.model_dump()
    try:
        return dict(arguments)
    except (TypeError, ValueError):
        return arguments


def _text(item: Any) -> Any:
    text = getattr(item, "text", None)
    if isinstance(text, str):
        return text
    result = getattr(item, "result", None)
    return result if result is not None else str(item)


def _describe(result: Any) -> tuple[Any, Any]:
    """What to record for ``context.result``: the text of the function's output."""
    if isinstance(result, list):
        parts = [_text(item) for item in result]
        if len(parts) == 1:
            return parts[0], None
        return parts, None
    return result, None


class VerifyWiseFunctionMiddleware(FunctionMiddleware):
    """Checks every function call with VerifyWise Agent Control before it runs.

    Args:
        client: An ``AsyncAgentControlClient``. An ``AgentControlClient`` is
            accepted too and its settings reused (one shared async client per
            sync client). When omitted, the shared client built from the
            ``VW_*`` environment variables is used.
    """

    def __init__(self, client: AsyncAgentControlClient | AgentControlClient | None = None):
        super().__init__()
        if isinstance(client, AgentControlClient):
            client = async_client_for(client)
        self.client = client or default_async_client()

    def _session_id(self, context: FunctionInvocationContext) -> str:
        session = getattr(context, "session", None)
        session_id = getattr(session, "session_id", None)
        return current_session_id() or (str(session_id) if session_id else self.client.session_id)

    async def process(
        self,
        context: FunctionInvocationContext,
        call_next: Callable[[], Awaitable[None]],
    ) -> None:
        tool_name = getattr(context.function, "name", None) or "unknown"
        call_id = context.metadata.get("call_id")

        async def execute() -> Any:
            await call_next()
            return context.result

        context.result = await arun_governed(
            self.client,
            tool_name=tool_name,
            arguments=_arguments(context),
            execute=execute,
            session_id=self._session_id(context),
            call_id=str(call_id) if call_id else None,
            describe=_describe,
            # call_next runs context.arguments; dump them again right before.
            current_arguments=lambda: _arguments(context),
            # Our own refusal (on_deny="raise") must stop the run; a plain
            # exception would become a tool-error result and the loop would go
            # on. Raised by the check only, never for an exception the tool raises.
            denied_error=VerifyWiseAgentFrameworkDenied,
        )
