"""Internal retention endpoints, called by the Express backend's daily job.

Neither route is tenant-scoped: the job runs across organizations, so these
authenticate with the internal key alone, and fail closed: with no internal
key configured they refuse every request. The purge always names one
organization; the job calls it once per opted-in organization.
"""

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel, StrictInt

from config import settings
from crud import spend as spend_crud
from crud.guardrails import purge_guardrail_logs
from crud.purge import PartialPurgeError
from database.db import get_db
from sqlalchemy import text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/retention", tags=["retention"])

# One call purges one organization and stops after 100 batches of 1,000 rows
# per log type, so a single call stays well inside the caller's timeout. The
# caller repeats the call while a type is capped.
ORG_PURGE_MAX_BATCHES = 100


class PurgeRequest(BaseModel):
    organization_id: StrictInt


@router.get("/config")
async def get_retention_config(request: Request):
    return {
        "mcp_audit_retention_days": settings.mcp_audit_retention_days,
        "mcp_audit_retention_min_days": settings.mcp_audit_retention_min_days,
    }


def _deleted_before(error: Exception) -> int:
    """Rows a failed purge had already deleted (its committed batches)."""
    return error.deleted if isinstance(error, PartialPurgeError) else 0


async def _purge_org(org: dict) -> dict:
    org_id = org["organization_id"]
    entry = {
        "organization_id": org_id,
        "guardrail_deleted": 0,
        "guardrail_capped": False,
        "spend_deleted": 0,
        "spend_capped": False,
    }
    # Each log type is purged and reported on its own, so one failure
    # does not mark the other as failed too.
    try:
        guardrail = await purge_guardrail_logs(
            org_id, org["log_retention_days"], max_batches=ORG_PURGE_MAX_BATCHES
        )
        entry["guardrail_deleted"] = guardrail["deleted"]
        entry["guardrail_capped"] = guardrail["capped"]
    except Exception as error:
        logger.error("Guardrail log purge failed for org %s: %s", org_id, error)
        entry["guardrail_deleted"] = _deleted_before(error)
        entry["guardrail_error"] = str(error)
    try:
        async with get_db() as db:
            spend = await spend_crud.purge_spend_logs(
                db,
                org_id,
                org["spend_log_retention_days"],
                max_batches=ORG_PURGE_MAX_BATCHES,
            )
        entry["spend_deleted"] = spend["deleted"]
        entry["spend_capped"] = spend["capped"]
    except Exception as error:
        logger.error("Spend log purge failed for org %s: %s", org_id, error)
        entry["spend_deleted"] = _deleted_before(error)
        entry["spend_error"] = str(error)
    return entry


@router.post("/purge")
async def purge_retention(request: Request, payload: PurgeRequest):
    """Purge guardrail and spend logs for one organization, when it opted in,
    with at most ORG_PURGE_MAX_BATCHES batches per log type."""

    async with get_db() as db:
        result = await db.execute(
            text(
                """
                SELECT organization_id, log_retention_days, spend_log_retention_days
                FROM ai_gateway_guardrail_settings
                WHERE auto_purge_enabled AND organization_id = :org_id
                """
            ),
            {"org_id": payload.organization_id},
        )
        org = result.mappings().first()

    # An organization that did not opt in has nothing to purge.
    if org is None:
        return {"results": []}
    return {"results": [await _purge_org(dict(org))]}
