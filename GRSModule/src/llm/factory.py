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
        return BedrockChatClient(model_id=spec.model_id, region=spec.region, profile=spec.profile)
    elif spec.provider == "mock":
        return MockChatClient(model_id=spec.model_id, provider=spec.provider)
    else:
        raise ValueError(f"Unsupported provider: '{spec.provider}'")
