"""
CRUD operations for DeepEval models (saved model configurations).

Shared-schema multi-tenancy: All data is in the public schema with organization_id column.
"""

from typing import List, Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def list_models(
    organization_id: int,
    db: AsyncSession,
) -> List[Dict[str, Any]]:
    """
    List saved models for an organization.
    """

    result = await db.execute(
        text(
            '''
            SELECT id,
                   organization_id,
                   name,
                   provider,
                   endpoint_url,
                   created_at,
                   updated_at,
                   created_by
            FROM llm_evals_models
            WHERE organization_id = :organization_id
            ORDER BY created_at DESC
            '''
        ),
        {"organization_id": organization_id},
    )

    rows = result.mappings().all()
    models: List[Dict[str, Any]] = []
    for row in rows:
        models.append(
            {
                "id": row["id"],
                "orgId": str(row["organization_id"]) if row["organization_id"] else None,
                "name": row["name"],
                "provider": row["provider"],
                "endpointUrl": row["endpoint_url"],
                "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
                "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
                "createdBy": row["created_by"],
            }
        )
    return models


async def create_model(
    model_id: str,
    *,
    organization_id: int,
    name: str,
    provider: str,
    endpoint_url: Optional[str],
    created_by: Optional[str],
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Create a new saved model configuration.
    """

    result = await db.execute(
        text(
            '''
            INSERT INTO llm_evals_models
            (id, organization_id, name, provider, endpoint_url, created_by)
            VALUES
            (:id, :organization_id, :name, :provider, :endpoint_url, :created_by)
            RETURNING id, organization_id, name, provider, endpoint_url, created_at, updated_at, created_by
            '''
        ),
        {
            "id": model_id,
            "organization_id": organization_id,
            "name": name,
            "provider": provider,
            "endpoint_url": endpoint_url,
            "created_by": created_by,
        },
    )

    row = result.mappings().first()
    if not row:
        return None

    return {
        "id": row["id"],
        "orgId": str(row["organization_id"]) if row["organization_id"] else None,
        "name": row["name"],
        "provider": row["provider"],
        "endpointUrl": row["endpoint_url"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "createdBy": row["created_by"],
    }


async def update_model(
    model_id: str,
    *,
    organization_id: int,
    name: Optional[str] = None,
    provider: Optional[str] = None,
    endpoint_url: Optional[str] = None,
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Update an existing saved model.
    """

    updates = []
    params: Dict[str, Any] = {"id": model_id, "organization_id": organization_id}

    if name is not None:
        updates.append("name = :name")
        params["name"] = name
    if provider is not None:
        updates.append("provider = :provider")
        params["provider"] = provider
    if endpoint_url is not None:
        updates.append("endpoint_url = :endpoint_url")
        params["endpoint_url"] = endpoint_url

    if not updates:
        # Nothing to update, just return current row
        result = await db.execute(
            text(
                '''
                SELECT id, organization_id, name, provider, endpoint_url, created_at, updated_at, created_by
                FROM llm_evals_models
                WHERE organization_id = :organization_id AND id = :id
                '''
            ),
            params,
        )
    else:
        updates.append("updated_at = CURRENT_TIMESTAMP")
        result = await db.execute(
            text(
                f'''
                UPDATE llm_evals_models
                SET {", ".join(updates)}
                WHERE organization_id = :organization_id AND id = :id
                RETURNING id, organization_id, name, provider, endpoint_url, created_at, updated_at, created_by
                '''
            ),
            params,
        )

    row = result.mappings().first()
    if not row:
        return None

    return {
        "id": row["id"],
        "orgId": str(row["organization_id"]) if row["organization_id"] else None,
        "name": row["name"],
        "provider": row["provider"],
        "endpointUrl": row["endpoint_url"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "createdBy": row["created_by"],
    }


async def get_model_by_id(
    model_id: str,
    *,
    organization_id: int,
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Get a single model by ID.
    """

    result = await db.execute(
        text(
            '''
            SELECT id,
                   organization_id,
                   name,
                   provider,
                   endpoint_url,
                   created_at,
                   updated_at,
                   created_by
            FROM llm_evals_models
            WHERE organization_id = :organization_id AND id = :id
            '''
        ),
        {"organization_id": organization_id, "id": model_id},
    )

    row = result.mappings().first()
    if not row:
        return None

    return {
        "id": row["id"],
        "orgId": str(row["organization_id"]) if row["organization_id"] else None,
        "name": row["name"],
        "provider": row["provider"],
        "endpointUrl": row["endpoint_url"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "createdBy": row["created_by"],
    }


async def delete_model(
    model_id: str,
    *,
    organization_id: int,
    db: AsyncSession,
) -> bool:
    """
    Delete a model by ID.
    """

    result = await db.execute(
        text(
            '''
            DELETE FROM llm_evals_models
            WHERE organization_id = :organization_id AND id = :id
            RETURNING id
            '''
        ),
        {"organization_id": organization_id, "id": model_id},
    )

    row = result.fetchone()
    return row is not None


async def get_latest_model(
    organization_id: int,
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Get the most recently added/updated model.
    Used for auto-populating experiment forms.
    """

    result = await db.execute(
        text(
            '''
            SELECT id,
                   organization_id,
                   name,
                   provider,
                   endpoint_url,
                   created_at,
                   updated_at,
                   created_by
            FROM llm_evals_models
            WHERE organization_id = :organization_id
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1
            '''
        ),
        {"organization_id": organization_id},
    )

    row = result.mappings().first()
    if not row:
        return None

    return {
        "id": row["id"],
        "orgId": str(row["organization_id"]) if row["organization_id"] else None,
        "name": row["name"],
        "provider": row["provider"],
        "endpointUrl": row["endpoint_url"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "createdBy": row["created_by"],
    }
