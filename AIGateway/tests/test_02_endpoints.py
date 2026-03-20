from conftest import set_state, get_state
"""E2E: Endpoint Management"""

import pytest



@pytest.fixture
def test_key_id(api):
    """Create a temporary API key for endpoint tests."""
    res = api.post("/keys", json={
        "key_name": "E2E Endpoint Test Key",
        "provider": "openai",
        "api_key": "sk-test-endpoint-fake-key-1234567890abcdefghijklmn",
    })
    assert res.status_code == 201
    key_id = res.json()["data"]["id"]
    yield key_id
    api.delete(f"/keys/{key_id}")


def test_create_endpoint(api, test_key_id):
    """Create endpoint with valid config."""
    res = api.post("/endpoints", json={
        "display_name": "E2E Test Endpoint",
        "slug": "e2e-test-endpoint",
        "provider": "openai",
        "model": "openai/gpt-4o-mini",
        "api_key_id": test_key_id,
        "max_tokens": 1024,
        "temperature": 0.7,
    })
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert data["slug"] == "e2e-test-endpoint"
    set_state("e2e_endpoint_id", data["id"])


def test_list_endpoints(api):
    """List endpoints — should include the one we just created."""
    res = api.get("/endpoints")
    assert res.status_code == 200
    slugs = [e["slug"] for e in res.json()["data"]]
    assert "e2e-test-endpoint" in slugs


def test_get_endpoint_by_id(api):
    """Get single endpoint by ID."""
    ep_id = get_state("e2e_endpoint_id", None)
    if not ep_id:
        pytest.skip("No endpoint")
    res = api.get(f"/endpoints/{ep_id}")
    assert res.status_code == 200
    assert res.json()["data"]["slug"] == "e2e-test-endpoint"


def test_update_endpoint(api):
    """Update endpoint display name."""
    ep_id = get_state("e2e_endpoint_id", None)
    if not ep_id:
        pytest.skip("No endpoint")
    res = api.patch(f"/endpoints/{ep_id}", json={
        "display_name": "E2E Test Endpoint Updated",
    })
    assert res.status_code == 200


def test_toggle_endpoint(api):
    """Deactivate and reactivate endpoint."""
    ep_id = get_state("e2e_endpoint_id", None)
    if not ep_id:
        pytest.skip("No endpoint")
    # Deactivate
    res = api.patch(f"/endpoints/{ep_id}", json={"is_active": False})
    assert res.status_code == 200
    # Reactivate
    res = api.patch(f"/endpoints/{ep_id}", json={"is_active": True})
    assert res.status_code == 200


def test_delete_endpoint(api):
    """Delete endpoint."""
    ep_id = get_state("e2e_endpoint_id", None)
    if not ep_id:
        pytest.skip("No endpoint")
    res = api.delete(f"/endpoints/{ep_id}")
    assert res.status_code == 200
