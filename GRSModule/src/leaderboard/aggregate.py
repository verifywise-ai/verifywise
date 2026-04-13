from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

from io_utils.jsonl import read_jsonl


SCORE_MAX = 4.0  # rubric scale upper bound


def _mean(values: List[float]) -> float | None:
    return round(sum(values) / len(values), 4) if values else None


def _normalize(mean: float | None) -> float | None:
    if mean is None:
        return None
    return round((mean / SCORE_MAX) * 100, 2)


def aggregate_from_judge_scores(
    *,
    scenarios_path: Path,
    judge_scores_paths: List[Path],
) -> Dict[str, Any]:
    # per candidate model accumulators
    grs_vals: dict[str, list[float]] = defaultdict(list)
    dim_vals: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    counts: dict[str, int] = defaultdict(int)
    all_dimensions: set[str] = set()

    for p in judge_scores_paths:
        for row in read_jsonl(p):
            cand = row.get("candidate_model_id")
            sid = row.get("scenario_id")
            grs = row.get("grs_score")

            if not isinstance(cand, str) or not isinstance(sid, str) or not isinstance(grs, (int, float)):
                continue

            counts[cand] += 1
            grs_vals[cand].append(float(grs))

            for d in row.get("dimension_scores", []) or []:
                dim_id = d.get("dimension_id")
                score = d.get("score")
                if isinstance(dim_id, str) and isinstance(score, (int, float)):
                    all_dimensions.add(dim_id)
                    dim_vals[cand][dim_id].append(float(score))

    # finalize rows
    rows: List[Dict[str, Any]] = []
    for cand in sorted(counts.keys()):
        mean_grs = _mean(grs_vals[cand])
        r: Dict[str, Any] = {
            "candidate_model_id": cand,
            "num_scored": counts[cand],
            "mean_grs": mean_grs,
            "grs_score_100": _normalize(mean_grs),
        }

        for dim in sorted(all_dimensions):
            mean_dim = _mean(dim_vals[cand].get(dim, []))
            r[f"mean_{dim}"] = mean_dim
            r[f"{dim}_score_100"] = _normalize(mean_dim)

        rows.append(r)

    return {
        "score_max": SCORE_MAX,
        "dimensions": sorted(all_dimensions),
        "rows": rows,
    }
