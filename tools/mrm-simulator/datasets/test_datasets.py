import subprocess, sys, json
from pathlib import Path

COMPUTE = Path(__file__).parent.parent / "compute"
DATA = Path(__file__).parent


def _run(dataset, period, metrics, segment=None):
    args = [sys.executable, "__main__.py", "--dataset", str(DATA / dataset),
            "--period", period, "--metrics", metrics, "--feature-col", "feature"]
    if segment:
        args += ["--segment-col", segment]
    r = subprocess.run(args, cwd=COMPUTE, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_credit_scoring_psi_breaches_late():
    out = _run("credit-scoring.csv", "2026-06-28", "psi")
    assert out["psi"] > 0.20


def test_fraud_psi_stays_low():
    out = _run("fraud-detection.csv", "2026-06-28", "psi")
    assert out["psi"] < 0.25


def test_loan_subprime_gini_drops():
    out = _run("loan-approval.csv", "2026-06-28", "gini", segment="segment")
    assert out["fairness"]["subprime"]["gini"] < out["fairness"]["prime"]["gini"]


def test_churn_psi_breaches_then_recovers():
    mid = _run("churn.csv", "2026-06-11", "psi")
    late = _run("churn.csv", "2026-06-28", "psi")
    assert mid["psi"] > late["psi"]  # recovered
