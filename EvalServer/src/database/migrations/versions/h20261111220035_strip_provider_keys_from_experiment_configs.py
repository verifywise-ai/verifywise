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
    {
        "apikey",
        "api_key",
        "apikeys",
        "api_keys",
        "scorerapikey",
        "scorer_api_key",
        "scorerapikeys",
        "scorer_api_keys",
    }
)
_USER_CONTENT_KEYS = frozenset({"dataset"})


def _strip(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: (v if isinstance(k, str) and k in _USER_CONTENT_KEYS else _strip(v))
            for k, v in value.items()
            if not (isinstance(k, str) and k.lower() in _SECRET_KEYS)
        }
    if isinstance(value, list):
        return [_strip(v) for v in value]
    return value


def upgrade() -> None:
    bind = op.get_bind()
    # Ids first, then one config at a time: configs can hold whole inline datasets.
    candidates = bind.execute(
        sa.text(
            "SELECT id, organization_id FROM verifywise.llm_evals_experiments "
            "WHERE config::text ~* '\"(api_?keys?|scorer_?api_?keys?)\"\\s*:'"
        )
    ).mappings().all()
    for candidate in candidates:
        row = bind.execute(
            sa.text(
                "SELECT id, organization_id, config FROM verifywise.llm_evals_experiments "
                "WHERE id = :id AND organization_id = :organization_id"
            ),
            {"id": candidate["id"], "organization_id": candidate["organization_id"]},
        ).mappings().first()
        if row is None:
            continue
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
