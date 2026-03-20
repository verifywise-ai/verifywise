"""
Export GRS dataset JSONL files to a single denormalized Parquet file.

Each row in the output represents one (scenario, model) evaluation pair.

Usage:
    uv run python scripts/export_parquet.py [--dataset-dir datasets/grs_scenarios_v0.1]
    uv run python scripts/export_parquet.py --dataset-dir datasets/grs_scenarios_v0.1 --out datasets/grs_scenarios_v0.1/final/grs_full.parquet
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open() as f:
        return [json.loads(line) for line in f if line.strip()]


def _dim_score(dimension_scores: list[dict], dimension_id: str) -> int | None:
    for d in dimension_scores:
        if d["dimension_id"] == dimension_id:
            return d["score"]
    return None


def build_dataframe(dataset_dir: Path) -> pd.DataFrame:
    """
    Join scenarios + responses + judge_scores into a wide DataFrame.

    Args:
        dataset_dir: Root of a dataset version folder (e.g. datasets/grs_scenarios_v0.1).

    Returns:
        DataFrame with one row per (scenario_id, model_id).
    """
    final = dataset_dir / "final"

    scenarios = _read_jsonl(final / "scenarios.jsonl")
    if not scenarios:
        raise FileNotFoundError(f"No scenarios found at {final / 'scenarios.jsonl'}")

    # Index scenarios by scenario_id
    scenario_map = {s["scenario_id"]: s for s in scenarios}

    # Collect all response files
    responses_dir = final / "responses"
    response_files = sorted(responses_dir.glob("*.jsonl")) if responses_dir.exists() else []
    # Exclude failure logs
    response_files = [f for f in response_files if not f.name.endswith(".failures.jsonl")]

    # Collect all judge score files
    judge_dir = final / "judge_scores"
    judge_files = sorted(judge_dir.glob("*.jsonl")) if judge_dir.exists() else []
    judge_files = [f for f in judge_files if not f.name.endswith(".failures.jsonl")]

    # Build (scenario_id, model_id) → response lookup
    response_map: dict[tuple[str, str], dict] = {}
    for rf in response_files:
        for rec in _read_jsonl(rf):
            key = (rec["scenario_id"], rec["model_id"])
            response_map[key] = rec

    # Build (scenario_id, model_id) → judge score lookup
    judge_map: dict[tuple[str, str], dict] = {}
    for jf in judge_files:
        for rec in _read_jsonl(jf):
            key = (rec["scenario_id"], rec["candidate_model_id"])
            judge_map[key] = rec

    rows = []
    for (sid, mid), resp in response_map.items():
        scen = scenario_map.get(sid)
        if scen is None:
            continue
        judge = judge_map.get((sid, mid), {})
        dim_scores = judge.get("dimension_scores", [])
        mutation_family = None
        mutations = scen.get("mutation_trace", {}).get("mutations", [])
        if mutations:
            mutation_family = mutations[0].get("family")

        rows.append(
            {
                "scenario_id": sid,
                "version": scen.get("version"),
                "domain": scen.get("domain"),
                "industry": scen.get("industry"),
                "assistant_role": scen.get("role_context", {}).get("assistant_role"),
                "user_role": scen.get("role_context", {}).get("user_role"),
                "org_context": scen.get("role_context", {}).get("org_context"),
                "prompt": scen.get("prompt"),
                "must_constraints": scen.get("constraints", {}).get("must", []),
                "must_not_constraints": scen.get("constraints", {}).get("must_not", []),
                "risk_level": scen.get("risk_level"),
                "risk_reasons": scen.get("risk_reasons", []),
                "mutation_family": mutation_family,
                "obligation_ids": scen.get("seed_trace", {}).get("obligation_ids", []),
                "model_id": mid,
                "provider": resp.get("provider"),
                "output_text": resp.get("output_text"),
                "latency_ms": resp.get("meta", {}).get("latency_ms"),
                "grs_score": judge.get("grs_score"),
                "boundary_management_score": _dim_score(dim_scores, "boundary_management"),
                "constraint_adherence_score": _dim_score(dim_scores, "constraint_adherence"),
                "clarity_score": _dim_score(dim_scores, "clarity_and_questions"),
                "escalation_score": _dim_score(dim_scores, "escalation_and_controls"),
            }
        )

    return pd.DataFrame(rows)


def export_parquet(dataset_dir: Path, out_path: Path) -> None:
    """Build the wide DataFrame and write it to a Parquet file."""
    df = build_dataframe(dataset_dir)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_path, index=False)
    print(f"Exported {len(df)} rows → {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export GRS JSONL dataset to Parquet.")
    parser.add_argument(
        "--dataset-dir",
        default="datasets/grs_scenarios_v0.1",
        help="Path to a dataset version folder (default: datasets/grs_scenarios_v0.1)",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output Parquet path (default: <dataset-dir>/final/grs_full.parquet)",
    )
    args = parser.parse_args()

    dataset_dir = Path(args.dataset_dir)
    out_path = Path(args.out) if args.out else dataset_dir / "final" / "grs_full.parquet"
    export_parquet(dataset_dir, out_path)


if __name__ == "__main__":
    main()
