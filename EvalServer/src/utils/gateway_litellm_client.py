"""
Call AI Gateway internal LiteLLM completion API (same path Express uses).

The client lives in EvaluationModule (deepeval_engine.gateway_litellm_client), which
EvalServer already imports; this module re-exports it so both use one implementation.
"""

import utils.deepeval_engine_path  # noqa: F401  (puts deepeval_engine on sys.path)

from deepeval_engine.gateway_litellm_client import (  # noqa: E402,F401
    BILLING_WORDS,
    DEFAULT_GATEWAY_URL,
    GatewayCompletion,
    GatewayProviderError,
    _extract_assistant_text,
    gateway_chat_completion_async,
    gateway_chat_completion_sync,
    gateway_completion_async,
    gateway_completion_sync,
    gateway_mode_enabled,
    rate_limit_recovers,
    retry_hint_seconds,
    to_litellm_model,
    top_p_to_send,
)
