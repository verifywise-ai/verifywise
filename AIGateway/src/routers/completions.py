from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from middlewares.auth import verify_internal_key
from services.cost_service import estimate_prompt_cost
from services.llm_service import (
    chat_completion,
    embedding,
    stream_chat_completion,
)

router = APIRouter()


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
    verify_internal_key(request)
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

    result = await chat_completion(
        model=body.model,
        messages=body.messages,
        api_key=api_key,
        num_retries=body.num_retries,
        fallback_models=body.fallback_models,
        **kwargs,
    )
    return result


@router.post("/v1/embeddings")
async def embeddings(request: Request, body: EmbeddingRequest):
    verify_internal_key(request)
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
    verify_internal_key(request)

    estimated_cost = estimate_prompt_cost(
        model=body.model,
        messages=body.messages,
        max_tokens=body.max_tokens,
    )
    return {"estimated_max_cost_usd": estimated_cost}
