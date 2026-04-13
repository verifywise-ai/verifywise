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
    profile: str | None = None
    _client: Any = field(init=False, repr=False)

    def __post_init__(self) -> None:
        session = boto3.Session(profile_name=self.profile) if self.profile else boto3.Session()
        self._client = session.client("bedrock-runtime", region_name=self.region)

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

        content_blocks = response["output"]["message"]["content"]
        text_block = next((b for b in content_blocks if "text" in b), None)
        if text_block is not None:
            text = text_block["text"]
        else:
            reasoning_block = next((b for b in content_blocks if "reasoningContent" in b), None)
            if reasoning_block is not None:
                text = reasoning_block["reasoningContent"]["reasoningText"]["text"]
            else:
                raise ValueError(f"No text or reasoningContent block in Bedrock response: {content_blocks}")

        return ChatResult(
            text=text,
            raw={
                "latency_ms": latency_ms,
                "stopReason": response.get("stopReason"),
                "usage": response.get("usage", {}),
                "model_id": self.model_id,
            },
        )
