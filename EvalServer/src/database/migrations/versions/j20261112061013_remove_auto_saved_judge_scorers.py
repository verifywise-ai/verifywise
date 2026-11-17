"""remove-auto-saved-judge-scorers

Revision ID: j20261112061013
Revises: i20261111233000
Create Date: 2026-11-12

Every experiment used to save its judge as a scorer named "Judge: <model>", once
from the wizard and once from EvalServer after the run. Neither writes them any
more: the next experiment takes its judge from the organization's latest
completed run. The rows left behind look like scorers someone made, but they have
no prompt templates, so they fail on every sample when "all enabled scorers" run.

Only rows that still match what the code wrote are removed: the "Judge: " name, a
"judge_" metric key, one of the two machine-written descriptions and no message
templates. A row a user has edited into a real scorer is kept. Experiments do not
reference these rows; a rerun that lists a missing scorer id skips it.

Downgrade is a no-op: the rows were derived data and the next runs do not need them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'j20261112061013'
down_revision: Union[str, None] = 'i20261111233000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text('''
        DELETE FROM llm_evals_scorers
        WHERE name LIKE 'Judge: %'
          AND metric_key LIKE 'judge\\_%'
          AND type = 'llm'
          AND (
              description LIKE 'Auto-saved judge LLM: %'
              OR description LIKE 'Standard LLM judge using %'
          )
          AND (
              CASE
                  WHEN jsonb_typeof(config->'messages') = 'array'
                      THEN jsonb_array_length(config->'messages') = 0
                  ELSE config->'messages' IS NULL
              END
          );
    '''))


def downgrade() -> None:
    pass
