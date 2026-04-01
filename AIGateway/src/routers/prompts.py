import json as _json
import re
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from crud import prompts as crud
from middlewares.auth import verify_internal_key
from services.llm_service import stream_chat_completion
from services.proxy_service import resolve_endpoint_for_key
from utils.auth import get_org_id, get_user_id, require_admin
from utils.notifications import notify_config_change

FRONTEND_URL = "http://localhost:5173"

router = APIRouter(prefix="/prompts")

# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9-]*$')
LABEL_RE = re.compile(r'^[a-z0-9][a-z0-9-]*$')


class CreatePromptRequest(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if len(v) < 2 or not SLUG_RE.match(v):
            raise ValueError(
                "slug must be at least 2 characters and match ^[a-z0-9][a-z0-9-]*$"
            )
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("name is required")
        return v


class UpdatePromptRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class CreateVersionRequest(BaseModel):
    content: list
    model: Optional[str] = None
    config: Optional[dict] = None
    commit_message: Optional[str] = None

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: list) -> list:
        if not v:
            raise ValueError("content must be a non-empty list")
        return v


class AssignLabelRequest(BaseModel):
    version_id: int

    @field_validator("version_id")
    @classmethod
    def validate_version_id(cls, v: Any) -> int:
        if v is None:
            raise ValueError("version_id is required")
        return v


class CreateTestDatasetRequest(BaseModel):
    name: str
    test_cases: Optional[list] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("name is required")
        return v


class UpdateTestDatasetRequest(BaseModel):
    name: Optional[str] = None
    test_cases: Optional[list] = None


class TestPromptRequest(BaseModel):
    content: list
    endpoint_slug: str
    variables: Optional[dict] = None

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: list) -> list:
        if not v:
            raise ValueError("content must be a non-empty list")
        return v

    @field_validator("endpoint_slug")
    @classmethod
    def validate_endpoint_slug(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("endpoint_slug is required")
        return v


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_prompts(request: Request):
    """List all prompts for the organisation."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    prompts = await crud.get_all_prompts(org_id)
    return {"prompts": prompts}


@router.post("", status_code=201)
async def create_prompt(request: Request, body: CreatePromptRequest):
    """Create a new prompt (admin only)."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)
    require_admin(request)

    # Check for slug uniqueness
    existing = await crud.get_prompt_by_slug(org_id, body.slug)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A prompt with slug '{body.slug}' already exists",
        )

    prompt = await crud.create_prompt(
        org_id=org_id,
        slug=body.slug,
        name=body.name,
        description=body.description,
        created_by=user_id,
    )

    await notify_config_change(
        org_id=org_id,
        event="prompt.created",
        payload={"prompt_id": prompt.get("id"), "slug": body.slug, "name": body.name},
        frontend_url=FRONTEND_URL,
    )

    return {"prompt": prompt}


@router.get("/{prompt_id}")
async def get_prompt(request: Request, prompt_id: int):
    """Get a single prompt by ID."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    prompt = await crud.get_prompt_by_id(org_id, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"prompt": prompt}


@router.patch("/{prompt_id}")
async def update_prompt(request: Request, prompt_id: int, body: UpdatePromptRequest):
    """Update a prompt's name or description."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    prompt = await crud.update_prompt(org_id, prompt_id, body.model_dump(exclude_none=True))
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"prompt": prompt}


@router.delete("/{prompt_id}", status_code=200)
async def delete_prompt(request: Request, prompt_id: int):
    """Delete a prompt and all its versions (admin only, CASCADE)."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    require_admin(request)

    deleted = await crud.delete_prompt(org_id, prompt_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Prompt not found")

    await notify_config_change(
        org_id=org_id,
        event="prompt.deleted",
        payload={"prompt_id": prompt_id},
        frontend_url=FRONTEND_URL,
    )

    return {"deleted": True}


@router.post("/{prompt_id}/versions", status_code=201)
async def create_version(request: Request, prompt_id: int, body: CreateVersionRequest):
    """Create a new draft version for a prompt."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)

    # Verify prompt exists and belongs to org
    prompt = await crud.get_prompt_by_id(org_id, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    version = await crud.create_version(
        org_id=org_id,
        prompt_id=prompt_id,
        content=body.content,
        model=body.model,
        config=body.config,
        created_by=user_id,
        commit_message=body.commit_message,
    )
    return {"version": version}


@router.get("/{prompt_id}/versions")
async def list_versions(request: Request, prompt_id: int):
    """List all versions for a prompt, ordered by version DESC."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    versions = await crud.get_versions(org_id, prompt_id)
    return {"versions": versions}


@router.post("/{prompt_id}/versions/{v}/publish")
async def publish_version(request: Request, prompt_id: int, v: int):
    """Publish a specific version (admin only)."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)
    require_admin(request)

    published = await crud.publish_version(
        org_id=org_id,
        prompt_id=prompt_id,
        version_number=v,
        published_by=user_id,
    )
    if published is None:
        raise HTTPException(status_code=404, detail=f"Version {v} not found for this prompt")

    await notify_config_change(
        org_id=org_id,
        event="prompt.version.published",
        payload={"prompt_id": prompt_id, "version": v},
        frontend_url=FRONTEND_URL,
    )

    return {"version": published}


@router.get("/{prompt_id}/labels")
async def get_labels(request: Request, prompt_id: int):
    """Get all labels assigned to a prompt."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    labels = await crud.get_labels(org_id, prompt_id)
    return {"labels": labels}


@router.put("/{prompt_id}/labels/{label}")
async def assign_label(
    request: Request,
    prompt_id: int,
    label: str,
    body: AssignLabelRequest,
):
    """Assign (or update) a label on a prompt version."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)

    if len(label) < 2 or len(label) > 64 or not LABEL_RE.match(label):
        raise HTTPException(
            status_code=422,
            detail="label must be 2-64 characters and match ^[a-z0-9][a-z0-9-]*$",
        )

    result = await crud.assign_label(
        org_id=org_id,
        prompt_id=prompt_id,
        label_name=label,
        version_id=body.version_id,
        assigned_by=user_id,
    )
    return {"label": result}


@router.delete("/{prompt_id}/labels/{label}")
async def remove_label(request: Request, prompt_id: int, label: str):
    """Remove a label from a prompt."""
    verify_internal_key(request)
    org_id = get_org_id(request)

    deleted = await crud.remove_label(org_id, prompt_id, label)
    if not deleted:
        raise HTTPException(status_code=404, detail="Label not found")
    return {"deleted": True}


@router.get("/{prompt_id}/test-datasets")
async def list_test_datasets(request: Request, prompt_id: int):
    """List all test datasets for a prompt."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    datasets = await crud.get_test_datasets(org_id, prompt_id)
    return {"test_datasets": datasets}


@router.post("/{prompt_id}/test-datasets", status_code=201)
async def create_test_dataset(
    request: Request,
    prompt_id: int,
    body: CreateTestDatasetRequest,
):
    """Create a new test dataset for a prompt."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)

    dataset = await crud.create_test_dataset(
        org_id=org_id,
        prompt_id=prompt_id,
        name=body.name,
        test_cases=body.test_cases,
        created_by=user_id,
    )
    return {"test_dataset": dataset}


@router.patch("/{prompt_id}/test-datasets/{dataset_id}")
async def update_test_dataset(
    request: Request,
    prompt_id: int,
    dataset_id: int,
    body: UpdateTestDatasetRequest,
):
    """Update a test dataset's name or test cases."""
    verify_internal_key(request)
    org_id = get_org_id(request)

    dataset = await crud.update_test_dataset(
        org_id=org_id,
        prompt_id=prompt_id,
        dataset_id=dataset_id,
        data=body.model_dump(exclude_none=True),
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Test dataset not found")
    return {"test_dataset": dataset}


@router.delete("/{prompt_id}/test-datasets/{dataset_id}")
async def delete_test_dataset(
    request: Request,
    prompt_id: int,
    dataset_id: int,
):
    """Delete a test dataset."""
    verify_internal_key(request)
    org_id = get_org_id(request)

    deleted = await crud.delete_test_dataset(org_id, prompt_id, dataset_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Test dataset not found")
    return {"deleted": True}


@router.post("/test")
async def test_prompt(request: Request, body: TestPromptRequest):
    """
    Test a prompt by resolving variables and streaming the LLM response.
    Returns an SSE stream compatible with the frontend's streamPromptTest().
    """
    verify_internal_key(request)
    org_id = get_org_id(request)

    # Resolve variables in the prompt content
    resolved_content = crud.resolve_variables(
        body.content,
        body.variables or {},
    )

    # Resolve the endpoint to get provider, model, and API key
    try:
        endpoint = await resolve_endpoint_for_key(
            organization_id=org_id,
            endpoint_slug=body.endpoint_slug,
            allowed_endpoint_ids=[],
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Stream the LLM response
    async def _stream():
        try:
            async for chunk_str in stream_chat_completion(
                model=endpoint["model"],
                messages=resolved_content,
                api_key=endpoint["decrypted_key"],
            ):
                yield chunk_str
        except Exception as e:
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")
