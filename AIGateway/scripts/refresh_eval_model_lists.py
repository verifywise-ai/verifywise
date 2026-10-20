"""
Refresh LLM Evals' bundled model lists from LiteLLM's cost map.

The lists in Clients/src/presentation/utils/providers/<provider>/models.json are only the
fallback the model picker shows when the AI Gateway catalog cannot be reached. Their model
IDs, names and descriptions are curated; this script keeps those and:

- sets inputCost / outputCost ($ per 1M tokens) and contextWindow from LiteLLM,
- drops models whose LiteLLM retirement date has passed,
- reports IDs LiteLLM does not know (left as they are, for a person to check).

Run with the gateway's environment, from the repository root:

    AIGateway/venv/bin/python AIGateway/scripts/refresh_eval_model_lists.py [--check]

--check writes nothing and exits 1 when a list would change.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

import litellm

PROVIDERS_DIR = Path(__file__).resolve().parents[2] / "Clients" / "src" / "presentation" / "utils" / "providers"

# Eval provider → LiteLLM provider and the prefix its cost-map keys use
LITELLM = {
    "openai": ("openai", ""),
    "anthropic": ("anthropic", ""),
    "google": ("gemini", "gemini/"),
    "mistral": ("mistral", "mistral/"),
    "xai": ("xai", "xai/"),
    "openrouter": ("openrouter", "openrouter/"),
}


def _entry(model_id: str, litellm_provider: str, prefix: str) -> dict | None:
    """The cost-map entry for the model as the gateway calls it, for the right provider."""
    for key in (prefix + model_id, model_id):
        info = litellm.model_cost.get(key)
        if isinstance(info, dict) and info.get("litellm_provider") == litellm_provider:
            return info
    return None


def _per_million(per_token) -> float | None:
    if not isinstance(per_token, (int, float)) or per_token <= 0:
        return None
    return round(per_token * 1_000_000, 4)


def refresh(provider: str, today: str) -> tuple[dict, dict, list[str], list[str]]:
    """(old list, new list, dropped IDs, unknown IDs) for one provider."""
    path = PROVIDERS_DIR / provider / "models.json"
    old = json.loads(path.read_text())
    litellm_provider, prefix = LITELLM[provider]
    models, dropped, unknown = [], [], []
    for model in old["models"]:
        info = _entry(model["id"], litellm_provider, prefix)
        if info is None:
            unknown.append(model["id"])
            models.append(model)
            continue
        retires = info.get("deprecation_date")
        if isinstance(retires, str) and retires < today:
            dropped.append(f"{model['id']} (retired {retires})")
            continue
        updated = dict(model)
        for field, value in (
            ("inputCost", _per_million(info.get("input_cost_per_token"))),
            ("outputCost", _per_million(info.get("output_cost_per_token"))),
            ("contextWindow", info.get("max_input_tokens")),
        ):
            if value is not None:
                updated[field] = value
        models.append(updated)
    return old, {**old, "models": models}, dropped, unknown


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--check", action="store_true", help="write nothing; exit 1 if a list would change")
    args = parser.parse_args()

    today = date.today().isoformat()
    changed = False
    for provider in LITELLM:
        old, new, dropped, unknown = refresh(provider, today)
        if new != old:
            changed = True
            if not args.check:
                path = PROVIDERS_DIR / provider / "models.json"
                path.write_text(json.dumps(new, indent=2, ensure_ascii=False) + "\n")
        print(f"{provider}: {len(new['models'])} models" + (" (updated)" if new != old else ""))
        for item in dropped:
            print(f"  dropped {item}")
        for item in unknown:
            print(f"  not in LiteLLM's map, kept: {item}")
    return 1 if args.check and changed else 0


if __name__ == "__main__":
    sys.exit(main())
