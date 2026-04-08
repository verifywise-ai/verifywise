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
