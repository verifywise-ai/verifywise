# tests/render/test_renderer.py
import random
import pytest
from unittest.mock import MagicMock

from render.renderer import _infer_domain, _build_render_vars
from render.models import DomainItem, DomainsCatalog, RenderVarsCatalog


def _make_domains(*items):
    return DomainsCatalog(version="v1", domains=list(items))


def _make_domain(domain_id, keywords, default=False):
    return DomainItem(domain_id=domain_id, regulated=True,
                      keywords=keywords, default=default)


def test_infer_domain_matches_keyword():
    domains = _make_domains(
        _make_domain("consumer_protection", ["dark patterns"], default=True),
        _make_domain("financial_governance", ["credit scoring"]),
    )
    inputs = MagicMock()
    inputs.domains = domains
    assert _infer_domain("this involves dark patterns", inputs) == "consumer_protection"


def test_infer_domain_falls_back_to_default():
    domains = _make_domains(
        _make_domain("consumer_protection", ["dark patterns"], default=True),
        _make_domain("financial_governance", ["credit scoring"]),
    )
    inputs = MagicMock()
    inputs.domains = domains
    assert _infer_domain("unrelated text", inputs) == "consumer_protection"


def test_infer_domain_raises_if_no_default_domain():
    domains = _make_domains(
        _make_domain("consumer_protection", ["dark patterns"], default=False),
    )
    inputs = MagicMock()
    inputs.domains = domains
    with pytest.raises(ValueError, match="No domain marked default"):
        _infer_domain("unrelated text", inputs)


def test_build_render_vars_fills_slots_from_domain():
    rv = RenderVarsCatalog(
        version="v1",
        consumer_protection={
            "manipulation_technique": ["dark pattern"],
            "marketing_goal": ["upsell"],
        }
    )
    rng = random.Random(42)
    template_str = "Use {manipulation_technique} to achieve {marketing_goal}."
    result = _build_render_vars(template_str, "consumer_protection", rv, rng, verb="optimize")
    assert result["verb"] == "optimize"
    assert result["manipulation_technique"] == "dark pattern"
    assert result["marketing_goal"] == "upsell"


def test_build_render_vars_ignores_context_slots():
    rv = RenderVarsCatalog(version="v1", consumer_protection={"target": ["x"]})
    rng = random.Random(42)
    template_str = "{assistant_role}\n{user_role}\n{org_context}\nUse {target}."
    result = _build_render_vars(template_str, "consumer_protection", rv, rng, verb="do")
    assert "assistant_role" not in result
    assert "user_role" not in result
    assert "org_context" not in result
    assert result["target"] == "x"


def test_build_render_vars_skips_missing_slots_gracefully():
    # A slot in the template that isn't in the domain vars — no KeyError
    rv = RenderVarsCatalog(version="v1", consumer_protection={})
    rng = random.Random(42)
    template_str = "Use {missing_slot}."
    result = _build_render_vars(template_str, "consumer_protection", rv, rng, verb="do")
    assert "missing_slot" not in result  # not filled — validator catches this separately
