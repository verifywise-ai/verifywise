from __future__ import annotations

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError

from llm.retry import RetryConfig, retry_with_backoff


def _make_client_error(code: str) -> ClientError:
    return ClientError(
        error_response={"Error": {"Code": code, "Message": "test error"}},
        operation_name="Converse",
    )


def test_throttling_exception_is_retried_and_eventually_succeeds():
    attempts = 0

    def fn():
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise _make_client_error("ThrottlingException")
        return "success"

    result = retry_with_backoff(fn, RetryConfig(max_attempts=5, base_delay_s=0.0))
    assert result == "success"
    assert attempts == 3


def test_model_not_ready_exception_is_retried():
    attempts = 0

    def fn():
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise _make_client_error("ModelNotReadyException")
        return "ok"

    result = retry_with_backoff(fn, RetryConfig(max_attempts=3, base_delay_s=0.0))
    assert result == "ok"
    assert attempts == 2


def test_service_unavailable_exception_is_retried():
    attempts = 0

    def fn():
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise _make_client_error("ServiceUnavailableException")
        return "ok"

    result = retry_with_backoff(fn, RetryConfig(max_attempts=3, base_delay_s=0.0))
    assert result == "ok"


def test_internal_server_exception_is_retried():
    attempts = 0

    def fn():
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise _make_client_error("InternalServerException")
        return "ok"

    result = retry_with_backoff(fn, RetryConfig(max_attempts=3, base_delay_s=0.0))
    assert result == "ok"


def test_access_denied_exception_is_not_retried():
    attempts = 0

    def fn():
        nonlocal attempts
        attempts += 1
        raise _make_client_error("AccessDeniedException")

    with pytest.raises(ClientError) as exc_info:
        retry_with_backoff(fn, RetryConfig(max_attempts=5, base_delay_s=0.0))

    assert attempts == 1  # no retries
    assert exc_info.value.response["Error"]["Code"] == "AccessDeniedException"


def test_validation_exception_is_not_retried():
    attempts = 0

    def fn():
        nonlocal attempts
        attempts += 1
        raise _make_client_error("ValidationException")

    with pytest.raises(ClientError):
        retry_with_backoff(fn, RetryConfig(max_attempts=5, base_delay_s=0.0))

    assert attempts == 1


def test_throttling_exhausts_max_attempts():
    attempts = 0

    def fn():
        nonlocal attempts
        attempts += 1
        raise _make_client_error("ThrottlingException")

    with pytest.raises(ClientError):
        retry_with_backoff(fn, RetryConfig(max_attempts=3, base_delay_s=0.0))

    assert attempts == 3


def test_endpoint_connection_error_is_retried():
    attempts = 0

    def fn():
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise EndpointConnectionError(
                endpoint_url="https://bedrock-runtime.us-east-1.amazonaws.com"
            )
        return "connected"

    result = retry_with_backoff(fn, RetryConfig(max_attempts=3, base_delay_s=0.0))
    assert result == "connected"
    assert attempts == 2


def test_endpoint_connection_error_exhausts_max_attempts():
    def fn():
        raise EndpointConnectionError(
            endpoint_url="https://bedrock-runtime.us-east-1.amazonaws.com"
        )

    with pytest.raises(EndpointConnectionError):
        retry_with_backoff(fn, RetryConfig(max_attempts=2, base_delay_s=0.0))
