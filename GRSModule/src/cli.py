from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import json

from rich.console import Console

from seeds.load import load_obligations_yaml
from seeds.export import export_obligations_jsonl
from io_utils.manifest import write_manifest
from io_utils.checksums import sha256_file
from io_utils.jsonl import write_jsonl, read_jsonl, append_jsonl
from reports.seed_report import build_seed_report
from reports.render_report import build_render_report
from reports.perturb_report import build_perturb_report

from render.load_catalogs import load_render_inputs
from render.renderer import render_base_scenarios, RenderConfig
from render.dedup import prompt_hash

from perturb.load_catalog import load_mutation_catalog
from perturb.perturbator import apply_mutations

from validate.validator import validate_candidates, ValidateConfig
from validate.semantic import SemanticValidator, SemanticValidatorConfig
from reports.validate_report import build_validate_report

from seeds.index import ObligationIndex
from validate.enrich import enrich_with_obligations

from infer.runner import run_inference, run_inference_resumable, InferConfig
from infer.load_models import load_models_config
from infer.paths import model_output_path
from infer.stats import compute_model_stats
from infer.manifest import write_infer_manifest
from llm.mock import MockChatClient
from llm.openrouter import OpenRouterChatClient

from infer.resume import load_completed_pairs
from reports.infer_report import build_infer_report

from judge.load_rubric import load_judge_rubric
from judge.runner import run_judging, JudgeConfig, run_judging_resumable
from judge.discovery import list_response_files
from judge.join import build_pairs
from judge.resume import load_completed_judgements
from judge.stats import compute_judge_stats
from judge.manifest import write_judge_manifest
from reports.judge_report import build_judge_report

from leaderboard.aggregate import aggregate_from_judge_scores
from leaderboard.discovery import list_judge_score_files
from leaderboard.export import write_leaderboard_json, write_leaderboard_csv


console = Console()


def _cmd_generate(args: argparse.Namespace) -> int:
    dataset_root = Path(args.out_dir) / args.dataset_version
    intermediate_dir = dataset_root / "intermediate"
    final_dir = dataset_root / "final"

    obligations_path = Path(args.obligations)

    obligations_out = intermediate_dir / "behavioral_obligations.jsonl"
    manifest_path = final_dir / "manifest.json"
    report_path = final_dir / "sampling_report.json"

    if args.stage == "seeds":
        obligations_version, obligations = load_obligations_yaml(obligations_path)
        export_obligations_jsonl(obligations_out, obligations)

        report = build_seed_report(obligations_version=obligations_version, obligations=obligations)
        report["generated_at"] = datetime.now(timezone.utc).isoformat()
        report["dataset_version"] = args.dataset_version
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

        manifest = {
            "dataset_version": args.dataset_version,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "stage": "seeds",
            "inputs": {
                "obligations_yaml": str(obligations_path),
                "obligations_yaml_sha256": sha256_file(obligations_path),
            },
            "outputs": {
                "behavioral_obligations_jsonl": str(obligations_out),
                "behavioral_obligations_jsonl_sha256": sha256_file(obligations_out),
                "sampling_report_json": str(report_path),
                "sampling_report_json_sha256": sha256_file(report_path),
            },
            "counts": {
                "obligations": len(obligations),
            },
        }
        write_manifest(manifest_path, manifest)

        console.print("[bold green]Seed layer complete.[/bold green]")
        console.print(f"- obligations_version: {obligations_version}")
        console.print(f"- obligations_count: {len(obligations)}")
        console.print(f"- wrote: {obligations_out}")
        console.print(f"- wrote: {report_path}")
        console.print(f"- wrote: {manifest_path}")
        return 0

    if args.stage == "render":
        obligations_version, obligations = load_obligations_yaml(obligations_path)

        inputs = load_render_inputs(config_dir=Path("configs"))
        base_scenarios = render_base_scenarios(
            obligations=obligations,
            inputs=inputs,
            cfg=RenderConfig(seed=int(args.seed), per_obligation=int(args.per_obligation)),
        )

        seen: set[str] = set()
        deduped: list[dict] = []

        for s in base_scenarios:
            h = prompt_hash(s["prompt"])
            s["prompt_hash"] = h
            if h in seen:
                continue
            seen.add(h)
            deduped.append(s)

        out_path = intermediate_dir / "base_scenarios.jsonl"
        raw_out = intermediate_dir / "base_scenarios.jsonl"
        dedup_out = intermediate_dir / "base_scenarios_deduped.jsonl"
        write_jsonl(out_path, base_scenarios)
        write_jsonl(raw_out, base_scenarios)
        write_jsonl(dedup_out, deduped)

        report = build_render_report(
            obligations_version=obligations_version,
            base_scenarios=base_scenarios,
            deduped_scenarios=deduped,
        )
        report["generated_at"] = datetime.now(timezone.utc).isoformat()
        report["dataset_version"] = args.dataset_version
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

        manifest = {
            "dataset_version": args.dataset_version,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "stage": "render",
            "inputs": {
                "obligations_yaml": str(obligations_path),
                "obligations_yaml_sha256": sha256_file(obligations_path),
                "seed": int(args.seed),
                "per_obligation": int(args.per_obligation),
            },
            "outputs": {
                "base_scenarios_jsonl": str(raw_out),
                "base_scenarios_jsonl_sha256": sha256_file(raw_out),
                "base_scenarios_deduped_jsonl": str(dedup_out),
                "base_scenarios_deduped_jsonl_sha256": sha256_file(dedup_out),
                "sampling_report_json": str(report_path),
                "sampling_report_json_sha256": sha256_file(report_path),
            },
            "counts": {
                "base_scenarios_raw": len(base_scenarios),
                "base_scenarios_deduped": len(deduped),
            },
        }
        write_manifest(manifest_path, manifest)

        console.print("[bold green]Render layer complete.[/bold green]")
        console.print(f"- base_scenarios_raw: {len(base_scenarios)}")
        console.print(f"- base_scenarios_deduped: {len(deduped)}")
        console.print(f"- wrote: {raw_out}")
        console.print(f"- wrote: {dedup_out}")
        console.print(f"- wrote: {report_path}")
        console.print(f"- wrote: {manifest_path}")

        return 0

    if args.stage == "perturb":
        # read deduped base scenarios
        base_in = intermediate_dir / "base_scenarios_deduped.jsonl"
        if not base_in.exists():
            console.print(f"[red]Missing input:[/red] {base_in} (run --stage render first)")
            return 2

        base_scenarios = list(read_jsonl(base_in))
        catalog = load_mutation_catalog(Path(args.mutations))

        mutated = apply_mutations(
            base_scenarios=base_scenarios,
            catalog=catalog,
            seed=int(args.seed),
            k_per_base=int(args.k_per_base),
            coverage=args.coverage,
        )

        out_path = intermediate_dir / "mutated_candidates.jsonl"
        write_jsonl(out_path, mutated)

        # Report
        report = build_perturb_report(
            mutation_catalog_version=catalog.version,
            mutated_candidates=mutated,
        )
        report["generated_at"] = datetime.now(timezone.utc).isoformat()
        report["dataset_version"] = args.dataset_version
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

        # Manifest
        manifest = {
            "dataset_version": args.dataset_version,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "stage": "perturb",
            "inputs": {
                "base_scenarios_deduped_jsonl": str(base_in),
                "base_scenarios_deduped_jsonl_sha256": sha256_file(base_in),
                "mutations_yaml": str(Path(args.mutations)),
                "mutations_yaml_sha256": sha256_file(Path(args.mutations)),
                "seed": int(args.seed),
                "k_per_base": int(args.k_per_base),
                "coverage": args.coverage,
            },
            "outputs": {
                "mutated_candidates_jsonl": str(out_path),
                "mutated_candidates_jsonl_sha256": sha256_file(out_path),
                "sampling_report_json": str(report_path),
                "sampling_report_json_sha256": sha256_file(report_path),
            },
            "counts": {
                "base_scenarios_in": len(base_scenarios),
                "mutated_candidates": len(mutated),
            },
        }
        write_manifest(manifest_path, manifest)

        console.print("[bold green]Perturbation layer complete.[/bold green]")
        console.print(f"- base_scenarios_in: {len(base_scenarios)}")
        console.print(f"- mutated_candidates: {len(mutated)}")
        console.print(f"- coverage: {args.coverage}")
        console.print(f"- wrote: {out_path}")
        console.print(f"- wrote: {report_path}")
        console.print(f"- wrote: {manifest_path}")

        return 0
    
    if args.stage == "validate":
        obligations_version, obligations = load_obligations_yaml(Path(args.obligations))
        ob_index = ObligationIndex.from_list(obligations)

        cand_in = intermediate_dir / "mutated_candidates.jsonl"
        if not cand_in.exists():
            console.print(f"[red]Missing input:[/red] {cand_in} (run --stage perturb first)")
            return 2

        candidates = list(read_jsonl(cand_in))
        sem_client = (
            MockChatClient()
            if args.provider == "mock"
            else OpenRouterChatClient(model_id=args.validator_model_id)
        )
        sem_validator = SemanticValidator(sem_client, SemanticValidatorConfig())
        accepted, rejections = validate_candidates(
            candidates=candidates,
            cfg=ValidateConfig(),
            semantic_validator=sem_validator,
        )

        accepted = enrich_with_obligations(
            scenarios=accepted,
            ob_index=ob_index,
            inject_constraints_into_prompt=bool(args.inject_constraints_into_prompt),
        )

        rej_out = intermediate_dir / "rejections.jsonl"
        scenarios_out = final_dir / "scenarios.jsonl"
        validate_report_path = final_dir / "validate_report.json"
        write_jsonl(rej_out, rejections)
        write_jsonl(scenarios_out, accepted)

        report = build_validate_report(accepted=accepted, rejections=rejections)
        report["generated_at"] = datetime.now(timezone.utc).isoformat()
        report["dataset_version"] = args.dataset_version
        validate_report_path.parent.mkdir(parents=True, exist_ok=True)
        validate_report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

        manifest = {
            "dataset_version": args.dataset_version,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "stage": "validate",
            "inputs": {
                "mutated_candidates_jsonl": str(cand_in),
                "mutated_candidates_jsonl_sha256": sha256_file(cand_in),
                "obligations_yaml": str(Path(args.obligations)),
                "obligations_yaml_sha256": sha256_file(Path(args.obligations)),
                "obligations_version": obligations_version,
                "inject_constraints_into_prompt": bool(args.inject_constraints_into_prompt),
            },
            "outputs": {
                "rejections_jsonl": str(rej_out),
                "rejections_jsonl_sha256": sha256_file(rej_out),
                "scenarios_jsonl": str(scenarios_out),
                "scenarios_jsonl_sha256": sha256_file(scenarios_out),
                "validate_report_json": str(validate_report_path),
                "validate_report_json_sha256": sha256_file(validate_report_path),
            },
            "counts": {
                "candidates_in": len(candidates),
                "accepted": len(accepted),
                "rejected": len(rejections),
            },
        }
        write_manifest(manifest_path, manifest)

        console.print("[bold green]Validation gate complete.[/bold green]")
        console.print(f"- candidates_in: {len(candidates)}")
        console.print(f"- accepted: {len(accepted)}")
        console.print(f"- rejected: {len(rejections)}")
        console.print(f"- wrote: {scenarios_out}")
        console.print(f"- wrote: {rej_out}")
        console.print(f"- wrote: {validate_report_path}")
        console.print(f"- wrote: {manifest_path}")
        return 0

    if args.stage == "infer":
        scenarios_in = final_dir / "scenarios.jsonl"
        infer_report_path = final_dir / "infer_report.json"
        infer_manifest_path = final_dir / "infer_manifest.json"

        if not scenarios_in.exists():
            console.print(f"[red]Missing input:[/red] {scenarios_in}")
            return 2

        scenarios = list(read_jsonl(scenarios_in))

        if args.limit is not None:
            scenarios = scenarios[:args.limit]
            console.print(f"[yellow]Limiting to {len(scenarios)} scenario(s)[/yellow]")

        if args.models_config:
            cfg_file = Path(args.models_config)
            models_cfg = load_models_config(cfg_file)

            per_model_stats = []
            outputs = []

            for spec in models_cfg.models:
                if spec.provider != "openrouter":
                    console.print(f"[yellow]Skipping unsupported provider in v0.1:[/yellow] {spec.provider}")
                    continue

                out_path = model_output_path(final_dir, spec.model_id)
                fail_path = out_path.with_suffix(out_path.suffix + ".failures.jsonl")

                skip = set()
                if args.resume:
                    skip = load_completed_pairs(out_path)

                client = OpenRouterChatClient(model_id=spec.model_id)
                successes, failures = run_inference_resumable(
                    scenarios=scenarios,
                    client=client,
                    cfg=InferConfig(
                        model_id=spec.model_id,
                        provider=spec.provider,
                        temperature=float(args.temperature),
                        max_tokens=int(args.max_tokens),
                        retry_max_attempts=int(args.retry_max_attempts),
                    ),
                    skip_pairs=skip,
                )

                if args.resume:
                    append_jsonl(out_path, successes)
                    append_jsonl(fail_path, failures)
                else:
                    write_jsonl(out_path, successes)
                    write_jsonl(fail_path, failures)

                stats = compute_model_stats(out_path, fail_path)
                stats["model_id"] = spec.model_id
                per_model_stats.append(stats)

                outputs.append({
                    "model_id": spec.model_id,
                    "success_path": str(out_path),
                    "success_sha256": sha256_file(out_path) if out_path.exists() else None,
                    "failure_path": str(fail_path),
                    "failure_sha256": sha256_file(fail_path) if fail_path.exists() else None,
                })

                console.print(f"[green]Done:[/green] {spec.model_id} -> {out_path}")
                console.print(f"[yellow]- skipped: {len(skip)}[/yellow]")
                console.print(f"[green]- successes: {len(successes)}[/green]")
                console.print(f"[red]- failures: {len(failures)}[/red]")

            models_list = [{"model_id": s.model_id, "provider": s.provider} for s in models_cfg.models]
            report = build_infer_report(
                models=models_list,
                per_model_stats=per_model_stats,
                total_scenarios=len(scenarios),
            )
            report["generated_at"] = datetime.now(timezone.utc).isoformat()
            report["dataset_version"] = args.dataset_version
            infer_report_path.parent.mkdir(parents=True, exist_ok=True)
            infer_report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

            write_infer_manifest(
                out_path=infer_manifest_path,
                dataset_version=args.dataset_version,
                scenarios_path=scenarios_in,
                models_config_path=cfg_file,
                temperature=float(args.temperature),
                max_tokens=int(args.max_tokens),
                retry_max_attempts=int(args.retry_max_attempts),
                resume=bool(args.resume),
                outputs=outputs,
            )

            console.print(f"- wrote: {infer_report_path}")
            console.print(f"- wrote: {infer_manifest_path}")

            return 0

        if args.provider == "openrouter":
            client = OpenRouterChatClient(model_id=args.model_id)
        else:
            client = MockChatClient(model_id=args.model_id, provider=args.provider)

        cfg = InferConfig(
            model_id=args.model_id,
            provider=args.provider,
            temperature=float(args.temperature),
            max_tokens=int(args.max_tokens),
        )

        responses = run_inference(
            scenarios=scenarios,
            client=client,
            cfg=cfg,
        )

        out_path = final_dir / "candidate_responses.jsonl"
        write_jsonl(out_path, responses)

        console.print("[bold green]Inference complete.[/bold green]")
        console.print(f"- provider: {args.provider}")
        console.print(f"- model_id: {args.model_id}")
        console.print(f"- scenarios_in: {len(scenarios)}")
        console.print(f"- responses_out: {len(responses)}")
        console.print(f"- wrote: {out_path}")
        return 0

    if args.stage == "judge":
        scenarios_path = final_dir / "scenarios.jsonl"
        judge_report_path = final_dir / "judge_report.json"
        judge_manifest_path = final_dir / "judge_manifest.json"

        if not scenarios_path.exists():
            console.print(f"[red]Missing input:[/red] {scenarios_path} (run --stage validate first)")
            return 2

        scenarios = list(read_jsonl(scenarios_path))
        if args.judge_limit is not None:
            scenarios = scenarios[: int(args.judge_limit)]

        rubric = load_judge_rubric(Path(args.judge_rubric))

        # judge client (OpenRouter)
        judge_client = OpenRouterChatClient(model_id=args.judge_model_id)

        responses_dir = Path(args.responses_dir) if args.responses_dir else (final_dir / "responses")
        out_dir = Path(args.judge_out_dir) if args.judge_out_dir else (final_dir / "judge_scores")
        out_dir.mkdir(parents=True, exist_ok=True)

        resp_files = list_response_files(responses_dir)
        if not resp_files:
            console.print(f"[red]No response files found in:[/red] {responses_dir}")
            return 2

        outputs = []
        for rf in resp_files:
            responses = list(read_jsonl(rf))
            pairs = build_pairs(scenarios=scenarios, responses=responses)

            if not pairs:
                console.print(f"[yellow]No joinable pairs for:[/yellow] {rf.name}")
                continue

            out_path = out_dir / rf.name
            fail_path = out_dir / (rf.name + ".failures.jsonl")

            skip = set()
            if args.judge_resume:
                skip = load_completed_judgements(out_path)

            cfg = JudgeConfig(
                judge_model_id=args.judge_model_id,
                judge_provider="openrouter",
                temperature=float(args.judge_temperature),
                max_tokens=int(args.judge_max_tokens),
            )

            scores, failures, skipped = run_judging_resumable(
                pairs=pairs,
                client=judge_client,
                rubric=rubric,
                cfg=cfg,
                skip_keys=skip,
                retry_max_attempts=int(args.judge_retry_max_attempts),
            )

            if args.judge_resume:
                append_jsonl(out_path, scores)
                append_jsonl(fail_path, failures)
            else:
                write_jsonl(out_path, scores)
                write_jsonl(fail_path, failures)

            outputs.append({
                "candidate_response_file": rf.name,
                "judge_scores_path": str(out_path),
                "judge_scores_sha256": sha256_file(out_path) if out_path.exists() else None,
                "judge_failures_path": str(fail_path),
                "judge_failures_sha256": sha256_file(fail_path) if fail_path.exists() else None,
            })

            console.print("[bold green]Judging complete.[/bold green]")
            console.print(f"- candidate_file: {rf.name}")
            console.print(f"- pairs_total: {len(pairs)}")
            console.print(f"- skipped: {skipped}")
            console.print(f"- scored: {len(scores)}")
            console.print(f"- failed: {len(failures)}")
            console.print(f"- wrote: {out_path}")
            console.print(f"- wrote: {fail_path}")
        
        per_candidate = []
        for o in outputs:
            sp = Path(o["judge_scores_path"])
            fp = Path(o["judge_failures_path"])
            stats = compute_judge_stats(sp, fp)
            stats["candidate_response_file"] = o["candidate_response_file"]
            per_candidate.append(stats)

        report = build_judge_report(
            judge_model_id=args.judge_model_id,
            rubric_version=rubric.version,
            per_candidate=per_candidate,
        )
        report["generated_at"] = datetime.now(timezone.utc).isoformat()
        report["dataset_version"] = args.dataset_version
        judge_report_path.parent.mkdir(parents=True, exist_ok=True)
        judge_report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

        write_judge_manifest(
            out_path=judge_manifest_path,
            dataset_version=args.dataset_version,
            scenarios_path=scenarios_path,
            responses_dir=responses_dir,
            judge_out_dir=out_dir,
            judge_model_id=args.judge_model_id,
            judge_rubric_path=Path(args.judge_rubric),
            judge_temperature=float(args.judge_temperature),
            judge_max_tokens=int(args.judge_max_tokens),
            judge_retry_max_attempts=int(args.judge_retry_max_attempts),
            judge_resume=bool(args.judge_resume),
            outputs=outputs,
        )

        console.print(f"[bold green]Wrote judge report:[/bold green] {judge_report_path}")
        console.print(f"[bold green]Wrote judge manifest:[/bold green] {judge_manifest_path}")

        return 0

    if args.stage == "leaderboard":
        scenarios_path = final_dir / "scenarios.jsonl"
        if not scenarios_path.exists():
            console.print(f"[red]Missing input:[/red] {scenarios_path}")
            return 2

        js_dir = Path(args.judge_scores_dir) if args.judge_scores_dir else (final_dir / "judge_scores")
        files = list_judge_score_files(js_dir)
        if not files:
            console.print(f"[red]No judge score files found in:[/red] {js_dir}")
            return 2

        agg = aggregate_from_judge_scores(scenarios_path=scenarios_path, judge_scores_paths=files)

        out_dir = Path(args.leaderboard_out_dir) if args.leaderboard_out_dir else final_dir
        out_json = out_dir / "leaderboard.json"
        out_csv = out_dir / "leaderboard.csv"

        write_leaderboard_json(out_json, agg)
        write_leaderboard_csv(out_csv, agg["rows"])

        console.print("[bold green]Leaderboard aggregation complete.[/bold green]")
        console.print(f"- judge_files: {len(files)}")
        console.print(f"- wrote: {out_json}")
        console.print(f"- wrote: {out_csv}")
        return 0


    console.print(f"[red]Unsupported stage:[/red] {args.stage}")
    return 2


def main() -> None:
    parser = argparse.ArgumentParser(prog="grs-scenarios")
    sub = parser.add_subparsers(dest="cmd", required=True)

    gen = sub.add_parser("generate", help="Generate artifacts for the scenario pipeline")
    gen.add_argument("--stage", choices=["seeds", "render", "perturb", "validate", "infer", "judge", "leaderboard"], required=True)
    gen.add_argument("--seed", default="42")
    gen.add_argument("--per-obligation", default="2")
    gen.add_argument("--mutations", default="configs/mutations.yaml")
    gen.add_argument("--k-per-base", default="3")
    gen.add_argument("--coverage", choices=["random", "per_family"], default="random")
    gen.add_argument("--inject-constraints-into-prompt", action="store_true")
    gen.add_argument("--model-id", default="mock-model")
    gen.add_argument("--provider", default="mock")
    gen.add_argument("--validator-model-id", default="openai/gpt-4o-mini")
    gen.add_argument("--temperature", default="0.2")
    gen.add_argument("--max-tokens", default="2048")
    gen.add_argument("--limit", type=int, default=None, help="Max number of scenarios to run inference on")
    gen.add_argument("--resume", action="store_true")
    gen.add_argument("--retry-max-attempts", default="5")
    gen.add_argument("--judge-model-id", default="openai/gpt-4o-mini")
    gen.add_argument("--judge-rubric", default="configs/judge_rubric.yaml")
    gen.add_argument("--responses-dir", default=None)  # default: <final_dir>/responses
    gen.add_argument("--judge-out-dir", default=None)  # default: <final_dir>/judge_scores
    gen.add_argument("--judge-temperature", default="0.0")
    gen.add_argument("--judge-max-tokens", default="800")
    gen.add_argument("--judge-limit", default=None)  # optional: limit scenarios for smoke tests
    gen.add_argument("--judge-resume", action="store_true")
    gen.add_argument("--judge-retry-max-attempts", default="5")
    gen.add_argument("--judge-scores-dir", default=None)
    gen.add_argument("--leaderboard-out-dir", default=None)
    gen.add_argument("--models-config", default=None)
    gen.add_argument("--dataset-version", default="grs_scenarios_v0.1")
    gen.add_argument("--obligations", default="configs/obligations.yaml")
    gen.add_argument("--out-dir", default="datasets")
    gen.set_defaults(func=_cmd_generate)

    args = parser.parse_args()
    rc = args.func(args)
    raise SystemExit(rc)
