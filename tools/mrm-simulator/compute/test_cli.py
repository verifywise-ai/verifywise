import json
import subprocess
import sys
import textwrap
from pathlib import Path


def _write_csv(tmp_path: Path) -> Path:
    # 14 days: first 7 = reference (mean 0), last 7 = shifted (mean 2)
    rows = ["date,feature,prediction,label,segment"]
    import numpy as np
    rng = np.random.default_rng(0)
    for day in range(14):
        shift = 0 if day < 7 else 2
        for _ in range(300):
            f = rng.normal(shift, 1)
            label = int(rng.integers(0, 2))
            pred = 0.5 + 0.3 * label + rng.normal(0, 0.1)
            seg = "subprime" if rng.random() < 0.3 else "prime"
            rows.append(f"2026-06-{day+1:02d},{f:.4f},{pred:.4f},{label},{seg}")
    p = tmp_path / "d.csv"
    p.write_text("\n".join(rows))
    return p


def test_cli_outputs_metric_json(tmp_path):
    csv = _write_csv(tmp_path)
    here = Path(__file__).parent
    result = subprocess.run(
        [sys.executable, "__main__.py",
         "--dataset", str(csv),
         "--period", "2026-06-13",
         "--metrics", "psi,auc,gini,ks",
         "--feature-col", "feature",
         "--segment-col", "segment"],
        cwd=here, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    out = json.loads(result.stdout)
    assert "psi" in out and out["psi"] > 0.25  # day 13 is in the shifted window
    assert 0.0 <= out["auc"] <= 1.0
    assert "fairness" in out and "overall" in out["fairness"]


def test_cli_errors_on_missing_dataset(tmp_path):
    here = Path(__file__).parent
    result = subprocess.run(
        [sys.executable, "__main__.py", "--dataset", "/nope.csv",
         "--period", "2026-06-13", "--metrics", "psi"],
        cwd=here, capture_output=True, text=True,
    )
    assert result.returncode != 0
    assert "not found" in result.stderr.lower() or "no such" in result.stderr.lower()
