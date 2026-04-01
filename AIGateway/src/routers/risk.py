"""
Risk management router for the AI Gateway.

Endpoints:
    GET  /risk/settings
    PUT  /risk/settings/{condition_id}
    GET  /risk/suggestions
    POST /risk/suggestions/{suggestion_id}/accept
    POST /risk/suggestions/{suggestion_id}/dismiss
    POST /risk/detect
"""

import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import text

from database.db import get_db
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, get_user_id, require_admin
from crud.risk import (
    get_risk_settings,
    upsert_risk_setting,
    get_suggestions,
    update_suggestion_status,
    create_suggestion,
)
from services.risk_conditions import CONDITION_DEFINITIONS, evaluate_all_conditions

router = APIRouter(prefix="/risk", tags=["risk"])


# ---------------------------------------------------------------------------
# Request / response bodies
# ---------------------------------------------------------------------------


class UpsertRiskSettingBody(BaseModel):
    is_enabled: bool = True
    threshold: Optional[dict] = None
    severity_override: Optional[str] = None


class AcceptSuggestionBody(BaseModel):
    pass  # no body required beyond path param


class DismissSuggestionBody(BaseModel):
    dismiss_reason: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/settings")
async def get_risk_settings_route(request: Request):
    """Return risk settings merged with CONDITION_DEFINITIONS defaults."""
    verify_internal_key(request)
    org_id = get_org_id(request)

    db_settings = await get_risk_settings(org_id)
    settings_by_id = {row["condition_id"]: row for row in db_settings}

    merged = []
    for defn in CONDITION_DEFINITIONS:
        cid = defn["id"]
        db_row = settings_by_id.get(cid)
        if db_row:
            merged.append(
                {
                    "condition_id": cid,
                    "label": defn["label"],
                    "is_enabled": db_row.get("is_enabled", True),
                    "threshold": db_row.get("threshold") or defn["default_threshold"],
                    "severity_override": db_row.get("severity_override"),
                    "default_threshold": defn["default_threshold"],
                    "default_severity": defn["default_severity"],
                    "updated_at": db_row.get("updated_at"),
                }
            )
        else:
            merged.append(
                {
                    "condition_id": cid,
                    "label": defn["label"],
                    "is_enabled": True,
                    "threshold": defn["default_threshold"],
                    "severity_override": None,
                    "default_threshold": defn["default_threshold"],
                    "default_severity": defn["default_severity"],
                    "updated_at": None,
                }
            )

    return {"settings": merged}


@router.put("/settings/{condition_id}")
async def upsert_risk_setting_route(
    condition_id: str,
    body: UpsertRiskSettingBody,
    request: Request,
):
    """Create or update a risk condition setting (admin only)."""
    verify_internal_key(request)
    require_admin(request)
    org_id = get_org_id(request)

    valid_ids = {defn["id"] for defn in CONDITION_DEFINITIONS}
    if condition_id not in valid_ids:
        raise HTTPException(status_code=400, detail=f"Unknown condition_id: {condition_id}")

    setting = await upsert_risk_setting(
        org_id=org_id,
        condition_id=condition_id,
        is_enabled=body.is_enabled,
        threshold=body.threshold,
        severity_override=body.severity_override,
    )
    return {"setting": setting}


@router.get("/suggestions")
async def get_suggestions_route(
    request: Request,
    status: Optional[str] = Query(default=None),
):
    """Return risk suggestions, optionally filtered by status."""
    verify_internal_key(request)
    org_id = get_org_id(request)

    suggestions = await get_suggestions(org_id, status=status)
    return {"suggestions": suggestions}


@router.post("/suggestions/{suggestion_id}/accept")
async def accept_suggestion_route(suggestion_id: int, request: Request):
    """
    Accept a risk suggestion.

    Creates a row in the ``risks`` table and then marks the suggestion as
    accepted, linking it to the newly created risk.
    """
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)

    # Fetch the suggestion first so we can populate the risks row
    suggestions = await get_suggestions(org_id)
    suggestion = next(
        (s for s in suggestions if s["id"] == suggestion_id and s["status"] == "pending"),
        None,
    )
    if not suggestion:
        raise HTTPException(
            status_code=404,
            detail="Suggestion not found or is not in pending state",
        )

    # Map AI Gateway severity to risk level vocabulary
    severity_to_level = {
        "critical": "Very High",
        "high": "High",
        "medium": "Medium",
        "low": "Low",
    }
    current_risk_level = severity_to_level.get(
        (suggestion.get("severity") or "medium").lower(), "Medium"
    )

    # Use a single db session for the INSERT + UPDATE
    async with get_db() as db:
        # 1. Insert into risks table
        risk_result = await db.execute(
            text(
                """
                INSERT INTO risks (
                    risk_name,
                    risk_description,
                    severity,
                    risk_category,
                    mitigation_plan,
                    mitigation_status,
                    current_risk_level,
                    organization_id
                ) VALUES (
                    :risk_name,
                    :risk_description,
                    :severity,
                    :risk_category,
                    :mitigation_plan,
                    'Not Started',
                    :current_risk_level,
                    :organization_id
                )
                RETURNING id
                """
            ),
            {
                "risk_name": suggestion["title"],
                "risk_description": suggestion["description"],
                "severity": suggestion.get("severity", "medium"),
                "risk_category": "{AI Governance}",  # pg array literal
                "mitigation_plan": suggestion.get("suggested_mitigation") or "",
                "current_risk_level": current_risk_level,
                "organization_id": org_id,
            },
        )
        risk_row = risk_result.first()
        accepted_risk_id = risk_row[0] if risk_row else None

        # 2. Update suggestion status
        update_result = await db.execute(
            text(
                """
                UPDATE ai_gateway_risk_suggestions SET
                    status           = 'accepted',
                    reviewed_by      = :reviewed_by,
                    reviewed_at      = NOW(),
                    accepted_risk_id = :accepted_risk_id
                WHERE id = :id
                  AND org_id = :org_id
                  AND status = 'pending'
                RETURNING *
                """
            ),
            {
                "reviewed_by": user_id,
                "accepted_risk_id": accepted_risk_id,
                "id": suggestion_id,
                "org_id": org_id,
            },
        )
        await db.commit()

        updated = update_result.mappings().first()
        if not updated:
            raise HTTPException(
                status_code=409,
                detail="Suggestion was already reviewed by another user",
            )

        return {
            "suggestion": dict(updated),
            "risk_id": accepted_risk_id,
        }

    raise HTTPException(status_code=500, detail="Database session unavailable")


@router.post("/suggestions/{suggestion_id}/dismiss")
async def dismiss_suggestion_route(
    suggestion_id: int,
    body: DismissSuggestionBody,
    request: Request,
):
    """Dismiss a risk suggestion with a required reason."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)

    if not body.dismiss_reason or not body.dismiss_reason.strip():
        raise HTTPException(status_code=400, detail="dismiss_reason is required")

    updated = await update_suggestion_status(
        org_id=org_id,
        suggestion_id=suggestion_id,
        status="dismissed",
        reviewed_by=user_id,
        dismiss_reason=body.dismiss_reason.strip(),
    )
    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Suggestion not found or is not in pending state",
        )

    return {"suggestion": updated}


@router.post("/detect")
async def detect_risks_route(request: Request):
    """
    Run all enabled risk condition evaluators and persist any new detections
    as pending suggestions (admin only).
    """
    verify_internal_key(request)
    require_admin(request)
    org_id = get_org_id(request)

    results = await evaluate_all_conditions(org_id)

    created_suggestions = []
    for result in results:
        if result.get("error"):
            # Evaluator failed — skip but surface in response
            continue

        if not result.get("detected"):
            continue

        if result.get("already_pending"):
            # Avoid duplicate pending suggestions for the same condition
            continue

        suggestion = await create_suggestion(
            org_id=org_id,
            condition_id=result["condition_id"],
            title=result["title"],
            description=result["description"],
            severity=result["severity"],
            evidence=result.get("evidence", {}),
            compliance_tags=result.get("compliance_tags", []),
            suggested_mitigation=result.get("suggested_mitigation"),
        )
        created_suggestions.append(suggestion)

    return {
        "results": results,
        "new_suggestions": created_suggestions,
        "new_suggestions_count": len(created_suggestions),
    }


@router.get("/detection-orgs")
async def get_detection_orgs(request: Request):
    """Return org IDs that have AI Gateway endpoints. Used by BullMQ risk detection job."""
    verify_internal_key(request)
    async with get_db() as db:
        result = await db.execute(
            text("SELECT DISTINCT organization_id FROM ai_gateway_endpoints")
        )
        org_ids = [row[0] for row in result.fetchall()]
    return {"data": org_ids}
