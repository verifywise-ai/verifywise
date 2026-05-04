from __future__ import annotations

import traceback
from typing import Any, Dict, List, Tuple

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeRemainingColumn, MofNCompleteColumn

from llm.base import ChatClient
from judge.rubric import JudgeRubric, RubricAggregation
from judge.prompt_builder import build_judge_messages
from judge.runner import JudgeConfig, _parse_judge_json
from llm.retry import retry_with_backoff, RetryConfig
from models.judge_score import DimensionScore


def _weighted_mean(dim_scores: Dict[str, int], weights: Dict[str, float]) -> float:
    num = sum(float(dim_scores[k]) * float(w) for k, w in weights.items() if k in dim_scores)
    den = sum(float(w) for k, w in weights.items() if k in dim_scores)
    return round(num / den, 4) if den > 0 else 0.0


def _make_single_dim_rubric(rubric: JudgeRubric, dimension_id: str) -> JudgeRubric:
    dim = next((d for d in rubric.dimensions if d.dimension_id == dimension_id), None)
    if dim is None:
        raise ValueError(f"Dimension '{dimension_id}' not found in rubric")
    return JudgeRubric(
        version=rubric.version,
        scale=rubric.scale,
        dimensions=[dim],
        aggregation=RubricAggregation(method=rubric.aggregation.method, weights={dimension_id: 1.0}),
    )


def already_has_dimension(record: Dict[str, Any], dimension_id: str) -> bool:
    return any(d.get("dimension_id") == dimension_id for d in record.get("dimension_scores", []))


def run_judge_patch(
    *,
    records: List[Dict[str, Any]],
    scenario_map: Dict[str, Dict[str, Any]],
    response_map: Dict[Tuple[str, str], Dict[str, Any]],
    client: ChatClient,
    full_rubric: JudgeRubric,
    patch_dimension_id: str,
    cfg: JudgeConfig,
    retry_max_attempts: int = 5,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], int]:
    """
    Add a missing dimension score to existing judge score records.

    Returns (patched_records, failures, skipped_count).
    patched_records contains only the newly patched records.
    Records already containing the dimension are counted in skipped_count.
    """
    patch_rubric = _make_single_dim_rubric(full_rubric, patch_dimension_id)
    retry_cfg = RetryConfig(max_attempts=retry_max_attempts)
    console = Console()

    to_patch = [r for r in records if not already_has_dimension(r, patch_dimension_id)]
    skipped = len(records) - len(to_patch)

    patched: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeRemainingColumn(),
        console=console,
    ) as progress:
        task = progress.add_task(f"[cyan]patching {patch_dimension_id}", total=len(to_patch))

        for record in to_patch:
            scenario_id = record["scenario_id"]
            model_id = record["candidate_model_id"]

            scenario = scenario_map.get(scenario_id)
            response = response_map.get((scenario_id, model_id))

            if scenario is None or response is None:
                failures.append({
                    "scenario_id": scenario_id,
                    "candidate_model_id": model_id,
                    "error_type": "MissingData",
                    "error": f"scenario_found={scenario is not None}, response_found={response is not None}",
                })
                progress.advance(task)
                continue

            try:
                messages = build_judge_messages(scenario=scenario, response=response, rubric=patch_rubric)

                def _call():
                    return client.chat(messages=messages, temperature=cfg.temperature, max_tokens=cfg.max_tokens)

                res = retry_with_backoff(_call, retry_cfg)
                data = _parse_judge_json(res.text)

                new_dim_score = None
                for d in data.get("dimension_scores", []):
                    if d.get("dimension_id") == patch_dimension_id:
                        new_dim_score = DimensionScore.model_validate(d)
                        break

                # Fallback: LLM returned a score but used a wrong dimension_id key
                if new_dim_score is None and data.get("dimension_scores"):
                    raw = dict(data["dimension_scores"][0])
                    raw["dimension_id"] = patch_dimension_id
                    new_dim_score = DimensionScore.model_validate(raw)

                if new_dim_score is None:
                    raise ValueError(f"Judge returned no dimension_scores for {patch_dimension_id}")

                updated = dict(record)
                updated["dimension_scores"] = list(record.get("dimension_scores", [])) + [new_dim_score.model_dump()]
                dim_map = {d["dimension_id"]: d["score"] for d in updated["dimension_scores"]}
                updated["grs_score"] = _weighted_mean(dim_map, full_rubric.aggregation.weights)

                patched.append(updated)

            except Exception as e:
                failures.append({
                    "scenario_id": scenario_id,
                    "candidate_model_id": model_id,
                    "error_type": type(e).__name__,
                    "error": str(e),
                    "traceback": traceback.format_exc(limit=3),
                })

            progress.advance(task)

    return patched, failures, skipped
