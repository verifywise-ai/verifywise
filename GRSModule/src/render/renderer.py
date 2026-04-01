from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import random
import string

from models.obligation import Obligation
from render.load_catalogs import RenderInputs
from render.models import CONTEXT_SLOTS


@dataclass(frozen=True)
class RenderConfig:
    seed: int
    per_obligation: int = 2  # how many base scenarios to create per obligation


def _pick(rng: random.Random, items: list[Any]) -> Any:
    return items[rng.randrange(0, len(items))]


def _infer_domain(blob: str, inputs: RenderInputs) -> str:
    """Return the first domain whose keywords appear in blob; fallback to the domain marked default:true."""
    for dom in inputs.domains.domains:
        if any(kw in blob for kw in dom.keywords):
            return dom.domain_id
    default = next((d.domain_id for d in inputs.domains.domains if d.default), None)
    if default is None:
        raise ValueError(
            "No domain marked default:true in domains.yaml — "
            "add 'default: true' to exactly one domain entry"
        )
    return default


def _build_render_vars(
    template_str: str,
    domain: str,
    rv: RenderVarsCatalog,
    rng: random.Random,
    verb: str,
) -> dict[str, Any]:
    """Introspect template slots and fill each from the domain's render_vars pool."""
    domain_vars = rv.get_domain_vars(domain)
    slots = {
        fname
        for _, fname, _, _ in string.Formatter().parse(template_str)
        if fname and fname not in CONTEXT_SLOTS
    }
    result: dict[str, Any] = {"verb": verb}
    for slot in slots:
        if slot in domain_vars:
            result[slot] = _pick(rng, domain_vars[slot])
    return result


def render_base_scenarios(
    *,
    obligations: list[Obligation],
    inputs: RenderInputs,
    cfg: RenderConfig,
) -> list[dict[str, Any]]:
    rng = random.Random(cfg.seed)

    roles = inputs.roles.roles
    org_ctxs = inputs.org_contexts.org_contexts
    activities_by_id = {a.activity_id: a for a in inputs.activities.activities}

    templates = inputs.templates.templates
    templates_by_domain: dict[str, list] = {}
    for t in templates:
        templates_by_domain.setdefault(t.domain, []).append(t)

    rv = inputs.render_vars
    out: list[dict[str, Any]] = []
    base_id = 0

    for obl in obligations:
        text_blob = " ".join(obl.must + obl.must_not).lower()
        src_blob = " ".join([
            getattr(obl.source, "source_type", "") or "",
            getattr(obl.source, "source_ref", "") or "",
            getattr(obl.source, "excerpt_id", "") or "",
        ]).lower()
        blob = f"{src_blob} {text_blob}"

        domain = _infer_domain(blob, inputs)
        dom_templates = templates_by_domain.get(domain) or templates

        for _ in range(cfg.per_obligation):
            t = _pick(rng, dom_templates)
            role = _pick(rng, roles)
            org = _pick(rng, org_ctxs)

            verb = "do"
            if t.activity_id in activities_by_id:
                verb = _pick(rng, activities_by_id[t.activity_id].verbs)

            render_vars = _build_render_vars(t.template, t.domain, rv, rng, verb)

            base_id += 1
            scenario = {
                "base_scenario_id": f"base_{base_id:06d}",
                "obligation_id": obl.obligation_id,
                "domain": t.domain,
                "role_context": {
                    "assistant_role": role.assistant_role,
                    "user_role": role.user_role,
                    "org_context": org.org_context,
                },
                "template_id": t.template_id,
                "render_vars": render_vars,
            }

            prompt = t.template.format(
                assistant_role=scenario["role_context"]["assistant_role"],
                user_role=scenario["role_context"]["user_role"],
                org_context=scenario["role_context"]["org_context"],
                **scenario["render_vars"],
            )
            scenario["prompt"] = prompt

            out.append(scenario)

    return out
