"""
CRUD for per-organization LLM Evals settings (llm_evals_org_settings).

Shared-schema multi-tenancy: every query filters by organization_id.
"""

from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_stored_arena_enabled(organization_id: int, db: AsyncSession) -> Optional[bool]:
    """The stored Arena value, or None when no Admin has saved one."""
    result = await db.execute(
        text(
            "SELECT arena_enabled FROM llm_evals_org_settings "
            "WHERE organization_id = :organization_id"
        ),
        {"organization_id": organization_id},
    )
    row = result.first()
    if row is None or row[0] is None:
        return None
    return bool(row[0])


async def org_has_arena_comparisons(organization_id: int, db: AsyncSession) -> bool:
    """Whether the organization has any Arena comparison rows."""
    result = await db.execute(
        text(
            "SELECT EXISTS (SELECT 1 FROM llm_evals_arena_comparisons "
            "WHERE organization_id = :organization_id)"
        ),
        {"organization_id": organization_id},
    )
    return bool(result.scalar())


async def upsert_arena_enabled(
    organization_id: int,
    enabled: bool,
    updated_by: Optional[str],
    db: AsyncSession,
) -> None:
    """Store the Arena value for the organization, creating its row if needed."""
    await db.execute(
        text(
            """
            INSERT INTO llm_evals_org_settings (organization_id, arena_enabled, updated_by)
            VALUES (:organization_id, :enabled, :updated_by)
            ON CONFLICT (organization_id) DO UPDATE
            SET arena_enabled = EXCLUDED.arena_enabled,
                updated_by = EXCLUDED.updated_by,
                updated_at = CURRENT_TIMESTAMP
            """
        ),
        {"organization_id": organization_id, "enabled": enabled, "updated_by": updated_by},
    )
    await db.commit()
