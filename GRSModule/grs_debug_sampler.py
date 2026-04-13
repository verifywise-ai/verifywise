#!/usr/bin/env python3
"""GRS Debug Sampler — produce a small reproducible scenario subset for smoke-testing."""

import argparse
import datetime
import hashlib
import json
import logging
import os
import random
import sys

# ── Constants ──────────────────────────────────────────────────────────────────
VALID_SOURCES = {"gpt", "gemini", "claude"}
VALID_SCENARIO_TYPES = {"base", "mutated"}
VALID_DIMENSIONS = {"authority", "constraint", "ambiguity", "risk", "accountability"}
VALID_MUTATION_TYPES = {"urgency", "ambiguity", "authority", "language"}
REQUIRED_FIELDS = frozenset({
    "scenario_id", "obligation_id", "source", "scenario_type",
    "primary_dimension", "mutation_type", "prompt",
})

# ── Pipeline schema → sampler schema mapping ───────────────────────────────────
_FAMILY_TO_MUTATION_TYPE: dict = {
    "ambiguity_pressure": "ambiguity",
    "authority_pressure": "authority",
    "bypass_request":     "authority",
    "language_nuance":    "language",
    "urgency_pressure":   "urgency",
}

# Ordered: first matching active trigger wins
_TRIGGER_TO_DIMENSION: list = [
    ("authority_oversight",      "authority"),
    ("traceability_constraints", "constraint"),
    ("transparency_uncertainty", "ambiguity"),
    ("prohibited_practices",     "risk"),
    ("escalation",               "accountability"),
    ("synthetic_disclosure",     "accountability"),
]


# ── Helpers ────────────────────────────────────────────────────────────────────
def _derive_primary_dimension(governance_triggers: dict) -> str:
    """Map governance_triggers booleans to the nearest valid dimension."""
    for key, dimension in _TRIGGER_TO_DIMENSION:
        if governance_triggers.get(key):
            return dimension
    return "risk"  # fallback when no trigger is active


def normalize_record(obj: dict, expected_source: str) -> dict | None:
    """Normalize a pipeline-schema record to the fields required by the sampler.

    If the record already has all REQUIRED_FIELDS, it is returned as-is.
    Otherwise the function attempts to derive them from the pipeline fields
    (seed_trace, mutation_trace, governance_triggers).
    Returns None when normalization is impossible (caller should drop the record).
    """
    if REQUIRED_FIELDS.issubset(obj.keys()):
        return obj  # already in sampler schema

    normalized = dict(obj)

    # source — always overridden by the expected_source parameter
    normalized["source"] = expected_source

    # obligation_id ← seed_trace.obligation_ids[0]
    obligation_ids = obj.get("seed_trace", {}).get("obligation_ids", [])
    if not obligation_ids:
        return None
    normalized["obligation_id"] = obligation_ids[0]

    # scenario_type / mutation_type ← mutation_trace
    mutations = obj.get("mutation_trace", {}).get("mutations", [])
    if mutations:
        normalized["scenario_type"] = "mutated"
        family = mutations[0].get("family", "")
        normalized["mutation_type"] = _FAMILY_TO_MUTATION_TYPE.get(family, "ambiguity")
    else:
        normalized["scenario_type"] = "base"
        normalized["mutation_type"] = None

    # primary_dimension ← governance_triggers
    normalized["primary_dimension"] = _derive_primary_dimension(
        obj.get("governance_triggers", {})
    )

    return normalized


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_source(path: str, expected_source: str) -> tuple:
    """Load, validate, and namespace a single source JSONL file.

    Returns (scenarios, dropped_count).
    scenario_id is prefixed with '{expected_source}:' for global uniqueness.
    """
    scenarios = []
    dropped = 0
    with open(path, encoding="utf-8") as f:
        for lineno, raw in enumerate(f, 1):
            line = raw.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                logging.warning("Malformed JSON at %s:%d, skipping", path, lineno)
                dropped += 1
                continue

            obj = normalize_record(obj, expected_source)
            if obj is None:
                logging.warning("Cannot derive required fields at %s:%d, dropping", path, lineno)
                dropped += 1
                continue
            if not REQUIRED_FIELDS.issubset(obj.keys()):
                missing = REQUIRED_FIELDS - obj.keys()
                logging.warning("Missing fields %s at %s:%d, dropping", missing, path, lineno)
                dropped += 1
                continue
            if obj["source"] not in VALID_SOURCES:
                logging.warning("Invalid source '%s' at %s:%d, dropping",
                                obj["source"], path, lineno)
                dropped += 1
                continue
            if obj["scenario_type"] not in VALID_SCENARIO_TYPES:
                logging.warning("Invalid scenario_type '%s' at %s:%d, dropping",
                                obj["scenario_type"], path, lineno)
                dropped += 1
                continue
            if obj["primary_dimension"] not in VALID_DIMENSIONS:
                logging.warning("Invalid primary_dimension '%s' at %s:%d, dropping",
                                obj["primary_dimension"], path, lineno)
                dropped += 1
                continue
            if obj["scenario_type"] == "mutated" and obj["mutation_type"] is None:
                logging.warning("Mutated scenario with null mutation_type at %s:%d, dropping",
                                path, lineno)
                dropped += 1
                continue
            if obj["scenario_type"] == "base" and obj["mutation_type"] is not None:
                logging.warning("Base scenario with non-null mutation_type at %s:%d, dropping",
                                path, lineno)
                dropped += 1
                continue
            if obj["mutation_type"] is not None and obj["mutation_type"] not in VALID_MUTATION_TYPES:
                logging.warning("Invalid mutation_type '%s' at %s:%d, dropping",
                                obj["mutation_type"], path, lineno)
                dropped += 1
                continue

            obj = dict(obj)  # shallow copy before mutating
            if obj["source"] != expected_source:
                logging.warning("Source override: '%s' → '%s' at %s:%d",
                                obj["source"], expected_source, path, lineno)
                obj["source"] = expected_source

            obj["scenario_id"] = f"{expected_source}:{obj['scenario_id']}"
            scenarios.append(obj)

    return scenarios, dropped


def deduplicate(scenarios: list) -> list:
    """Remove duplicate scenario_id entries, keeping first occurrence."""
    seen: dict = {}  # scenario_id → source label
    result = []
    for s in scenarios:
        sid = s["scenario_id"]
        if sid in seen:
            logging.warning(
                "Duplicate scenario_id '%s' (sources: '%s' and '%s'), keeping first",
                sid, seen[sid], s["source"],
            )
        else:
            seen[sid] = s["source"]
            result.append(s)
    return result


def phase1_draw(pool: list, rng: random.Random) -> tuple:
    """Draw one scenario per obligation_id (alphabetical order for determinism).

    Returns (phase1_sample, coverage_map, remaining_pool).
    coverage_map: { obligation_id → scenario_id (namespaced) }
    remaining_pool: pool minus selected scenarios.
    """
    obl_ids = sorted({s["obligation_id"] for s in pool})
    by_obl: dict = {}
    for s in pool:
        by_obl.setdefault(s["obligation_id"], []).append(s)

    sample = []
    coverage_map: dict = {}
    selected_ids: set = set()

    for obl_id in obl_ids:
        chosen = rng.choice(by_obl[obl_id])
        sample.append(chosen)
        coverage_map[obl_id] = chosen["scenario_id"]
        selected_ids.add(chosen["scenario_id"])

    remaining = [s for s in pool if s["scenario_id"] not in selected_ids]
    return sample, coverage_map, remaining


def phase2_draw(remaining: list, n_phase2: int, rng: random.Random) -> tuple:
    """Source-balanced draw from remaining pool.

    Splits budget equally across ["claude", "gemini", "gpt"] (alphabetical).
    Remainder extra slots go to the first r sources in that order.
    Shortfalls from exhausted sources are filled from the overflow of non-exhausted ones.

    Returns (phase2_sample, shortfalls).
    shortfalls: { source: int } — only present for sources that ran out.
    """
    SOURCES_SORTED = ["claude", "gemini", "gpt"]

    by_source: dict = {s: [] for s in SOURCES_SORTED}
    for s in remaining:
        src = s["source"]
        if src in by_source:
            by_source[src].append(s)

    base = n_phase2 // 3
    r = n_phase2 % 3
    allocation = {src: base for src in SOURCES_SORTED}
    for i in range(r):
        allocation[SOURCES_SORTED[i]] += 1

    sample: list = []
    shortfalls: dict = {}
    overflow_pool: list = []

    for src in SOURCES_SORTED:
        pool_slice = by_source[src][:]
        rng.shuffle(pool_slice)
        alloc = allocation[src]
        if len(pool_slice) >= alloc:
            sample.extend(pool_slice[:alloc])
            overflow_pool.extend(pool_slice[alloc:])
        else:
            sample.extend(pool_slice)
            shortfall = alloc - len(pool_slice)
            shortfalls[src] = shortfall
            logging.warning(
                "Phase 2 shortfall for source '%s': needed %d, had %d",
                src, alloc, len(pool_slice),
            )

    total_shortfall = sum(shortfalls.values())
    if total_shortfall > 0 and overflow_pool:
        rng.shuffle(overflow_pool)
        sample.extend(overflow_pool[:total_shortfall])

    return sample, shortfalls


def run_audit(sample: list, coverage_map: dict, target_n: int) -> dict:
    """Run all five audit checks. Returns the audit dict for the manifest."""
    n = len(sample)
    source_counts: dict = {"gpt": 0, "gemini": 0, "claude": 0}
    dimension_counts: dict = {d: 0 for d in VALID_DIMENSIONS}
    seen_ids: list = []
    unique_ids: set = set()

    for s in sample:
        src = s.get("source", "")
        if src in source_counts:
            source_counts[src] += 1
        dim = s.get("primary_dimension", "")
        if dim in dimension_counts:
            dimension_counts[dim] += 1
        sid = s.get("scenario_id")
        seen_ids.append(sid)
        unique_ids.add(sid)

    # ── source_balance (HARD) ──────────────────────────────────────────────────
    pcts = {src: (count / n * 100) if n > 0 else 0.0 for src, count in source_counts.items()}
    source_balance_pass = all(23.0 <= p <= 43.0 for p in pcts.values())

    # ── obligation_coverage (HARD) ─────────────────────────────────────────────
    output_ids = {s["scenario_id"] for s in sample}
    missing_obls = [obl for obl, sid in coverage_map.items() if sid not in output_ids]
    obligation_coverage_pass = len(missing_obls) == 0

    # ── sample_size (HARD) ────────────────────────────────────────────────────
    sample_size_pass = 15 <= n <= 100

    # ── id_uniqueness (HARD) ──────────────────────────────────────────────────
    id_uniqueness_pass = len(seen_ids) == len(unique_ids)

    # ── dimension_coverage (SOFT) ─────────────────────────────────────────────
    missing_dims = [d for d, count in dimension_counts.items() if count == 0]
    dimension_coverage_pass = len(missing_dims) == 0
    if not dimension_coverage_pass:
        logging.warning("SOFT CHECK dimension_coverage FAILED: missing dimensions %s", missing_dims)

    overall_pass = (
        source_balance_pass
        and obligation_coverage_pass
        and sample_size_pass
        and id_uniqueness_pass
    )

    return {
        "source_balance": {
            "pass": source_balance_pass,
            "counts": source_counts,
            "percentages": {src: round(p, 2) for src, p in pcts.items()},
            "tolerance": "33% ± 10% (debug mode)",
        },
        "obligation_coverage": {
            "pass": obligation_coverage_pass,
            "total_obligations": len(coverage_map),
            "covered": len(coverage_map) - len(missing_obls),
            "missing": missing_obls,
        },
        "sample_size": {
            "pass": sample_size_pass,
            "actual": n,
            "target": target_n,
        },
        "id_uniqueness": {
            "pass": id_uniqueness_pass,
            "total": len(seen_ids),
            "unique": len(unique_ids),
        },
        "dimension_coverage": {
            "pass": dimension_coverage_pass,
            "counts": dimension_counts,
            "missing_dimensions": missing_dims,
            "note": "Soft check in debug mode — failure is a warning, not a blocker",
        },
        "overall_pass": overall_pass,
    }


# ── CLI ────────────────────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(
        description="GRS Debug Sampler — produce a small reproducible scenario subset"
    )
    parser.add_argument("--source-a", required=True, help="GPT dataset JSONL (required)")
    parser.add_argument("--source-b", required=True, help="Gemini dataset JSONL (required)")
    parser.add_argument("--source-c", required=True, help="Claude dataset JSONL (required)")
    parser.add_argument("--target-n", type=int, default=30,
                        help="Target sample size [15, 100], default 30")
    parser.add_argument("--seed", type=int, default=42, help="Primary random seed, default 42")
    parser.add_argument(
        "--output",
        default="datasets/debug/grs_debug_sample.jsonl",
        help="Output JSONL path (default: datasets/debug/grs_debug_sample.jsonl)",
    )
    parser.add_argument(
        "--manifest",
        default="datasets/debug/grs_debug_manifest.json",
        help="Output manifest JSON path (default: datasets/debug/grs_debug_manifest.json)",
    )
    args = parser.parse_args()

    errors = []
    for attr, label in [
        ("source_a", "--source-a"),
        ("source_b", "--source-b"),
        ("source_c", "--source-c"),
    ]:
        path = getattr(args, attr)
        if not os.path.exists(path):
            errors.append(f"Source file not found: {path} ({label})")

    if not (15 <= args.target_n <= 100):
        errors.append(f"--target-n {args.target_n} is outside allowed range [15, 100]")

    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    return args


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s %(message)s",
        datefmt="%H:%M:%S",
    )
    args = parse_args()
    logging.info("GRS Debug Sampler starting — seed=%d, target_n=%d", args.seed, args.target_n)

    file_map = [
        ("gpt", args.source_a),
        ("gemini", args.source_b),
        ("claude", args.source_c),
    ]
    all_scenarios = []
    source_hashes = {}

    for source, path in file_map:
        source_hashes[source] = sha256_file(path)
        scenarios, dropped = load_source(path, source)
        logging.info("Loaded %s: %d valid, %d dropped", path, len(scenarios), dropped)
        logging.info("Namespace prefix applied: source='%s', count=%d", source, len(scenarios))
        all_scenarios.extend(scenarios)

    logging.info("Source hashes recorded: %s", list(source_hashes.keys()))

    pool = deduplicate(all_scenarios)

    # ── Phase 1 budget check ───────────────────────────────────────────────────
    n_obligations = len({s["obligation_id"] for s in pool})
    if n_obligations == 0:
        logging.error("No valid scenarios loaded from any source — cannot sample. Exiting.")
        return 1
    if n_obligations / args.target_n > 0.50:
        suggested = n_obligations * 2
        logging.warning(
            "Phase 1 budget warning: %d obligations / %d target_n > 50%%. "
            "Recommend --target-n >= %d.",
            n_obligations, args.target_n, suggested,
        )

    # ── Phase 1 ───────────────────────────────────────────────────────────────
    rng1 = random.Random(args.seed)
    phase1_sample, coverage_map, remaining_pool = phase1_draw(pool, rng1)
    p1_dist = {
        src: sum(1 for s in phase1_sample if s["source"] == src)
        for src in ["gpt", "gemini", "claude"]
    }
    logging.info("Phase 1 complete: %d drawn, distribution=%s", len(phase1_sample), p1_dist)

    # ── Phase 2 ───────────────────────────────────────────────────────────────
    n_phase2 = args.target_n - len(phase1_sample)
    if n_phase2 <= 0:
        logging.warning("n_phase2 <= 0, skipping Phase 2")
        phase2_sample = []
        shortfalls = {}
    else:
        phase2_sample, shortfalls = phase2_draw(remaining_pool, n_phase2, rng1)

    p2_dist = {
        src: sum(1 for s in phase2_sample if s["source"] == src)
        for src in ["gpt", "gemini", "claude"]
    }
    logging.info("Phase 2 complete: %d drawn, distribution=%s", len(phase2_sample), p2_dist)

    # ── Merge and shuffle ─────────────────────────────────────────────────────
    combined = phase1_sample + phase2_sample
    rng2 = random.Random(args.seed + 1)
    rng2.shuffle(combined)
    logging.info("Final sample size after shuffle: %d", len(combined))

    # Create output and manifest directories if needed
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    os.makedirs(os.path.dirname(os.path.abspath(args.manifest)), exist_ok=True)

    # Write output
    with open(args.output, "w", encoding="utf-8") as f:
        for s in combined:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")

    output_hash = sha256_file(args.output)
    logging.info("Output written to %s (sha256: %s...)", args.output, output_hash[:16])

    # ── Audit ─────────────────────────────────────────────────────────────────
    audit_result = run_audit(combined, coverage_map, args.target_n)

    for check_name, check_data in audit_result.items():
        if check_name == "overall_pass":
            continue
        passed = check_data["pass"]
        is_soft = check_name == "dimension_coverage"
        if passed:
            status = "PASS"
        elif is_soft:
            status = "WARN"
        else:
            status = "FAIL"
        logging.info("Audit %-22s %s", check_name + ":", status)

    overall_str = "PASS" if audit_result["overall_pass"] else "FAIL"
    logging.info("Overall audit result: %s", overall_str)

    # Manifest with audit block
    final_dist = {
        src: sum(1 for s in combined if s["source"] == src)
        for src in ["gpt", "gemini", "claude"]
    }
    manifest_data = {
        "grs_version": "v3.0",
        "sampler_version": "debug-v1.0",
        "sampling_date": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "mode": "debug",
        "source_files": {
            "gpt": args.source_a,
            "gemini": args.source_b,
            "claude": args.source_c,
        },
        "source_hashes": source_hashes,
        "random_seed_1": args.seed,
        "random_seed_2": args.seed + 1,  # used by rng2 for final shuffle (Task 5)
        "target_n": args.target_n,
        "phase1": {
            "description": "One scenario drawn per obligation (coverage guarantee)",
            "scenarios_drawn": len(phase1_sample),
            "obligations_covered": len(coverage_map),
            "coverage_map": coverage_map,
            "source_distribution": p1_dist,
        },
        "phase2": {
            "description": "Equal source-balanced draw on remaining budget",
            "scenarios_drawn": len(phase2_sample),
            "shortfalls": shortfalls,
            "source_distribution": p2_dist,
        },
        "final_sample": {
            "total_scenarios": len(combined),
            "source_distribution": final_dist,
            "sha256": output_hash,
        },
        "audit": audit_result,
    }
    with open(args.manifest, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2, ensure_ascii=False)
    logging.info("Manifest written to %s", args.manifest)

    return 0 if audit_result["overall_pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
