"""Compute monitoring metrics for one model/period and print JSON.

Reference window: first 7 days of the dataset (min date .. min date + 7d)
unless --reference start:end is given. The period is a single date; its rows
are the "current" slice compared against the reference.
"""
from __future__ import annotations
import argparse
import json
import sys
from datetime import timedelta
import pandas as pd

from metrics import psi as psi_fn, auc as auc_fn, gini as gini_fn, ks as ks_fn, fairness


def main() -> int:
    ap = argparse.ArgumentParser(prog="compute")
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--period", required=True, help="ISO date of the current slice")
    ap.add_argument("--reference", help="start:end ISO dates; default = first 7 days")
    ap.add_argument("--metrics", required=True, help="comma list: psi,auc,gini,ks")
    ap.add_argument("--feature-col", default="feature")
    ap.add_argument("--segment-col")
    args = ap.parse_args()

    try:
        df = pd.read_csv(args.dataset, parse_dates=["date"])
    except FileNotFoundError:
        print(f"dataset not found: {args.dataset}", file=sys.stderr)
        return 2

    if args.reference:
        rstart, rend = args.reference.split(":")
        ref_mask = (df["date"] >= rstart) & (df["date"] <= rend)
    else:
        rmin = df["date"].min()
        ref_mask = (df["date"] >= rmin) & (df["date"] <= rmin + timedelta(days=7))
    ref = df[ref_mask]
    cur = df[df["date"] == args.period]

    if cur.empty:
        print(f"no rows for period {args.period}", file=sys.stderr)
        return 3

    wanted = [m.strip() for m in args.metrics.split(",") if m.strip()]
    out: dict = {}
    if "psi" in wanted:
        out["psi"] = round(psi_fn(ref[args.feature_col], cur[args.feature_col]), 4)
    if "auc" in wanted:
        out["auc"] = round(auc_fn(cur["label"], cur["prediction"]), 4)
    if "gini" in wanted:
        out["gini"] = round(gini_fn(cur["label"], cur["prediction"]), 4)
    if "ks" in wanted:
        out["ks"] = round(ks_fn(cur["label"], cur["prediction"]), 4)
    if args.segment_col:
        fair = fairness(cur, args.segment_col, "gini")
        out["fairness"] = {
            seg: {k: round(v, 4) for k, v in vals.items()} for seg, vals in fair.items()
        }

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
