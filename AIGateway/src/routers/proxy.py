"""
Public proxy endpoints — authenticated via virtual keys (no JWT required).

Employees point their OpenAI SDK here:
    client = OpenAI(base_url="https://gateway.company.com/v1", api_key="sk-vw-xxx")

These endpoints handle the full request lifecycle:
    1. Authenticate virtual key
    2. Resolve endpoint (provider, model, API key)
    3. Check budget + rate limits
    4. Run guardrails on input
    5. Forward to LLM via litellm
    6. Log spend + reconcile budget
"""

import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

from services.proxy_service import (
    authenticate_virtual_key,
    resolve_endpoint_for_key,
    resolve_endpoint_by_id,
    enforce_model_provider_acls,
    check_org_budget,
    reconcile_budget,
    enforce_rate_limits,
    log_spend,
    log_cache_hit,
    run_guardrails,
    get_guardrail_config,
)
from services.cache_service import generate_cache_key, check_cache, store_in_cache, is_cache_globally_enabled
from services.cost_service import estimate_prompt_cost, tool_definitions, whole_tokens
from services.llm_service import chat_completion, embedding, stream_chat_completion

logger = logging.getLogger("uvicorn")

router = APIRouter()

MAX_FALLBACK_DEPTH = 3


# ─── Request Models ──────────────────────────────────────────────────────────

class ProxyChatRequest(BaseModel):
    model: str  # endpoint slug
    messages: list[dict]
    stream: bool = False
    temperature: Optional[float] = Field(None, ge=0, le=2)
    max_tokens: Optional[int] = Field(None, ge=1, le=128000)
    top_p: Optional[float] = Field(None, ge=0, le=1)
    # OpenAI tool calling. Without these fields Pydantic drops them silently and
    # the model answers in plain text instead of choosing a tool.
    tools: Optional[list[dict]] = None
    tool_choice: Optional[str | dict] = None
    parallel_tool_calls: Optional[bool] = None
    # The deprecated functions API, still sent by older clients.
    functions: Optional[list[dict]] = None
    function_call: Optional[str | dict] = None


# Request fields forwarded to the provider and hashed into the cache key.
TOOL_PARAMS = ("tools", "tool_choice", "parallel_tool_calls", "functions", "function_call")


def _tool_params(body: ProxyChatRequest) -> dict:
    return {k: getattr(body, k) for k in TOOL_PARAMS if getattr(body, k) is not None}




def _build_llm_kwargs(body: ProxyChatRequest, endpoint: dict) -> dict:
    """Provider-call parameters: the request's, else the endpoint's defaults."""
    kwargs: dict = {}
    if body.temperature is not None or endpoint.get("temperature") is not None:
        kwargs["temperature"] = body.temperature if body.temperature is not None else float(endpoint["temperature"])
    if body.max_tokens is not None or endpoint.get("max_tokens") is not None:
        kwargs["max_tokens"] = body.max_tokens or endpoint["max_tokens"]
    if body.top_p is not None:
        kwargs["top_p"] = body.top_p
    kwargs.update(_tool_params(body))
    return kwargs


def _response_text(message: Optional[dict]) -> Optional[str]:
    """Text to log for a response message: the content, the tool calls the
    model asked for, or both as JSON when the model wrote text alongside a tool
    call. Content parts are stored as JSON so the TEXT column INSERT doesn't
    break."""
    if not isinstance(message, dict):
        return None
    content = message.get("content")
    calls = message.get("tool_calls")
    if not calls and message.get("function_call"):
        # Deprecated functions API: log it in the same list shape as tool_calls.
        calls = [{"type": "function", "function": message["function_call"]}]
    if calls:
        return json.dumps({"content": content, "tool_calls": calls} if content else calls)
    if content is None:
        return None
    return content if isinstance(content, str) else json.dumps(content)


def _first_message(response: dict) -> Optional[dict]:
    try:
        return response["choices"][0]["message"]
    except (KeyError, IndexError, TypeError):
        return None


class ProxyEmbeddingRequest(BaseModel):
    model: str  # endpoint slug
    input: str | list[str]


# ─── Auth Helper ─────────────────────────────────────────────────────────────

async def _extract_virtual_key(request: Request) -> dict:
    """Extract and validate virtual key from Authorization header."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization: Bearer <virtual-key>")
    token = auth[7:].strip()
    try:
        return await authenticate_virtual_key(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


def _extract_run_id(request: Request) -> Optional[str]:
    """Read the agent run/session id. Canonical header `x-vw-agent-run-id` wins;
    `x-session-id` and `helicone-session-id` are accepted aliases (intentional, so
    agents already instrumented for Helicone/LangSmith correlate without changes)."""
    for h in ("x-vw-agent-run-id", "x-session-id", "helicone-session-id"):
        v = request.headers.get(h)
        if v:
            return v.strip()
    return None


# ─── Chat Completions ────────────────────────────────────────────────────────

@router.post("/v1/chat/completions")
async def proxy_chat(request: Request, body: ProxyChatRequest):
    """OpenAI-compatible chat completions endpoint with virtual key auth."""
    vk = await _extract_virtual_key(request)
    org_id = vk["organization_id"]
    agent_run_id = _extract_run_id(request)
    endpoint_slug = body.model  # "model" field is the endpoint slug

    # Conversation capture is gated on org-level guardrail settings, not the
    # endpoint (the endpoint dict carries no log_request_body/log_response_body).
    # Fetch the guardrail config once and reuse it for run_guardrails below.
    _gr_config = await get_guardrail_config(org_id)
    _, _gr_settings = _gr_config
    capture_request = bool(_gr_settings.get("log_request_body"))
    capture_response = bool(_gr_settings.get("log_response_body"))

    try:
        endpoint = await resolve_endpoint_for_key(
            org_id, endpoint_slug, vk.get("allowed_endpoint_ids") or [],
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Model/provider access control
    try:
        enforce_model_provider_acls(vk, endpoint)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Rate limit: per-endpoint + per-key
    await enforce_rate_limits(endpoint, vk)

    # Cost estimation + budget check
    estimated_cost = estimate_prompt_cost(
        model=endpoint["model"],
        messages=body.messages,
        max_tokens=body.max_tokens or endpoint.get("max_tokens") or 4096,
        tools=tool_definitions(_tool_params(body)),
    )
    if not await check_org_budget(org_id, estimated_cost):
        raise HTTPException(status_code=402, detail="Organization budget limit exceeded")

    # Guardrails (reuse the config fetched above)
    scanned_messages = await run_guardrails(org_id, body.messages, endpoint["id"], config=_gr_config)

    # --- Cache check (exact match, after guardrails for security) ---
    prompt_hash = None
    cache_hit = None
    use_cache = (
        endpoint.get("cache_enabled")
        and not body.stream
        and await is_cache_globally_enabled(org_id)
    )
    if use_cache:
        # Include system prompt in hash — it affects the LLM response
        cache_messages = scanned_messages
        if endpoint.get("system_prompt"):
            cache_messages = [{"role": "system", "content": endpoint["system_prompt"]}] + scanned_messages
        prompt_hash = generate_cache_key(
            model=endpoint["model"],
            messages=cache_messages,
            temperature=body.temperature if body.temperature is not None else endpoint.get("temperature"),
            max_tokens=body.max_tokens or endpoint.get("max_tokens"),
            top_p=body.top_p,
            tool_params=_tool_params(body),
        )
        cache_hit = await check_cache(org_id, endpoint["id"], prompt_hash)

    if cache_hit is not None:
        cached_response = json.loads(cache_hit["response_body"])

        # Capture request/response for the run drawer when the org opts in, so a
        # served-from-cache call doesn't wrongly show "(body logging disabled)".
        cache_resp_text = _response_text(_first_message(cached_response)) if capture_response else None

        await log_cache_hit(
            organization_id=org_id,
            endpoint_id=endpoint["id"],
            virtual_key_id=vk["id"],
            provider=endpoint["provider"],
            model=cache_hit.get("model", endpoint["model"]),
            prompt_tokens=cache_hit.get("prompt_tokens", 0),
            completion_tokens=cache_hit.get("completion_tokens", 0),
            total_tokens=cache_hit.get("total_tokens", 0),
            original_cost_usd=float(cache_hit.get("cost_usd", 0)),
            latency_ms=0,
            agent_run_id=agent_run_id,
            request_messages=scanned_messages if capture_request else None,
            response_text=cache_resp_text,
        )
        # Reverse the budget estimate (cache hits are free)
        await reconcile_budget(org_id, estimated_cost, 0)
        return JSONResponse(
            content=cached_response,
            headers={"x-vw-cache": "HIT"},
        )

    # Build final messages (system prompt prepended if configured)
    final_messages = scanned_messages
    if endpoint.get("system_prompt"):
        final_messages = [{"role": "system", "content": endpoint["system_prompt"]}] + scanned_messages

    kwargs = _build_llm_kwargs(body, endpoint)

    start_time = time.time()

    # Store the SCANNED (post-guardrails) request only when the org opts in
    stored_request = scanned_messages if capture_request else None

    if body.stream:
        return await _handle_stream(
            org_id, vk, endpoint, final_messages, kwargs, estimated_cost, start_time,
            agent_run_id=agent_run_id, stored_request=stored_request,
            capture_response=capture_response,
        )

    return await _handle_completion(
        org_id, vk, endpoint, final_messages, kwargs, estimated_cost, start_time,
        _prompt_hash=prompt_hash,
        _scanned_messages=scanned_messages if prompt_hash else None,
        agent_run_id=agent_run_id, stored_request=stored_request,
        capture_response=capture_response,
    )


async def _handle_completion(
    org_id: int, vk: dict, endpoint: dict,
    messages: list[dict], kwargs: dict,
    estimated_cost: float, start_time: float,
    _depth: int = 0,
    _prompt_hash: Optional[str] = None,
    _scanned_messages: Optional[list[dict]] = None,
    agent_run_id: Optional[str] = None,
    stored_request: Optional[list] = None,
    capture_response: bool = False,
):
    """Non-streaming completion with fallback support and optional cache store."""
    try:
        result = await chat_completion(
            model=endpoint["model"],
            messages=messages,
            api_key=endpoint["decrypted_key"],
            **kwargs,
        )

        latency_ms = int((time.time() - start_time) * 1000)
        usage = result.get("usage", {})
        cost = result.get("cost_usd", 0)

        resp_text = _response_text(_first_message(result)) if capture_response else None

        await log_spend(
            organization_id=org_id,
            endpoint_id=endpoint["id"],
            virtual_key_id=vk["id"],
            provider=endpoint["provider"],
            model=result.get("model", endpoint["model"]),
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
            cost_usd=cost,
            latency_ms=latency_ms,
            metadata={"virtual_key_id": str(vk["id"])},
            agent_run_id=agent_run_id,
            request_messages=stored_request,
            response_text=resp_text,
        )
        await reconcile_budget(org_id, estimated_cost, cost)

        # Store in cache if caching enabled. A tool-call response is not cached:
        # replaying it would hand another caller the same tool_call ids, merging
        # unrelated runs in run correlation and agent logs.
        first = _first_message(result)
        if _prompt_hash and not (first and (first.get("tool_calls") or first.get("function_call"))):
            await store_in_cache(
                organization_id=org_id,
                endpoint_id=endpoint["id"],
                prompt_hash=_prompt_hash,
                model=result.get("model", endpoint["model"]),
                messages=_scanned_messages or messages,
                response_body=json.dumps(result),
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
                cost_usd=cost,
                ttl_seconds=endpoint.get("cache_ttl_seconds", 14400),
            )

        return JSONResponse(content=result, headers={"x-vw-cache": "MISS" if _prompt_hash else "DISABLED"})

    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)

        # Log failed request
        await log_spend(
            organization_id=org_id, endpoint_id=endpoint["id"],
            virtual_key_id=vk["id"], provider=endpoint["provider"],
            model=endpoint["model"], prompt_tokens=0, completion_tokens=0,
            total_tokens=0, cost_usd=0, latency_ms=latency_ms, status_code=500,
            agent_run_id=agent_run_id,
        )
        await reconcile_budget(org_id, estimated_cost, 0)

        # Fallback — don't cache fallback responses against original endpoint
        if endpoint.get("fallback_endpoint_id") and _depth < MAX_FALLBACK_DEPTH:
            fallback = await resolve_endpoint_by_id(org_id, endpoint["fallback_endpoint_id"])
            if fallback:
                logger.info(f"Falling back to {fallback['slug']} (depth {_depth + 1})")
                return await _handle_completion(
                    org_id, vk, fallback, messages, kwargs, 0, time.time(), _depth + 1,
                    _prompt_hash=None, _scanned_messages=None,
                    agent_run_id=agent_run_id, stored_request=stored_request,
                    capture_response=capture_response,
                )

        logger.error(f"LLM provider error: {e}")
        raise HTTPException(status_code=502, detail="LLM provider request failed")


async def _handle_stream(
    org_id: int, vk: dict, endpoint: dict,
    messages: list[dict], kwargs: dict,
    estimated_cost: float, start_time: float,
    agent_run_id: Optional[str] = None,
    stored_request: Optional[list] = None,
    capture_response: bool = False,
):
    """Streaming completion — returns SSE response."""

    async def _stream_generator():
        total_prompt = 0
        total_completion = 0
        total_cost = 0.0
        final_model = endpoint["model"]
        acc = []
        streamed_tool_calls: dict[int, dict] = {}

        try:
            async for chunk_str in stream_chat_completion(
                model=endpoint["model"],
                messages=messages,
                api_key=endpoint["decrypted_key"],
                **kwargs,
            ):
                yield chunk_str

                # Parse SSE for usage data
                if chunk_str.startswith("data: ") and chunk_str.strip() != "data: [DONE]":
                    try:
                        chunk = json.loads(chunk_str[6:])
                        # Usage-only final chunk has "choices": [] (key present but
                        # empty) — guard against IndexError so usage/cost/model below
                        # still parse for that chunk.
                        choices = chunk.get("choices") or []
                        delta_obj = (choices[0].get("delta") or {}) if choices else {}
                        delta = delta_obj.get("content")
                        if delta and capture_response:
                            acc.append(delta)
                        if capture_response:
                            _merge_tool_call_deltas(streamed_tool_calls, delta_obj.get("tool_calls"))
                            if delta_obj.get("function_call"):
                                _merge_tool_call_deltas(
                                    streamed_tool_calls, [{"function": delta_obj["function_call"]}], legacy=True,
                                )
                        # The final cost chunk can carry "usage": null or null
                        # counts; only whole numbers may reach the spend log sums.
                        usage = chunk.get("usage")
                        if isinstance(usage, dict):
                            total_prompt = _token_count(usage.get("prompt_tokens"), total_prompt)
                            total_completion = _token_count(usage.get("completion_tokens"), total_completion)
                        cost_usd = chunk.get("cost_usd")
                        # NaN/Infinity from json.loads are dropped by log_spend and
                        # reconcile_budget, which both apply _safe_cost.
                        if isinstance(cost_usd, (int, float)) and not isinstance(cost_usd, bool):
                            total_cost = cost_usd
                        if isinstance(chunk.get("model"), str):
                            final_model = chunk["model"]
                    except Exception as parse_err:
                        # This side path only feeds the spend log and usage;
                        # a chunk it cannot read must never end the client's stream.
                        logger.debug(f"Could not parse stream chunk for logging: {parse_err}")

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'error': 'LLM provider stream failed'})}\n\n"
        finally:
            latency_ms = int((time.time() - start_time) * 1000)
            await log_spend(
                organization_id=org_id, endpoint_id=endpoint["id"],
                virtual_key_id=vk["id"], provider=endpoint["provider"],
                model=final_model,
                prompt_tokens=total_prompt, completion_tokens=total_completion,
                total_tokens=total_prompt + total_completion,
                cost_usd=total_cost, latency_ms=latency_ms,
                metadata={"virtual_key_id": str(vk["id"])},
                agent_run_id=agent_run_id,
                request_messages=stored_request,
                response_text=_response_text({
                    "content": "".join(acc) or None,
                    "tool_calls": _finished_tool_calls(streamed_tool_calls),
                }) if capture_response else None,
            )
            await reconcile_budget(org_id, estimated_cost, total_cost)

    return StreamingResponse(_stream_generator(), media_type="text/event-stream")


def _merge_tool_call_deltas(
    calls: dict[int, dict], deltas: Optional[list], legacy: bool = False,
) -> None:
    """Rebuild streamed tool calls from their deltas.

    The id and name normally arrive in a call's first delta and the arguments
    in later fragments, all with the same int `index`. Adapters differ, so:
    a delta with an id joins the call with that id (unless that call has a
    different index, as with servers that reuse one id), else the latest
    id-less call with its index, else starts a new call; a delta without an
    id joins the latest call with its index, or the latest call when it has
    no index. Legacy `function_call` deltas (`legacy=True`) only ever join
    each other.

    Name fragments are appended. Some adapters repeat the whole name on every
    delta, so once arguments have started a name equal to the current one is
    a repeat and is not appended again. A different name at that point, or
    the same name with a fragment that opens a new JSON value after the
    current arguments already form complete JSON, is a new call that reuses
    the slot.

    This only feeds the response log, so malformed values are coerced to text
    rather than raised: a bad delta must never abort the client's stream.
    """
    for d in deltas or []:
        if not isinstance(d, dict):
            continue
        cid = d.get("id") or None
        idx = d.get("index") if isinstance(d.get("index"), int) else None
        fn = d.get("function") if isinstance(d.get("function"), dict) else {}
        name = _delta_text(fn.get("name"))
        arguments = _delta_text(fn.get("arguments"))
        group = {k: c for k, c in calls.items() if c["_legacy"] == legacy}
        key = None
        if cid:
            key = max((k for k, c in group.items()
                       if c["id"] == cid and (idx is None or c["_index"] in (idx, None))), default=None)
            if key is None and idx is not None:
                key = max((k for k, c in group.items() if c["_index"] == idx and not c["id"]), default=None)
        elif idx is not None:
            key = max((k for k, c in group.items() if c["_index"] == idx), default=None)
        elif group:
            key = max(group)
        if key is not None:
            current = calls[key]["function"]
            if name and current["arguments"] and (
                name != current["name"]
                or (arguments.lstrip()[:1] in ("{", "[") and _is_complete_json(current["arguments"]))
            ):
                key = None
        if key is None:
            key = max(calls) + 1 if calls else 0
            calls[key] = {"id": None, "type": "function", "function": {"name": "", "arguments": ""},
                          "_index": idx, "_legacy": legacy}
        call = calls[key]
        if cid:
            call["id"] = cid
        if call["_index"] is None and idx is not None:
            call["_index"] = idx
        current = call["function"]
        if name and not (name == current["name"] and (current["arguments"] or arguments)):
            current["name"] += name
        current["arguments"] += arguments


def _delta_text(value) -> str:
    """A streamed name or arguments fragment as text ("" when absent)."""
    if value is None:
        return ""
    return value if isinstance(value, str) else json.dumps(value, default=str)


def _is_complete_json(text: str) -> bool:
    try:
        json.loads(text)
        return True
    except (ValueError, RecursionError):
        return False


def _token_count(value, fallback: int) -> int:
    """A usage token count, or `fallback` when it is missing or not a whole number."""
    count = whole_tokens(value)
    return fallback if count is None else count


def _finished_tool_calls(calls: dict[int, dict]) -> list[dict]:
    """Tool calls in arrival order, without the merge bookkeeping. Legacy
    function calls have no id, as in the non-streamed log."""
    finished = []
    for key in sorted(calls):
        call = calls[key]
        entry = {k: v for k, v in call.items() if not k.startswith("_")}
        if call["_legacy"] and entry["id"] is None:
            del entry["id"]
        finished.append(entry)
    return finished


# ─── Embeddings ──────────────────────────────────────────────────────────────

@router.post("/v1/embeddings")
async def proxy_embeddings(request: Request, body: ProxyEmbeddingRequest):
    """OpenAI-compatible embeddings endpoint with virtual key auth."""
    vk = await _extract_virtual_key(request)
    org_id = vk["organization_id"]
    agent_run_id = _extract_run_id(request)
    endpoint_slug = body.model

    try:
        endpoint = await resolve_endpoint_for_key(
            org_id, endpoint_slug, vk.get("allowed_endpoint_ids") or [],
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Model/provider access control
    try:
        enforce_model_provider_acls(vk, endpoint)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Rate limit
    await enforce_rate_limits(endpoint, vk)

    # Guardrails on embedding input
    input_texts = body.input if isinstance(body.input, list) else [body.input]
    scanned_texts = []
    for text_item in input_texts:
        scanned = await run_guardrails(
            org_id, [{"role": "user", "content": text_item}], endpoint["id"],
        )
        scanned_texts.append(scanned[0].get("content", text_item))

    # Cost estimation + budget
    estimated_cost = estimate_prompt_cost(
        model=endpoint["model"],
        messages=[{"role": "user", "content": " ".join(scanned_texts)}],
    )
    if not await check_org_budget(org_id, estimated_cost):
        raise HTTPException(status_code=402, detail="Budget limit exceeded")

    start_time = time.time()

    try:
        result = await embedding(
            model=endpoint["model"],
            input_text=scanned_texts if isinstance(body.input, list) else scanned_texts[0],
            api_key=endpoint["decrypted_key"],
        )

        latency_ms = int((time.time() - start_time) * 1000)
        usage = result.get("usage", {})
        cost = result.get("cost_usd", 0)

        await log_spend(
            organization_id=org_id, endpoint_id=endpoint["id"],
            virtual_key_id=vk["id"], provider=endpoint["provider"],
            model=result.get("model", endpoint["model"]),
            prompt_tokens=usage.get("prompt_tokens", 0), completion_tokens=0,
            total_tokens=usage.get("total_tokens", 0),
            cost_usd=cost, latency_ms=latency_ms,
            metadata={"virtual_key_id": str(vk["id"])},
            agent_run_id=agent_run_id,
        )
        await reconcile_budget(org_id, estimated_cost, cost)

        return JSONResponse(content=result)

    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        await log_spend(
            organization_id=org_id, endpoint_id=endpoint["id"],
            virtual_key_id=vk["id"], provider=endpoint["provider"],
            model=endpoint["model"], prompt_tokens=0, completion_tokens=0,
            total_tokens=0, cost_usd=0, latency_ms=latency_ms, status_code=500,
            agent_run_id=agent_run_id,
        )
        await reconcile_budget(org_id, estimated_cost, 0)
        logger.error(f"Embedding error: {e}")
        raise HTTPException(status_code=502, detail="Embedding request failed")


# ─── Models List ─────────────────────────────────────────────────────────────

@router.get("/v1/models")
async def list_models_for_key(request: Request):
    """List the endpoint slugs this virtual key can actually call.

    Applies the same checks as POST /v1/chat/completions: the key's endpoint
    allowlist, an active endpoint with an active provider key, and the key's
    model/provider ACLs.
    """
    vk = await _extract_virtual_key(request)
    from database.db import get_db
    from sqlalchemy import text as sql_text

    allowed = vk.get("allowed_endpoint_ids") or []
    async with get_db() as db:
        result = await db.execute(
            # nosemgrep: python.sqlalchemy.security.audit.avoid-sqlalchemy-text.avoid-sqlalchemy-text
            sql_text("""
                SELECT e.id, e.slug, e.display_name, e.provider, e.model
                FROM ai_gateway_endpoints e
                JOIN ai_gateway_api_keys k ON e.api_key_id = k.id
                WHERE e.organization_id = :org_id
                  AND e.is_active = true
                  AND k.is_active = true
                ORDER BY e.display_name
            """),
            {"org_id": vk["organization_id"]},
        )
        endpoints = [dict(r) for r in result.mappings().fetchall()]

    callable_endpoints = []
    for endpoint in endpoints:
        if allowed and endpoint["id"] not in allowed:
            continue
        try:
            enforce_model_provider_acls(vk, endpoint)
        except ValueError:
            continue
        callable_endpoints.append(endpoint)

    return {
        "object": "list",
        "data": [{"id": e["slug"], "object": "model", "owned_by": e["provider"]} for e in callable_endpoints],
    }
