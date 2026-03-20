"""E2E: Risk Detection Suggestions"""

import pytest



def test_get_risk_settings(api):
    """Get risk settings — should return all 8 conditions with defaults."""
    res = api.get("/risk-settings")
    assert res.status_code == 200
    settings = res.json()["data"]
    assert len(settings) == 8
    condition_ids = [s["condition_id"] for s in settings]
    assert "pii_exposure" in condition_ids
    assert "no_guardrails" in condition_ids
    assert "budget_exhaustion" in condition_ids
    assert "provider_concentration" in condition_ids
    assert "error_rate_spike" in condition_ids
    assert "cost_anomaly" in condition_ids
    assert "stale_virtual_key" in condition_ids
    assert "unused_endpoint" in condition_ids


def test_update_risk_setting(api):
    """Update a condition threshold."""
    res = api.put("/risk-settings/pii_exposure", json={
        "is_enabled": True,
        "threshold": {"count": 50, "period_days": 14},
    })
    assert res.status_code == 200


def test_toggle_risk_condition(api):
    """Disable and re-enable a condition."""
    res = api.put("/risk-settings/provider_concentration", json={
        "is_enabled": False,
    })
    assert res.status_code == 200
    res = api.put("/risk-settings/provider_concentration", json={
        "is_enabled": True,
    })
    assert res.status_code == 200


def test_run_manual_detection(api):
    """Run manual risk detection — should return count."""
    res = api.post("/risk-suggestions/detect")
    assert res.status_code == 200
    data = res.json()["data"]
    assert "new_suggestions" in data


def test_get_risk_suggestions(api):
    """Get risk suggestions — should return a list."""
    res = api.get("/risk-suggestions")
    assert res.status_code == 200
    assert isinstance(res.json()["data"], list)


def test_get_risk_suggestions_filtered(api):
    """Get risk suggestions filtered by status."""
    res = api.get("/risk-suggestions?status=pending")
    assert res.status_code == 200
    for s in res.json()["data"]:
        assert s["status"] == "pending"
