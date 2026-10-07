"""
Unit tests for ``build_no_responses_message``: the failure reason stored on an
experiment when no prompt produced a response. It must carry the cause (how
many prompts failed and the first provider error), not just a generic string.
"""

from __future__ import annotations

from utils.error_detection import build_no_responses_message, redact_secrets


def test_includes_failed_count_and_first_error() -> None:
    message = build_no_responses_message(
        30, ["Model claude-sonnet-5 not available", "second error"]
    )
    assert message == (
        "No responses generated: 2/30 prompts failed. "
        "First error: Model claude-sonnet-5 not available"
    )


def test_truncates_long_first_error() -> None:
    long_error = "x" * 1000
    message = build_no_responses_message(5, [long_error] * 5)
    prefix = "No responses generated: 5/5 prompts failed. First error: "
    assert message.startswith(prefix)
    first_error = message[len(prefix):]
    assert first_error == "x" * 300 + "…"


def test_collapses_whitespace_in_first_error() -> None:
    message = build_no_responses_message(1, ["line one\n\n   line two  "])
    assert message.endswith("First error: line one line two")


def test_falls_back_to_generic_message_without_errors() -> None:
    assert build_no_responses_message(0, []) == "No responses generated"
    assert build_no_responses_message(3, []) == "No responses generated"


def test_skips_blank_errors_when_choosing_first_error() -> None:
    message = build_no_responses_message(2, ["   ", "Real cause"])
    assert message.endswith("First error: Real cause")


def test_redacts_credentials_in_the_first_error() -> None:
    # Provider and HTTP errors can echo the request URL or headers.
    message = build_no_responses_message(
        1,
        [
            "403 for url https://x.googleapis.com/v1/m:generateContent?key=AIzaSyABCDEF123456 "
            "with Authorization: Bearer sk-proj-abcdef1234567890 api_key=secret-value-99"
        ],
    )
    for secret in ["AIzaSyABCDEF123456", "sk-proj-abcdef1234567890", "secret-value-99"]:
        assert secret not in message
    assert "[redacted]" in message
    assert message.startswith("No responses generated: 1/1 prompts failed. First error: 403 for url")


def test_leaves_ordinary_error_text_alone() -> None:
    # "token" and "key" in plain error text are not credentials.
    for text in [
        "Unexpected token: < in JSON at position 0",
        "Missing required key: model",
        "Missing required key: messages_template",
        "Basic authentication is not supported for this endpoint",
        "Bearer authentication failed",
        "Invalid token count",
    ]:
        assert redact_secrets(text) == text


def test_redacts_other_credential_formats() -> None:
    text = (
        'body {"api_key": "abc123secretvalue"} hf_abcdefghijklmnop gsk_abcdefghijklmnop '
        "Authorization: Basic dXNlcjpwYXNzd29yZA=="
    )
    redacted = redact_secrets(text)
    for secret in [
        "abc123secretvalue",
        "hf_abcdefghijklmnop",
        "gsk_abcdefghijklmnop",
        "dXNlcjpwYXNzd29yZA==",
    ]:
        assert secret not in redacted


def test_redacts_aws_access_keys() -> None:
    assert "AKIAIOSFODNN7EXAMPLE" not in redact_secrets("AWS AKIAIOSFODNN7EXAMPLE denied")


def test_always_redacts_values_after_password_and_secret_labels() -> None:
    # A passphrase can be a plain lowercase word; these labels always mean a secret.
    for text in [
        "password=correcthorsebatterystaple",
        'secret: "letmeinplease"',
        "api_key=abcdefghijklmnopqrst",
    ]:
        assert "[redacted]" in redact_secrets(text), text



def test_redacts_a_whole_password_with_symbols() -> None:
    text = redact_secrets('auth failed: password=a!b@c#d$ for "password": "p@ss w0rd"')
    assert "a!b@c#d$" not in text
    assert "p@ss" not in text
    assert text.count("[redacted]") == 2


def test_redacts_credentials_in_a_url() -> None:
    text = redact_secrets("cannot reach postgres://evals:Hunter2!x@db.internal:5432/evals")
    assert "Hunter2!x" not in text
    assert "postgres://evals:[redacted]@db.internal:5432/evals" in text


def test_redacts_env_style_key_assignments() -> None:
    # The label follows an underscore, not a word boundary.
    for text in ("AZURE_OPENAI_API_KEY=3f2a9c1d7e8b4a6f", "x_api_key: abcdef", "OPENAI_TOKEN=abcDEF1234567890"):
        assert redact_secrets(text).endswith("[redacted]"), text


def test_redacts_a_url_password_containing_at_and_slash() -> None:
    text = redact_secrets("proxy https://bob:p@ss/w0rd@proxy.local failed")
    assert text == "proxy https://bob:[redacted]@proxy.local failed"


def test_leaves_a_url_with_a_port_and_no_userinfo_alone() -> None:
    assert redact_secrets("cannot reach http://host:8080/a now") == "cannot reach http://host:8080/a now"


def test_redacts_a_url_password_without_a_username() -> None:
    # Redis and Valkey URLs carry only a password.
    assert redact_secrets("redis://:hunter2secret@cache:6379 refused") == "redis://:[redacted]@cache:6379 refused"


def test_redacts_a_password_that_starts_like_a_port() -> None:
    # "user:1234/abc@host" cannot be told apart from "host:8080/a@b", so
    # both are redacted rather than risk keeping a password.
    assert "1234/abc" not in redact_secrets("cannot reach redis://user:1234/abc@cache now")
    assert redact_secrets("GET http://host:8080/a@b failed") == "GET http://host:[redacted]@b failed"
    assert "2024#Secret" not in redact_secrets("postgres://admin:2024#Secret@db:5432/x failed")


def test_redacts_userinfo_whatever_the_username_looks_like() -> None:
    # A bracket does not mark an IPv6 host safely: "[u:pw@h" must not leak.
    assert "secretpw" not in redact_secrets("GET https://[u:secretpw@h failed")
    assert redact_secrets("GET http://u:pw@[::1]:8080/ failed") == "GET http://u:[redacted]@[::1]:8080/ failed"
