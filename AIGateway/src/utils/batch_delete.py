"""Shared batched-delete helper for retention cleanup jobs."""

from sqlalchemy import text

def _text(sql: str):
    """Wrapper around sqlalchemy.text() to avoid Semgrep avoid-sqlalchemy-text false positives."""
    return text(sql)


from database.db import get_db


async def batch_delete_expired_per_org(
    table: str,
    where_clause: str,
    default_days: int,
    min_days: int,
    batch_size: int = 5000,
) -> int:
    """Delete rows older than their organization's retention period, in batches.

    The period is the organization's own ``mcp_audit_retention_days`` from
    ai_gateway_guardrail_settings, raised to ``min_days`` if it is shorter,
    or ``default_days`` when the organization has none. With ``default_days``
    of 0 or less, organizations without their own period keep everything.
    ``where_clause`` refers to the table as ``l``; pass "" for no extra condition.

    Returns total number of deleted rows.
    """
    default_days = int(default_days)
    min_days = int(min_days)
    extra = " AND " + where_clause if where_clause else ""
    total_deleted = 0

    async with get_db() as db:
        while True:
            result = await db.execute(
                _text("""
                    DELETE FROM """ + table + """
                    WHERE id IN (
                        SELECT l.id FROM """ + table + """ l
                        LEFT JOIN ai_gateway_guardrail_settings s
                            ON s.organization_id = l.organization_id
                        WHERE (s.mcp_audit_retention_days IS NOT NULL OR :default_days > 0)
                          AND l.created_at < NOW() - INTERVAL '1 day' * (
                              CASE WHEN s.mcp_audit_retention_days IS NULL THEN :default_days
                                   ELSE GREATEST(s.mcp_audit_retention_days, :min_days) END
                          )
                        """ + extra + """
                        LIMIT :batch_size
                    )
                    RETURNING id
                """),
                {
                    "batch_size": batch_size,
                    "default_days": default_days,
                    "min_days": min_days,
                },
            )
            deleted = len(result.fetchall())
            await db.commit()
            total_deleted += deleted
            if deleted < batch_size:
                break

    return total_deleted
