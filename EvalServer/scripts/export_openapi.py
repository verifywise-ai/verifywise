"""Export the FastAPI OpenAPI schema to ``EvalServer/openapi.json``.

The committed artifact is consumed by the Node-side contract test
(``Servers/routes/__tests__/evalServerContract.test.ts``) to detect drift
between the EvalServer request schemas and the Node/Clients types.

Import-only: the app module is loaded but startup events (migrations,
Redis init) never run. Environment stubs mirror ``tests/conftest.py`` so the
module-level settings/engine construction succeeds without real services.

Usage (from the EvalServer directory):

    venv/bin/python scripts/export_openapi.py
"""

import json
import os
import sys
from pathlib import Path

EVALSERVER_ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(EVALSERVER_ROOT / "src"))
sys.path.insert(0, str(EVALSERVER_ROOT.parent / "EvaluationModule" / "src"))

os.environ.setdefault("EVAL_SERVER_INTERNAL_KEY", "openapi-export-stub")
os.environ.setdefault("DB_USER", "stub")
os.environ.setdefault("DB_PASSWORD", "stub")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "stub")

from app import app  # noqa: E402


def main() -> None:
    out_path = EVALSERVER_ROOT / "openapi.json"
    schema = app.openapi()
    with out_path.open("w") as f:
        json.dump(schema, f, indent=2)
        f.write("\n")
    print(f"Wrote {out_path} ({len(schema.get('paths', {}))} paths)")


if __name__ == "__main__":
    main()
