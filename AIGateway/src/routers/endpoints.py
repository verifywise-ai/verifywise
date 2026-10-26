import re
import logging
from fastapi import APIRouter, HTTPException, Request
from typing import Any, Optional

from utils.auth import get_org_id, get_user_id, get_role_id, require_admin
from utils.notifications import config_event, notify_config_change
from utils.change_history import record_endpoint_change
from utils.endpoint_model import normalize_endpoint_model
import crud.endpoints as endpoints_crud

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/endpoints", tags=["endpoints"])


SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _validate_slug(slug: str) -> None:
    if not SLUG_PATTERN.match(slug):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid slug. Must start with a lowercase letter or digit and "
                "contain only lowercase letters, digits, and hyphens."
            ),
        )


def _validate_text_fields(body: dict) -> None:
    for field in ("provider", "model"):
        if field in body and body[field] is not None and not isinstance(body[field], str):
            raise HTTPException(status_code=400, detail=f"{field} must be a string")


@router.get("")
async def list_endpoints(request: Request) -> Any:

    org_id = get_org_id(request)
    role_id = get_role_id(request)

    endpoints = await endpoints_crud.get_all_endpoints(org_id, role_id=role_id)
    return {"endpoints": endpoints}


@router.get("/{endpoint_id}")
async def get_endpoint(endpoint_id: int, request: Request) -> Any:

    org_id = get_org_id(request)
    role_id = get_role_id(request)

    # Role visibility as the gateway enforces it (empty or NULL
    # allowed_role_ids = open to every role): an endpoint the caller's role
    # cannot see is reported as missing rather than leaking its configuration.
    endpoint = await endpoints_crud.get_endpoint_by_id(
        org_id, endpoint_id, role_id=role_id
    )
    if not endpoint:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    return {"endpoint": endpoint}


@router.post("")
async def create_endpoint(request: Request) -> Any:
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    body: dict = await request.json()

    slug: Optional[str] = body.get("slug")
    if not slug:
        raise HTTPException(status_code=400, detail="slug is required")
    _validate_slug(slug)

    if not body.get("display_name"):
        raise HTTPException(status_code=400, detail="display_name is required")

    if not body.get("provider"):
        raise HTTPException(status_code=400, detail="provider is required")

    if not body.get("model"):
        raise HTTPException(status_code=400, detail="model is required")
    _validate_text_fields(body)

    body["model"] = normalize_endpoint_model(body["provider"], body["model"])

    endpoint = await endpoints_crud.create_endpoint(org_id, body)
    if not endpoint:
        raise HTTPException(status_code=500, detail="Failed to create endpoint")

    await notify_config_change(
        org_id,
        user_id,
        config_event("endpoint", "created", endpoint.get("display_name"), endpoint["id"]),
    )

    return {"endpoint": endpoint}


@router.patch("/{endpoint_id}")
async def update_endpoint(endpoint_id: int, request: Request) -> Any:
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    body: dict = await request.json()

    slug: Optional[str] = body.get("slug")
    if slug is not None:
        _validate_slug(slug)

    existing = await endpoints_crud.get_endpoint_by_id(
        org_id, endpoint_id, role_id=None  # Admin-only route: unfiltered read
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    _validate_text_fields(body)
    if body.get("model"):
        body["model"] = normalize_endpoint_model(
            body.get("provider") or existing.get("provider"), body["model"]
        )

    updated = await endpoints_crud.update_endpoint(org_id, endpoint_id, body)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update endpoint")

    try:
        await record_endpoint_change(
            organization_id=org_id,
            endpoint_id=endpoint_id,
            changed_by=user_id,
            action="updated",
        )
    except Exception:
        logger.exception(
            "Failed to record change history for endpoint id=%s", endpoint_id
        )

    await notify_config_change(
        org_id,
        user_id,
        config_event("endpoint", "updated", updated.get("display_name"), endpoint_id),
    )

    return {"endpoint": updated}


@router.delete("/{endpoint_id}")
async def delete_endpoint(endpoint_id: int, request: Request) -> Any:
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    existing = await endpoints_crud.get_endpoint_by_id(
        org_id, endpoint_id, role_id=None  # Admin-only route: unfiltered read
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    deleted = await endpoints_crud.delete_endpoint(org_id, endpoint_id)
    if not deleted:
        # Another request deleted it after the lookup above.
        raise HTTPException(status_code=404, detail="Endpoint not found")

    await notify_config_change(
        org_id,
        user_id,
        config_event("endpoint", "deleted", existing.get("display_name"), endpoint_id),
    )

    return {"deleted": True, "endpoint_id": endpoint_id}
