"""Govern plain Python functions: ``@governed`` and ``govern_tool()``.

For custom agents without a supported framework. Each call is checked with the
gateway first; a refused call returns the refusal text instead of running.

The gateway sees every argument the function runs with, defaults included.
On methods (instance, class or static, with ``@governed`` above or below
``@classmethod`` / ``@staticmethod``) the ``self`` / ``cls`` argument is left
out: it is the object the method belongs to, not tool input.
"""

from __future__ import annotations

import functools
import inspect
from collections.abc import Callable
from typing import Any, TypeVar, overload

from ._core import arun_governed, default_async_client, default_client, run_governed
from .client import AgentControlClient, AsyncAgentControlClient

F = TypeVar("F", bound=Callable[..., Any])


_POSITIONAL = (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)


def _owner(fn: Any) -> tuple[str | None, str] | None:
    """(module, qualified name) of the class ``fn`` is defined in, or None for a
    function defined outside a class body."""
    owner, dot, _ = getattr(fn, "__qualname__", "").rpartition(".")
    if not dot or owner.endswith("<locals>"):
        return None
    return getattr(fn, "__module__", None), owner


def _belongs_to_owner(name: str, value: Any, owner: tuple[str | None, str] | None) -> bool:
    """True when ``value`` is the instance (``self``) or class (``cls``) the
    method was defined on, or a subclass of it."""
    if owner is None:
        return False
    if name == "self":
        mro = type(value).__mro__
    elif name == "cls" and isinstance(value, type):
        mro = value.__mro__
    else:
        return False
    module, qualname = owner
    return any(k.__qualname__ == qualname and k.__module__ == module for k in mro)


def _receiver(
    signature: inspect.Signature | None,
    args: tuple,
    bound_first: bool,
    owner: tuple[str | None, str] | None,
) -> str | None:
    """The name of the first parameter when it holds ``self`` / ``cls``, else None."""
    if signature is None or not args:
        return None
    params = list(signature.parameters.values())
    if not params or params[0].kind not in _POSITIONAL:
        return None
    first = params[0].name
    return first if bound_first or _belongs_to_owner(first, args[0], owner) else None


def _call_arguments(
    signature: inspect.Signature | None,
    args: tuple,
    kwargs: dict,
    *,
    bound_first: bool = False,
    owner: tuple[str | None, str] | None = None,
) -> dict[str, Any]:
    """The call's arguments by parameter name, defaults applied and
    ``**kwargs`` merged in, without the ``self`` / ``cls`` receiver.

    ``bound_first``: the first positional argument is always the receiver (a
    function wrapped from a ``classmethod``).
    """
    receiver = _receiver(signature, args, bound_first, owner)
    if signature is not None:
        try:
            bound = signature.bind(*args, **kwargs)
        except TypeError:
            pass
        else:
            # Defaulted parameters are part of what runs, so they are checked too.
            bound.apply_defaults()
            out: dict[str, Any] = {}
            for name, value in bound.arguments.items():
                if name == receiver:
                    continue
                kind = signature.parameters[name].kind
                if kind is inspect.Parameter.VAR_KEYWORD:
                    out.update(value)
                elif kind is inspect.Parameter.VAR_POSITIONAL:
                    out[name] = list(value)
                else:
                    out[name] = value
            return out
    positional = list(args[1:] if receiver or (bound_first and args) else args)
    return {"args": positional, "kwargs": dict(kwargs)}


def _is_async(fn: Any) -> bool:
    """An ``async def`` function, or an object whose ``__call__`` is one."""
    call = getattr(fn, "__call__", None)  # noqa: B004 - we need the method itself, not callable()
    return inspect.iscoroutinefunction(fn) or inspect.iscoroutinefunction(call)


def _wrap(fn: Any, client: AgentControlClient | AsyncAgentControlClient | None, name: str | None) -> Any:
    # @governed above @classmethod / @staticmethod: govern the function inside
    # and wrap it the same way again, so the descriptor still binds as before.
    if isinstance(fn, classmethod):
        return classmethod(_wrap_function(fn.__func__, client, name, bound_first=True))
    if isinstance(fn, staticmethod):
        return staticmethod(_wrap_function(fn.__func__, client, name, bound_first=False))
    return _wrap_function(fn, client, name, bound_first=False)


def _wrap_function(
    fn: F,
    client: AgentControlClient | AsyncAgentControlClient | None,
    name: str | None,
    *,
    bound_first: bool,
) -> F:
    tool_name = name or getattr(fn, "__name__", "tool")
    try:
        signature: inspect.Signature | None = inspect.signature(fn)
    except (TypeError, ValueError):
        signature = None
    owner = _owner(fn)

    def arguments(args: tuple, kwargs: dict) -> dict[str, Any]:
        return _call_arguments(signature, args, kwargs, bound_first=bound_first, owner=owner)

    if _is_async(fn):
        if client is not None and not isinstance(client, AsyncAgentControlClient):
            raise TypeError("an async function needs an AsyncAgentControlClient")

        @functools.wraps(fn)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            return await arun_governed(
                client or default_async_client(),
                tool_name=tool_name,
                arguments=arguments(args, kwargs),
                execute=lambda: fn(*args, **kwargs),
            )

        return async_wrapper  # type: ignore[return-value]

    if client is not None and not isinstance(client, AgentControlClient):
        raise TypeError("a regular function needs an AgentControlClient")

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        return run_governed(
            client or default_client(),
            tool_name=tool_name,
            arguments=arguments(args, kwargs),
            execute=lambda: fn(*args, **kwargs),
        )

    return wrapper  # type: ignore[return-value]


@overload
def governed(fn: F) -> F: ...


@overload
def governed(
    fn: None = None,
    *,
    client: AgentControlClient | AsyncAgentControlClient | None = None,
    name: str | None = None,
) -> Callable[[F], F]: ...


def governed(
    fn: Callable[..., Any] | None = None,
    *,
    client: AgentControlClient | AsyncAgentControlClient | None = None,
    name: str | None = None,
) -> Any:
    """Check every call of the decorated function with VerifyWise Agent Control.

    Works on regular and ``async`` functions and on methods (instance, class
    and static), bare (``@governed``) or with options
    (``@governed(client=..., name=...)``). Without ``client`` a shared client is
    built from the ``VW_*`` environment variables.

    Args:
        client: An ``AgentControlClient`` (regular functions) or
            ``AsyncAgentControlClient`` (async functions).
        name: The tool name reported to the gateway; defaults to the function name.
    """
    if fn is not None:
        return _wrap(fn, client, name)
    return lambda f: _wrap(f, client, name)


def govern_tool(
    fn: F,
    *,
    client: AgentControlClient | AsyncAgentControlClient | None = None,
    name: str | None = None,
) -> F:
    """Return a governed version of an existing function (``governed`` as a call)."""
    return _wrap(fn, client, name)
