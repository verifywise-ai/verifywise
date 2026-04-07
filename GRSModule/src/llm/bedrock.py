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
