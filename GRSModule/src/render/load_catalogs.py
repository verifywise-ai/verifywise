from __future__ import annotations

import string
from dataclasses import dataclass
from pathlib import Path

from config import load_yaml_model
from render.models import (
    RolesCatalog,
    ActivitiesCatalog,
    DomainsCatalog,
    OrgContextsCatalog,
    BaseTemplatesFile,
    RenderVarsCatalog,
    CONTEXT_SLOTS,
)


@dataclass(frozen=True)
class RenderInputs:
    roles: RolesCatalog
    activities: ActivitiesCatalog
    domains: DomainsCatalog
    org_contexts: OrgContextsCatalog
    templates: BaseTemplatesFile
    render_vars: RenderVarsCatalog


def load_render_inputs(*, config_dir: Path) -> RenderInputs:
    catalogs_dir = config_dir / "catalogs"
    templates_dir = config_dir / "templates"

    roles = load_yaml_model(catalogs_dir / "roles.yaml", RolesCatalog)
    activities = load_yaml_model(catalogs_dir / "activities.yaml", ActivitiesCatalog)
    domains = load_yaml_model(catalogs_dir / "domains.yaml", DomainsCatalog)
    org_contexts = load_yaml_model(catalogs_dir / "org_contexts.yaml", OrgContextsCatalog)
    templates = load_yaml_model(templates_dir / "base_scenarios.yaml", BaseTemplatesFile)
    render_vars = load_yaml_model(catalogs_dir / "render_vars.yaml", RenderVarsCatalog)

    return RenderInputs(
        roles=roles,
        activities=activities,
        domains=domains,
        org_contexts=org_contexts,
        templates=templates,
        render_vars=render_vars,
    )


def validate_render_inputs(inputs: RenderInputs) -> None:
    """Validate that render_vars.yaml covers every placeholder in every template.

    Raises ValueError with a full list of issues if anything is missing.
    Called once at startup before rendering begins.
    """
    errors: list[str] = []

    defaults = [d for d in inputs.domains.domains if d.default]
    if len(defaults) != 1:
        errors.append(
            f"domains.yaml must have exactly one default:true domain, found {len(defaults)}"
        )

    _MISSING = object()
    for t in inputs.templates.templates:
        raw = (inputs.render_vars.model_extra or {}).get(t.domain, _MISSING)
        if raw is _MISSING:
            errors.append(
                f"[{t.template_id}] domain '{t.domain}' not found in render_vars.yaml"
            )
            continue
        domain_vars: dict[str, list[str]] = raw
        slots = {
            fname
            for _, fname, _, _ in string.Formatter().parse(t.template)
            if fname and fname not in CONTEXT_SLOTS
        }
        for slot in slots:
            if slot not in domain_vars:
                errors.append(
                    f"[{t.template_id}] placeholder '{{{slot}}}' has no entry "
                    f"in render_vars.yaml under '{t.domain}'"
                )

    if errors:
        raise ValueError(
            "Render config validation failed:\n" + "\n".join(f"  - {e}" for e in errors)
        )
