from __future__ import annotations

import random
import time
from dataclasses import dataclass
from typing import Callable, TypeVar

import httpx
from botocore.exceptions import ClientError, EndpointConnectionError

T = TypeVar("T")

_RETRYABLE_BEDROCK_CODES = frozenset({
    "ThrottlingException",
    "ModelNotReadyException",
    "ServiceUnavailableException",
    "InternalServerException",
})


@dataclass(frozen=True)
class RetryConfig:
    max_attempts: int = 5
    base_delay_s: float = 2.0
    max_delay_s: float = 30.0
    jitter: float = 0.2


def is_retryable_http_status(status: int) -> bool:
    return status in (408, 409, 429, 500, 502, 503, 504)


def _backoff_delay(attempt: int, cfg: RetryConfig) -> float:
    delay = min(cfg.max_delay_s, cfg.base_delay_s * (2 ** (attempt - 1)))
    return max(0.0, delay * (1.0 + random.uniform(-cfg.jitter, cfg.jitter)))


def retry_with_backoff(fn: Callable[[], T], cfg: RetryConfig) -> T:
    attempt = 0
    while True:
        attempt += 1
        try:
            return fn()
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if attempt >= cfg.max_attempts or not is_retryable_http_status(status):
                raise
            retry_after = e.response.headers.get("retry-after")
            if retry_after and retry_after.isdigit():
                delay = float(retry_after)
            else:
                delay = _backoff_delay(attempt, cfg)
            time.sleep(delay)
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt >= cfg.max_attempts:
                raise
            time.sleep(_backoff_delay(attempt, cfg))
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if attempt >= cfg.max_attempts or code not in _RETRYABLE_BEDROCK_CODES:
                raise
            time.sleep(_backoff_delay(attempt, cfg))
        except EndpointConnectionError:
            if attempt >= cfg.max_attempts:
                raise
            time.sleep(_backoff_delay(attempt, cfg))
