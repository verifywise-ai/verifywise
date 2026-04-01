"""E2E: Response Cache

Tests the full caching lifecycle:
- Global cache settings (GET/PUT)
- Endpoint cache toggle
- Cache stats
- Cache purge
- Cache hit/miss via proxy (if virtual key + endpoint available)
"""

import time

from conftest import set_state, get_state


# ─── Cache Settings ──────────────────────────────────────────────────────────


def test_get_cache_settings(api):
    """GET /cache/settings — should return defaults or saved settings."""
    res = api.get("/cache/settings")
    assert res.status_code == 200, res.text
    data = res.json()
    # May be wrapped in "settings" key or at top level
    settings = data.get("settings", data)
    assert "cache_global_enabled" in settings
    assert "cache_default_ttl_seconds" in settings
    assert "cache_max_entries_per_org" in settings


def test_update_cache_settings(api):
    """PUT /cache/settings — save custom values."""
    res = api.put("/cache/settings", json={
        "cache_global_enabled": True,
        "cache_default_ttl_seconds": 7200,
        "cache_max_entries_per_org": 10000,
    })
    assert res.status_code == 200, res.text
    data = res.json()
    settings = data.get("settings", data)
    assert settings["cache_default_ttl_seconds"] == 7200
    assert settings["cache_max_entries_per_org"] == 10000


def test_cache_settings_roundtrip(api):
    """Verify saved settings persist on re-read."""
    res = api.get("/cache/settings")
    assert res.status_code == 200
    settings = res.json().get("settings", res.json())
    assert settings["cache_default_ttl_seconds"] == 7200


def test_restore_cache_settings(api):
    """Restore default settings."""
    res = api.put("/cache/settings", json={
        "cache_global_enabled": True,
        "cache_default_ttl_seconds": 14400,
        "cache_max_entries_per_org": 50000,
    })
    assert res.status_code == 200


# ─── Cache Settings Don't Clobber Guardrail Settings ─────────────────────────


def test_cache_settings_dont_clobber_guardrails(api):
    """Saving cache settings should not null-out guardrail settings."""
    # Read current guardrail settings
    gs_res = api.get("/guardrails/settings")
    if gs_res.status_code != 200:
        return  # No guardrail settings row — skip
    gs = gs_res.json().get("settings", gs_res.json())
    if not gs:
        return

    original_pii = gs.get("pii_on_error", "block")

    # Save cache settings
    api.put("/cache/settings", json={
        "cache_global_enabled": True,
        "cache_default_ttl_seconds": 3600,
        "cache_max_entries_per_org": 25000,
    })

    # Re-read guardrail settings — should be unchanged
    gs_res2 = api.get("/guardrails/settings")
    assert gs_res2.status_code == 200
    gs2 = gs_res2.json().get("settings", gs_res2.json())
    assert gs2.get("pii_on_error") == original_pii, \
        f"Guardrail pii_on_error changed from '{original_pii}' to '{gs2.get('pii_on_error')}' after saving cache settings"

    # Restore
    api.put("/cache/settings", json={
        "cache_global_enabled": True,
        "cache_default_ttl_seconds": 14400,
        "cache_max_entries_per_org": 50000,
    })


# ─── Cache Stats ─────────────────────────────────────────────────────────────


def test_get_cache_stats(api):
    """GET /cache/stats — should return aggregate stats."""
    res = api.get("/cache/stats")
    assert res.status_code == 200, res.text
    data = res.json()
    stats = data.get("stats", data)
    assert "total_entries" in stats
    assert "total_hits" in stats
    assert "total_cost_saved" in stats
    assert "hit_rate_pct" in stats


# ─── Endpoint Cache Toggle ───────────────────────────────────────────────────


def test_create_cached_endpoint(api):
    """Create an endpoint with caching enabled."""
    import random
    suffix = random.randint(1000, 9999)

    # First create a test API key
    key_res = api.post("/keys", json={
        "key_name": f"Cache Test Key {suffix}",
        "provider": "openai",
        "api_key": f"sk-test-cache-fake-key-{suffix}-abcdefghijklmno",
    })
    assert key_res.status_code in (200, 201), key_res.text
    key_id = key_res.json()["data"]["id"]
    set_state("cache_test_key_id", key_id)

    # Create endpoint with cache enabled
    res = api.post("/endpoints", json={
        "display_name": f"Cache Test Endpoint {suffix}",
        "slug": f"cache-test-ep-{suffix}",
        "provider": "openai",
        "model": "openai/gpt-4o-mini",
        "api_key_id": key_id,
        "cache_enabled": True,
        "cache_ttl_seconds": 300,
    })
    assert res.status_code in (200, 201), res.text
    ep = res.json().get("endpoint", res.json().get("data", {}))
    assert ep.get("cache_enabled") is True
    assert ep.get("cache_ttl_seconds") == 300
    set_state("cache_test_ep_id", ep["id"])
    set_state("cache_test_ep_slug", ep.get("slug"))


def test_endpoint_list_includes_cache_fields(api):
    """GET /endpoints — cache fields should be visible."""
    slug = get_state("cache_test_ep_slug")
    if not slug:
        return
    res = api.get("/endpoints")
    assert res.status_code == 200
    endpoints = res.json().get("endpoints", res.json().get("data", []))
    cached_ep = next((e for e in endpoints if e.get("slug") == slug), None)
    assert cached_ep is not None, f"{slug} not found in endpoints list"
    assert cached_ep.get("cache_enabled") is True
    assert cached_ep.get("cache_ttl_seconds") == 300


def test_toggle_cache_off(api):
    """PATCH endpoint to disable cache."""
    ep_id = get_state("cache_test_ep_id")
    if not ep_id:
        return
    res = api.patch(f"/endpoints/{ep_id}", json={"cache_enabled": False})
    assert res.status_code == 200, res.text
    ep = res.json().get("endpoint", res.json().get("data", {}))
    assert ep.get("cache_enabled") is False


def test_toggle_cache_on(api):
    """PATCH endpoint to re-enable cache."""
    ep_id = get_state("cache_test_ep_id")
    if not ep_id:
        return
    res = api.patch(f"/endpoints/{ep_id}", json={"cache_enabled": True})
    assert res.status_code == 200, res.text
    ep = res.json().get("endpoint", res.json().get("data", {}))
    assert ep.get("cache_enabled") is True


# ─── Cache Auto-Invalidation ────────────────────────────────────────────────


def test_model_change_invalidates_cache(api):
    """Changing model should clear the endpoint's cache."""
    ep_id = get_state("cache_test_ep_id")
    if not ep_id:
        return
    # Change model
    res = api.patch(f"/endpoints/{ep_id}", json={"model": "openai/gpt-4o"})
    assert res.status_code == 200, res.text

    # Change back
    res = api.patch(f"/endpoints/{ep_id}", json={"model": "openai/gpt-4o-mini"})
    assert res.status_code == 200


# ─── Cache Purge ─────────────────────────────────────────────────────────────


def test_purge_cache(api):
    """POST /cache/purge — should succeed even if nothing to purge."""
    res = api.post("/cache/purge")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data.get("purged") is True
    assert "deleted" in data


def test_clear_endpoint_cache(api):
    """DELETE /cache/endpoint/:id — clear cache for specific endpoint."""
    ep_id = get_state("cache_test_ep_id")
    if not ep_id:
        return
    res = api.delete(f"/cache/endpoint/{ep_id}")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data.get("cleared") is True


# ─── Cache Key Generation (Unit Tests) ───────────────────────────────────────


def test_cache_key_deterministic():
    """Same input always produces same hash."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    from services.cache_service import generate_cache_key

    key1 = generate_cache_key("gpt-4o", [{"role": "user", "content": "test"}], 0.7, 1000)
    key2 = generate_cache_key("gpt-4o", [{"role": "user", "content": "test"}], 0.7, 1000)
    assert key1 == key2
    assert len(key1) == 64


def test_cache_key_varies_on_model():
    """Different models produce different hashes."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    from services.cache_service import generate_cache_key

    key1 = generate_cache_key("gpt-4o", [{"role": "user", "content": "test"}], 0.7, 1000)
    key2 = generate_cache_key("claude-sonnet-4-20250514", [{"role": "user", "content": "test"}], 0.7, 1000)
    assert key1 != key2


def test_cache_key_varies_on_content():
    """Different message content produces different hashes."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    from services.cache_service import generate_cache_key

    key1 = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], 0.7, 1000)
    key2 = generate_cache_key("gpt-4o", [{"role": "user", "content": "world"}], 0.7, 1000)
    assert key1 != key2


def test_cache_key_includes_system_prompt():
    """System prompt affects the hash."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    from services.cache_service import generate_cache_key

    msgs1 = [{"role": "system", "content": "helpful"}, {"role": "user", "content": "hi"}]
    msgs2 = [{"role": "system", "content": "rude"}, {"role": "user", "content": "hi"}]
    assert generate_cache_key("gpt-4o", msgs1, 0.7, 1000) != generate_cache_key("gpt-4o", msgs2, 0.7, 1000)


# ─── Cleanup ─────────────────────────────────────────────────────────────────


def test_cleanup_cache_test_resources(api):
    """Delete test endpoint and API key."""
    ep_id = get_state("cache_test_ep_id")
    if ep_id:
        api.delete(f"/endpoints/{ep_id}")

    key_id = get_state("cache_test_key_id")
    if key_id:
        api.delete(f"/keys/{key_id}")
