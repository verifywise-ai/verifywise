#!/usr/bin/env python3
"""
VerifyWise CI/CD Evaluation Runner

Standalone script that creates an LLM evaluation experiment via the
VerifyWise API, polls for completion, and outputs results.
Designed to run in GitHub Actions or any CI/CD pipeline.

Exit codes:
  0 — all metrics passed
  1 — one or more metrics failed thresholds
  2 — error (timeout, API failure, etc.)
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required. Install with: pip install requests")
    sys.exit(2)

INVERTED_KEYWORDS = ("bias", "toxicity", "hallucination", "conversationsafety")
EM_DASH = "\u2014"
CHECK = "\u2705"
CROSS = "\u274C"
UP = "\u25B2"
DOWN = "\u25BC"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="VerifyWise CI/CD Evaluation Runner")
    p.add_argument("--api-url", default=os.getenv("VW_API_URL", ""), help="VerifyWise API base URL")
    p.add_argument("--token", default=os.getenv("VW_API_TOKEN", ""), help="JWT or API token")
    p.add_argument("--project-id", default=os.getenv("VW_PROJECT_ID", ""), help="Project ID")
    p.add_argument("--dataset-id", default=os.getenv("VW_DATASET_ID", ""), help="Dataset ID")
    p.add_argument("--metrics", default=os.getenv("VW_METRICS", ""), help="Comma-separated metrics")
    p.add_argument("--model-name", default=os.getenv("VW_MODEL_NAME", ""), help="Model to evaluate")
    p.add_argument("--model-provider", default=os.getenv("VW_MODEL_PROVIDER", "openai"), help="Model provider")
    p.add_argument("--judge-model", default=os.getenv("VW_JUDGE_MODEL", "gpt-4o"), help="Judge model")
    p.add_argument("--judge-provider", default=os.getenv("VW_JUDGE_PROVIDER", "openai"), help="Judge provider")
    p.add_argument("--threshold", type=float, default=float(os.getenv("VW_THRESHOLD", "0.7")), help="Pass threshold (0-1)")
    p.add_argument("--timeout", type=int, default=int(os.getenv("VW_TIMEOUT_MINUTES", "30")), help="Timeout in minutes")
    p.add_argument("--poll-interval", type=int, default=int(os.getenv("VW_POLL_INTERVAL", "15")), help="Poll interval in seconds")
    p.add_argument("--name", default=os.getenv("VW_EXPERIMENT_NAME", ""), help="Experiment name")
    p.add_argument("--output", default="results.json", help="Output JSON file path")
    p.add_argument("--markdown-output", default="summary.md", help="Output markdown summary path")
    return p.parse_args()


def api_headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def resolve_dataset(base_url: str, token: str, dataset_id: str) -> Dict[str, Any]:
    """Fetch dataset metadata to get the file path needed by the evaluation runner."""
    url = f"{base_url}/api/deepeval/datasets/user"
    resp = requests.get(url, headers=api_headers(token), timeout=15)
    resp.raise_for_status()
    datasets = resp.json()
    if isinstance(datasets, dict):
        datasets = datasets.get("datasets", [])
    for ds in datasets:
        if str(ds.get("id")) == str(dataset_id):
            return ds
    raise RuntimeError(f"Dataset {dataset_id} not found. Available: {[d.get('id') for d in datasets]}")


def create_experiment(
    base_url: str,
    token: str,
    project_id: str,
    dataset_id: str,
    metrics: List[str],
    model_name: str,
    model_provider: str,
    judge_model: str,
    judge_provider: str,
    threshold: float,
    name: str,
) -> Dict[str, Any]:
    url = f"{base_url}/api/deepeval/experiments"
    model_api_key = os.getenv("LLM_API_KEY", "")
    judge_api_key = os.getenv("JUDGE_API_KEY", "") or model_api_key

    metric_configs = []
    for m in metrics:
        m = m.strip()
        if m:
            metric_configs.append({"name": m, "threshold": threshold})

    dataset_info = resolve_dataset(base_url, token, dataset_id)
    dataset_path = dataset_info.get("path", "")
    dataset_name = dataset_info.get("name", f"dataset-{dataset_id}")
    print(f"Resolved dataset '{dataset_name}' -> {dataset_path}")

    now = datetime.now(tz=timezone.utc)
    experiment_name = name or f"CI Eval -- {now.strftime('%Y-%m-%d %H:%M')}"

    payload = {
        "project_id": project_id,
        "name": experiment_name,
        "description": "Automated CI/CD evaluation via GitHub Actions",
        "config": {
            "evaluationMode": "standard",
            "model": {
                "name": model_name,
                "model_name": model_name,
                "provider": model_provider,
                "apiKey": model_api_key if model_provider != "self-hosted" else "",
            },
            "dataset": {
                "id": dataset_id,
                "name": dataset_name,
                "path": dataset_path,
            },
            "metrics": metric_configs,
            "metric_thresholds": {m["name"]: m["threshold"] for m in metric_configs},
            "judgeLlm": {
                "provider": judge_provider,
                "model": judge_model,
                "apiKey": judge_api_key,
            },
        },
    }

    print(f"Creating experiment '{experiment_name}'...")
    resp = requests.post(url, json=payload, headers=api_headers(token), timeout=30)
    resp.raise_for_status()
    data = resp.json()
    exp_id = data.get("experiment", {}).get("id") or data.get("id")
    if not exp_id:
        raise RuntimeError(f"No experiment ID in response: {data}")
    print(f"Experiment created: {exp_id}")
    return {"id": exp_id, "data": data}


def poll_experiment(
    base_url: str,
    token: str,
    experiment_id: str,
    timeout_minutes: int,
    poll_interval: int,
) -> Dict[str, Any]:
    url = f"{base_url}/api/deepeval/experiments/{experiment_id}"
    deadline = time.time() + timeout_minutes * 60
    last_status = ""

    while time.time() < deadline:
        try:
            resp = requests.get(url, headers=api_headers(token), timeout=30)
            resp.raise_for_status()
            data = resp.json()
            exp = data.get("experiment", data)
            status = exp.get("status", "unknown")

            if status != last_status:
                print(f"Status: {status}")
                last_status = status

            if status in ("completed", "failed"):
                return exp

        except requests.RequestException as e:
            print(f"Poll error (will retry): {e}")

        time.sleep(poll_interval)

    raise TimeoutError(f"Experiment did not complete within {timeout_minutes} minutes")


def fetch_logs(
    base_url: str,
    token: str,
    experiment_id: str,
) -> List[Dict[str, Any]]:
    """Fetch per-prompt logs for an experiment (contains actual model responses)."""
    url = f"{base_url}/api/deepeval/logs"
    try:
        resp = requests.get(
            url,
            headers=api_headers(token),
            params={"experiment_id": experiment_id, "limit": 100},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("logs", [])
    except Exception as e:
        print(f"Warning: could not fetch logs: {e}")
        return []


def fetch_baseline(
    base_url: str,
    token: str,
    project_id: str,
    current_experiment_id: str,
) -> Optional[Dict[str, float]]:
    """Fetch avg_scores from the most recent completed experiment before this one."""
    url = f"{base_url}/api/deepeval/experiments"
    try:
        resp = requests.get(
            url,
            headers=api_headers(token),
            params={"project_id": project_id, "status": "completed", "limit": 5},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        experiments = data.get("experiments", [])

        for exp in experiments:
            if exp.get("id") == current_experiment_id:
                continue
            results = exp.get("results", {})
            if isinstance(results, str):
                results = json.loads(results)
            scores = results.get("avg_scores", {})
            if scores:
                print(f"Baseline: {exp.get('name', exp.get('id'))} ({len(scores)} metrics)")
                return scores
        return None
    except Exception as e:
        print(f"Warning: could not fetch baseline: {e}")
        return None


def is_inverted(name: str) -> bool:
    return any(k in name.lower() for k in INVERTED_KEYWORDS)


def parse_results(
    experiment: Dict[str, Any],
    threshold: float,
    logs: List[Dict[str, Any]],
    baseline: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    results = experiment.get("results", {})
    if isinstance(results, str):
        results = json.loads(results)

    avg_scores = results.get("avg_scores", {})
    metric_thresholds_raw = results.get("metric_thresholds", {})
    detailed_results = results.get("detailed_results", [])

    config = experiment.get("config", {})
    if isinstance(config, str):
        config = json.loads(config)

    metrics_out = []
    all_passed = True

    for name, score in avg_scores.items():
        score = float(score)
        mt = metric_thresholds_raw.get(name)
        mt = float(mt) if mt is not None else threshold
        inverted = is_inverted(name)
        passed = (score <= mt) if inverted else (score >= mt)
        if not passed:
            all_passed = False

        delta = None
        if baseline:
            prev = _find_baseline_score(name, baseline)
            if prev is not None:
                delta = score - prev

        metrics_out.append({
            "name": name,
            "score": score,
            "threshold": mt,
            "passed": passed,
            "inverted": inverted,
            "delta": delta,
        })

    sorted_logs = list(reversed(logs))

    samples = []
    for i, sample in enumerate(detailed_results):
        log = sorted_logs[i] if i < len(sorted_logs) else {}

        input_text = sample.get("input", "") or log.get("input_text", "")
        output_text = sample.get("output", "") or log.get("output_text", "")
        expected_text = sample.get("expected", "")

        sample_entry = {
            "index": i + 1,
            "input": input_text,
            "output": output_text,
            "expected": expected_text,
            "metric_scores": {},
        }
        raw_scores = sample.get("metric_scores", {})
        for metric_name, metric_data in raw_scores.items():
            if isinstance(metric_data, dict):
                sample_entry["metric_scores"][metric_name] = {
                    "score": metric_data.get("score"),
                    "passed": metric_data.get("passed"),
                    "explanation": metric_data.get("reason", ""),
                }
            else:
                sample_entry["metric_scores"][metric_name] = {
                    "score": metric_data,
                    "passed": None,
                    "explanation": "",
                }
        samples.append(sample_entry)

    if not detailed_results and sorted_logs:
        for i, log in enumerate(sorted_logs):
            samples.append({
                "index": i + 1,
                "input": log.get("input_text", ""),
                "output": log.get("output_text", ""),
                "expected": "",
                "metric_scores": {},
            })

    judge_cfg = config.get("judgeLlm", {})
    judge_name = judge_cfg.get("model", "") or judge_cfg.get("name", "")

    return {
        "experiment_id": experiment.get("id", ""),
        "name": experiment.get("name", ""),
        "status": experiment.get("status", "unknown"),
        "model": config.get("model", {}).get("name", "Unknown"),
        "judge": judge_name,
        "total_prompts": results.get("total_prompts", 0),
        "duration_ms": results.get("duration"),
        "passed": all_passed,
        "metrics": metrics_out,
        "samples": samples,
        "has_baseline": baseline is not None,
    }


def _find_baseline_score(name: str, baseline: Dict[str, float]) -> Optional[float]:
    """Find a metric score in the baseline, handling case/underscore differences."""
    if name in baseline:
        return float(baseline[name])
    norm = name.lower().replace("_", "")
    for k, v in baseline.items():
        if k.lower().replace("_", "") == norm:
            return float(v)
    return None


def _escape_md(text: str) -> str:
    """Prepare text for display in markdown."""
    if not text:
        return ""
    return text.replace("\n", " ").replace("|", "\\|").strip()


def _format_delta(delta: Optional[float], inverted: bool) -> str:
    if delta is None:
        return ""
    pp = delta * 100
    if abs(pp) < 0.1:
        return " (no change)"
    sign = "+" if pp > 0 else ""
    # For inverted metrics (lower=better), a positive delta is bad
    if inverted:
        arrow = DOWN if pp < 0 else UP
        color = "improvement" if pp < 0 else "regression"
    else:
        arrow = UP if pp > 0 else DOWN
        color = "improvement" if pp > 0 else "regression"
    return f" ({arrow} {sign}{pp:.1f}pp)"


def generate_markdown(results: Dict[str, Any]) -> str:
    model = results["model"]
    overall_icon = CHECK if results["passed"] else CROSS
    overall_word = "PASS" if results["passed"] else "FAIL"
    has_baseline = results.get("has_baseline", False)

    lines = [
        "## VerifyWise LLM Evaluation Results",
        "",
        f"**Experiment:** {results['name']}  ",
        f"**Model:** {model}  ",
        f"**Judge:** {results.get('judge') or 'gpt-4o'}  ",
        f"**Status:** {results['status']}  ",
        f"**Samples:** {results['total_prompts']}  ",
    ]

    if results.get("duration_ms"):
        lines.append(f"**Duration:** {results['duration_ms'] / 1000:.1f}s  ")

    lines.extend([
        "",
        f"### Overall: {overall_icon} {overall_word}",
        "",
    ])

    if has_baseline:
        lines.extend([
            "| Metric | Score | Delta | Threshold | Result |",
            "|:------:|:-----:|:-----:|:---------:|:------:|",
        ])
        for m in results["metrics"]:
            inv = " *(inverted)*" if m["inverted"] else ""
            mi = CHECK if m["passed"] else CROSS
            delta_str = _format_delta(m.get("delta"), m["inverted"])
            lines.append(
                f"| {m['name']}{inv} | {m['score']*100:.1f}% | {delta_str} | {m['threshold']*100:.0f}% | {mi} |"
            )
    else:
        lines.extend([
            "| Metric | Score | Threshold | Result |",
            "|:------:|:-----:|:---------:|:------:|",
        ])
        for m in results["metrics"]:
            inv = " *(inverted)*" if m["inverted"] else ""
            mi = CHECK if m["passed"] else CROSS
            lines.append(
                f"| {m['name']}{inv} | {m['score']*100:.1f}% | {m['threshold']*100:.0f}% | {mi} |"
            )

    # Per-sample breakdown for failing metrics
    failing_metrics = {m["name"] for m in results["metrics"] if not m["passed"]}
    samples = results.get("samples", [])

    if failing_metrics and samples:
        lines.extend(["", "---", "", "### Failure Details", ""])
        lines.append(
            "Per-sample breakdown for metrics that did not meet the threshold."
        )

        for sample in samples:
            sample_scores = sample.get("metric_scores", {})
            if not sample_scores:
                continue

            input_text = _escape_md(sample["input"]) or "*(empty)*"
            output_text = _escape_md(sample["output"]) or "*(not captured)*"
            expected_text = _escape_md(sample.get("expected", ""))

            lines.extend([
                "",
                f"#### Sample {sample['index']}",
                "",
                f"**Input:** {input_text}",
                "",
                f"**Response:** {output_text}",
            ])

            if expected_text:
                lines.extend(["", f"**Expected:** {expected_text}"])

            lines.extend([
                "",
                "| Metric | Score | Result | Explanation |",
                "|:------:|:-----:|:------:|:------------|",
            ])
            for metric_name, score_data in sample_scores.items():
                score_val = score_data.get("score")
                passed = score_data.get("passed")
                explanation = _escape_md(score_data.get("explanation", ""))

                if score_val is not None:
                    score_str = f"{score_val * 100:.1f}%" if isinstance(score_val, float) else str(score_val)
                else:
                    score_str = "N/A"

                if passed is True:
                    result_str = CHECK
                elif passed is False:
                    result_str = CROSS
                else:
                    result_str = EM_DASH

                explanation_str = explanation if explanation else EM_DASH
                lines.append(f"| {metric_name} | {score_str} | {result_str} | {explanation_str} |")

    lines.extend([
        "",
        "---",
        f"*Generated by [VerifyWise](https://verifywise.ai) at {datetime.now(tz=timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}*",
    ])

    return "\n".join(lines)


def main():
    args = parse_args()

    if not args.api_url:
        print("ERROR: --api-url or VW_API_URL required")
        sys.exit(2)
    if not args.token:
        print("ERROR: --token or VW_API_TOKEN required")
        sys.exit(2)
    if not args.project_id:
        print("ERROR: --project-id or VW_PROJECT_ID required")
        sys.exit(2)

    base_url = args.api_url.rstrip("/")
    metrics = [m.strip() for m in args.metrics.split(",") if m.strip()]

    if not metrics:
        print("ERROR: --metrics or VW_METRICS required (comma-separated)")
        sys.exit(2)

    try:
        exp = create_experiment(
            base_url=base_url,
            token=args.token,
            project_id=args.project_id,
            dataset_id=args.dataset_id,
            metrics=metrics,
            model_name=args.model_name,
            model_provider=args.model_provider,
            judge_model=args.judge_model,
            judge_provider=args.judge_provider,
            threshold=args.threshold,
            name=args.name,
        )

        experiment = poll_experiment(
            base_url=base_url,
            token=args.token,
            experiment_id=exp["id"],
            timeout_minutes=args.timeout,
            poll_interval=args.poll_interval,
        )

        if experiment.get("status") == "failed":
            error = experiment.get("error_message", "Unknown error")
            print(f"Experiment failed: {error}")
            sys.exit(2)

        logs = fetch_logs(base_url, args.token, exp["id"])
        print(f"Fetched {len(logs)} evaluation logs")

        baseline = fetch_baseline(base_url, args.token, args.project_id, exp["id"])

        results = parse_results(experiment, args.threshold, logs, baseline)

        with open(args.output, "w") as f:
            json.dump(results, f, indent=2)
        print(f"Results written to {args.output}")

        md = generate_markdown(results)
        with open(args.markdown_output, "w") as f:
            f.write(md)
        print(f"Markdown summary written to {args.markdown_output}")

        print("\n" + "=" * 50)
        passing = sum(1 for m in results["metrics"] if m["passed"])
        total = len(results["metrics"])
        print(f"Results: {passing}/{total} metrics passing")
        for m in results["metrics"]:
            icon = "PASS" if m["passed"] else "FAIL"
            delta = ""
            if m.get("delta") is not None:
                pp = m["delta"] * 100
                sign = "+" if pp > 0 else ""
                delta = f" ({sign}{pp:.1f}pp)"
            print(f"  [{icon}] {m['name']}: {m['score']*100:.1f}%{delta} (threshold: {m['threshold']*100:.0f}%)")

        if not results["passed"]:
            print("\nEvaluation FAILED -- one or more metrics below threshold")
            sys.exit(1)
        else:
            print("\nEvaluation PASSED -- all metrics within threshold")
            sys.exit(0)

    except TimeoutError as e:
        print(f"TIMEOUT: {e}")
        sys.exit(2)
    except requests.HTTPError as e:
        print(f"API ERROR: {e}")
        if e.response is not None:
            print(f"Response: {e.response.text[:500]}")
        sys.exit(2)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(2)


if __name__ == "__main__":
    main()
