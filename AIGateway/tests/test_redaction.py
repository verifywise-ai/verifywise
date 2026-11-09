"""Gateway redaction, the copy of EvalServer's redact_secrets. Same cases, so the two stay in step."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import pytest  # noqa: E402

from utils.redaction import redact_secrets  # noqa: E402


@pytest.mark.parametrize(
    "text, secret",
    [
        ("https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyA1234567890abcdef", "AIzaSyA1234567890abcdef"),
        ("Incorrect API key provided: sk-proj-abcdefghijkl", "sk-proj-abcdefghijkl"),
        ("Authorization: Bearer abcDEF1234567890", "abcDEF1234567890"),
        ("proxy https://user:s3cret@proxy.internal/v1 failed", "s3cret"),
        ("OPENAI_API_KEY=whatever-value", "whatever-value"),
        ("hf token hf_abcdefghij1234 rejected", "hf_abcdefghij1234"),
        ("xai key xai-abcdefgh12 rejected", "xai-abcdefgh12"),
        ("https://host/v1/x?key=lowercaseonlysecret&alt=sse", "lowercaseonlysecret"),
        ("https://host/v1/x?alt=sse&key=abc123xyz", "abc123xyz"),
    ],
)
def test_secrets_are_redacted(text: str, secret: str) -> None:
    assert secret not in redact_secrets(text)


@pytest.mark.parametrize(
    "text",
    ["Unexpected token: <", "Missing required key: messages_template", "Basic authentication is not supported"],
)
def test_ordinary_error_text_is_kept(text: str) -> None:
    assert redact_secrets(text) == text


def test_known_secret_is_replaced_only_when_long_enough() -> None:
    assert "MyOwnKeyValue" not in redact_secrets("got MyOwnKeyValue back", "MyOwnKeyValue")
    assert redact_secrets("not available for testing", "test") == "not available for testing"
