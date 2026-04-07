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
