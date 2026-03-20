"""API routes for evaluation report generation and storage."""

from typing import Optional
from fastapi import APIRouter, Request, HTTPException
from controllers import reports as controller

router = APIRouter(prefix="/deepeval", tags=["Reports"])


def _org_id(request: Request) -> int:
    org_id = getattr(request.state, "organization_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="Missing organization id")
    return org_id


@router.post("/reports/generate")
async def generate_report(request: Request):
    """Generate a PDF or CSV evaluation report and save it to the database."""
    body = await request.json()
    return await controller.generate_report_controller(
        body=body,
        organization_id=_org_id(request),
        user_id=getattr(request.state, "user_id", None),
    )


@router.get("/reports")
async def list_reports(request: Request, project_id: Optional[str] = None):
    """List stored reports for the current organization."""
    return await controller.list_reports_controller(
        organization_id=_org_id(request),
        project_id=project_id,
    )


@router.get("/reports/{report_id}/file")
async def get_report_file(report_id: str, request: Request):
    """Download a stored report file."""
    return await controller.get_report_controller(
        organization_id=_org_id(request),
        report_id=report_id,
    )


@router.delete("/reports/{report_id}")
async def delete_report(report_id: str, request: Request):
    """Delete a stored report."""
    return await controller.delete_report_controller(
        organization_id=_org_id(request),
        report_id=report_id,
    )
