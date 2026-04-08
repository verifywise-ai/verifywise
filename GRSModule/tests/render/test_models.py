# tests/render/test_models.py
import pytest
from pydantic import ValidationError
from render.models import DomainItem, RenderVarsCatalog


def test_domain_item_default_false_by_default():
    d = DomainItem(domain_id="foo", regulated=True, keywords=["a"])
    assert d.default is False


def test_domain_item_accepts_default_true():
    d = DomainItem(domain_id="foo", regulated=True, keywords=["a"], default=True)
    assert d.default is True


def test_render_vars_catalog_get_domain_vars_returns_dict():
    rv = RenderVarsCatalog(
        version="v1",
        consumer_protection={"manipulation_technique": ["dark pattern"]}
    )
    assert rv.get_domain_vars("consumer_protection") == {
        "manipulation_technique": ["dark pattern"]
    }


def test_render_vars_catalog_get_domain_vars_missing_returns_empty():
    rv = RenderVarsCatalog(version="v1")
    assert rv.get_domain_vars("nonexistent") == {}


def test_render_vars_catalog_version_required():
    with pytest.raises(ValidationError):
        RenderVarsCatalog()
