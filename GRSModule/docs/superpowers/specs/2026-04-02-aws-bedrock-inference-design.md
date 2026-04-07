# AWS Bedrock Inference Support — Design Spec

**Date:** 2026-04-02
**Status:** Approved

---

## Overview

Add AWS Bedrock as a second real inference provider to the GRS Module pipeline, alongside the existing OpenRouter provider. Bedrock support uses the `converse` API (unified interface across model families), a per-model `region` field in `models.yaml`, and a new client factory to eliminate hardcoded provider dispatch in `cli.py`.

---

## Goals

- Run inference against Bedrock-hosted models (Claude, Llama, Mistral, and others) using free AWS credits.
- Support a mix of base model IDs and cross-region inference profile IDs — both are valid values for `model_id` in config.
- Preserve full resumability, failure tracking, and manifest writing for Bedrock models.
- Keep `runner.py` completely untouched — it operates on the `ChatClient` protocol.

---

## Files Changed

| File | Type | Description |
|------|------|-------------|
| `src/llm/bedrock.py` | New | `BedrockChatClient` — boto3 converse API implementation |
| `src/llm/factory.py` | New | `build_client(spec)` factory — single provider dispatch point |
| `src/llm/retry.py` | Modified | Add botocore exception branch alongside existing httpx branch |
| `src/infer/models_config.py` | Modified | Add optional `region: str \| None = None` to `ModelSpec` |
| `configs/models.yaml` | Modified | Add example Bedrock model entries |
| `src/cli.py` | Modified | Replace two provider dispatch blocks with `build_client()` calls |
| `pyproject.toml` | Modified | Add `boto3` dependency |

---

## Component Design

### `src/llm/bedrock.py` — `BedrockChatClient`

```python
@dataclass
class BedrockChatClient:
    model_id: str
    region: str
```

- Creates `boto3.client("bedrock-runtime", region_name=self.region)` on init.
- Credentials resolved automatically via boto3's default chain: `~/.aws/credentials`, `~/.aws/config`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env vars, IAM instance profile. No credential configuration in code.
- `chat(messages, temperature, max_tokens)` transforms the incoming messages list to Bedrock's `converse` format:

```python
# Input (OpenAI-style, already in this format from runner.py):
{"role": "user", "content": "some text"}

# Transformed for Bedrock converse:
{"role": "user", "content": [{"text": "some text"}]}
```

- Calls `client.converse(modelId=..., messages=..., inferenceConfig={...})`.
- Extracts response text from `response["output"]["message"]["content"][0]["text"]`.
- Returns `ChatResult` with `raw` containing: `usage`, `stopReason`, `model_id`, `latency_ms`.

### `src/llm/factory.py` — `build_client()`

Single function that maps a `ModelSpec` to a `ChatClient`:

```python
def build_client(spec: ModelSpec) -> ChatClient:
    if spec.provider == "openrouter":
        return OpenRouterChatClient(model_id=spec.model_id)
    elif spec.provider == "bedrock":
        if not spec.region:
            raise ValueError(f"Bedrock model '{spec.model_id}' requires a 'region' field in models.yaml")
        return BedrockChatClient(model_id=spec.model_id, region=spec.region)
    elif spec.provider == "mock":
        return MockChatClient(model_id=spec.model_id, provider=spec.provider)
    else:
        raise ValueError(f"Unsupported provider: '{spec.provider}'")
```

Fails fast with a clear message for misconfiguration (missing region, unknown provider).

### `src/llm/retry.py` — Botocore branch

Two new exception branches added alongside the existing httpx branches in `retry_with_backoff`:

**Retryable botocore error codes:**

| Code | Reason |
|------|--------|
| `ThrottlingException` | Rate limited |
| `ModelNotReadyException` | Model warming up |
| `ServiceUnavailableException` | Transient Bedrock service issue |
| `InternalServerException` | Transient server error |

- `botocore.exceptions.ClientError`: extract code from `e.response["Error"]["Code"]`. If retryable, apply the same exponential backoff + jitter as the httpx branch. Non-retryable codes (e.g., `ValidationException`, `AccessDeniedException`) re-raise immediately.
- `botocore.exceptions.EndpointConnectionError`: always retry with backoff (connectivity issue).
- Delay formula unchanged: `min(max_delay_s, base_delay_s * 2^(attempt-1)) * (1 ± jitter)`.

### `src/infer/models_config.py` — `ModelSpec`

```python
class ModelSpec(BaseModel):
    provider: str
    model_id: str
    region: str | None = None  # required for bedrock, ignored for openrouter/mock
```

### `configs/models.yaml` — Example entries

```yaml
version: models_v0.1
models:
  - provider: openrouter
    model_id: google/gemini-2.5-pro

  - provider: bedrock
    model_id: anthropic.claude-3-5-sonnet-20241022-v2:0
    region: us-east-1

  - provider: bedrock
    model_id: us.meta.llama3-3-70b-instruct-v1:0  # cross-region inference profile
    region: us-east-1

  - provider: bedrock
    model_id: mistral.mistral-large-2402-v1:0
    region: eu-west-1
```

Both base model IDs and cross-region inference profile IDs (prefixed with region group, e.g., `us.`) are valid — Bedrock accepts both in the `converse` API.

### `src/cli.py` — Dispatch cleanup

**Multi-model loop** (currently lines 352–364) — replace skip-with-warning + hardcoded `OpenRouterChatClient`:

```python
# Before:
if spec.provider != "openrouter":
    console.print(f"[yellow]Skipping unsupported provider in v0.1:[/yellow] {spec.provider}")
    continue
client = OpenRouterChatClient(model_id=spec.model_id)

# After:
client = build_client(spec)
```

**Single-model path** (currently lines 430–433) — replace if/else:

```python
# Before:
if args.provider == "openrouter":
    client = OpenRouterChatClient(model_id=args.model_id)
else:
    client = MockChatClient(model_id=args.model_id, provider=args.provider)

# After:
client = build_client(ModelSpec(provider=args.provider, model_id=args.model_id))
```

**Constraint:** The single-model CLI path (`--provider bedrock --model-id ...`) does not support `--region`. Bedrock models in single-model mode must use `--models-config`. This is acceptable since single-model mode is primarily used for mock/openrouter smoke tests.

---

## Credentials

No credential configuration in code. boto3 resolves credentials automatically in this order:
1. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` env vars
2. `~/.aws/credentials` and `~/.aws/config` files (default profile, or `AWS_PROFILE` env var for non-default)
3. IAM instance profile / ECS task role

The IAM principal must have `bedrock:InvokeModel` and `bedrock:Converse` permissions on the target models.

---

## Error Handling

| Error | Behavior |
|-------|----------|
| Missing `region` for Bedrock model | `ValueError` raised by `build_client()` at startup — fails before any inference runs |
| Retryable Bedrock error (throttle, unavailable) | Exponential backoff + jitter, up to `retry_max_attempts` |
| Non-retryable Bedrock error (access denied, validation) | Immediate re-raise, recorded as failure in `.failures.jsonl` |
| Connectivity error | Retry with backoff |
| Unknown provider in `models.yaml` | `ValueError` raised by `build_client()` |

---

## Dependency

Add to `pyproject.toml` `dependencies`:

```toml
"boto3>=1.34",
```

---

## Out of Scope

- Streaming responses (not used in the pipeline)
- Bedrock Agents or Knowledge Bases
- Cross-account role assumption
- `--region` CLI flag for single-model mode (use `--models-config` for Bedrock)
- Bedrock model availability validation at startup
