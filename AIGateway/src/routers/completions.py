import logging

import litellm
from litellm.utils import get_optional_params
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from services.cost_service import estimate_prompt_cost
from services.llm_service import (
    ProviderCallError,
    chat_completion,
    embedding,
    stream_chat_completion,
)
from utils.redaction import redact_secrets

router = APIRouter()
logger = logging.getLogger(__name__)

ERROR_MESSAGE_LIMIT = 500
# Settings LiteLLM may drop for a model (drop_params): reasoning models take neither
_SAMPLING_PARAMS = ("temperature", "top_p")


def _dropped_params(model: str, kwargs: dict) -> list[str]:
    """
    The sampling settings LiteLLM leaves out of the provider request for this model, so
    the caller can record that its setting was not applied. Each setting is mapped with
    drop_params off: a refusal is exactly what drop_params would have dropped, and a
    provider that renames it (Bedrock topP, Cohere p) counts as applied. Supported-params
    lists can't tell (o3-mini "supports" temperature yet refuses any value but 1).
    Unknown when the mapping itself fails: report nothing.
    """
    try:
        model_name, provider, _, _ = litellm.get_llm_provider(model)
    except Exception:
        return []
    dropped = []
    for key in _SAMPLING_PARAMS:
        if kwargs.get(key) is None:
            continue
        try:
            get_optional_params(
                model=model_name, custom_llm_provider=provider, drop_params=False, **{key: kwargs[key]}
            )
        except litellm.UnsupportedParamsError:
            dropped.append(key)
        except Exception:
            continue
    return dropped


def _provider_error(failure: ProviderCallError, api_key: str) -> JSONResponse:
    """
    A failed provider call as a typed error: LiteLLM's exception class (AuthenticationError,
    NotFoundError, RateLimitError, ...) and the provider's status code.

    The HTTP status stays 502: callers forward it, and a provider's 401 must not read as
    the caller's own session expiring. Only LiteLLM's exceptions pass their message on,
    redacted; anything else gets a generic one.
    """
    exc = failure.cause
    status = getattr(exc, "status_code", None)
    # No traceback: the exception text can carry the key; log it redacted instead
    logger.warning(
        "Provider call failed: %s (%s): %s",
        type(exc).__name__,
        status,
        redact_secrets(str(exc), api_key)[:ERROR_MESSAGE_LIMIT],
    )
    # LiteLLM's exceptions don't share one base class (most derive from the openai package's)
    if type(exc).__module__ == litellm.exceptions.__name__:
        message = redact_secrets(str(exc), api_key)[:ERROR_MESSAGE_LIMIT]
    else:
        message = "The provider call failed"
    return JSONResponse(
        status_code=502,
        content={
            "error": {
                "type": type(exc).__name__,
                "status_code": status if isinstance(status, int) else None,
                "message": message,
            }
        },
    )


class CompletionRequest(BaseModel):
    model: str
    messages: list[dict]
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = None
    tools: list | None = None
    tool_choice: str | dict | None = None
    top_p: float | None = None
    num_retries: int = 0
    fallback_models: list[str] | None = None
    extra_params: dict | None = None


class EmbeddingRequest(BaseModel):
    model: str
    input: list[str]


class CostEstimateRequest(BaseModel):
    model: str
    messages: list[dict]
    max_tokens: int = 4096


def _get_provider_key(request: Request) -> str:
    """Extract provider API key from header (not body)."""
    key = request.headers.get("x-provider-key", "")
    if not key:
        raise HTTPException(status_code=400, detail="Missing x-provider-key header")
    return key


@router.post("/v1/chat/completions")
async def chat_completions(request: Request, body: CompletionRequest):
    api_key = _get_provider_key(request)

    kwargs = {}
    if body.temperature is not None:
        kwargs["temperature"] = body.temperature
    if body.max_tokens is not None:
        kwargs["max_tokens"] = body.max_tokens
    if body.tools is not None:
        kwargs["tools"] = body.tools
    if body.tool_choice is not None:
        kwargs["tool_choice"] = body.tool_choice
    if body.top_p is not None:
        kwargs["top_p"] = body.top_p
    if body.extra_params:
        kwargs.update(body.extra_params)

    if body.stream:
        return StreamingResponse(
            stream_chat_completion(
                model=body.model,
                messages=body.messages,
                api_key=api_key,
                **kwargs,
            ),
            media_type="text/event-stream",
        )

    try:
        result = await chat_completion(
            model=body.model,
            messages=body.messages,
            api_key=api_key,
            num_retries=body.num_retries,
            fallback_models=body.fallback_models,
            **kwargs,
        )
    except ProviderCallError as failure:
        return _provider_error(failure, api_key)
    # With fallbacks another model may have answered, so what it dropped is unknown
    result["dropped_params"] = [] if body.fallback_models else _dropped_params(body.model, kwargs)
    return result


@router.post("/v1/embeddings")
async def embeddings(request: Request, body: EmbeddingRequest):
    api_key = _get_provider_key(request)

    result = await embedding(
        model=body.model,
        input_text=body.input,
        api_key=api_key,
    )
    return result


@router.post("/v1/cost-estimate")
async def cost_estimate(request: Request, body: CostEstimateRequest):
    """Pre-request cost estimation for budget enforcement."""

    estimated_cost = estimate_prompt_cost(
        model=body.model,
        messages=body.messages,
        max_tokens=body.max_tokens,
    )
    return {"estimated_max_cost_usd": estimated_cost}
