"""
SSRF policy for user-entered model endpoints (self-hosted judges and scorers, custom_api
models). The policy lives in EvaluationModule (deepeval_engine.safe_outbound_url), a copy
of AIGateway/src/utils/safe_outbound_url.py; this module re-exports it.
"""

import utils.deepeval_engine_path  # noqa: F401  (puts deepeval_engine on sys.path)
from deepeval_engine.safe_outbound_url import (  # noqa: E402,F401
    UnsafeOutboundUrlError,
    assert_safe_outbound_url,
)
# Checking and clients for those endpoints (no redirects, so a checked host can't bounce)
from deepeval_engine.endpoint_client import (  # noqa: E402,F401
    checked_endpoint,
    ollama_client,
    openai_base_url,
    openai_compatible_client,
)
