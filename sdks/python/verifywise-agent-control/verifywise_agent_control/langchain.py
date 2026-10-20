"""LangChain v1 adapter: agent middleware that governs every tool call.

    from langchain.agents import create_agent
    from verifywise_agent_control.langchain import VerifyWiseMiddleware

    agent = create_agent(model, tools=tools, middleware=[VerifyWiseMiddleware()])

Uses ``AgentMiddleware.wrap_tool_call`` / ``awrap_tool_call``, so every tool the
agent calls is checked, including tools added by other middleware. A refused
call becomes a ``ToolMessage`` with ``status="error"`` and the refusal text; the
tool does not run and the agent continues.

Run id: the active ``vw_session`` id, else the LangGraph ``thread_id``, else a
new id created once per agent invocation.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from langchain.agents.middleware import AgentMiddleware, AgentState
from langchain.agents.middleware.types import PrivateStateAttr
from langchain_core.messages import ToolMessage
from typing_extensions import NotRequired

from ._core import (
    arun_governed,
    async_client_for,
    default_async_client,
    default_client,
    run_governed,
    sync_client_for,
)
from .client import AgentControlClient, AsyncAgentControlClient
from .decision import Decision
from .session import current_session_id, new_session_id

logger = logging.getLogger("verifywise_agent_control")

SESSION_STATE_KEY = "vw_session_id"


class VerifyWiseState(AgentState):
    """Agent state plus the per-invocation run id (private: not in input or output)."""

    vw_session_id: NotRequired[Annotated[str, PrivateStateAttr]]


def _thread_id(request: Any) -> str | None:
    runtime = getattr(request, "runtime", None)
    config = getattr(runtime, "config", None) or {}
    thread_id = (config.get("configurable") or {}).get("thread_id")
    if thread_id is None:
        info = getattr(runtime, "execution_info", None)
        thread_id = getattr(info, "thread_id", None)
    return str(thread_id) if thread_id is not None else None


def _state_session_id(request: Any) -> str | None:
    state = getattr(request, "state", None)
    if isinstance(state, dict):
        return state.get(SESSION_STATE_KEY)
    return getattr(state, SESSION_STATE_KEY, None)


def _describe(result: Any) -> tuple[Any, Any]:
    """What to record for the handler's result: (output, error)."""
    if isinstance(result, ToolMessage):
        content = result.content
        if result.status == "error":
            return None, content
        return content, None
    return result, None


class VerifyWiseMiddleware(AgentMiddleware):
    """Checks every tool call with VerifyWise Agent Control before it runs.

    Args:
        client: Client for synchronous agents (``invoke``/``stream``).
        async_client: Client for async agents (``ainvoke``/``astream``).

    With neither, the shared clients built from the ``VW_*`` environment
    variables are used (the same ones ``@governed`` uses). With only one, the
    other is a shared client with the same settings.
    """

    state_schema = VerifyWiseState

    def __init__(
        self,
        client: AgentControlClient | None = None,
        async_client: AsyncAgentControlClient | None = None,
    ):
        super().__init__()
        if client is None and async_client is None:
            client, async_client = default_client(), default_async_client()
        elif client is None:
            client = sync_client_for(async_client)
        elif async_client is None:
            async_client = async_client_for(client)
        self.client = client
        self.async_client = async_client

    # A fresh run id per agent invocation, used when there is no vw_session and
    # no thread_id. Kept in private state, so it never reaches the caller.
    def before_agent(self, state: Any, runtime: Any) -> dict[str, Any] | None:
        return {SESSION_STATE_KEY: new_session_id()}

    async def abefore_agent(self, state: Any, runtime: Any) -> dict[str, Any] | None:
        return {SESSION_STATE_KEY: new_session_id()}

    def _session_id(self, request: Any, fallback: str) -> str:
        return current_session_id() or _thread_id(request) or _state_session_id(request) or fallback

    @staticmethod
    def _call(request: Any) -> tuple[str, Any, str | None]:
        call = request.tool_call
        return call.get("name") or "unknown", call.get("args") or {}, call.get("id")

    @staticmethod
    def _refuse(tool_name: str, call_id: str | None) -> Callable[[Decision], ToolMessage]:
        def refuse(decision: Decision) -> ToolMessage:
            return ToolMessage(
                content=decision.refusal_message,
                tool_call_id=call_id or "",
                name=tool_name,
                status="error",
            )

        return refuse

    def wrap_tool_call(self, request: Any, handler: Callable[[Any], Any]) -> Any:
        tool_name, arguments, call_id = self._call(request)
        return run_governed(
            self.client,
            tool_name=tool_name,
            arguments=arguments,
            execute=lambda: handler(request),
            session_id=self._session_id(request, self.client.session_id),
            call_id=call_id,
            refuse=self._refuse(tool_name, call_id),
            describe=_describe,
            # The handler runs request.tool_call["args"]; read it again right before.
            current_arguments=lambda: self._call(request)[1],
        )

    async def awrap_tool_call(self, request: Any, handler: Callable[[Any], Awaitable[Any]]) -> Any:
        tool_name, arguments, call_id = self._call(request)
        return await arun_governed(
            self.async_client,
            tool_name=tool_name,
            arguments=arguments,
            execute=lambda: handler(request),
            session_id=self._session_id(request, self.async_client.session_id),
            call_id=call_id,
            refuse=self._refuse(tool_name, call_id),
            describe=_describe,
            # The handler runs request.tool_call["args"]; read it again right before.
            current_arguments=lambda: self._call(request)[1],
        )
