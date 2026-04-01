"""
CRUD operations for DeepEval Projects.

Shared-schema multi-tenancy: All data is in the public schema with organization_id column.
"""

import json
from typing import List, Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime


async def create_project(
    project_id: str,
    name: str,
    description: str,
    organization_id: int,
    created_by: str,
    db: AsyncSession,
    use_case: str = "chatbot"
) -> Optional[Dict[str, Any]]:
    """
    Create a new DeepEval project.

    Args:
        project_id: Unique project identifier
        name: Project name
        description: Project description
        organization_id: Organization ID for tenant isolation
        created_by: Creator identifier
        db: Database session
        use_case: Use case type (chatbot, rag, agent)

    Returns:
        Created project as dictionary, or None if failed
    """

    result = await db.execute(
        text('''
            INSERT INTO llm_evals_projects
            (id, name, description, organization_id, created_by, use_case)
            VALUES (:id, :name, :description, :organization_id, :created_by, :use_case)
            RETURNING id, name, description, organization_id, created_at, updated_at, created_by, use_case
        '''),
        {
            "id": project_id,
            "name": name,
            "description": description,
            "organization_id": organization_id,
            "created_by": created_by,
            "use_case": use_case
        }
    )

    row = result.mappings().first()
    if row:
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "orgId": str(row["organization_id"]) if row["organization_id"] else None,
            "useCase": row["use_case"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
            "createdBy": row["created_by"]
        }
    return None


async def get_all_projects(organization_id: int, db: AsyncSession) -> List[Dict[str, Any]]:
    """
    Get all projects for an organization.

    Args:
        organization_id: Organization ID for tenant isolation
        db: Database session

    Returns:
        List of projects
    """

    result = await db.execute(
        text('''
            SELECT id, name, description, organization_id, created_at, updated_at, created_by, use_case
            FROM llm_evals_projects
            WHERE organization_id = :organization_id
            ORDER BY created_at DESC
        '''),
        {"organization_id": organization_id}
    )

    rows = result.mappings().all()
    projects = []
    for row in rows:
        projects.append({
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "orgId": str(row["organization_id"]) if row["organization_id"] else None,
            "useCase": row["use_case"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
            "createdBy": row["created_by"]
        })
    return projects


async def get_project_by_id(
    project_id: str,
    organization_id: int,
    db: AsyncSession
) -> Optional[Dict[str, Any]]:
    """
    Get a project by ID.

    Args:
        project_id: Project ID
        organization_id: Organization ID for tenant isolation
        db: Database session

    Returns:
        Project as dictionary, or None if not found
    """

    result = await db.execute(
        text('''
            SELECT id, name, description, organization_id, created_at, updated_at, created_by, use_case
            FROM llm_evals_projects
            WHERE organization_id = :organization_id AND id = :id
        '''),
        {"organization_id": organization_id, "id": project_id}
    )

    row = result.mappings().first()
    if row:
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "orgId": str(row["organization_id"]) if row["organization_id"] else None,
            "useCase": row["use_case"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
            "createdBy": row["created_by"]
        }
    return None


async def update_project(
    project_id: str,
    name: Optional[str],
    description: Optional[str],
    organization_id: int,
    db: AsyncSession,
    use_case: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Update a project.

    Args:
        project_id: Project ID
        name: New name (optional)
        description: New description (optional)
        organization_id: Organization ID for tenant isolation
        db: Database session
        use_case: New use case (optional)

    Returns:
        Updated project as dictionary, or None if not found
    """

    # Build update query dynamically based on provided fields
    updates = []
    params = {"id": project_id, "organization_id": organization_id}

    if name is not None:
        updates.append("name = :name")
        params["name"] = name

    if description is not None:
        updates.append("description = :description")
        params["description"] = description

    if use_case is not None:
        updates.append("use_case = :use_case")
        params["use_case"] = use_case

    if not updates:
        # Nothing to update, just return existing project
        return await get_project_by_id(project_id, organization_id, db)

    updates.append("updated_at = CURRENT_TIMESTAMP")

    result = await db.execute(
        text(f'''
            UPDATE llm_evals_projects
            SET {", ".join(updates)}
            WHERE organization_id = :organization_id AND id = :id
            RETURNING id, name, description, organization_id, created_at, updated_at, created_by, use_case
        '''),
        params
    )

    row = result.mappings().first()
    if row:
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "orgId": str(row["organization_id"]) if row["organization_id"] else None,
            "useCase": row["use_case"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
            "createdBy": row["created_by"]
        }
    return None


async def delete_project(
    project_id: str,
    organization_id: int,
    db: AsyncSession
) -> bool:
    """
    Delete a project.

    Args:
        project_id: Project ID
        organization_id: Organization ID for tenant isolation
        db: Database session

    Returns:
        True if deleted, False if not found
    """

    result = await db.execute(
        text('''
            DELETE FROM llm_evals_projects
            WHERE organization_id = :organization_id AND id = :id
            RETURNING id
        '''),
        {"organization_id": organization_id, "id": project_id}
    )

    row = result.fetchone()
    return row is not None
