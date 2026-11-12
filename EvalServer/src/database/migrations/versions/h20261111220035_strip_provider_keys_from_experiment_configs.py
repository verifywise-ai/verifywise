"""strip-provider-keys-from-experiment-configs

Revision ID: h20261111220035
Revises: g20260506000000
Create Date: 2026-11-11

Experiment configs used to be stored with the provider keys the backend adds for
the run (config.model.apiKey, config.judgeLlm.apiKey, config.scorerApiKeys,
apiKeys), unencrypted, and returned to the browser. New experiments are stored
without them (utils/secret_config.py); this removes them from existing rows.

The stripping logic is copied here on purpose so this migration keeps doing the
same thing if the application helper changes later.
"""
import json
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h20261111220035'
down_revision: Union[str, None] = 'g20260506000000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SECRET_KEYS = frozenset(
    {"apikey", "api_key", "apikeys", "api_keys", "scorerapikeys", "scorer_api_keys"}
)


def _strip(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: _strip(v)
            for k, v in value.items()
            if not (isinstance(k, str) and k.lower() in _SECRET_KEYS)
        }
    if isinstance(value, list):
        return [_strip(v) for v in value]
    return value


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, organization_id, config FROM verifywise.llm_evals_experiments "
            "WHERE config::text ~* '\"(api_?keys?|scorer_?api_?keys)\"\\s*:'"
        )
    ).mappings().all()
    for row in rows:
        config = row["config"]
        if isinstance(config, str):
            config = json.loads(config)
        cleaned = _strip(config)
        if cleaned != config:
            bind.execute(
                sa.text(
                    "UPDATE verifywise.llm_evals_experiments SET config = CAST(:config AS jsonb) "
                    "WHERE id = :id AND organization_id = :organization_id"
                ),
                {
                    "config": json.dumps(cleaned),
                    "id": row["id"],
                    "organization_id": row["organization_id"],
                },
            )


def downgrade() -> None:
    # Removed keys cannot be restored, and must not be.
    pass
