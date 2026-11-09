"""Guardrails router — the "Test guardrails" preview of an org's active rules.

Rule, settings, log and stats management lives in routers/guardrails_crud.py.
"""

from fastapi import APIRouter, HTTPException, Request

from services.guardrail_service import scan_text_async
from services.proxy_service import get_guardrail_config
from utils.auth import get_org_id

router = APIRouter()

MAX_TEST_TEXT = 20_000


@router.post("/guardrails/test")
async def test_org_guardrails(request: Request):
    """Run the org's active rules and settings on sample text. Nothing is logged."""
    org_id = get_org_id(request)
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Request body must be JSON")
    text = body.get("text") if isinstance(body, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=400, detail="Sample text is required")
    if len(text) > MAX_TEST_TEXT:
        raise HTTPException(status_code=400, detail=f"Sample text must be at most {MAX_TEST_TEXT} characters")
    try:
        text.encode("utf-8")  # a lone surrogate (half an emoji) cannot be echoed back
    except UnicodeEncodeError:
        raise HTTPException(status_code=400, detail="Sample text contains an invalid character")

    rules, settings = await get_guardrail_config(org_id)
    # Off the event loop on the single scan thread, like the live proxy and MCP
    # scans: the PII engine is shared and is never called from two threads.
    result = await scan_text_async(text=text, guardrail_rules=rules, settings=settings)
    return {"data": guardrail_preview(result)}


def guardrail_preview(result) -> dict:
    """What a guardrail test shows: would it block, what was found, the masked text."""
    return {
        "would_block": result.blocked,
        "block_reason": result.block_reason,
        "detections": [
            {
                "guardrail_type": d.guardrail_type,
                "entity_type": d.entity_type,
                "action": d.action,
                "matched_text": d.matched_text,
                "start": d.start,
                "end": d.end,
                "score": d.score,
            }
            for d in result.detections
        ],
        "masked_preview": result.masked_text,
        "execution_time_ms": result.execution_time_ms,
    }
