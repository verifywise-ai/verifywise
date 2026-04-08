# AWS Bedrock Inference Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AWS Bedrock as a second real inference provider, usable alongside OpenRouter in `configs/models.yaml`, via a `BedrockChatClient` that implements the existing `ChatClient` protocol.

**Architecture:** A new `BedrockChatClient` (using boto3's `converse` API) and a `build_client()` factory replace the hardcoded provider dispatch in `cli.py`. Retry logic in `retry.py` is extended with a botocore exception branch. Everything downstream (`runner.py`, manifests, reports) is untouched — it already operates on the `ChatClient` protocol.

**Tech Stack:** Python 3.12, boto3 ≥1.34, botocore, pytest, unittest.mock

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `pyproject.toml` | Modify | Add `boto3>=1.34` dependency |
| `src/infer/models_config.py` | Modify | Add optional `region: str \| None = None` to `ModelSpec` |
| `src/llm/bedrock.py` | Create | `BedrockChatClient` — wraps boto3 converse API |
| `src/llm/retry.py` | Modify | Add botocore exception branch to `retry_with_backoff` |
| `src/llm/factory.py` | Create | `build_client(spec) -> ChatClient` — single provider dispatch |
| `src/cli.py` | Modify | Replace two hardcoded dispatch blocks with `build_client()` |
| `configs/models.yaml` | Modify | Add Bedrock example entries |
| `tests/infer/__init__.py` | Create | Empty — makes `tests/infer/` a package |
| `tests/infer/test_models_config.py` | Create | Tests for `ModelSpec` region field |
| `tests/llm/__init__.py` | Create | Empty — makes `tests/llm/` a package |
| `tests/llm/test_bedrock.py` | Create | Tests for `BedrockChatClient` |
| `tests/llm/test_retry_bedrock.py` | Create | Tests for botocore retry branches |
| `tests/llm/test_factory.py` | Create | Tests for `build_client()` |

---

## Task 1: Add boto3 dependency and extend `ModelSpec` with `region`

**Files:**
- Modify: `pyproject.toml`
- Modify: `src/infer/models_config.py`
- Create: `tests/infer/__init__.py`
- Create: `tests/infer/test_models_config.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/infer/__init__.py` (empty file), then create `tests/infer/test_models_config.py`:

```python
from infer.models_config import ModelSpec, ModelsConfig


def test_model_spec_region_defaults_to_none():
    spec = ModelSpec(provider="openrouter", model_id="google/gemini-2.5-pro")
    assert spec.region is None


def test_model_spec_accepts_region():
    spec = ModelSpec(
        provider="bedrock",
        model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
        region="us-east-1",
    )
    assert spec.region == "us-east-1"


def test_models_config_parses_bedrock_entry():
    data = {
        "version": "models_v0.1",
        "models": [
            {
                "provider": "bedrock",
                "model_id": "anthropic.claude-3-5-sonnet-20241022-v2:0",
                "region": "us-east-1",
            }
        ],
    }
    cfg = ModelsConfig(**data)
    assert cfg.models[0].region == "us-east-1"


def test_existing_openrouter_spec_still_parses():
    """Regression: adding region field must not break existing openrouter entries."""
    data = {
        "version": "models_v0.1",
        "models": [{"provider": "openrouter", "model_id": "google/gemini-2.5-pro"}],
    }
    cfg = ModelsConfig(**data)
    assert cfg.models[0].region is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/sermengi/scorers/verifywise/GRSModule
uv run pytest tests/infer/test_models_config.py -v
```

Expected: FAIL — `ModelSpec` has no `region` field yet.

- [ ] **Step 3: Add `boto3` to `pyproject.toml`**

In `pyproject.toml`, add `boto3` to the `dependencies` list:

```toml
dependencies = [
  "httpx>=0.28.1",
  "pydantic>=2.6",
  "pyyaml>=6.0",
  "rich>=13.7",
  "streamlit>=1.54.0",
  "boto3>=1.34",
]
```

- [ ] **Step 4: Sync the environment**

```bash
uv sync
```

Expected: boto3 and botocore appear in the lock file, no errors.

- [ ] **Step 5: Add `region` field to `ModelSpec`**

In `src/infer/models_config.py`, change `ModelSpec` to:

```python
from __future__ import annotations

from pydantic import BaseModel
from typing import List


class ModelSpec(BaseModel):
    provider: str
    model_id: str
    region: str | None = None


class ModelsConfig(BaseModel):
    version: str
    models: List[ModelSpec]
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
uv run pytest tests/infer/test_models_config.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml uv.lock src/infer/models_config.py tests/infer/__init__.py tests/infer/test_models_config.py
git commit -m "feat(infer): add optional region field to ModelSpec, add boto3 dependency"
```

---

## Task 2: Implement `BedrockChatClient`

**Files:**
- Create: `src/llm/bedrock.py`
- Create: `tests/llm/__init__.py`
- Create: `tests/llm/test_bedrock.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/llm/__init__.py` (empty file), then create `tests/llm/test_bedrock.py`:

```python
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from llm.bedrock import BedrockChatClient


def _mock_converse_response(text: str = "Test response.") -> dict:
    return {
        "output": {
            "message": {
                "content": [{"text": text}]
            }
        },
        "stopReason": "end_turn",
        "usage": {"inputTokens": 10, "outputTokens": 20},
    }


def test_chat_returns_chat_result():
    with patch("boto3.client") as mock_boto3:
        mock_bedrock = MagicMock()
        mock_bedrock.converse.return_value = _mock_converse_response("Hello back.")
        mock_boto3.return_value = mock_bedrock

        client = BedrockChatClient(
            model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
            region="us-east-1",
        )
        result = client.chat(
            messages=[{"role": "user", "content": "Hello"}],
            temperature=0.2,
            max_tokens=512,
        )

    assert result.text == "Hello back."
    assert result.raw["stopReason"] == "end_turn"
    assert result.raw["usage"] == {"inputTokens": 10, "outputTokens": 20}
    assert "latency_ms" in result.raw
    assert isinstance(result.raw["latency_ms"], int)


def test_chat_transforms_messages_to_bedrock_format():
    """Messages must be wrapped: {"role": ..., "content": [{"text": ...}]}"""
    with patch("boto3.client") as mock_boto3:
        mock_bedrock = MagicMock()
        mock_bedrock.converse.return_value = _mock_converse_response()
        mock_boto3.return_value = mock_bedrock

        client = BedrockChatClient(model_id="test-model", region="us-east-1")
        client.chat(
            messages=[{"role": "user", "content": "Explain governance."}],
            temperature=0.0,
            max_tokens=100,
        )

        call_kwargs = mock_bedrock.converse.call_args[1]
        assert call_kwargs["messages"] == [
            {"role": "user", "content": [{"text": "Explain governance."}]}
        ]


def test_chat_passes_inference_config():
    with patch("boto3.client") as mock_boto3:
        mock_bedrock = MagicMock()
        mock_bedrock.converse.return_value = _mock_converse_response()
        mock_boto3.return_value = mock_bedrock

        client = BedrockChatClient(model_id="test-model", region="eu-west-1")
        client.chat(
            messages=[{"role": "user", "content": "test"}],
            temperature=0.7,
            max_tokens=256,
        )

        call_kwargs = mock_bedrock.converse.call_args[1]
        assert call_kwargs["inferenceConfig"] == {
            "temperature": 0.7,
            "maxTokens": 256,
        }


def test_boto3_client_uses_correct_region():
    with patch("boto3.client") as mock_boto3:
        mock_boto3.return_value = MagicMock()
        mock_boto3.return_value.converse.return_value = _mock_converse_response()

        BedrockChatClient(model_id="test-model", region="ap-southeast-1")

        mock_boto3.assert_called_once_with(
            "bedrock-runtime", region_name="ap-southeast-1"
        )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest tests/llm/test_bedrock.py -v
```

Expected: FAIL — `llm.bedrock` module does not exist yet.

- [ ] **Step 3: Create `src/llm/bedrock.py`**

```python
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List

import boto3

from llm.base import ChatResult


@dataclass
class BedrockChatClient:
    model_id: str
    region: str
    _client: Any = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._client = boto3.client("bedrock-runtime", region_name=self.region)

    def chat(
        self,
        *,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> ChatResult:
        bedrock_messages = [
            {"role": m["role"], "content": [{"text": m["content"]}]}
            for m in messages
        ]

        t0 = time.time()
        response = self._client.converse(
            modelId=self.model_id,
            messages=bedrock_messages,
            inferenceConfig={
                "temperature": temperature,
                "maxTokens": max_tokens,
            },
        )
        latency_ms = int((time.time() - t0) * 1000)

        text = response["output"]["message"]["content"][0]["text"]

        return ChatResult(
            text=text,
            raw={
                "latency_ms": latency_ms,
                "stopReason": response.get("stopReason"),
                "usage": response.get("usage", {}),
                "model_id": self.model_id,
            },
        )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/llm/test_bedrock.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/llm/bedrock.py tests/llm/__init__.py tests/llm/test_bedrock.py
git commit -m "feat(llm): add BedrockChatClient using boto3 converse API"
```

---

## Task 3: Extend `retry_with_backoff` with botocore exception branches

**Files:**
- Modify: `src/llm/retry.py`
- Create: `tests/llm/test_retry_bedrock.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/llm/test_retry_bedrock.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest tests/llm/test_retry_bedrock.py -v
```

Expected: FAIL — `retry_with_backoff` does not catch botocore exceptions yet.

- [ ] **Step 3: Extend `src/llm/retry.py` with botocore branches**

Replace the entire content of `src/llm/retry.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/llm/test_retry_bedrock.py -v
```

Expected: 9 tests PASS.

- [ ] **Step 5: Run the full existing test suite to verify no regressions**

```bash
uv run pytest tests/ -v
```

Expected: all previously passing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add src/llm/retry.py tests/llm/test_retry_bedrock.py
git commit -m "feat(llm): extend retry_with_backoff with botocore exception branches"
```

---

## Task 4: Implement `build_client()` factory

**Files:**
- Create: `src/llm/factory.py`
- Create: `tests/llm/test_factory.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/llm/test_factory.py`:

```python
from __future__ import annotations

from unittest.mock import patch

import pytest

from infer.models_config import ModelSpec
from llm.factory import build_client
from llm.bedrock import BedrockChatClient
from llm.mock import MockChatClient
from llm.openrouter import OpenRouterChatClient


def test_build_mock_client():
    spec = ModelSpec(provider="mock", model_id="mock-model")
    client = build_client(spec)
    assert isinstance(client, MockChatClient)
    assert client.model_id == "mock-model"


def test_build_openrouter_client(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    spec = ModelSpec(provider="openrouter", model_id="google/gemini-2.5-pro")
    client = build_client(spec)
    assert isinstance(client, OpenRouterChatClient)
    assert client.model_id == "google/gemini-2.5-pro"


def test_build_bedrock_client():
    with patch("boto3.client"):
        spec = ModelSpec(
            provider="bedrock",
            model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
            region="us-east-1",
        )
        client = build_client(spec)
    assert isinstance(client, BedrockChatClient)
    assert client.model_id == "anthropic.claude-3-5-sonnet-20241022-v2:0"
    assert client.region == "us-east-1"


def test_bedrock_without_region_raises_value_error():
    spec = ModelSpec(
        provider="bedrock",
        model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
        # region intentionally omitted
    )
    with pytest.raises(ValueError, match="requires a 'region'"):
        build_client(spec)


def test_unknown_provider_raises_value_error():
    spec = ModelSpec(provider="azure", model_id="gpt-4")
    with pytest.raises(ValueError, match="Unsupported provider"):
        build_client(spec)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest tests/llm/test_factory.py -v
```

Expected: FAIL — `llm.factory` does not exist yet.

- [ ] **Step 3: Create `src/llm/factory.py`**

```python
from __future__ import annotations

from infer.models_config import ModelSpec
from llm.base import ChatClient
from llm.bedrock import BedrockChatClient
from llm.mock import MockChatClient
from llm.openrouter import OpenRouterChatClient


def build_client(spec: ModelSpec) -> ChatClient:
    if spec.provider == "openrouter":
        return OpenRouterChatClient(model_id=spec.model_id)
    elif spec.provider == "bedrock":
        if not spec.region:
            raise ValueError(
                f"Bedrock model '{spec.model_id}' requires a 'region' field in models.yaml"
            )
        return BedrockChatClient(model_id=spec.model_id, region=spec.region)
    elif spec.provider == "mock":
        return MockChatClient(model_id=spec.model_id, provider=spec.provider)
    else:
        raise ValueError(f"Unsupported provider: '{spec.provider}'")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/llm/test_factory.py -v
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/llm/factory.py tests/llm/test_factory.py
git commit -m "feat(llm): add build_client factory for provider dispatch"
```

---

## Task 5: Update `cli.py` to use `build_client()`

**Files:**
- Modify: `src/cli.py`

- [ ] **Step 1: Add the `build_client` import to `cli.py`**

In `src/cli.py`, the current import block around line 38–39 reads:

```python
from llm.mock import MockChatClient
from llm.openrouter import OpenRouterChatClient
```

Replace those two lines with:

```python
from llm.mock import MockChatClient
from llm.openrouter import OpenRouterChatClient
from llm.factory import build_client
```

- [ ] **Step 2: Fix the multi-model loop dispatch (lines 352–364)**

In `src/cli.py`, find this block inside the `if args.models_config:` branch:

```python
            for spec in models_cfg.models:
                if spec.provider != "openrouter":
                    console.print(f"[yellow]Skipping unsupported provider in v0.1:[/yellow] {spec.provider}")
                    continue

                out_path = model_output_path(final_dir, spec.model_id)
                fail_path = out_path.with_suffix(out_path.suffix + ".failures.jsonl")

                skip = set()
                if args.resume:
                    skip = load_completed_pairs(out_path)

                client = OpenRouterChatClient(model_id=spec.model_id)
```

Replace with:

```python
            for spec in models_cfg.models:
                out_path = model_output_path(final_dir, spec.model_id)
                fail_path = out_path.with_suffix(out_path.suffix + ".failures.jsonl")

                skip = set()
                if args.resume:
                    skip = load_completed_pairs(out_path)

                client = build_client(spec)
```

- [ ] **Step 3: Fix the single-model dispatch (lines 430–433)**

In `src/cli.py`, find:

```python
        if args.provider == "openrouter":
            client = OpenRouterChatClient(model_id=args.model_id)
        else:
            client = MockChatClient(model_id=args.model_id, provider=args.provider)
```

Replace with:

```python
        client = build_client(ModelSpec(provider=args.provider, model_id=args.model_id))
```

Also add `ModelSpec` to the import from `infer.models_config`. Find the existing line:

```python
from infer.load_models import load_models_config
```

And add below it:

```python
from infer.models_config import ModelSpec
```

- [ ] **Step 4: Smoke test with mock provider**

```bash
cd /home/sermengi/scorers/verifywise/GRSModule
make infer-mock-client
```

Expected: pipeline runs 3 scenarios with mock client, writes `candidate_responses.jsonl`, no errors.

- [ ] **Step 5: Run full test suite**

```bash
uv run pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli.py
git commit -m "refactor(cli): replace hardcoded provider dispatch with build_client factory"
```

---

## Task 6: Update `configs/models.yaml` with Bedrock examples

**Files:**
- Modify: `configs/models.yaml`

- [ ] **Step 1: Update `configs/models.yaml`**

Replace the entire file content:

```yaml
version: models_v0.1
models:
  - provider: openrouter
    model_id: google/gemini-2.5-pro

  # AWS Bedrock models — requires AWS credentials in ~/.aws/credentials
  # Use base model IDs or cross-region inference profile IDs (prefixed with region group, e.g. us.)
#  - provider: bedrock
#    model_id: anthropic.claude-3-5-sonnet-20241022-v2:0
#    region: us-east-1

#  - provider: bedrock
#    model_id: us.meta.llama3-3-70b-instruct-v1:0
#    region: us-east-1

#  - provider: bedrock
#    model_id: mistral.mistral-large-2402-v1:0
#    region: eu-west-1
```

Bedrock entries are commented out by default so the existing OpenRouter run isn't disrupted. Uncomment the models you want to use.

- [ ] **Step 2: Commit**

```bash
git add configs/models.yaml
git commit -m "chore(config): add commented Bedrock model examples to models.yaml"
```

---

## Task 7: End-to-end smoke test with real Bedrock

> **Skip this task if you do not have active AWS credentials / Bedrock access in your current shell session.**

**Files:** none (validation only)

- [ ] **Step 1: Verify AWS credentials are active**

```bash
aws sts get-caller-identity
```

Expected: JSON with `UserId`, `Account`, `Arn`. If this fails, check `~/.aws/credentials` or set `AWS_PROFILE`.

- [ ] **Step 2: Uncomment one Bedrock model in `configs/models.yaml`**

Uncomment the Claude entry (or whichever model you have access to in your Bedrock region):

```yaml
  - provider: bedrock
    model_id: anthropic.claude-3-5-sonnet-20241022-v2:0
    region: us-east-1
```

- [ ] **Step 3: Run inference with `--limit 1` for a quick smoke test**

```bash
uv run grs-scenarios generate --stage infer --models-config configs/models.yaml --temperature 0.2 --max-tokens 512 --limit 1
```

Expected: one scenario runs, `datasets/grs_scenarios_v0.1/final/responses/` contains a `.jsonl` file for the model, no errors.

- [ ] **Step 4: Inspect the output**

```bash
cat datasets/grs_scenarios_v0.1/final/responses/anthropic.claude-3-5-sonnet-20241022-v2:0.jsonl | python3 -m json.tool | head -40
```

Expected: valid JSON with `output_text`, `provider: "bedrock"`, `raw.stopReason`, `raw.usage`.

- [ ] **Step 5: Revert `configs/models.yaml` to commented-out state (optional)**

If you want to keep the default config clean for other contributors:

```bash
git checkout configs/models.yaml
```

Or commit the uncommented version if Bedrock is now the primary inference target.
