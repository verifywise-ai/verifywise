# tests/render/test_validation.py
import pytest
from unittest.mock import MagicMock

from render.load_catalogs import validate_render_inputs
from render.models import (
    DomainItem, DomainsCatalog, RenderVarsCatalog,
    BaseTemplate, BaseTemplatesFile,
)


def _make_inputs(*, domains, render_vars, templates):
    inputs = MagicMock()
    inputs.domains = domains
    inputs.render_vars = render_vars
    inputs.templates = templates
    return inputs


def _domains(*items):
    return DomainsCatalog(version="v1", domains=list(items))


def _dom(domain_id, keywords, default=False):
    return DomainItem(domain_id=domain_id, regulated=True,
                      keywords=keywords, default=default)


def _templates(*items):
    return BaseTemplatesFile(version="v1", templates=list(items))


def _tpl(template_id, domain, template_str):
    return BaseTemplate(
        template_id=template_id,
        domain=domain,
        activity_id="act_x",
        template=template_str,
    )


def test_validate_passes_when_all_correct():
    domains = _domains(_dom("consumer_protection", ["dark patterns"], default=True))
    rv = RenderVarsCatalog(
        version="v1",
        consumer_protection={"manipulation_technique": ["dark pattern"]}
    )
    templates = _templates(
        _tpl("tpl_1", "consumer_protection",
             "{assistant_role}\n{user_role}\n{org_context}\nUse {manipulation_technique}.")
    )
    validate_render_inputs(_make_inputs(domains=domains, render_vars=rv, templates=templates))
    # No exception raised


def test_validate_errors_on_zero_default_domains():
    domains = _domains(_dom("consumer_protection", ["dark patterns"], default=False))
    rv = RenderVarsCatalog(version="v1", consumer_protection={"x": ["y"]})
    templates = _templates(_tpl("tpl_1", "consumer_protection", "{x}"))
    with pytest.raises(ValueError, match="exactly one default:true domain"):
        validate_render_inputs(_make_inputs(domains=domains, render_vars=rv, templates=templates))


def test_validate_errors_on_multiple_default_domains():
    domains = _domains(
        _dom("consumer_protection", ["dark patterns"], default=True),
        _dom("financial_governance", ["credit"], default=True),
    )
    rv = RenderVarsCatalog(version="v1",
                           consumer_protection={"x": ["y"]},
                           financial_governance={"x": ["y"]})
    templates = _templates(_tpl("tpl_1", "consumer_protection", "{x}"))
    with pytest.raises(ValueError, match="exactly one default:true domain"):
        validate_render_inputs(_make_inputs(domains=domains, render_vars=rv, templates=templates))


def test_validate_errors_on_missing_domain_in_render_vars():
    domains = _domains(_dom("consumer_protection", ["dark patterns"], default=True))
    rv = RenderVarsCatalog(version="v1")  # no consumer_protection section
    templates = _templates(_tpl("tpl_1", "consumer_protection", "{x}"))
    with pytest.raises(ValueError, match="domain 'consumer_protection' not found in render_vars"):
        validate_render_inputs(_make_inputs(domains=domains, render_vars=rv, templates=templates))


def test_validate_errors_on_missing_placeholder_in_domain():
    domains = _domains(_dom("consumer_protection", ["dark patterns"], default=True))
    rv = RenderVarsCatalog(version="v1", consumer_protection={"marketing_goal": ["upsell"]})
    templates = _templates(
        _tpl("tpl_1", "consumer_protection", "{marketing_goal} and {manipulation_technique}")
    )
    with pytest.raises(ValueError, match="placeholder '{manipulation_technique}'"):
        validate_render_inputs(_make_inputs(domains=domains, render_vars=rv, templates=templates))


def test_validate_collects_all_errors_before_raising():
    domains = _domains(_dom("consumer_protection", ["dark patterns"], default=True))
    rv = RenderVarsCatalog(version="v1", consumer_protection={})
    templates = _templates(
        _tpl("tpl_1", "consumer_protection", "{slot_a} and {slot_b}")
    )
    with pytest.raises(ValueError) as exc_info:
        validate_render_inputs(_make_inputs(domains=domains, render_vars=rv, templates=templates))
    msg = str(exc_info.value)
    assert "slot_a" in msg
    assert "slot_b" in msg
