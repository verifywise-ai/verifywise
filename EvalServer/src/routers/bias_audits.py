"""
Bias Audits Router

Endpoints for managing bias audits with law-aware presets.
Shared-schema multi-tenancy: Uses organization_id from request.state.
"""

from fastapi import APIRouter, BackgroundTasks, Request, UploadFile, File, Form, HTTPException
from controllers.bias_audits import (
    list_presets_controller,
    get_preset_controller,
    create_bias_audit_controller,
    get_bias_audit_status_controller,
    get_bias_audit_results_controller,
    list_bias_audits_controller,
    delete_bias_audit_controller,
    get_csv_headers_controller,
)

router = APIRouter()


def _get_organization_id(request: Request) -> int:
    """Extract organization_id from request state (set by middleware)."""
    org_id = getattr(request.state, "organization_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="Missing organization id")
    return org_id


# ==================== PRESETS ====================

@router.get("/bias-audits/presets")
async def list_presets():
    """List all available bias audit preset summaries."""
    return await list_presets_controller()


@router.get("/bias-audits/presets/{preset_id}")
async def get_preset(preset_id: str):
    """Get full details of a single preset."""
    return await get_preset_controller(preset_id)


# ==================== AUDITS ====================

@router.post("/bias-audits/run")
async def create_bias_audit(
    request: Request,
    background_tasks: BackgroundTasks,
    dataset: UploadFile = File(...),
    config_json: str = Form(...),
    org_id: str = Form(...),
):
    """
    Create and execute a bias audit.

    Multipart form: dataset CSV file + config_json string + org_id.
    Returns 202 with auditId for polling.
    """
    organization_id = _get_organization_id(request)
    user_id = request.headers.get("x-user-id")
    return await create_bias_audit_controller(
        background_tasks=background_tasks,
        dataset=dataset,
        config_json=config_json,
        organization_id=organization_id,
        user_id=user_id,
        org_id=org_id,
    )


@router.get("/bias-audits/{audit_id}/status")
async def get_audit_status(audit_id: str, request: Request):
    """Poll the status of a bias audit."""
    organization_id = _get_organization_id(request)
    return await get_bias_audit_status_controller(
        audit_id,
        organization_id=organization_id,
    )


@router.get("/bias-audits/{audit_id}/results")
async def get_audit_results(audit_id: str, request: Request):
    """Get full results of a completed bias audit."""
    organization_id = _get_organization_id(request)
    return await get_bias_audit_results_controller(
        audit_id,
        organization_id=organization_id,
    )


@router.get("/bias-audits")
async def list_audits(
    request: Request,
    org_id: str | None = None,
    project_id: str | None = None,
):
    """List all bias audits for the organization."""
    organization_id = _get_organization_id(request)
    return await list_bias_audits_controller(
        organization_id=organization_id,
        org_id=org_id,
        project_id=project_id,
    )


@router.delete("/bias-audits/{audit_id}")
async def delete_audit(audit_id: str, request: Request):
    """Delete a bias audit and its results."""
    organization_id = _get_organization_id(request)
    return await delete_bias_audit_controller(
        audit_id,
        organization_id=organization_id,
    )


# ==================== UTILITIES ====================

@router.post("/bias-audits/parse-headers")
async def parse_csv_headers(dataset: UploadFile = File(...)):
    """Parse CSV headers for column mapping UI."""
    return await get_csv_headers_controller(dataset)
