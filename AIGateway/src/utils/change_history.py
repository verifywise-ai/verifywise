"""
Change history — direct INSERT into ai_gateway change history tables.
"""

import logging
from typing import Optional

from sqlalchemy import text

from database.db import get_db

logger = logging.getLogger("uvicorn")


async def record_endpoint_change(
    organization_id: int,
    endpoint_id: int,
    changed_by: int,
    action: str,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
) -> None:
    """Insert a row into ai_gateway_endpoint_change_history."""
    try:
        async with get_db() as db:
            await db.execute(
                text("""
                    INSERT INTO ai_gateway_endpoint_change_history
                        (organization_id, endpoint_id, changed_by, action,
                         field_name, old_value, new_value)
                    VALUES
                        (:org_id, :endpoint_id, :changed_by, :action,
                         :field_name, :old_value, :new_value)
                """),
                {
                    "org_id": organization_id,
                    "endpoint_id": endpoint_id,
                    "changed_by": changed_by,
                    "action": action,
                    "field_name": field_name,
                    "old_value": old_value,
                    "new_value": new_value,
                },
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to record endpoint change: {e}")


async def record_guardrail_change(
    organization_id: int,
    guardrail_id: int,
    changed_by: int,
    action: str,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
) -> None:
    """Insert a row into ai_gateway_guardrail_change_history."""
    try:
        async with get_db() as db:
            await db.execute(
                text("""
                    INSERT INTO ai_gateway_guardrail_change_history
                        (organization_id, guardrail_id, changed_by, action,
                         field_name, old_value, new_value)
                    VALUES
                        (:org_id, :guardrail_id, :changed_by, :action,
                         :field_name, :old_value, :new_value)
                """),
                {
                    "org_id": organization_id,
                    "guardrail_id": guardrail_id,
                    "changed_by": changed_by,
                    "action": action,
                    "field_name": field_name,
                    "old_value": old_value,
                    "new_value": new_value,
                },
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to record guardrail change: {e}")
