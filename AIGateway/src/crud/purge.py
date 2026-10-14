"""Shared pieces of the batched log purges (guardrail and spend logs)."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Optional

logger = logging.getLogger(__name__)

# Longest retention period the settings accept: 10 years.
MAX_RETENTION_DAYS = 3650


def retention_cutoff(retention_days: int) -> Optional[datetime]:
    """The moment before which logs are older than `retention_days`.

    None when the period reaches back past the earliest representable date
    (only possible for a value saved before the settings were capped): no log
    can be that old, so there is nothing to delete.
    """
    try:
        return datetime.now(tz=timezone.utc) - timedelta(days=retention_days)
    except OverflowError:
        return None


class PartialPurgeError(Exception):
    """A purge failed after committing some batches.

    `deleted` is the number of rows already deleted (and committed) before the
    failure. Raise it `from` the original error so that error is chained.
    """

    def __init__(self, deleted: int, cause: BaseException):
        super().__init__(str(cause))
        self.deleted = deleted


async def older_rows_remain(
    check: Callable[[], Awaitable[object]], label: str, org_id: int
) -> bool:
    """Run a purge's read-only "are rows older than the cutoff left?" check,
    after its last allowed batch was full.

    The deletes have already succeeded, so a failing check must not mark the
    purge failed: it is logged and reported as capped (rows may remain), the
    conservative answer that makes the caller run the purge again.
    """
    try:
        return bool(await check())
    except Exception as error:
        logger.warning(
            "Checking for remaining %s after a capped purge failed for org %s: %s",
            label,
            org_id,
            error,
        )
        return True
