"""VerifyWise CLI — interact with the VerifyWise platform from the terminal.

Usage:
    verifywise [--api-url URL] [--token TOKEN] <command> <subcommand> [options]

Authentication is read from --api-url / --token flags or from environment
variables VW_API_URL and VW_API_TOKEN.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import textwrap
from typing import Any, Dict, List, Optional, Sequence

from . import __version__
from .client import VerifyWiseClient
from .exceptions import VerifyWiseError
from .models import EvalResults


# ── Output formatting ───────────────────────────────────────────────

def _json_out(data: Any) -> None:
    print(json.dumps(data, indent=2, default=str))


def _table(rows: List[Dict[str, Any]], columns: List[str]) -> None:
    """Print rows as an aligned table with header."""
    if not rows:
        print("(no results)")
        return

    widths = {c: len(c) for c in columns}
    str_rows: List[Dict[str, str]] = []
    for r in rows:
        sr: Dict[str, str] = {}
        for c in columns:
            val = r.get(c, "")
            s = str(val) if val is not None else ""
            if len(s) > 60:
                s = s[:57] + "..."
            sr[c] = s
            widths[c] = max(widths[c], len(s))
        str_rows.append(sr)

    header = "  ".join(c.upper().ljust(widths[c]) for c in columns)
    sep = "  ".join("─" * widths[c] for c in columns)
    print(header)
    print(sep)
    for sr in str_rows:
        print("  ".join(sr[c].ljust(widths[c]) for c in columns))


def _obj_out(data: Dict[str, Any], fields: Optional[List[str]] = None) -> None:
    """Print a single object as key: value pairs."""
    keys = fields or list(data.keys())
    width = max(len(k) for k in keys) if keys else 0
    for k in keys:
        v = data.get(k, "")
        print(f"  {k:<{width}}  {v}")


# ── Client factory ──────────────────────────────────────────────────

def _make_client(args: argparse.Namespace) -> VerifyWiseClient:
    api_url = args.api_url or os.getenv("VW_API_URL", "")
    token = args.token or os.getenv("VW_API_TOKEN", "")

    if not api_url:
        print("Error: --api-url or VW_API_URL is required.", file=sys.stderr)
        sys.exit(1)
    if not token:
        print("Error: --token or VW_API_TOKEN is required.", file=sys.stderr)
        sys.exit(1)

    return VerifyWiseClient(api_url=api_url, token=token)


def _use_json(args: argparse.Namespace) -> bool:
    return getattr(args, "json_output", False)


# ── Projects ────────────────────────────────────────────────────────

def cmd_projects_list(args: argparse.Namespace) -> None:
    client = _make_client(args)
    projects = client.projects.list()
    if _use_json(args):
        _json_out([{"id": p.id, "name": p.name, "use_case": p.use_case, "created_at": p.created_at} for p in projects])
    else:
        _table(
            [{"id": p.id, "name": p.name, "use_case": p.use_case, "created_at": p.created_at} for p in projects],
            ["id", "name", "use_case", "created_at"],
        )


def cmd_projects_get(args: argparse.Namespace) -> None:
    client = _make_client(args)
    p = client.projects.get(args.project_id)
    if _use_json(args):
        _json_out({"id": p.id, "name": p.name, "description": p.description, "use_case": p.use_case, "created_at": p.created_at})
    else:
        _obj_out({"id": p.id, "name": p.name, "description": p.description, "use_case": p.use_case, "created_at": p.created_at})


def cmd_projects_create(args: argparse.Namespace) -> None:
    client = _make_client(args)
    p = client.projects.create(args.name, description=args.description or "", use_case=args.use_case or "")
    print(f"Created project: {p.id}  {p.name}")


def cmd_projects_delete(args: argparse.Namespace) -> None:
    client = _make_client(args)
    client.projects.delete(args.project_id)
    print(f"Deleted project: {args.project_id}")


def cmd_projects_stats(args: argparse.Namespace) -> None:
    client = _make_client(args)
    stats = client.projects.stats(args.project_id)
    if _use_json(args):
        _json_out(stats)
    else:
        for k, v in stats.items():
            print(f"  {k}: {v}")


# ── Experiments ─────────────────────────────────────────────────────

def cmd_experiments_list(args: argparse.Namespace) -> None:
    client = _make_client(args)
    exps = client.experiments.list(
        project_id=args.project_id or None,
        status=args.status or None,
        limit=args.limit,
    )
    if _use_json(args):
        _json_out([{"id": e.id, "name": e.name, "status": e.status, "created_at": e.created_at} for e in exps])
    else:
        _table(
            [{"id": e.id, "name": e.name, "status": e.status, "created_at": e.created_at} for e in exps],
            ["id", "name", "status", "created_at"],
        )


def cmd_experiments_get(args: argparse.Namespace) -> None:
    client = _make_client(args)
    e = client.experiments.get(args.experiment_id)
    if _use_json(args):
        _json_out({"id": e.id, "name": e.name, "status": e.status, "config": e.config, "results": e.results, "created_at": e.created_at})
    else:
        _obj_out({
            "id": e.id, "name": e.name, "status": e.status,
            "error": e.error_message or "(none)",
            "created_at": e.created_at, "completed_at": e.completed_at or "(pending)",
        })
        if e.results and e.results.get("avg_scores"):
            print("\n  Scores:")
            for metric, score in e.results["avg_scores"].items():
                print(f"    {metric}: {float(score)*100:.1f}%")


def cmd_experiments_delete(args: argparse.Namespace) -> None:
    client = _make_client(args)
    client.experiments.delete(args.experiment_id)
    print(f"Deleted experiment: {args.experiment_id}")


def cmd_experiments_run(args: argparse.Namespace) -> None:
    client = _make_client(args)
    metrics = [m.strip() for m in args.metrics.split(",") if m.strip()]
    threshold = args.threshold

    print(f"Starting evaluation '{args.name}'...")
    print(f"  Model: {args.model_name} ({args.model_provider})")
    print(f"  Metrics: {', '.join(metrics)}")
    print(f"  Threshold: {threshold}")
    print()

    results = client.experiments.run_and_wait(
        project_id=args.project_id,
        name=args.name,
        model_name=args.model_name,
        model_provider=args.model_provider,
        dataset_id=args.dataset_id or None,
        dataset_path=args.dataset_path or None,
        metrics=metrics,
        threshold=threshold,
        judge_model=args.judge_model,
        judge_provider=args.judge_provider,
        timeout_minutes=args.timeout,
        poll_interval=args.poll_interval,
        on_status=lambda s: print(f"  Status: {s}"),
    )

    if _use_json(args):
        _json_out({
            "experiment_id": results.experiment_id,
            "passed": results.passed,
            "model": results.model,
            "total_prompts": results.total_prompts,
            "metrics": [{"name": m.name, "score": m.score, "threshold": m.threshold, "passed": m.passed, "inverted": m.inverted} for m in results.metrics],
        })
    else:
        _print_eval_results(results)

    if not results.passed:
        sys.exit(1)


def _print_eval_results(results: EvalResults) -> None:
    overall = "PASS" if results.passed else "FAIL"
    print(f"\n{'='*50}")
    print(f"  Result: {overall}")
    print(f"  Model:  {results.model}")
    if results.total_prompts:
        print(f"  Samples: {results.total_prompts}")
    print(f"{'='*50}")

    passing = sum(1 for m in results.metrics if m.passed)
    total = len(results.metrics)
    print(f"\n  Metrics: {passing}/{total} passing\n")

    for m in results.metrics:
        icon = "PASS" if m.passed else "FAIL"
        inv = " (inverted)" if m.inverted else ""
        print(f"    [{icon}] {m.name}{inv}: {m.score*100:.1f}% (threshold: {m.threshold*100:.0f}%)")
    print()


# ── Datasets ────────────────────────────────────────────────────────

def cmd_datasets_list(args: argparse.Namespace) -> None:
    client = _make_client(args)
    datasets = client.datasets.list_user()
    if _use_json(args):
        _json_out([{"id": d.id, "name": d.name, "path": d.path, "prompt_count": d.prompt_count} for d in datasets])
    else:
        _table(
            [{"id": d.id, "name": d.name, "path": d.path, "prompts": d.prompt_count} for d in datasets],
            ["id", "name", "path", "prompts"],
        )


def cmd_datasets_list_builtin(args: argparse.Namespace) -> None:
    client = _make_client(args)
    data = client.datasets.list_builtin(use_case=args.use_case or None)
    if _use_json(args):
        _json_out(data)
    else:
        if isinstance(data, list):
            for d in data:
                print(f"  {d.get('name', d.get('id', '?'))}: {d.get('description', '')}")
        else:
            _json_out(data)


def cmd_datasets_upload(args: argparse.Namespace) -> None:
    client = _make_client(args)
    result = client.datasets.upload(
        args.file, args.name,
        dataset_type=args.type, turn_type=args.turn_type,
    )
    print(f"Uploaded: {result}")


def cmd_datasets_read(args: argparse.Namespace) -> None:
    client = _make_client(args)
    prompts = client.datasets.read(args.path)
    if _use_json(args):
        _json_out(prompts)
    else:
        for i, p in enumerate(prompts[:20], 1):
            inp = str(p.get("input", ""))[:80]
            print(f"  {i:3d}. {inp}")
        if len(prompts) > 20:
            print(f"  ... and {len(prompts) - 20} more")


# ── Reports ─────────────────────────────────────────────────────────

def cmd_reports_list(args: argparse.Namespace) -> None:
    client = _make_client(args)
    reports = client.reports.list(project_id=args.project_id or None)
    if _use_json(args):
        _json_out([{"id": r.id, "title": r.title, "format": r.format, "file_size": r.file_size} for r in reports])
    else:
        _table(
            [{"id": r.id, "title": r.title, "format": r.format, "size": f"{r.file_size:,}B"} for r in reports],
            ["id", "title", "format", "size"],
        )


def cmd_reports_generate(args: argparse.Namespace) -> None:
    client = _make_client(args)
    exp_ids = [e.strip() for e in args.experiments.split(",")]
    report = client.reports.generate(
        exp_ids,
        project_id=args.project_id or "",
        title=args.title or "",
        format=args.format,
    )
    print(f"Generated report: {report.id}  ({report.format}, {report.file_size:,} bytes)")


def cmd_reports_download(args: argparse.Namespace) -> None:
    client = _make_client(args)
    path = client.reports.download_to_file(args.report_id, args.output)
    print(f"Downloaded to: {path}")


# ── Metrics ─────────────────────────────────────────────────────────

def cmd_metrics_list(args: argparse.Namespace) -> None:
    client = _make_client(args)
    metrics = client.metrics.available()
    if _use_json(args):
        _json_out(metrics)
    else:
        for m in metrics:
            ctx = " (requires context)" if m.get("requires_context") else ""
            print(f"  {m.get('name', '?')}{ctx}")


def cmd_metrics_aggregates(args: argparse.Namespace) -> None:
    client = _make_client(args)
    agg = client.metrics.aggregates(args.project_id, metric_name=args.metric or None)
    if _use_json(args):
        _json_out(agg)
    else:
        for k, v in agg.items():
            print(f"  {k}: {v}")


# ── Models ──────────────────────────────────────────────────────────

def cmd_models_list(args: argparse.Namespace) -> None:
    client = _make_client(args)
    models = client.models.list()
    if _use_json(args):
        _json_out([{"id": m.id, "name": m.name, "provider": m.provider, "model_name": m.model_name} for m in models])
    else:
        _table(
            [{"id": m.id, "name": m.name, "provider": m.provider, "model_name": m.model_name} for m in models],
            ["id", "name", "provider", "model_name"],
        )


def cmd_models_create(args: argparse.Namespace) -> None:
    client = _make_client(args)
    m = client.models.create(args.name, provider=args.provider, model_name=args.model_name)
    print(f"Created model config: {m.id}  {m.name} ({m.provider}/{m.model_name})")


def cmd_models_delete(args: argparse.Namespace) -> None:
    client = _make_client(args)
    client.models.delete(args.model_id)
    print(f"Deleted model config: {args.model_id}")


def cmd_models_validate(args: argparse.Namespace) -> None:
    client = _make_client(args)
    result = client.models.validate(args.provider, args.api_key, args.model_name or "")
    if _use_json(args):
        _json_out(result)
    else:
        valid = result.get("valid", result.get("success", False))
        print(f"  Valid: {valid}")
        if result.get("error"):
            print(f"  Error: {result['error']}")


# ── Scorers ─────────────────────────────────────────────────────────

def cmd_scorers_list(args: argparse.Namespace) -> None:
    client = _make_client(args)
    scorers = client.scorers.list()
    if _use_json(args):
        _json_out([{"id": s.id, "name": s.name, "provider": s.provider, "model": s.model} for s in scorers])
    else:
        _table(
            [{"id": s.id, "name": s.name, "provider": s.provider, "model": s.model} for s in scorers],
            ["id", "name", "provider", "model"],
        )


# ── Logs ────────────────────────────────────────────────────────────

def cmd_logs_list(args: argparse.Namespace) -> None:
    client = _make_client(args)
    logs = client.logs.list(
        project_id=args.project_id or None,
        experiment_id=args.experiment_id or None,
        limit=args.limit,
    )
    if _use_json(args):
        _json_out(logs)
    else:
        cols = ["id", "status"]
        if logs and "experiment_id" in logs[0]:
            cols.insert(1, "experiment_id")
        _table(logs[:50], cols)


# ── Config / whoami ─────────────────────────────────────────────────

def cmd_config(args: argparse.Namespace) -> None:
    api_url = args.api_url or os.getenv("VW_API_URL", "(not set)")
    token = args.token or os.getenv("VW_API_TOKEN", "")
    masked = f"{token[:8]}...{token[-4:]}" if len(token) > 12 else ("(not set)" if not token else "***")
    print(f"  API URL:  {api_url}")
    print(f"  Token:    {masked}")
    print(f"  SDK:      verifywise {__version__}")


# ── Parser construction ─────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="verifywise",
        description="VerifyWise CLI — AI governance and LLM evaluation from the terminal.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Authentication:
              Set VW_API_URL and VW_API_TOKEN environment variables, or pass
              --api-url and --token on every invocation.

            Examples:
              verifywise projects list
              verifywise experiments run --project-id abc --name "Nightly" \\
                --model-name gpt-4o-mini --model-provider openai \\
                --dataset-id 2 --metrics correctness,faithfulness
              verifywise datasets list
              verifywise metrics list
              verifywise reports generate --experiments exp1,exp2

            Documentation: https://docs.verifywise.ai
        """),
    )
    parser.add_argument("-V", "--version", action="version", version=f"verifywise {__version__}")
    parser.add_argument("--api-url", default="", help="VerifyWise API base URL (env: VW_API_URL)")
    parser.add_argument("--token", default="", help="JWT or API token (env: VW_API_TOKEN)")
    parser.add_argument("--json", dest="json_output", action="store_true", help="Output as JSON")

    subs = parser.add_subparsers(dest="command", title="Commands", metavar="<command>")

    # ── config ──
    p_config = subs.add_parser("config", help="Show current configuration")
    p_config.set_defaults(func=cmd_config)

    # ── projects ──
    p_proj = subs.add_parser("projects", help="Manage evaluation projects")
    proj_subs = p_proj.add_subparsers(dest="subcommand", title="Subcommands", metavar="<subcommand>")

    p = proj_subs.add_parser("list", help="List all projects")
    p.set_defaults(func=cmd_projects_list)

    p = proj_subs.add_parser("get", help="Get project details")
    p.add_argument("project_id", help="Project ID")
    p.set_defaults(func=cmd_projects_get)

    p = proj_subs.add_parser("create", help="Create a new project")
    p.add_argument("--name", required=True, help="Project name")
    p.add_argument("--description", default="", help="Project description")
    p.add_argument("--use-case", default="", help="Use case (chatbot, rag, agent)")
    p.set_defaults(func=cmd_projects_create)

    p = proj_subs.add_parser("delete", help="Delete a project and its experiments")
    p.add_argument("project_id", help="Project ID")
    p.set_defaults(func=cmd_projects_delete)

    p = proj_subs.add_parser("stats", help="Get project statistics")
    p.add_argument("project_id", help="Project ID")
    p.set_defaults(func=cmd_projects_stats)

    # ── experiments ──
    p_exp = subs.add_parser("experiments", help="Manage LLM evaluation experiments")
    exp_subs = p_exp.add_subparsers(dest="subcommand", title="Subcommands", metavar="<subcommand>")

    p = exp_subs.add_parser("list", help="List experiments")
    p.add_argument("--project-id", default="", help="Filter by project ID")
    p.add_argument("--status", default="", help="Filter by status (pending, running, completed, failed)")
    p.add_argument("--limit", type=int, default=50, help="Max results (default: 50)")
    p.set_defaults(func=cmd_experiments_list)

    p = exp_subs.add_parser("get", help="Get experiment details and scores")
    p.add_argument("experiment_id", help="Experiment ID")
    p.set_defaults(func=cmd_experiments_get)

    p = exp_subs.add_parser("delete", help="Delete an experiment")
    p.add_argument("experiment_id", help="Experiment ID")
    p.set_defaults(func=cmd_experiments_delete)

    p = exp_subs.add_parser("run", help="Create an evaluation, poll until done, and show results")
    p.add_argument("--project-id", required=True, help="Project ID")
    p.add_argument("--name", required=True, help="Experiment name")
    p.add_argument("--model-name", required=True, help="Model to evaluate (e.g. gpt-4o-mini)")
    p.add_argument("--model-provider", required=True, help="Provider (openai, anthropic, google, mistral, xai, self-hosted)")
    p.add_argument("--dataset-id", default="", help="Dataset ID")
    p.add_argument("--dataset-path", default="", help="Dataset file path (alternative to --dataset-id)")
    p.add_argument("--metrics", required=True, help="Comma-separated metrics (e.g. correctness,faithfulness,hallucination)")
    p.add_argument("--threshold", type=float, default=0.7, help="Pass threshold 0-1 (default: 0.7)")
    p.add_argument("--judge-model", default="gpt-4o", help="Judge LLM model (default: gpt-4o)")
    p.add_argument("--judge-provider", default="openai", help="Judge LLM provider (default: openai)")
    p.add_argument("--timeout", type=int, default=30, help="Timeout in minutes (default: 30)")
    p.add_argument("--poll-interval", type=int, default=10, help="Poll interval in seconds (default: 10)")
    p.set_defaults(func=cmd_experiments_run)

    # ── datasets ──
    p_ds = subs.add_parser("datasets", help="Manage evaluation datasets")
    ds_subs = p_ds.add_subparsers(dest="subcommand", title="Subcommands", metavar="<subcommand>")

    p = ds_subs.add_parser("list", help="List uploaded datasets")
    p.set_defaults(func=cmd_datasets_list)

    p = ds_subs.add_parser("list-builtin", help="List built-in preset datasets")
    p.add_argument("--use-case", default="", help="Filter by use case (chatbot, rag, agent)")
    p.set_defaults(func=cmd_datasets_list_builtin)

    p = ds_subs.add_parser("upload", help="Upload a JSON dataset file")
    p.add_argument("file", help="Path to JSON dataset file")
    p.add_argument("--name", required=True, help="Dataset name")
    p.add_argument("--type", default="chatbot", help="Dataset type (default: chatbot)")
    p.add_argument("--turn-type", default="single-turn", help="Turn type (default: single-turn)")
    p.set_defaults(func=cmd_datasets_upload)

    p = ds_subs.add_parser("read", help="Read dataset contents by path")
    p.add_argument("path", help="Dataset file path")
    p.set_defaults(func=cmd_datasets_read)

    # ── reports ──
    p_rpt = subs.add_parser("reports", help="Generate and download evaluation reports")
    rpt_subs = p_rpt.add_subparsers(dest="subcommand", title="Subcommands", metavar="<subcommand>")

    p = rpt_subs.add_parser("list", help="List stored reports")
    p.add_argument("--project-id", default="", help="Filter by project ID")
    p.set_defaults(func=cmd_reports_list)

    p = rpt_subs.add_parser("generate", help="Generate a report from experiments")
    p.add_argument("--experiments", required=True, help="Comma-separated experiment IDs")
    p.add_argument("--project-id", default="", help="Project ID")
    p.add_argument("--title", default="", help="Report title")
    p.add_argument("--format", default="pdf", choices=["pdf", "html"], help="Report format (default: pdf)")
    p.set_defaults(func=cmd_reports_generate)

    p = rpt_subs.add_parser("download", help="Download a report to a file")
    p.add_argument("report_id", help="Report ID")
    p.add_argument("--output", "-o", required=True, help="Output file path")
    p.set_defaults(func=cmd_reports_download)

    # ── metrics ──
    p_met = subs.add_parser("metrics", help="Query available metrics and stats")
    met_subs = p_met.add_subparsers(dest="subcommand", title="Subcommands", metavar="<subcommand>")

    p = met_subs.add_parser("list", help="List all available evaluation metrics")
    p.set_defaults(func=cmd_metrics_list)

    p = met_subs.add_parser("aggregates", help="Get aggregated metric stats for a project")
    p.add_argument("project_id", help="Project ID")
    p.add_argument("--metric", default="", help="Filter to a specific metric name")
    p.set_defaults(func=cmd_metrics_aggregates)

    # ── models ──
    p_mod = subs.add_parser("models", help="Manage saved model configurations")
    mod_subs = p_mod.add_subparsers(dest="subcommand", title="Subcommands", metavar="<subcommand>")

    p = mod_subs.add_parser("list", help="List saved model configurations")
    p.set_defaults(func=cmd_models_list)

    p = mod_subs.add_parser("create", help="Create a saved model configuration")
    p.add_argument("--name", required=True, help="Display name")
    p.add_argument("--provider", required=True, help="Provider (openai, anthropic, google, mistral, xai, self-hosted)")
    p.add_argument("--model-name", required=True, help="Model identifier (e.g. gpt-4o)")
    p.set_defaults(func=cmd_models_create)

    p = mod_subs.add_parser("delete", help="Delete a saved model configuration")
    p.add_argument("model_id", help="Model config ID")
    p.set_defaults(func=cmd_models_delete)

    p = mod_subs.add_parser("validate", help="Validate an API key for a provider")
    p.add_argument("--provider", required=True, help="Provider name")
    p.add_argument("--api-key", required=True, help="API key to validate")
    p.add_argument("--model-name", default="", help="Specific model to test against")
    p.set_defaults(func=cmd_models_validate)

    # ── scorers ──
    p_sc = subs.add_parser("scorers", help="Manage custom scorers")
    sc_subs = p_sc.add_subparsers(dest="subcommand", title="Subcommands", metavar="<subcommand>")

    p = sc_subs.add_parser("list", help="List saved scorers")
    p.set_defaults(func=cmd_scorers_list)

    # ── logs ──
    p_log = subs.add_parser("logs", help="Query evaluation log entries")
    log_subs = p_log.add_subparsers(dest="subcommand", title="Subcommands", metavar="<subcommand>")

    p = log_subs.add_parser("list", help="List evaluation logs")
    p.add_argument("--project-id", default="", help="Filter by project ID")
    p.add_argument("--experiment-id", default="", help="Filter by experiment ID")
    p.add_argument("--limit", type=int, default=50, help="Max results (default: 50)")
    p.set_defaults(func=cmd_logs_list)

    return parser


# ── Entrypoint ──────────────────────────────────────────────────────

def main(argv: Optional[Sequence[str]] = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if not args.command:
        parser.print_help()
        sys.exit(0)

    func = getattr(args, "func", None)
    if not func:
        # Subcommand level — print help for that command
        # Walk the parser tree to find the right subparser
        for action in parser._subparsers._actions:
            if isinstance(action, argparse._SubParsersAction):
                subparser = action.choices.get(args.command)
                if subparser:
                    subparser.print_help()
                    break
        sys.exit(0)

    try:
        func(args)
    except VerifyWiseError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nAborted.", file=sys.stderr)
        sys.exit(130)


if __name__ == "__main__":
    main()
