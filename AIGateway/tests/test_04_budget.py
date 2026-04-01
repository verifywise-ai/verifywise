"""E2E: Budget Management"""

import pytest



def test_set_budget(api):
    """Set a monthly budget."""
    res = api.put("/budget", json={
        "monthly_limit_usd": 100.00,
        "alert_threshold_pct": 80,
        "is_hard_limit": False,
    })
    assert res.status_code == 200, res.text


def test_get_budget(api):
    """Get budget — should return the configured values."""
    res = api.get("/budget")
    assert res.status_code == 200
    data = res.json()["data"]
    if data:
        assert float(data["monthly_limit_usd"]) == 100.00
        assert data["alert_threshold_pct"] == 80


def test_update_budget_hard_limit(api):
    """Update to hard limit."""
    res = api.put("/budget", json={
        "monthly_limit_usd": 50.00,
        "alert_threshold_pct": 90,
        "is_hard_limit": True,
    })
    assert res.status_code == 200


def test_reset_budget_to_soft(api):
    """Reset to soft limit with higher budget for other tests."""
    res = api.put("/budget", json={
        "monthly_limit_usd": 1000.00,
        "alert_threshold_pct": 80,
        "is_hard_limit": False,
    })
    assert res.status_code == 200
