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


# ---------------------------------------------------------------------------
# Original directional assertions (must not regress)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Realism-range assertions (prevent fake/synthetic values from sneaking back)
# ---------------------------------------------------------------------------

def test_fraud_auc_realistic():
    """Fraud AUC must be in a realistic strong-model range — never 1.000."""
    out = _run("fraud-detection.csv", "2026-06-15", "auc")
    assert 0.80 < out["auc"] < 0.98, f"Fraud AUC={out['auc']:.4f} outside realistic range (0.80, 0.98)"


def test_credit_psi_bounded():
    """Credit PSI late must be real drift — high but not exploded."""
    out = _run("credit-scoring.csv", "2026-06-28", "psi")
    assert 0.20 < out["psi"] < 0.80, f"Credit PSI late={out['psi']:.4f} outside realistic range (0.20, 0.80)"


def test_credit_psi_clean_at_start():
    """Credit PSI in the first few days must be near-zero (clean baseline).
    Uses day-3 to avoid single-day sampling noise on day-1."""
    out = _run("credit-scoring.csv", "2026-06-03", "psi")
    assert out["psi"] < 0.10, f"Credit PSI day-3={out['psi']:.4f} should be near-zero (< 0.10)"


def test_loan_prime_gini_not_perfect():
    """Prime-segment Gini must be well below 1.0 (not a synthetic perfect separator)."""
    out = _run("loan-approval.csv", "2026-06-28", "gini", segment="segment")
    prime_gini = out["fairness"]["prime"]["gini"]
    assert prime_gini < 0.95, f"Prime Gini={prime_gini:.4f} is unrealistically high (>= 0.95)"


def test_loan_fairness_gap_visible():
    """Prime minus subprime Gini must be > 0.20 at late period — a visible, auditable gap."""
    out = _run("loan-approval.csv", "2026-06-28", "gini", segment="segment")
    prime_gini = out["fairness"]["prime"]["gini"]
    subprime_gini = out["fairness"]["subprime"]["gini"]
    gap = prime_gini - subprime_gini
    assert gap > 0.20, f"Fairness gap={gap:.4f} is too small to be visible (< 0.20)"


def test_churn_psi_peak_bounded():
    """Churn PSI at peak (day-13) must be real drift — elevated but not exploded."""
    out = _run("churn.csv", "2026-06-13", "psi")
    assert out["psi"] < 0.60, f"Churn PSI peak={out['psi']:.4f} is unrealistically high (>= 0.60)"


def test_churn_psi_clean_at_start():
    """Churn PSI in the first few days must be near-zero (clean baseline).
    Uses day-3 to avoid single-day sampling noise on day-1."""
    out = _run("churn.csv", "2026-06-03", "psi")
    assert out["psi"] < 0.10, f"Churn PSI day-3={out['psi']:.4f} should be near-zero (< 0.10)"
