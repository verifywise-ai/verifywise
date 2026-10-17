"""CrewAI adapter: governs every tool call through CrewAI's tool-call hooks.

    from verifywise_agent_control.crewai import enable_crewai_governance

    enable_crewai_governance()
    crew.kickoff()

Registers one ``pre_tool_call`` and one ``post_tool_call`` hook (plus
``execution_start``/``execution_end`` hooks for run ids). CrewAI runs these
hooks on every tool-execution path (native function calling, the text ReAct
loop, parallel tool calls, ``Agent.kickoff``), so no tool can be missed. The
hooks are process-wide: they govern every crew and agent in the process until
``disable()`` is called.

Behaviour verified against crewai 1.15.28:

- A refused call is blocked in the pre hook, so the tool does not run. CrewAI
  still runs the post hooks on a blocked call, and the post hook replaces
  CrewAI's fixed "Tool execution blocked by hook" text with our refusal, so the
  model sees ``Blocked by VerifyWise policy: <reason>`` and the agent continues.
- With ``on_deny="raise"`` the post hook raises :class:`VerifyWiseCrewAIDenied`
  (a ``VerifyWiseDenied`` that is also CrewAI's ``HookAborted``), which CrewAI
  passes through without retrying, so ``kickoff()`` raises it. Any other
  exception raised inside a CrewAI hook is swallowed by CrewAI.
- CrewAI catches tool exceptions itself and hands the error text to the model.
  The adapter does not change that; it records the error on the audit row.

What the audit row says happened never depends on the text of the tool result.
A tool's output can echo web pages, files or user input, so it can contain
CrewAI's own "blocked" or "error" wording. Instead, for an allowed call the pre
hook arms a thin shim around the tool's body (``func`` of the
``CrewStructuredTool`` and of a ``@tool`` function, ``_run``/``_arun`` of a
``BaseTool`` subclass), and the post hook restores it. The shim records whether
the body started and whether it raised, and the post hook reports:

- the body returned: the raw result as output (a ``ToolFailure`` the tool
  returned is recorded as an error, since it is the tool's own structured
  report of failure);
- the body raised: the exception, as ``<type>: <message>``;
- the body never started: :data:`NOT_EXECUTED`. That covers another pre-tool
  hook blocking the call, a spent usage limit, a result served from CrewAI's
  tool cache, and arguments CrewAI rejected before calling the tool. CrewAI
  gives the post hook no structural way to tell these apart.

When no reliable signal exists (the hook context carries no tool object to
arm, or the same tool object has two calls in flight and its body runs in a
thread without either call's context), the raw result is reported as output,
never interpreted.

Run id: the active ``vw_session`` id, else a new id per crew kickoff, else the
client's own id (e.g. ``Agent.kickoff`` outside a crew).
"""

from __future__ import annotations

import functools
import inspect
import logging
import threading
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

from crewai.hooks import HookAborted, InterceptionPoint, register_hook, unregister_hook

from ._core import default_client
from ._logsafe import log_safe, safe_traceback
from .client import AgentControlClient, arguments_changed, has_audit_row
from .decision import Decision, VerifyWiseDenied
from .session import current_session_id, new_session_id

try:  # crewai >= 1.15: a tool's structured report that it failed
    from crewai.tools.tool_failure import ToolFailure
except ImportError:  # pragma: no cover - older crewai
    ToolFailure = None  # type: ignore[assignment,misc]

logger = logging.getLogger("verifywise_agent_control")

ARGUMENTS_CHANGED_AFTER_RUN = (
    "arguments changed after VerifyWise checked them; the tool ran with arguments that were not checked"
)

NOT_EXECUTED = (
    "not executed: CrewAI did not run the tool after VerifyWise allowed it "
    "(another pre-tool hook blocked it, its usage limit was reached, the result came "
    "from CrewAI's tool cache, or CrewAI rejected the arguments)"
)


class VerifyWiseCrewAIDenied(VerifyWiseDenied, HookAborted):
    """``VerifyWiseDenied`` that CrewAI treats as a deliberate stop (``on_deny="raise"``)."""

    def __init__(self, tool_name: str, decision: Decision):
        VerifyWiseDenied.__init__(self, tool_name, decision)
        self.reason = decision.refusal_message
        self.source = "verifywise_agent_control"


@dataclass(eq=False)
class _Pending:
    tool_name: str
    tool_input_id: int
    session_id: str
    call_id: str
    decision: Decision
    # Execution state, written by the shim around the tool's body.
    targets: tuple[Any, ...] = ()  # the tool objects armed for this call
    started: bool = False  # the body was entered
    error: BaseException | None = None  # what the last run of the body raised
    failure: Any = None  # a ToolFailure the last run of the body returned
    ambiguous: bool = False  # a run of the body could not be tied to one call


# Pre → post hand-over. CrewAI runs the pre hook, the tool and the post hook
# in one context (parallel calls each get a copied context), and tools such as
# delegation can nest further calls in between, hence a stack.
_pending: ContextVar[tuple[_Pending, ...]] = ContextVar("verifywise_crewai_pending", default=())
# Run ids of the crew kickoffs in progress in this context (innermost last).
_kickoffs: ContextVar[tuple[str, ...]] = ContextVar("verifywise_crewai_kickoffs", default=())


# ── Execution state ───────────────────────────────────────────────────────
#
# The tool's body is wrapped for the duration of an allowed call, so the post
# hook knows from the call itself, not from the text of its result, whether
# the body ran and whether it raised.


@dataclass(eq=False)
class _Armed:
    """A tool object whose body is wrapped, and the calls in flight on it."""

    owner: Any
    # (attribute, was an instance attribute before, its previous value, shim)
    patches: list[tuple[str, bool, Any, Any]]
    calls: list[_Pending] = field(default_factory=list)


_armed: dict[int, _Armed] = {}
_armed_lock = threading.Lock()


def _tool_objects(ctx: Any) -> tuple[Any, ...]:
    """The hook context's tool, and the tool it was converted from, if any."""
    tool = getattr(ctx, "tool", None)
    if tool is None:
        return ()
    original = getattr(tool, "_original_tool", None)
    return (tool,) if original is None or original is tool else (tool, original)


def _body_attributes(tool: Any) -> tuple[str, ...]:
    """Where the tool's own code is called from.

    ``CrewStructuredTool`` and ``@tool`` functions call their ``func`` field;
    a ``BaseTool`` subclass is its ``_run`` / ``_arun`` methods.
    """
    fields = getattr(type(tool), "model_fields", None) or {}
    if "func" in fields and callable(getattr(tool, "func", None)):
        return ("func",)
    return tuple(name for name in ("_run", "_arun") if callable(getattr(tool, name, None)))


def _call_for(owner: Any) -> _Pending | None:
    """The governed call a run of ``owner``'s body belongs to.

    The innermost call on this context's stack that armed ``owner``. The body
    can run in a thread without that context (CrewAI runs sync tools of the
    async ReAct loop in ``run_in_executor``); then the call is the only one in
    flight on ``owner``, or, with several, none: those are marked ambiguous.
    """
    for entry in reversed(_pending.get()):
        if any(target is owner for target in entry.targets):
            return entry
    with _armed_lock:
        armed = _armed.get(id(owner))
        calls = list(armed.calls) if armed is not None and armed.owner is owner else []
    if len(calls) == 1:
        return calls[0]
    for entry in calls:
        entry.ambiguous = True
    return None


def _started(owner: Any) -> _Pending | None:
    entry = _call_for(owner)
    if entry is not None:
        entry.started = True
    return entry


def _finished(entry: _Pending | None, result: Any = None, error: BaseException | None = None) -> None:
    # Called on every run of the body: the last run wins (CrewAI's ReAct loop
    # retries a failed tool), and an outer run wins over a nested one.
    if entry is not None:
        entry.error = error
        entry.failure = result if ToolFailure is not None and isinstance(result, ToolFailure) else None


async def _watched(entry: _Pending | None, awaitable: Any) -> Any:
    try:
        result = await awaitable
    except Exception as exc:
        _finished(entry, error=exc)
        raise
    _finished(entry, result=result)
    return result


def _shim(owner: Any, body: Any) -> Any:
    """``body``, recording each run on the governed call it belongs to."""
    if inspect.iscoroutinefunction(body):

        @functools.wraps(body)
        async def run_async(*args: Any, **kwargs: Any) -> Any:
            return await _watched(_started(owner), body(*args, **kwargs))

        return run_async

    @functools.wraps(body)
    def run(*args: Any, **kwargs: Any) -> Any:
        entry = _started(owner)
        try:
            result = body(*args, **kwargs)
        except Exception as exc:
            _finished(entry, error=exc)
            raise
        if inspect.iscoroutine(result):  # a sync function handing back a coroutine
            return _watched(entry, result)
        _finished(entry, result=result)
        return result

    return run


def _install(tool: Any) -> _Armed | None:
    try:
        own = vars(tool)
    except TypeError:
        return None
    patches = []
    for attr in _body_attributes(tool):
        had_own = attr in own
        previous = own.get(attr)
        shim = _shim(tool, getattr(tool, attr))
        # object.__setattr__: skips pydantic validation, and a method shadowed
        # in the instance __dict__ is what CrewAI's self._run / self.func finds.
        object.__setattr__(tool, attr, shim)
        if vars(tool).get(attr) is shim:
            patches.append((attr, had_own, previous, shim))
    return _Armed(tool, patches) if patches else None


def _restore(armed: _Armed) -> None:
    own = vars(armed.owner)
    for attr, had_own, previous, shim in armed.patches:
        if own.get(attr) is not shim:
            continue  # replaced by someone else since: leave theirs in place
        if had_own:
            object.__setattr__(armed.owner, attr, previous)
        else:
            del own[attr]


def _arm(entry: _Pending, tools: tuple[Any, ...]) -> None:
    armed_on = []
    with _armed_lock:
        for tool in tools:
            armed = _armed.get(id(tool))
            if armed is None:
                armed = _install(tool)
                if armed is None:
                    continue
                _armed[id(tool)] = armed
            armed.calls.append(entry)
            armed_on.append(tool)
    entry.targets = tuple(armed_on)


def _disarm(entry: _Pending) -> None:
    with _armed_lock:
        for tool in entry.targets:
            armed = _armed.get(id(tool))
            if armed is None:
                continue
            armed.calls = [call for call in armed.calls if call is not entry]
            if not armed.calls:
                del _armed[id(tool)]
                _restore(armed)


def _disarm_all() -> None:
    with _armed_lock:
        for armed in _armed.values():
            _restore(armed)
        _armed.clear()


def _outcome(entry: _Pending, ctx: Any) -> tuple[bool, Any, Any]:
    """``(ran, output, error)`` from the call's execution state."""
    if not entry.targets or entry.ambiguous:
        # No reliable signal: report the result as it is, never interpret it.
        return True, ctx.raw_tool_result, None
    if not entry.started:
        return False, None, NOT_EXECUTED
    if entry.error is not None:
        return True, None, entry.error
    if entry.failure is not None:
        return True, None, f"ToolFailure: {entry.failure.as_agent_message()}"
    return True, ctx.raw_tool_result, None


class CrewAIGovernance:
    """The registered hooks. Create with :func:`enable_crewai_governance`."""

    def __init__(self, client: AgentControlClient):
        self.client = client
        self._hooks = (
            (InterceptionPoint.EXECUTION_START, self._on_execution_start),
            (InterceptionPoint.EXECUTION_END, self._on_execution_end),
            (InterceptionPoint.PRE_TOOL_CALL, self._before_tool_call),
            (InterceptionPoint.POST_TOOL_CALL, self._after_tool_call),
        )
        self.enabled = False

    def _enable(self) -> None:
        for point, hook in self._hooks:
            register_hook(point, hook)
        self.enabled = True

    def disable(self) -> None:
        """Remove the hooks; later tool calls are no longer checked."""
        for point, hook in self._hooks:
            unregister_hook(point, hook)
        _disarm_all()
        self.enabled = False

    # ── Run ids ────────────────────────────────────────────────────────────

    def _on_execution_start(self, ctx: Any) -> None:
        _kickoffs.set((*_kickoffs.get(), new_session_id()))
        return None  # a non-None return would replace the kickoff inputs

    def _on_execution_end(self, ctx: Any) -> None:
        _kickoffs.set(_kickoffs.get()[:-1])
        return None

    def _session_id(self) -> str:
        kickoffs = _kickoffs.get()
        return current_session_id() or (kickoffs[-1] if kickoffs else self.client.session_id)

    # ── Tool calls ─────────────────────────────────────────────────────────

    def _before_tool_call(self, ctx: Any) -> bool | None:
        tool_name = ctx.tool_name or "unknown"
        session_id = self._session_id()
        call_id = str(uuid.uuid4())
        decision = self.client.check(tool_name, ctx.tool_input or {}, session_id=session_id, call_id=call_id)
        entry = _Pending(tool_name, id(ctx.tool_input), session_id, call_id, decision)
        if decision.allowed and has_audit_row(decision):
            try:
                _arm(entry, _tool_objects(ctx))
            except Exception as exc:  # noqa: BLE001 - never let result capture break the agent
                logger.debug(
                    "VerifyWise could not track tool '%s': %s", log_safe(tool_name), safe_traceback(exc)
                )
        _pending.set((*_pending.get(), entry))
        return None if decision.allowed else False

    def _take_pending(self, ctx: Any) -> _Pending | None:
        stack = _pending.get()
        for index in range(len(stack) - 1, -1, -1):
            entry = stack[index]
            if entry.tool_name == ctx.tool_name and entry.tool_input_id == id(ctx.tool_input):
                _pending.set(stack[:index] + stack[index + 1 :])
                return entry
        for index in range(len(stack) - 1, -1, -1):  # input dict was copied: match by name
            if stack[index].tool_name == ctx.tool_name:
                entry = stack[index]
                _pending.set(stack[:index] + stack[index + 1 :])
                return entry
        return None

    def _after_tool_call(self, ctx: Any) -> str | None:
        entry = self._take_pending(ctx)
        if entry is None:
            return None
        _disarm(entry)
        if not entry.decision.allowed:
            if self.client.settings.on_deny == "raise":
                raise VerifyWiseCrewAIDenied(entry.tool_name, entry.decision)
            return entry.decision.refusal_message
        if not has_audit_row(entry.decision):
            # Allowed by the fail mode during a gateway outage: there is no
            # audit row to attach the result to.
            return None
        try:
            ran, output, error = _outcome(entry, ctx)
        except Exception:  # noqa: BLE001 - never let result capture break the agent
            ran, output, error = True, None, None
        if ran and arguments_changed(entry.decision, ctx.tool_input or {}):
            # A pre-tool hook registered after ours changed the input in place.
            # The tool has already run, so this can only be recorded loudly.
            logger.error(
                "VerifyWise: tool '%s' ran with arguments that changed after they were checked. "
                "Call enable_crewai_governance() after registering hooks that modify tool input.",
                log_safe(entry.tool_name),
            )
            error, output = ARGUMENTS_CHANGED_AFTER_RUN, None
        self.client.report(
            session_id=entry.session_id,
            call_id=entry.call_id,
            tool_name=entry.tool_name,
            output=output,
            error=error,
        )
        return None


_lock = threading.Lock()
_active: CrewAIGovernance | None = None


def enable_crewai_governance(client: AgentControlClient | None = None) -> CrewAIGovernance:
    """Check every CrewAI tool call in this process with VerifyWise Agent Control.

    Calling it again replaces the previous registration, so hooks are never
    doubled.

    Args:
        client: The client to use. Built from the ``VW_*`` environment variables
            when omitted.

    Returns:
        The registration; call ``.disable()`` to remove it.
    """
    global _active
    with _lock:
        if _active is not None:
            _active.disable()
        _active = CrewAIGovernance(client or default_client())
        _active._enable()
        return _active


def disable_crewai_governance() -> None:
    """Remove the hooks registered by :func:`enable_crewai_governance`, if any."""
    global _active
    with _lock:
        if _active is not None:
            _active.disable()
            _active = None
