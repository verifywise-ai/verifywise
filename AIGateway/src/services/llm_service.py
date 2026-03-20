import json
from typing import AsyncIterator

import litellm

from services.cost_service import calculate_stream_cost


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
        **kwargs,
    }

    if fallback_models:
        call_kwargs["fallbacks"] = [
            {"model": m, "api_key": api_key} for m in fallback_models
        ]

    response = await litellm.acompletion(**call_kwargs)

    try:
        cost = litellm.completion_cost(completion_response=response)
    except Exception:
        # Model not in LiteLLM cost DB (e.g., OpenRouter models) — use upstream cost if available
        cost = getattr(response, "_hidden_params", {}).get("response_cost") or 0.0

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
        "cost_usd": cost,
        "model": model,
    }


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
        **kwargs,
    )

    last_chunk = None
    accumulated_text = ""

    async for chunk in response:
        last_chunk = chunk
        if (
            chunk.choices
            and chunk.choices[0].delta
            and chunk.choices[0].delta.content
        ):
            accumulated_text += chunk.choices[0].delta.content
        yield f"data: {json.dumps(chunk.model_dump())}\n\n"

    # Calculate cost: try from usage first, fall back to token counting
    cost = 0.0
    usage = None

    if last_chunk and hasattr(last_chunk, "usage") and last_chunk.usage:
        try:
            cost = litellm.completion_cost(completion_response=last_chunk)
            usage = {
                "prompt_tokens": last_chunk.usage.prompt_tokens,
                "completion_tokens": last_chunk.usage.completion_tokens,
                "total_tokens": last_chunk.usage.total_tokens,
            }
        except Exception:
            pass

    if cost == 0.0 and accumulated_text:
        cost, usage = calculate_stream_cost(model, messages, accumulated_text)

    yield f"data: {json.dumps({'cost_usd': cost, 'usage': usage})}\n\n"
    yield "data: [DONE]\n\n"
