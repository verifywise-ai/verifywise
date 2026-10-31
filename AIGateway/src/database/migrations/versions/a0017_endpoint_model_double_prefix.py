"""repair endpoint models saved with a doubled provider prefix

The endpoint form put "<provider>/" in front of every model it listed, but
LiteLLM already lists most Gemini, xAI, Mistral and OpenRouter models with that
prefix. Those endpoints were saved as "gemini/gemini/gemini-2.5-flash", which
the provider rejects, so every request through them failed.

The form and the endpoint API now keep a single prefix. This migration repairs
data saved before that. A model that starts with its provider prefix more than
once is reduced to one ("gemini/gemini/x" becomes "gemini/x"):

- ai_gateway_endpoints.model. Each repaired endpoint gets a change-history row
  (field "model", old and new value, no user: the migration made the change).
- ai_gateway_virtual_keys.allowed_models and blocked_models. An admin may have
  copied the doubled name from the endpoints list; virtual key access rules
  compare these entries with the endpoint's model, so they are repaired the
  same way or a block would stop matching. Order and NULLs are kept.
  Wildcards fail closed: an allowed entry with a "*" is left alone (rewriting
  "gemini/gemini/*" to "gemini/*" would let a key reach endpoints it was never
  allowed). Every blocked entry is kept and followed by its repaired form
  ("gemini/gemini/x" adds "gemini/x", "gemini/gemini/*" adds "gemini/*",
  "openrouter/openrouter/a*" adds "openrouter/a*"), so the block still covers
  the repaired endpoints, any endpoint that keeps a doubled name, and
  OpenRouter's own models. A wider block can only refuse more. The API
  applies the same rules on save (normalize_acl_models).

Only the providers an API key can be stored for are repaired, the same set
normalize_endpoint_model uses. OpenRouter model ids are "<vendor>/<model>" and
"openrouter" is itself a vendor, so LiteLLM has real names such as
"openrouter/openrouter/auto". An OpenRouter name is never cut below three
parts: "openrouter/openrouter/auto" is kept and
"openrouter/openrouter/openrouter/auto" becomes "openrouter/openrouter/auto".
No other provider in this set has a real name that repeats the prefix (checked
against LiteLLM's model list).

There is no downgrade: the doubled names never worked, so there is nothing to
restore.

Revision ID: a0017
Revises: a0016
Create Date: 2026-10-19
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0017"
down_revision: Union[str, None] = "a0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.execute("SET search_path TO verifywise")

    # The provider list is VALID_PROVIDERS in routers/api_keys.py when this
    # migration was written, frozen here on purpose. "rest" is the model with
    # every leading provider prefix removed.
    op.execute(
        """
        WITH stripped AS (
            SELECT id, organization_id, provider, model AS old_model,
                   regexp_replace(model, '^(' || provider || '/)+', '') AS rest
            FROM ai_gateway_endpoints
            WHERE provider IN ('openai', 'anthropic', 'gemini', 'mistral', 'xai', 'openrouter', 'together_ai', 'cohere')
              AND left(model, 2 * length(provider) + 2) = provider || '/' || provider || '/'
        ),
        repaired AS (
            SELECT id, organization_id, old_model,
                   CASE WHEN provider = 'openrouter' AND strpos(rest, '/') = 0
                        THEN 'openrouter/openrouter/' || rest
                        ELSE provider || '/' || rest
                   END AS new_model
            FROM stripped
        ),
        updated AS (
            UPDATE ai_gateway_endpoints e
            SET model = r.new_model
            FROM repaired r
            WHERE e.id = r.id
              AND r.new_model <> r.old_model
            RETURNING e.id
        )
        INSERT INTO ai_gateway_endpoint_change_history
            (organization_id, endpoint_id, action, field_name, old_value, new_value, changed_by_user_id)
        SELECT r.organization_id, r.id, 'updated', 'model', r.old_model, r.new_model, NULL
        FROM repaired r
        JOIN updated u ON u.id = r.id
        """
    )

    # Same repair for virtual key access lists, keeping entry order. "p" is the
    # doubled provider, or NULL when the entry does not start with one.
    op.execute(
        r"""
        UPDATE ai_gateway_virtual_keys
        SET allowed_models = ARRAY(
            SELECT CASE
                       WHEN a.p IS NULL OR strpos(t.m, '*') > 0 THEN t.m
                       WHEN a.p = 'openrouter' AND strpos(b.rest, '/') = 0 THEN 'openrouter/openrouter/' || b.rest
                       ELSE a.p || '/' || b.rest
                   END
            FROM unnest(allowed_models) WITH ORDINALITY AS t(m, n)
            CROSS JOIN LATERAL (
                SELECT substring(t.m from '^(openai|anthropic|gemini|mistral|xai|openrouter|together_ai|cohere)/\1/') AS p
            ) a
            CROSS JOIN LATERAL (
                SELECT regexp_replace(t.m, '^(' || a.p || '/)+', '') AS rest
            ) b
            ORDER BY t.n
        )
        WHERE allowed_models IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM unnest(allowed_models) AS m
              WHERE m ~ '^(openai|anthropic|gemini|mistral|xai|openrouter|together_ai|cohere)/(\1/)+'
          )
        """
    )
    op.execute(
        r"""
        UPDATE ai_gateway_virtual_keys
        SET blocked_models = ARRAY(
            SELECT v.m
            FROM unnest(blocked_models) WITH ORDINALITY AS t(m, n)
            CROSS JOIN LATERAL (
                SELECT substring(t.m from '^(openai|anthropic|gemini|mistral|xai|openrouter|together_ai|cohere)/\1/') AS p
            ) a
            CROSS JOIN LATERAL (
                SELECT regexp_replace(t.m, '^(' || a.p || '/)+', '') AS rest
            ) b
            -- Blocks fail closed: k = 1 keeps the entry as it is, k = 2 adds
            -- its repaired form (a wildcard fully collapsed)
            CROSS JOIN LATERAL (VALUES
                (1, t.m),
                (2, CASE
                        WHEN a.p IS NULL THEN NULL
                        WHEN strpos(t.m, '*') > 0 THEN a.p || '/' || b.rest
                        WHEN a.p = 'openrouter' AND strpos(b.rest, '/') = 0 THEN 'openrouter/openrouter/' || b.rest
                        ELSE a.p || '/' || b.rest
                    END)
            ) AS v(k, m)
            WHERE v.k = 1 OR (v.m IS NOT NULL AND v.m <> t.m)
            ORDER BY t.n, v.k
        )
        WHERE blocked_models IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM unnest(blocked_models) AS m
              WHERE m ~ '^(openai|anthropic|gemini|mistral|xai|openrouter|together_ai|cohere)/(\1/)+'
          )
        """
    )


def downgrade() -> None:
    pass
