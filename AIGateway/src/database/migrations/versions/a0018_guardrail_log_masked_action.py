"""store masked guardrail detections as "masked"

The proxy logged a detection's raw rule action, so a masked detection was saved
in ai_gateway_guardrail_logs.action_taken as "mask". The guardrail stats count
action_taken = 'masked', so the dashboard never counted a masked detection.
The proxy now saves "masked" (services/proxy_service.py _ACTION_TAKEN). This
migration rewrites the rows saved before that.

Rows saved as "blocked" are correct and left alone: every detection in a blocked
message is stored as "blocked", since that message was never masked.

One UPDATE, unbatched: it touches only the "mask" rows, new inserts do not wait
on it, and retention keeps the table bounded.

There is no downgrade: "mask" was never a value the stats or the Logs page read.

Revision ID: a0018
Revises: a0017
Create Date: 2026-10-26
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0018"
down_revision: Union[str, None] = "a0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute(
        """
        UPDATE ai_gateway_guardrail_logs
        SET action_taken = 'masked'
        WHERE action_taken = 'mask'
        """
    )


def downgrade() -> None:
    pass
