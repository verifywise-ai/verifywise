#!/usr/bin/env python3
"""Generate oracle fixtures for the TypeScript bias-audit engine port.

DEVELOPMENT ONLY. Run once, commit the output, never ship or import this.
The TypeScript module and its tests depend on cases.json and expected.json,
not on this script or on EvalServer.

    cd Servers/services/biasAudit/engine/__fixtures__
    ~/verifywise/EvalServer/venv/bin/python generate_oracle.py
"""
import json
import pathlib
import sys

EVALSERVER = pathlib.Path.home() / "verifywise/EvalServer"
sys.path.insert(0, str(EVALSERVER / "src"))

from engines.bias_audit.engine import compute_bias_audit       # noqa: E402
from engines.bias_audit.models import BiasAuditConfig          # noqa: E402

RACES = [
    "White", "Black or African American", "Hispanic or Latino", "Asian",
    "Native Hawaiian or Pacific Islander", "Native American or Alaska Native",
    "Two or more races",
]


def balanced_sex_60_40():
    out = []
    for i in range(200):
        sex = "Male" if i % 2 == 0 else "Female"
        # Male 60% selected, Female 40% -> IR 0.666667 for Female
        sel = (i % 10) < (6 if sex == "Male" else 4)
        out.append({"sex": sex, "selected": sel})
    return out


def ll144_full_14_cells():
    out = []
    for i in range(1400):
        sex = "Male" if i % 2 == 0 else "Female"
        race = RACES[(i // 2) % 7]
        sel = (i % 7) < 4
        out.append({"sex": sex, "race_ethnicity": race, "selected": sel})
    return out


def single_group_male_only():
    return [{"sex": "Male", "selected": i % 3 == 0} for i in range(60)]


def all_selected():
    return [{"sex": "Male" if i % 2 == 0 else "Female", "selected": True} for i in range(100)]


def none_selected():
    return [{"sex": "Male" if i % 2 == 0 else "Female", "selected": False} for i in range(100)]


def mostly_blank_sex():
    out = []
    for i in range(100):
        sex = ("Male" if i % 2 == 0 else "Female") if i < 12 else ""
        out.append({"sex": sex, "selected": i % 3 == 0})
    return out


def one_tiny_race_cell():
    out = []
    for i in range(1000):
        if i < 10:
            race = "Two or more races"      # 1% of 1000, below the 2% exclusion
        elif i < 500:
            race = "White"
        else:
            race = "Asian"
        out.append({"race_ethnicity": race, "selected": i % 4 == 0})
    return out


def continuous_scores_0_100():
    out = []
    for i in range(200):
        sex = "Male" if i % 2 == 0 else "Female"
        score = float((i * 7) % 101)
        out.append({"sex": sex, "score": score})
    return out


def three_levels_75_at_top():
    # The Review Focus case: median coincides with the modal value.
    out = []
    for i in range(100):
        sex = "Male" if i % 2 == 0 else "Female"
        score = 3 if i < 75 else (2 if i < 90 else 1)
        out.append({"sex": sex, "score": float(score)})
    return out


def rates_producing_exact_half_at_7dp():
    # 128 Male (64 score 90.0, rest 10.0) and 128 Female (1 scores 90.0, rest 10.0).
    # The median is 10.0, so the rates are 0.5 and 1/128 = 0.0078125, which Python
    # rounds half-to-even to 0.007812 (round-half-up would give 0.007813).
    out = []
    for i in range(128):
        out.append({"sex": "Male", "score": 90.0 if i < 64 else 10.0})
    for i in range(128):
        out.append({"sex": "Female", "score": 90.0 if i < 1 else 10.0})
    return out


def prediction_and_truth():
    out = []
    for i in range(200):
        sex = "Male" if i % 2 == 0 else "Female"
        truth = i % 3 == 0
        pred = truth if i % 5 else not truth
        out.append({"sex": sex, "prediction": pred, "ground_truth": truth})
    return out


def selected_plus_scores():
    out = []
    for i in range(200):
        sex = "Male" if i % 2 == 0 else "Female"
        out.append({"sex": sex, "selected": i % 3 == 0, "score": float((i * 13) % 101)})
    return out


GENERATORS = {
    "balanced_sex_60_40": balanced_sex_60_40,
    "ll144_full_14_cells": ll144_full_14_cells,
    "single_group_male_only": single_group_male_only,
    "all_selected": all_selected,
    "none_selected": none_selected,
    "mostly_blank_sex": mostly_blank_sex,
    "one_tiny_race_cell": one_tiny_race_cell,
    "continuous_scores_0_100": continuous_scores_0_100,
    "three_levels_75_at_top": three_levels_75_at_top,
    "rates_producing_exact_half_at_7dp": rates_producing_exact_half_at_7dp,
    "prediction_and_truth": prediction_and_truth,
    "selected_plus_scores": selected_plus_scores,
}


def main() -> int:
    here = pathlib.Path(__file__).parent
    cases = json.loads((here / "cases.json").read_text())

    resolved, expected = [], {}
    for case in cases:
        gen = GENERATORS[case["records_generator"]]
        records = gen()
        cfg = BiasAuditConfig(**case["config"])
        result = compute_bias_audit(records, cfg)
        resolved.append({"name": case["name"], "records": records, "config": case["config"]})
        expected[case["name"]] = json.loads(result.model_dump_json())
        print(f"  {case['name']}: {len(records)} records, {len(result.tables)} tables")

    (here / "cases.resolved.json").write_text(json.dumps(resolved, indent=2) + "\n")
    (here / "expected.json").write_text(json.dumps(expected, indent=2, sort_keys=True) + "\n")
    print(f"\nwrote {len(resolved)} cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
