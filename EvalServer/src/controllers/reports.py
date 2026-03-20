"""
Controller for report generation and storage endpoints.
"""

import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding as crypto_padding
from cryptography.hazmat.backends import default_backend
from fastapi import HTTPException
from fastapi.responses import JSONResponse, Response
from sqlalchemy import text
from database.db import get_db
from crud import reports as crud
from utils.report_generator import generate_pdf_report, generate_csv_report
from utils.report_summarizer import generate_all_summaries

logger = logging.getLogger("uvicorn")

ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")
if not ENCRYPTION_KEY:
    logger.warning("ENCRYPTION_KEY not set — report AI summaries requiring stored API keys will be unavailable")

PREFERRED_PROVIDERS = ["openai", "anthropic", "google", "mistral", "xai"]
DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-20241022",
    "google": "gemini-2.0-flash",
    "mistral": "mistral-small-latest",
    "xai": "grok-2",
}


def _decrypt_api_key(encrypted_text: str) -> str:
    """Decrypt an API key encrypted by the Node.js backend (AES-256-CBC, hex-encoded)."""
    if not ENCRYPTION_KEY:
        raise ValueError("ENCRYPTION_KEY not configured")
    parts = encrypted_text.split(":")
    if len(parts) != 2:
        raise ValueError("Invalid encrypted format")
    iv_hex, data_hex = parts
    key = ENCRYPTION_KEY.encode("ascii").ljust(32, b"0")[:32]
    iv = bytes.fromhex(iv_hex)
    ct = bytes.fromhex(data_hex)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    padded = decryptor.update(ct) + decryptor.finalize()
    unpadder = crypto_padding.PKCS7(128).unpadder()
    plaintext = unpadder.update(padded) + unpadder.finalize()
    return plaintext.decode("utf-8")


async def _get_best_api_key(db, organization_id: int) -> Optional[Tuple[str, str]]:
    """
    Fetch the best available LLM API key from the database.
    Returns (provider, decrypted_key) or None.
    Prefers providers in PREFERRED_PROVIDERS order.
    """
    result = await db.execute(
        text("SELECT provider, api_key_encrypted FROM llm_evals_api_keys "
             "WHERE organization_id = :org_id"),
        {"org_id": organization_id},
    )
    rows = result.fetchall()
    if not rows:
        return None

    keys_by_provider = {}
    for row in rows:
        provider = row[0].lower()
        try:
            decrypted = _decrypt_api_key(row[1])
            keys_by_provider[provider] = decrypted
        except Exception as e:
            logger.warning(f"Failed to decrypt key for {provider}: {e}")

    for preferred in PREFERRED_PROVIDERS:
        if preferred in keys_by_provider:
            return preferred, keys_by_provider[preferred]

    if keys_by_provider:
        provider = next(iter(keys_by_provider))
        return provider, keys_by_provider[provider]

    return None


async def generate_report_controller(
    body: Dict[str, Any],
    organization_id: int,
    user_id: Optional[str] = None,
) -> Response:
    """Generate a PDF or CSV evaluation report."""

    experiment_ids: List[str] = body.get("experimentIds", [])
    if not experiment_ids:
        raise HTTPException(status_code=400, detail="No experiment IDs provided")

    project_id: str = body.get("projectId", "")
    report_format: str = body.get("format", "pdf").lower()
    config: Dict[str, Any] = body

    try:
        async with get_db() as db:
            project = None
            if project_id:
                project = await crud.get_project_info(db, organization_id, project_id)

            project_name = (project or {}).get("name", "Unknown Project")
            org_name = body.get("orgName", "")

            experiments = await crud.get_experiments_for_report(
                db, organization_id, experiment_ids
            )

            if not experiments:
                raise HTTPException(
                    status_code=404,
                    detail="No experiments found for the given IDs",
                )

            if report_format == "csv":
                csv_content = generate_csv_report(experiments, project_name)
                file_data = csv_content.encode("utf-8") if isinstance(csv_content, str) else csv_content
            else:
                executive_summary = ""
                metric_summaries: Dict[str, Dict[str, str]] = {}
                recommendations_summary = ""

                key_info = await _get_best_api_key(db, organization_id)
                if key_info:
                    provider, api_key = key_info
                    model = DEFAULT_MODELS.get(provider, "gpt-4o-mini")
                    try:
                        logger.info(f"Generating AI summaries with {provider}/{model}")
                        executive_summary, metric_summaries, recommendations_summary = generate_all_summaries(
                            experiments,
                            provider=provider,
                            model=model,
                            api_key=api_key,
                        )
                    except Exception as e:
                        logger.warning(f"AI summary generation failed, continuing without: {e}")
                else:
                    logger.info("No API keys stored — skipping AI summaries")

                config["ai_executive_summary"] = executive_summary
                config["ai_metric_summaries"] = metric_summaries
                config["ai_recommendations"] = recommendations_summary

                file_data = generate_pdf_report(config, experiments, project_name, org_name)

            title = config.get("title") or f"{project_name} - Evaluation Report"
            sections = body.get("sections", [])

            saved = await crud.save_report(
                db=db,
                organization_id=organization_id,
                title=title,
                format=report_format,
                file_data=file_data,
                experiment_ids=experiment_ids,
                sections=sections,
                project_id=project_id,
                created_by=str(user_id) if user_id else None,
            )

            return JSONResponse(content={
                "id": saved["id"],
                "title": title,
                "format": report_format,
                "fileSize": saved["fileSize"],
                "experimentIds": experiment_ids,
                "projectId": project_id,
            })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report generation failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate report. Please try again.",
        )


async def list_reports_controller(
    organization_id: int,
    project_id: Optional[str] = None,
) -> JSONResponse:
    """List stored reports for an organization."""
    try:
        async with get_db() as db:
            reports = await crud.list_reports(db, organization_id, project_id)
            return JSONResponse(content=reports)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def get_report_controller(
    organization_id: int,
    report_id: str,
) -> Response:
    """Return the stored report file."""
    try:
        async with get_db() as db:
            report = await crud.get_report_file(db, organization_id, report_id)
            if not report:
                raise HTTPException(status_code=404, detail="Report not found")

            fmt = report["format"]
            safe_title = re.sub(r'[^\w\s\-.]', '', report["title"]).strip()[:200]
            if fmt == "csv":
                return Response(
                    content=report["file_data"],
                    media_type="text/csv",
                    headers={
                        "Content-Disposition": f'attachment; filename="{safe_title}.csv"',
                    },
                )
            return Response(
                content=report["file_data"],
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'inline; filename="{safe_title}.pdf"',
                },
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def delete_report_controller(
    organization_id: int,
    report_id: str,
) -> JSONResponse:
    """Delete a stored report."""
    try:
        async with get_db() as db:
            deleted = await crud.delete_report(db, organization_id, report_id)
            if not deleted:
                raise HTTPException(status_code=404, detail="Report not found")
            return JSONResponse(content={"success": True})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
