from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple, Optional, Set
import traceback

from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeRemainingColumn, MofNCompleteColumn
from rich.console import Console

from llm.base import ChatClient
from models.judge_score import JudgeScore, DimensionScore
from judge.prompt_builder import build_judge_messages
from judge.rubric import JudgeRubric
from llm.retry import retry_with_backoff, RetryConfig


def _fix_standalone_escaped_quotes(text: str) -> str:
    """
    Convert \"...\" used as standalone JSON value delimiters to "...".

    When the judge LLM uses backslash-escaped quotes as string delimiters instead
    of plain quotes (e.g. in evidence arrays), this converts them to valid JSON strings.
    Leaves \" inside properly-opened "..." strings untouched — those are valid JSON escapes.
    """
    result = []
    i = 0
    n = len(text)
    in_string = False

    while i < n:
        c = text[i]
        if in_string:
            if c == "\\" and i + 1 < n:
                # Any escape sequence inside a string: pass through unchanged
                result.append(c)
                result.append(text[i + 1])
                i += 2
            elif c == '"':
                # Closing quote of a normal string
                result.append(c)
                in_string = False
                i += 1
            else:
                result.append(c)
                i += 1
        else:
            if c == '"':
                # Opening quote of a normal string
                result.append(c)
                in_string = True
                i += 1
            elif c == "\\" and i + 1 < n and text[i + 1] == '"':
                # \"...\" used as a value delimiter — convert opening \" to "
                result.append('"')
                i += 2
                # Consume until the matching closing \"
                while i < n:
                    c = text[i]
                    if c == "\\" and i + 1 < n and text[i + 1] == '"':
                        result.append('"')
                        i += 2
                        break
                    elif c == "\\" and i + 1 < n:
                        result.append(c)
                        result.append(text[i + 1])
                        i += 2
                    else:
                        result.append(c)
                        i += 1
            else:
                result.append(c)
                i += 1

    return "".join(result)


def _parse_judge_json(text: str) -> dict:
    """Parse judge LLM output tolerantly: strip markdown fences, fix common LLM JSON mistakes."""
    # Strip markdown code fences (```json ... ``` or ``` ... ```)
    stripped = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    stripped = re.sub(r"\s*```$", "", stripped)
    # Fix \"...\" used as standalone string value delimiters
    stripped = _fix_standalone_escaped_quotes(stripped)
    # Remove trailing commas before ] or } (invalid JSON, common LLM mistake)
    stripped = re.sub(r",(\s*[}\]])", r"\1", stripped)
    return json.loads(stripped)


@dataclass(frozen=True)
class JudgeConfig:
    judge_model_id: str
    judge_provider: str
    temperature: float = 0.0
    max_tokens: int = 800


def _weighted_mean(dim_scores: Dict[str, int], weights: Dict[str, float]) -> float:
    num = 0.0
    den = 0.0
    for k, w in weights.items():
        if k in dim_scores:
            num += float(dim_scores[k]) * float(w)
            den += float(w)
    return round(num / den, 4) if den > 0 else 0.0


def run_judging(
    *,
    pairs: List[Tuple[Dict[str, Any], Dict[str, Any]]],  # (scenario, response)
    client: ChatClient,
    rubric: JudgeRubric,
    cfg: JudgeConfig,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    i = 0

    for scenario, response in pairs:
        i += 1
        messages = build_judge_messages(scenario=scenario, response=response, rubric=rubric)

        t0 = time.time()
        res = client.chat(messages=messages, temperature=cfg.temperature, max_tokens=cfg.max_tokens)
        latency_ms = int((time.time() - t0) * 1000)

        # Parse JSON (strict)
        data = _parse_judge_json(res.text)

        dim_list = []
        dim_map: Dict[str, int] = {}
        for d in data.get("dimension_scores", []):
            ds = DimensionScore.model_validate(d)
            dim_list.append(ds)
            dim_map[ds.dimension_id] = ds.score

        grs = data.get("grs_score")
        if grs is None:
            grs = _weighted_mean(dim_map, rubric.aggregation.weights)

        js = JudgeScore(
            judge_score_id=f"judge_{cfg.judge_model_id}_{i:06d}",
            scenario_id=scenario["scenario_id"],
            candidate_model_id=response["model_id"],
            candidate_provider=response["provider"],
            judge_model_id=cfg.judge_model_id,
            judge_provider=cfg.judge_provider,
            grs_score=float(grs),
            dimension_scores=dim_list,
            flags=data.get("flags", {}) or {},
            raw={"judge_raw": res.raw, "judge_parsed": data},
            meta={"latency_ms": latency_ms},
        )
        out.append(js.model_dump())

    return out


def run_judging_resumable(
    *,
    pairs: List[Tuple[Dict[str, Any], Dict[str, Any]]],  # (scenario, response)
    client: ChatClient,
    rubric: JudgeRubric,
    cfg: JudgeConfig,
    skip_keys: Optional[Set[tuple[str, str, str]]] = None,
    retry_max_attempts: int = 5,
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], int]:
    """
    Returns (scores, failures, skipped_count).
    """
    skip_keys = skip_keys or set()
    retry_cfg = RetryConfig(max_attempts=retry_max_attempts)

    out: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []
    skipped = 0
    i = 0

    total_to_run = sum(
        1 for scenario, response in pairs
        if (scenario["scenario_id"], str(response.get("model_id", "unknown")), cfg.judge_model_id) not in skip_keys
    )

    console = Console()
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeRemainingColumn(),
        console=console,
    ) as progress:
        task = progress.add_task(f"[cyan]judging with {cfg.judge_model_id}", total=total_to_run)

        for scenario, response in pairs:
            scenario_id = scenario["scenario_id"]
            cand_model = response.get("model_id", "unknown")
            key = (scenario_id, str(cand_model), cfg.judge_model_id)

            if key in skip_keys:
                skipped += 1
                continue

            i += 1
            messages = build_judge_messages(scenario=scenario, response=response, rubric=rubric)

            res = None
            try:
                def _call():
                    return client.chat(messages=messages, temperature=cfg.temperature, max_tokens=cfg.max_tokens)

                t0 = time.time()
                res = retry_with_backoff(_call, retry_cfg)
                latency_ms = int((time.time() - t0) * 1000)

                data = _parse_judge_json(res.text)

                dim_list = []
                dim_map: Dict[str, int] = {}
                for d in data.get("dimension_scores", []):
                    ds = DimensionScore.model_validate(d)
                    dim_list.append(ds)
                    dim_map[ds.dimension_id] = ds.score

                grs = data.get("grs_score")
                if grs is None:
                    grs = _weighted_mean(dim_map, rubric.aggregation.weights)

                js = JudgeScore(
                    judge_score_id=f"judge_{cfg.judge_model_id}_{i:06d}",
                    scenario_id=scenario_id,
                    candidate_model_id=response["model_id"],
                    candidate_provider=response["provider"],
                    judge_model_id=cfg.judge_model_id,
                    judge_provider=cfg.judge_provider,
                    grs_score=float(grs),
                    dimension_scores=dim_list,
                    flags=data.get("flags", {}) or {},
                    raw={"judge_raw": res.raw, "judge_parsed": data},
                    meta={"latency_ms": latency_ms},
                )
                out.append(js.model_dump())

            except Exception as e:
                failures.append(
                    {
                        "scenario_id": scenario_id,
                        "candidate_model_id": response.get("model_id"),
                        "candidate_provider": response.get("provider"),
                        "judge_model_id": cfg.judge_model_id,
                        "judge_provider": cfg.judge_provider,
                        "error_type": type(e).__name__,
                        "error": str(e),
                        "traceback": traceback.format_exc(limit=3),
                        "judge_raw_text": res.text if res is not None else None,
                    }
                )

            progress.advance(task)

    return out, failures, skipped