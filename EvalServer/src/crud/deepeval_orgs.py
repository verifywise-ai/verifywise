"""
CRUD for DeepEval organizations (shared-schema multi-tenancy).

All data is in the public schema with organization_id column for tenant isolation.
"""
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def create_org(
    org_id: str,
    name: str,
    organization_id: int,
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    result = await db.execute(
        text(
            '''
            INSERT INTO llm_evals_organizations (id, name, organization_id)
            VALUES (:id, :name, :organization_id)
            ON CONFLICT (organization_id, name) DO NOTHING
            RETURNING id, name, created_at
            '''
        ),
        {"id": org_id, "name": name, "organization_id": organization_id},
    )
    row = result.mappings().first()
    if row:
        return {
            "id": row["id"],
            "name": row["name"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        }
    # If conflict (existing), fetch it
    res2 = await db.execute(
        text('SELECT id, name, created_at FROM llm_evals_organizations WHERE organization_id = :organization_id AND name = :name'),
        {"organization_id": organization_id, "name": name},
    )
    row2 = res2.mappings().first()
    if row2:
        return {
            "id": row2["id"],
            "name": row2["name"],
            "createdAt": row2["created_at"].isoformat() if row2["created_at"] else None,
        }
    return None


async def get_all_orgs(organization_id: int, db: AsyncSession) -> List[Dict[str, Any]]:
    res = await db.execute(
        text('SELECT id, name, created_at FROM llm_evals_organizations WHERE organization_id = :organization_id ORDER BY created_at DESC'),
        {"organization_id": organization_id}
    )
    orgs: List[Dict[str, Any]] = []
    for row in res.mappings().all():
        orgs.append(
            {
                "id": row["id"],
                "name": row["name"],
                "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            }
        )
    return orgs


async def get_projects_for_org(org_id: str, organization_id: int, db: AsyncSession) -> List[str]:
    res = await db.execute(
        text('SELECT id FROM llm_evals_projects WHERE organization_id = :organization_id ORDER BY created_at DESC'),
        {"organization_id": organization_id},
    )
    return [row[0] for row in res.fetchall()]


async def update_org(
    org_id: str,
    name: str,
    member_ids: Optional[List[int]],
    organization_id: int,
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Update an organization's name and member_ids.
    """
    result = await db.execute(
        text(
            '''
            UPDATE llm_evals_organizations
            SET name = :name
            WHERE organization_id = :organization_id AND id = :id
            RETURNING id, name, created_at
            '''
        ),
        {"id": org_id, "name": name, "organization_id": organization_id},
    )
    row = result.mappings().first()
    if row:
        return {
            "id": row["id"],
            "name": row["name"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        }
    return None


async def delete_org(org_id: str, organization_id: int, db: AsyncSession) -> bool:
    """
    Delete an organization by ID. Returns True if a row was removed.
    """
    res = await db.execute(
        text('DELETE FROM llm_evals_organizations WHERE organization_id = :organization_id AND id = :id'),
        {"organization_id": organization_id, "id": org_id},
    )
    # res.rowcount may be None on some DB backends; treat None as 0
    return bool(getattr(res, "rowcount", 0))
