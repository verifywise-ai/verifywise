from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List
import time
import traceback

from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeRemainingColumn, MofNCompleteColumn
from rich.console import Console

from llm.base import ChatClient
from models.candidate_response import CandidateResponse
from llm.retry import retry_with_backoff, RetryConfig


@dataclass(frozen=True)
class InferConfig:
    model_id: str
    provider: str
    temperature: float = 0.2
    max_tokens: int = 8192  # Increased from 2048: thinking models (e.g. Gemini 2.5 Pro) consume
                            # reasoning tokens from this budget before generating visible output.
                            # With 2048, ~1600-1963 tokens were spent on reasoning, leaving <400
                            # for actual output and causing finish_reason=length truncation.
    retry_max_attempts: int = 5


def build_messages_from_scenario(s: Dict[str, Any]) -> List[Dict[str, str]]:
    # simple: scenario.prompt is already a complete “chat-style” prompt
    return [{"role": "user", "content": s["prompt"]}]


def run_inference(
    *,
    scenarios: List[Dict[str, Any]],
    client: ChatClient,
    cfg: InferConfig,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    i = 0
    for s in scenarios:
        i += 1
        messages = build_messages_from_scenario(s)

        t0 = time.time()
        res = client.chat(messages=messages, temperature=cfg.temperature, max_tokens=cfg.max_tokens)
        dt_ms = int((time.time() - t0) * 1000)

        resp = CandidateResponse(
            response_id=f"resp_{cfg.model_id}_{i:06d}",
            scenario_id=s["scenario_id"],
            model_id=cfg.model_id,
            provider=cfg.provider,
            prompt=s["prompt"],
            messages=messages,
            output_text=res.text,
            raw=res.raw,
            meta={
                "latency_ms": dt_ms,
                "temperature": cfg.temperature,
                "max_tokens": cfg.max_tokens,
            },
        )
        out.append(resp.model_dump())

    return out


def run_inference_resumable(
    *,
    scenarios: List[Dict[str, Any]],
    client: ChatClient,
    cfg: InferConfig,
    skip_pairs: set[tuple[str, str]] | None = None,
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    skip_pairs = skip_pairs or set()
    successes: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []

    retry_cfg = RetryConfig(max_attempts=cfg.retry_max_attempts)

    total_to_run = sum(
        1 for s in scenarios
        if (s["scenario_id"], cfg.model_id) not in skip_pairs
    )

    console = Console()
    i = 0
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeRemainingColumn(),
        console=console,
    ) as progress:
        task = progress.add_task(f"[cyan]{cfg.model_id}", total=total_to_run)

        for s in scenarios:
            scenario_id = s["scenario_id"]
            pair = (scenario_id, cfg.model_id)
            if pair in skip_pairs:
                continue

            i += 1
            messages = build_messages_from_scenario(s)

            try:
                def _call():
                    return client.chat(messages=messages, temperature=cfg.temperature, max_tokens=cfg.max_tokens)

                res = retry_with_backoff(_call, retry_cfg)

                resp = CandidateResponse(
                    response_id=f"resp_{cfg.model_id}_{i:06d}",
                    scenario_id=scenario_id,
                    model_id=cfg.model_id,
                    provider=cfg.provider,
                    prompt=s["prompt"],
                    messages=messages,
                    output_text=res.text,
                    raw=res.raw if isinstance(res.raw, dict) else {"raw": res.raw},
                    meta={
                        "temperature": cfg.temperature,
                        "max_tokens": cfg.max_tokens,
                    },
                )
                successes.append(resp.model_dump())

            except Exception as e:
                failures.append(
                    {
                        "scenario_id": scenario_id,
                        "model_id": cfg.model_id,
                        "provider": cfg.provider,
                        "error_type": type(e).__name__,
                        "error": str(e),
                        "traceback": traceback.format_exc(limit=3),
                    }
                )

            progress.advance(task)

    return successes, failures
