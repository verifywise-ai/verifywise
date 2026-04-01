"""
CRUD for user datasets (shared-schema multi-tenancy).

All data is in the public schema with organization_id column for tenant isolation.
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def create_user_dataset(
    organization_id: int,
    db: AsyncSession,
    *,
    name: str,
    path: str,
    size: int,
    prompt_count: int = 0,
    dataset_type: str = "chatbot",
    turn_type: str = "single-turn",
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    res = await db.execute(
        text(
            '''
            INSERT INTO llm_evals_datasets (organization_id, name, path, size, prompt_count, dataset_type, turn_type, created_by)
            VALUES (:organization_id, :name, :path, :size, :prompt_count, :dataset_type, :turn_type, :created_by)
            RETURNING id, name, path, size, prompt_count, dataset_type, turn_type, created_at, created_by;
            '''
        ),
        {
            "organization_id": organization_id,
            "name": name,
            "path": path,
            "size": int(size),
            "prompt_count": int(prompt_count),
            "dataset_type": dataset_type,
            "turn_type": turn_type,
            "created_by": created_by,
        },
    )
    row = res.mappings().first()
    return {
        "id": row["id"],
        "name": row["name"],
        "path": row["path"],
        "size": row["size"],
        "promptCount": row["prompt_count"],
        "datasetType": row["dataset_type"],
        "turnType": row["turn_type"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "createdBy": row["created_by"],
    }


async def list_user_datasets(
    organization_id: int,
    db: AsyncSession,
) -> List[Dict[str, Any]]:
    """
    List user datasets for an organization.
    """
    res = await db.execute(
        text(
            '''
            SELECT id, name, path, size, prompt_count, dataset_type, turn_type, created_at, created_by
            FROM llm_evals_datasets
            WHERE organization_id = :organization_id
            ORDER BY created_at DESC;
            '''
        ),
        {"organization_id": organization_id},
    )
    items: List[Dict[str, Any]] = []
    for r in res.mappings().all():
        item = {
            "id": r["id"],
            "name": r["name"],
            "path": r["path"],
            "size": r["size"],
            "promptCount": r["prompt_count"] if r["prompt_count"] else 0,
            "datasetType": r["dataset_type"] if r["dataset_type"] else "chatbot",
            "turnType": r["turn_type"] if r["turn_type"] else None,
            "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
            "createdBy": r["created_by"],
        }
        items.append(item)
    return items


async def delete_user_datasets(organization_id: int, db: AsyncSession, paths: List[str]) -> None:
    if not paths:
        return

    # Create placeholders for the IN clause
    placeholders = ", ".join([f":path_{i}" for i in range(len(paths))])
    params = {f"path_{i}": path for i, path in enumerate(paths)}
    params["organization_id"] = organization_id

    await db.execute(
        text(
            f'''
            DELETE FROM llm_evals_datasets
            WHERE organization_id = :organization_id AND path IN ({placeholders});
            '''
        ),
        params
    )
