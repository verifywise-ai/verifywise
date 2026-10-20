"""
Puts EvaluationModule/src on sys.path so EvalServer can import deepeval_engine. Import it
before any deepeval_engine import (the utils shims for it do).

Docker copies deepeval_engine next to the app (/app/deepeval_engine); a checkout needs
EvaluationModule/src on the path, which run_evaluation adds too, but a shim may be
imported first. Walk up rather than index parents: /app/utils has only two above it.
"""

import sys
from pathlib import Path

for _parent in Path(__file__).resolve().parents:
    _candidate = _parent / "EvaluationModule" / "src"
    if _candidate.is_dir():
        if str(_candidate) not in sys.path:
            sys.path.insert(0, str(_candidate))
        break

