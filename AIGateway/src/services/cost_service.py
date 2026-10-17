import json
import math

import litellm
from typing import Optional


def _safe_cost(value: float) -> float:
    """
    Coerce a cost to a finite, non-negative float.

    LiteLLM's cost_per_token can return NaN (not raise) when a model's pricing
    is unknown — e.g. for a provider-prefixed model id it doesn't recognize.
    A NaN cost persisted to ai_gateway_spend_logs.cost_usd then breaks every
    SUM/AVG the spend dashboards run (COALESCE does not catch NaN), so we never
    let a non-finite cost leave this module.
    """
    if value is None or not math.isfinite(value) or value < 0:
        return 0.0
    return value


def _count_prompt_tokens(model: str, messages: list[dict], tools: Optional[list[dict]]) -> int:
    """Prompt tokens including tool definitions. `tools` comes from the caller,
    so a value the counter cannot handle must not zero the estimate (that would
    let the request through the budget check as free): count the messages
    alone and add roughly one token per four characters of the tools' JSON."""
    if not tools:
        return litellm.token_counter(model=model, messages=messages)
    try:
        return litellm.token_counter(model=model, messages=messages, tools=tools)
    except Exception:
        return litellm.token_counter(model=model, messages=messages) + len(json.dumps(tools, default=str)) // 4


def estimate_prompt_cost(
    model: str, messages: list[dict], max_tokens: int = 4096,
    tools: Optional[list[dict]] = None,
) -> float:
    """
    Estimate the maximum cost of a request BEFORE sending it.
    Used by Express for budget pre-reservation.

    Tool definitions count as prompt tokens; a request with many large tool
    schemas costs far more than its messages alone.

    Returns estimated max cost in USD (prompt cost + max possible completion cost).
    """
    try:
        prompt_tokens = _count_prompt_tokens(model, messages, tools)
        prompt_cost, completion_cost = litellm.cost_per_token(
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=max_tokens,
        )
        return _safe_cost(prompt_cost + completion_cost)
    except Exception:
        return 0.0


def calculate_stream_cost(
    model: str,
    prompt_messages: list[dict],
    accumulated_text: str,
    tools: Optional[list[dict]] = None,
) -> tuple[float, dict]:
    """
    Calculate cost after streaming completes, for providers that don't
    include usage in stream chunks (Anthropic, Gemini, Mistral, etc.).

    Returns (cost_usd, usage_dict).
    """
    try:
        prompt_tokens = _count_prompt_tokens(model, prompt_messages, tools)
        completion_tokens = litellm.token_counter(model=model, text=accumulated_text)
        prompt_cost, completion_cost = litellm.cost_per_token(
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
        return _safe_cost(prompt_cost + completion_cost), {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        }
    except Exception:
        return 0.0, {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }


def validate_model(model: str) -> Optional[dict]:
    """
    Check if a model string is in LiteLLM's supported model list.
    Returns model info dict if valid, None if not.
    """
    try:
        info = litellm.get_model_info(model)
        return info
    except Exception:
        return None
