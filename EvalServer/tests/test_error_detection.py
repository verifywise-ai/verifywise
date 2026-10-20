"""Fatal error detection: typed gateway errors first, then the text patterns."""

from __future__ import annotations

import pytest

from utils.error_detection import FatalErrorTracker, detect_fatal_error
from utils.gateway_litellm_client import GatewayProviderError


@pytest.mark.parametrize(
    "error_type, status, code",
    [
        ("AuthenticationError", 401, "invalid_api_key"),
        ("PermissionDeniedError", 403, "permission_denied"),
        ("NotFoundError", 404, "model_not_found"),
        ("BudgetExceededError", 429, "budget_exceeded"),
    ],
)
def test_typed_gateway_error_is_fatal(error_type: str, status: int, code: str) -> None:
    fatal, error_code, message = detect_fatal_error(str(GatewayProviderError(error_type, status, "x")))
    assert fatal is True
    assert error_code == code
    assert message


def test_typed_error_wins_over_a_transient_word_in_the_message() -> None:
    err = GatewayProviderError("AuthenticationError", 401, "Key rejected, please try again later")
    assert detect_fatal_error(str(err))[:2] == (True, "invalid_api_key")


def test_typed_error_inside_a_wrapper_message() -> None:
    wrapped = f"Error calling judge model (google): {GatewayProviderError('NotFoundError', 404, 'gone')}"
    assert detect_fatal_error(wrapped)[:2] == (True, "model_not_found")


def test_unlisted_type_falls_through_to_the_patterns() -> None:
    quota = GatewayProviderError("RateLimitError", 429, "You exceeded your current quota: insufficient_quota")
    assert detect_fatal_error(str(quota))[:2] == (True, "insufficient_credits")
    plain = GatewayProviderError("RateLimitError", 429, "Requests are coming in too fast")
    assert detect_fatal_error(str(plain))[0] is False


def test_gemini_per_minute_quota_is_transient_but_daily_quota_is_fatal() -> None:
    per_minute = GatewayProviderError(
        "RateLimitError", 429, "Quota exceeded for metric requests per minute. Please retry in 30s"
    )
    assert detect_fatal_error(str(per_minute))[0] is False
    daily = GatewayProviderError(
        "RateLimitError", 429, "Quota exceeded for metric requests per day. Please retry in 30s"
    )
    assert detect_fatal_error(str(daily))[:2] == (True, "quota_exceeded")


@pytest.mark.parametrize(
    "message, code",
    [
        # "try again" is a transient pattern; a typed daily limit must still stop the run
        ("Rate limit reached on requests per day (RPD): Limit 200. Please try again in 8s", "quota_exceeded"),
        ("Quota exceeded for metric x, limit: 0. Please retry in 30s", "quota_exceeded"),
        ("You exceeded your current quota: insufficient_quota", "insufficient_credits"),
    ],
)
def test_typed_non_recovering_rate_limits_are_fatal(message: str, code: str) -> None:
    assert detect_fatal_error(str(GatewayProviderError("RateLimitError", 429, message)))[:2] == (True, code)


@pytest.mark.parametrize(
    "message, fatal",
    [
        ("Quota exceeded for metric requests per minute. Please retry in 30s", False),
        ("Quota exceeded per day, please try again", True),
        ("Rate limit reached on requests per day (RPD). Please try again in 8s", True),
        ("429 RESOURCE_EXHAUSTED: quota for requests per day. Please retry in 30s", True),
        # Nothing retries an untyped plain rate limit, so it stays fatal
        ("Rate limit exceeded", True),
        # ...unless the endpoint says when to retry
        ("Rate limit exceeded, please retry in 20s", False),
        ("429 Too Many Requests, retry in 20s", False),
        # 429 inside a port or id is not a rate limit
        ("Invalid API key (request id ab429f), retry in 5s", True),
    ],
)
def test_untyped_rate_limits_use_the_same_rule(message: str, fatal: bool) -> None:
    assert detect_fatal_error(message)[0] is fatal


def test_gemini_per_minute_limit_that_mentions_billing_is_transient() -> None:
    message = (
        "You exceeded your current quota, please check your plan and billing details. "
        "Quota exceeded for metric generate_content_free_tier_requests, limit: 10. Please retry in 43.6s"
    )
    assert detect_fatal_error(str(GatewayProviderError("RateLimitError", 429, message)))[0] is False


def test_non_recovering_credit_limit_reports_credits() -> None:
    err = GatewayProviderError("RateLimitError", 429, "Your credits are used up")
    assert detect_fatal_error(str(err))[:2] == (True, "insufficient_credits")


def test_untyped_text_still_uses_the_patterns() -> None:
    assert detect_fatal_error("Incorrect API key provided")[:2] == (True, "invalid_api_key")
    assert detect_fatal_error("Request timeout, please retry")[0] is False


def test_tracker_stops_after_repeated_typed_errors() -> None:
    tracker = FatalErrorTracker(threshold=2)
    err = str(GatewayProviderError("NotFoundError", 404, "gone"))
    assert tracker.track_error(err) is False
    assert tracker.track_error(err) is True


@pytest.mark.parametrize(
    "text, secret",
    [
        ("https://host/v1/x?key=lowercaseonlysecret&alt=sse", "lowercaseonlysecret"),
        ("https://host/v1/x?alt=sse&key=abc123xyz", "abc123xyz"),
    ],
)
def test_key_query_parameters_are_always_redacted(text: str, secret: str) -> None:
    from utils.error_detection import redact_secrets

    assert secret not in redact_secrets(text)


def test_query_secret_rule_matches_the_gateway_copy() -> None:
    """The gateway keeps its own copy of the rule (separate deploy); they must not drift."""
    from pathlib import Path

    from utils.error_detection import _QUERY_SECRET

    gateway = Path(__file__).resolve().parents[2] / "AIGateway" / "src" / "utils" / "redaction.py"
    if not gateway.is_file():
        pytest.skip("AIGateway source not present")
    assert _QUERY_SECRET.pattern in gateway.read_text()
