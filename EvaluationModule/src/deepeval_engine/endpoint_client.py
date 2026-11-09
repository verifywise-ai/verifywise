"""
User-entered model endpoints (custom_api models, self-hosted and Ollama judges, scorers
and report summaries): one place that checks them against the outbound URL policy and
builds their clients. The clients never follow redirects, so an allowed host cannot
bounce the request on to a refused one (cloud metadata, a wildcard address).
"""

import re
from typing import Optional
from urllib.parse import urlsplit, urlunsplit

from deepeval_engine.safe_outbound_url import assert_safe_outbound_url


_HAS_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*://", re.IGNORECASE)


def checked_endpoint(raw: str) -> str:
    """
    The endpoint after the outbound policy, with http:// added when none was typed
    ("localhost:11434", the form Ollama's own docs use). Raises UnsafeOutboundUrlError.
    """
    raw = (raw or "").strip()
    if raw and not _HAS_SCHEME.match(raw):
        raw = "http://" + raw
    return assert_safe_outbound_url(raw)


def openai_base_url(raw: str, keep_entered_path: bool = False) -> str:
    """
    checked_endpoint() with the OpenAI-compatible /v1 path; a query is kept.

    Self-hosted judges and scorers have always had /v1 added unless the path ends with
    it, and saved configs rely on that. A custom_api model keeps any path the user typed
    (Gemini's .../v1beta/openai, an Azure deployment path); only a bare host gets /v1.
    """
    parts = urlsplit(checked_endpoint(raw))
    path = parts.path.rstrip("/")
    if keep_entered_path and path:
        pass
    elif not path.endswith("/v1"):
        path += "/v1"
    return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))


def openai_compatible_client(base_url: str, api_key: Optional[str] = None):
    """An OpenAI SDK client for a base URL from openai_base_url(). Self-hosted servers
    often take no key, but the client requires one."""
    from openai import DefaultHttpxClient, OpenAI

    return OpenAI(
        api_key=api_key or "not-needed",
        base_url=base_url,
        http_client=DefaultHttpxClient(follow_redirects=False),
    )


def ollama_client(host: Optional[str] = None):
    """An Ollama client for this run's host (checked), else the operator's OLLAMA_HOST or
    localhost. Never read from a variable another run may have set."""
    import ollama

    return ollama.Client(host=checked_endpoint(host) if host else None, follow_redirects=False)
