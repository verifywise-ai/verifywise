"""Guardrails router — test endpoint for previewing guardrail results."""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from middlewares.auth import verify_internal_key
from services.guardrail_service import scan_text

router = APIRouter()


class GuardrailTestRequest(BaseModel):
    text: str
    guardrail_rules: list[dict]
    settings: dict = {}


@router.post("/v1/guardrails/test")
async def test_guardrails(request: Request, body: GuardrailTestRequest):
    """Test guardrail rules against sample text without logging."""
    verify_internal_key(request)

    result = scan_text(
        text=body.text,
        guardrail_rules=body.guardrail_rules,
        settings=body.settings,
    )

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


@router.post("/v1/guardrails/scan")
async def scan_for_guardrails(request: Request, body: GuardrailTestRequest):
    """
    Production scan endpoint called by Express proxy before LLM completion.
    Same as test but intended for the live flow.
    """
    verify_internal_key(request)

    result = scan_text(
        text=body.text,
        guardrail_rules=body.guardrail_rules,
        settings=body.settings,
    )

    return {
        "blocked": result.blocked,
        "block_reason": result.block_reason,
        "detections": [
            {
                "guardrail_id": d.guardrail_id,
                "guardrail_type": d.guardrail_type,
                "entity_type": d.entity_type,
                "action": d.action,
                "matched_text": d.matched_text,
                "execution_time_ms": result.execution_time_ms,
            }
            for d in result.detections
        ],
        "masked_text": result.masked_text,
        "execution_time_ms": result.execution_time_ms,
    }
