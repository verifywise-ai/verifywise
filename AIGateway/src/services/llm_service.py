import json
from typing import AsyncIterator

import litellm

from services.cost_service import _safe_cost, calculate_stream_cost, tool_definitions, whole_tokens


class ProviderCallError(Exception):
    """The provider call itself failed; `cause` is LiteLLM's exception (or whatever it raised)."""

    def __init__(self, cause: Exception):
        super().__init__(str(cause))
        self.cause = cause


async def chat_completion(
    model: str,
    messages: list[dict],
    api_key: str,
    num_retries: int = 0,
    fallback_models: list[str] | None = None,
    **kwargs,
) -> dict:
    """
    Call any LLM provider via LiteLLM SDK.

    Returns:
        {
            "response": <OpenAI-format ModelResponse>,
            "cost_usd": 0.00042,
            "provider": "openai",
            "model": "gpt-4o",
            "usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}
        }
    """
    call_kwargs = {
        "model": model,
        "messages": messages,
        "api_key": api_key,
        "num_retries": num_retries,
        # Silently drop any parameters the target model does not support
        # (e.g. temperature for o1/o3 reasoning models, max_tokens for some providers).
        "drop_params": True,
        **kwargs,
    }

    if fallback_models:
        call_kwargs["fallbacks"] = [
            {"model": m, "api_key": api_key} for m in fallback_models
        ]

    # Only the provider call counts as a provider failure; a bug in the bookkeeping below
    # must surface as the gateway's own error
    try:
        response = await litellm.acompletion(**call_kwargs)
    except Exception as exc:
        raise ProviderCallError(exc) from exc

    try:
        cost = litellm.completion_cost(completion_response=response)
    except Exception:
        # Model not in LiteLLM cost DB (e.g., OpenRouter models) — use upstream cost if available
        cost = getattr(response, "_hidden_params", {}).get("response_cost") or 0.0

    # completion_cost can return NaN (not raise) for models it can't price.
    cost = _safe_cost(cost)
    result = response.model_dump()
    result["cost_usd"] = cost
    result["usage"] = {
        "prompt_tokens": response.usage.prompt_tokens,
        "completion_tokens": response.usage.completion_tokens,
        "total_tokens": response.usage.total_tokens,
    }
    return result


async def embedding(
    model: str,
    input_text: list[str],
    api_key: str,
) -> dict:
    response = await litellm.aembedding(
        model=model,
        input=input_text,
        api_key=api_key,
    )
    try:
        cost = litellm.completion_cost(completion_response=response)
    except Exception:
        cost = 0.0
    return {
        "response": response.model_dump(),
        "cost_usd": _safe_cost(cost),
        "model": model,
    }


def _text(value) -> str:
    """A streamed name or arguments fragment as text ("" when absent).

    Only feeds the fallback token count, so an odd value from an adapter is
    stringified rather than allowed to raise mid-stream.
    """
    if value is None:
        return ""
    return value if isinstance(value, str) else str(value)


async def stream_chat_completion(
    model: str,
    messages: list[dict],
    api_key: str,
    **kwargs,
) -> AsyncIterator[str]:
    """
    Yields SSE-formatted chunks. The final chunk includes usage/cost.

    Handles two cases:
    1. Provider includes usage in stream (OpenAI with stream_options) -> use directly
    2. Provider doesn't (Anthropic, Gemini, etc.) -> count tokens on accumulated text
    """
    response = await litellm.acompletion(
        model=model,
        messages=messages,
        api_key=api_key,
        stream=True,
        stream_options={"include_usage": True},
        drop_params=True,
        **kwargs,
    )

    last_chunk = None
    accumulated_text = ""

    async for chunk in response:
        last_chunk = chunk
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            accumulated_text += delta.content
        # A tool-call answer has no content; its name and arguments are the
        # completion tokens, so they must count when the provider sends no usage.
        functions = [getattr(tc, "function", None) for tc in (getattr(delta, "tool_calls", None) or [])]
        functions.append(getattr(delta, "function_call", None))  # deprecated functions API
        for fn in functions:
            if fn is not None:
                accumulated_text += _text(getattr(fn, "name", None)) + _text(getattr(fn, "arguments", None))
        yield f"data: {json.dumps(chunk.model_dump())}\n\n"

    # Calculate cost: try from usage first, fall back to token counting
    cost = 0.0
    usage = None

    provider_usage = getattr(last_chunk, "usage", None) if last_chunk else None
    prompt_tokens = whole_tokens(getattr(provider_usage, "prompt_tokens", None))
    completion_tokens = whole_tokens(getattr(provider_usage, "completion_tokens", None))
    if prompt_tokens is not None and completion_tokens is not None and (prompt_tokens or completion_tokens):
        # The provider's counts are exact; keep them even when pricing fails.
        usage = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        }
        try:
            # completion_cost can return NaN (not raise); _safe_cost coerces it.
            cost = _safe_cost(litellm.completion_cost(completion_response=last_chunk))
        except Exception:
            pass
        if cost == 0.0:
            try:
                prompt_cost, completion_cost = litellm.cost_per_token(
                    model=model, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                )
                cost = _safe_cost(prompt_cost + completion_cost)
            except Exception:
                pass
    elif accumulated_text:
        # No usable provider counts (missing, partial, null or all zero): estimate them.
        cost, usage = calculate_stream_cost(
            model, messages, accumulated_text,
            tools=tool_definitions(kwargs),
        )

    yield f"data: {json.dumps({'cost_usd': cost, 'usage': usage})}\n\n"
    yield "data: [DONE]\n\n"
