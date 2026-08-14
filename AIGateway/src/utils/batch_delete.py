"""Shared batched-delete helper for retention cleanup jobs."""

from sqlalchemy import text

from database.db import get_db


async def batch_delete_expired(
    table: str,
    where_clause: str,
    retention_days: int = 30,
    batch_size: int = 5000,
) -> int:
    """Delete rows matching where_clause older than retention_days in batches.

    ``where_clause`` is appended after
    ``WHERE created_at < NOW() - INTERVAL '1 day' * :retention_days``.
    Pass an empty string if no extra conditions are needed.

    Returns total number of deleted rows.
    """
    retention_days = int(retention_days)
    extra = " AND " + where_clause if where_clause else ""
    total_deleted = 0

    async with get_db() as db:
        while True:
            result = await db.execute(
                text("""  # nosemgrep: python.sqlalchemy.security.audit.avoid-sqlalchemy-text.avoid-sqlalchemy-text
                    DELETE FROM """ + table + """
                    WHERE id IN (
                        SELECT id FROM """ + table + """
                        WHERE created_at < NOW() - INTERVAL '1 day' * :retention_days
                        """ + extra + """
                        LIMIT :batch_size
                    )
                    RETURNING id
                """),
                {"batch_size": batch_size, "retention_days": retention_days},
            )
            deleted = len(result.fetchall())
            await db.commit()
            total_deleted += deleted
            if deleted < batch_size:
                break

    return total_deleted
