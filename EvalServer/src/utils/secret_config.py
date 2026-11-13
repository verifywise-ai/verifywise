"""
Keep provider keys out of stored and returned experiment configs.

The backend (Servers/routes/deepEvalRoutes.route.ts, injectApiKeys) decrypts the
organization's saved provider keys and adds them to an experiment's config so
the evaluation can call the models: config.model.apiKey, config.judgeLlm.apiKey,
config.scorerApiKeys and, for some callers, apiKeys. The running evaluation
needs them in memory. They must never be written to llm_evals_experiments or
sent back to the browser, where any user who can open LLM Evals could read them.
"""

from typing import Any

# Compared case-insensitively, at any depth. scorerApiKey is the older single-key form.
SECRET_CONFIG_KEYS = frozenset(
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

# Copied as-is: the backend never puts keys here, and a dataset may legitimately
# contain fields with these names (for example a prompt-injection test case).
_USER_CONTENT_KEYS = frozenset({"dataset"})


def strip_secrets(value: Any) -> Any:
    """A copy of value with every provider-key field removed, at any depth outside user content."""
    if isinstance(value, dict):
        return {
            k: (v if isinstance(k, str) and k in _USER_CONTENT_KEYS else strip_secrets(v))
            for k, v in value.items()
            if not (isinstance(k, str) and k.lower() in SECRET_CONFIG_KEYS)
        }
    if isinstance(value, list):
        return [strip_secrets(v) for v in value]
    return value
