import litellm
from typing import Optional


def estimate_prompt_cost(
    model: str, messages: list[dict], max_tokens: int = 4096
) -> float:
    """
    Estimate the maximum cost of a request BEFORE sending it.
    Used by Express for budget pre-reservation.

    Returns estimated max cost in USD (prompt cost + max possible completion cost).
    """
    try:
        prompt_tokens = litellm.token_counter(model=model, messages=messages)
        prompt_cost, completion_cost = litellm.cost_per_token(
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=max_tokens,
        )
        return prompt_cost + completion_cost
    except Exception:
        return 0.0


def calculate_stream_cost(
    model: str,
    prompt_messages: list[dict],
    accumulated_text: str,
) -> tuple[float, dict]:
    """
    Calculate cost after streaming completes, for providers that don't
    include usage in stream chunks (Anthropic, Gemini, Mistral, etc.).

    Returns (cost_usd, usage_dict).
    """
    try:
        prompt_tokens = litellm.token_counter(model=model, messages=prompt_messages)
        completion_tokens = litellm.token_counter(model=model, text=accumulated_text)
        prompt_cost, completion_cost = litellm.cost_per_token(
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
        return prompt_cost + completion_cost, {
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
