"""
Risk condition evaluators for the AI Gateway.

Each condition evaluator queries the database and returns a dict describing
whether a risk was detected and, if so, all metadata needed to create a
suggestion row.
"""

import asyncio
from typing import Optional
from sqlalchemy import text
from database.db import get_db
from crud.risk import get_risk_settings, has_pending_suggestion, get_all_pending_condition_ids


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _fetch_one(query: str, params: dict):
    async with get_db() as db:
        result = await db.execute(text(query), params)
        return result.mappings().first()
    return None


async def _fetch_all(query: str, params: dict):
    async with get_db() as db:
        result = await db.execute(text(query), params)
        return result.mappings().all()
    return []


# ---------------------------------------------------------------------------
# Individual condition evaluators
# ---------------------------------------------------------------------------

async def _evaluate_pii_exposure(org_id: int, threshold: dict) -> dict:
    """Count PII detections in guardrail_logs within the last N days."""
    days = threshold.get("days", 7)
    min_count = threshold.get("min_count", 1)

    row = await _fetch_one(
        """
        SELECT COUNT(*) AS pii_count
        FROM ai_gateway_guardrail_logs gl
        JOIN ai_gateway_endpoints ep ON ep.id = gl.endpoint_id
        WHERE ep.org_id = :org_id
          AND gl.triggered_rule_type = 'pii'
          AND gl.created_at >= NOW() - INTERVAL '1 day' * :days
        """,
        {"org_id": org_id, "days": days},
    )

    pii_count = int(row["pii_count"]) if row else 0
    detected = pii_count >= min_count

    return {
        "detected": detected,
        "condition_id": "pii_exposure",
        "title": "PII Exposure Detected in Requests",
        "description": (
            f"{pii_count} PII detection(s) found in guardrail logs over the last {days} day(s). "
            "Sensitive data may be leaking through AI requests."
        ),
        "severity": "high",
        "evidence": {"pii_count": pii_count, "days": days, "min_count": min_count},
        "compliance_tags": ["GDPR", "HIPAA", "EU AI Act Art. 10"],
        "suggested_mitigation": (
            "Review guardrail rules for PII detection. "
            "Enable or tighten PII redaction rules on affected endpoints."
        ),
    }


async def _evaluate_no_guardrails(org_id: int, threshold: dict) -> dict:
    """Find active endpoints with zero active guardrail rules."""
    rows = await _fetch_all(
        """
        SELECT ep.id, ep.name
        FROM ai_gateway_endpoints ep
        WHERE ep.org_id = :org_id
          AND ep.is_active = TRUE
          AND NOT EXISTS (
              SELECT 1 FROM ai_gateway_guardrail_rules gr
              WHERE gr.endpoint_id = ep.id
                AND gr.is_active = TRUE
          )
        """,
        {"org_id": org_id},
    )

    unprotected = [{"id": r["id"], "name": r["name"]} for r in rows]
    detected = len(unprotected) > 0

    return {
        "detected": detected,
        "condition_id": "no_guardrails",
        "title": "Active Endpoints Without Guardrails",
        "description": (
            f"{len(unprotected)} active endpoint(s) have no active guardrail rules configured. "
            "These endpoints are unprotected."
        ),
        "severity": "medium",
        "evidence": {"unprotected_endpoints": unprotected, "count": len(unprotected)},
        "compliance_tags": ["EU AI Act Art. 9", "ISO 42001"],
        "suggested_mitigation": (
            "Add at least one active guardrail rule to every active endpoint. "
            "Consider enabling default PII and prompt-injection rules."
        ),
    }


async def _evaluate_budget_exhaustion(org_id: int, threshold: dict) -> dict:
    """Check whether spend percentage of budget has reached the threshold."""
    pct_threshold = threshold.get("percent", 80)

    row = await _fetch_one(
        """
        SELECT
            SUM(s.total_cost)                         AS total_spend,
            MAX(b.monthly_budget_usd)                 AS budget
        FROM ai_gateway_spend_logs s
        JOIN ai_gateway_virtual_keys vk ON vk.id = s.virtual_key_id
        LEFT JOIN ai_gateway_budgets b ON b.org_id = vk.org_id
        WHERE vk.org_id = :org_id
          AND DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', NOW())
        """,
        {"org_id": org_id},
    )

    total_spend = float(row["total_spend"] or 0) if row else 0.0
    budget = float(row["budget"] or 0) if row else 0.0
    pct_used = (total_spend / budget * 100) if budget > 0 else 0.0
    detected = budget > 0 and pct_used >= pct_threshold

    return {
        "detected": detected,
        "condition_id": "budget_exhaustion",
        "title": "Monthly Budget Nearly Exhausted",
        "description": (
            f"Current month spend is ${total_spend:.2f} "
            f"({pct_used:.1f}% of ${budget:.2f} budget), "
            f"exceeding the {pct_threshold}% threshold."
        ),
        "severity": "high",
        "evidence": {
            "total_spend_usd": round(total_spend, 4),
            "budget_usd": round(budget, 4),
            "percent_used": round(pct_used, 2),
            "threshold_percent": pct_threshold,
        },
        "compliance_tags": ["Cost Governance"],
        "suggested_mitigation": (
            "Review spending by virtual key and endpoint. "
            "Consider raising the budget, reducing usage, or adding spend limits to virtual keys."
        ),
    }


async def _evaluate_provider_concentration(org_id: int, threshold: dict) -> dict:
    """Check if the top provider accounts for >= threshold % of 30-day spend."""
    pct_threshold = threshold.get("percent", 80)

    rows = await _fetch_all(
        """
        SELECT
            sl.provider,
            SUM(sl.total_cost) AS provider_spend
        FROM ai_gateway_spend_logs sl
        JOIN ai_gateway_virtual_keys vk ON vk.id = sl.virtual_key_id
        WHERE vk.org_id = :org_id
          AND sl.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY sl.provider
        ORDER BY provider_spend DESC
        """,
        {"org_id": org_id},
    )

    total = sum(float(r["provider_spend"]) for r in rows)
    top_provider = dict(rows[0]) if rows else None
    top_pct = (
        float(top_provider["provider_spend"]) / total * 100
        if top_provider and total > 0
        else 0.0
    )
    detected = top_provider is not None and total > 0 and top_pct >= pct_threshold

    return {
        "detected": detected,
        "condition_id": "provider_concentration",
        "title": "High Provider Concentration Risk",
        "description": (
            f"Provider '{top_provider['provider'] if top_provider else 'N/A'}' accounts for "
            f"{top_pct:.1f}% of 30-day AI spend, exceeding the {pct_threshold}% threshold."
        ),
        "severity": "medium",
        "evidence": {
            "top_provider": top_provider["provider"] if top_provider else None,
            "top_provider_pct": round(top_pct, 2),
            "total_spend_usd": round(total, 4),
            "threshold_percent": pct_threshold,
            "breakdown": [
                {"provider": r["provider"], "spend_usd": round(float(r["provider_spend"]), 4)}
                for r in rows
            ],
        },
        "compliance_tags": ["Vendor Risk", "EU AI Act Art. 9"],
        "suggested_mitigation": (
            "Diversify AI provider usage across multiple vendors to reduce dependency risk."
        ),
    }


async def _evaluate_error_rate_spike(org_id: int, threshold: dict) -> dict:
    """Check if 24-hour error rate >= multiplier * 7-day error rate (min 10 requests)."""
    multiplier = threshold.get("multiplier", 2.0)
    min_requests = threshold.get("min_requests", 10)

    row = await _fetch_one(
        """
        SELECT
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')       AS req_24h,
            COUNT(*) FILTER (
                WHERE created_at >= NOW() - INTERVAL '24 hours'
                  AND status_code >= 400
            )                                                                        AS err_24h,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')         AS req_7d,
            COUNT(*) FILTER (
                WHERE created_at >= NOW() - INTERVAL '7 days'
                  AND status_code >= 400
            )                                                                        AS err_7d
        FROM ai_gateway_request_logs rl
        JOIN ai_gateway_endpoints ep ON ep.id = rl.endpoint_id
        WHERE ep.org_id = :org_id
        """,
        {"org_id": org_id},
    )

    req_24h = int(row["req_24h"]) if row else 0
    err_24h = int(row["err_24h"]) if row else 0
    req_7d = int(row["req_7d"]) if row else 0
    err_7d = int(row["err_7d"]) if row else 0

    rate_24h = err_24h / req_24h if req_24h >= min_requests else 0.0
    rate_7d = err_7d / req_7d if req_7d > 0 else 0.0
    detected = req_24h >= min_requests and rate_7d > 0 and rate_24h >= multiplier * rate_7d

    return {
        "detected": detected,
        "condition_id": "error_rate_spike",
        "title": "Error Rate Spike Detected",
        "description": (
            f"24-hour error rate ({rate_24h * 100:.1f}%) is {multiplier}x higher than "
            f"the 7-day baseline ({rate_7d * 100:.1f}%)."
        ),
        "severity": "high",
        "evidence": {
            "rate_24h_pct": round(rate_24h * 100, 2),
            "rate_7d_pct": round(rate_7d * 100, 2),
            "req_24h": req_24h,
            "err_24h": err_24h,
            "req_7d": req_7d,
            "err_7d": err_7d,
            "multiplier": multiplier,
        },
        "compliance_tags": ["Reliability", "EU AI Act Art. 9"],
        "suggested_mitigation": (
            "Investigate recent errors in request logs. "
            "Check provider status pages and review any recent configuration changes."
        ),
    }


async def _evaluate_cost_anomaly(org_id: int, threshold: dict) -> dict:
    """Check if today's cost >= multiplier * 7-day daily average (min $1)."""
    multiplier = threshold.get("multiplier", 2.0)
    min_usd = threshold.get("min_usd", 1.0)

    row = await _fetch_one(
        """
        SELECT
            SUM(sl.total_cost) FILTER (
                WHERE DATE_TRUNC('day', sl.created_at) = DATE_TRUNC('day', NOW())
            )                                                           AS today_cost,
            SUM(sl.total_cost) FILTER (
                WHERE sl.created_at >= NOW() - INTERVAL '7 days'
            ) / 7.0                                                     AS avg_daily_cost
        FROM ai_gateway_spend_logs sl
        JOIN ai_gateway_virtual_keys vk ON vk.id = sl.virtual_key_id
        WHERE vk.org_id = :org_id
        """,
        {"org_id": org_id},
    )

    today_cost = float(row["today_cost"] or 0) if row else 0.0
    avg_daily = float(row["avg_daily_cost"] or 0) if row else 0.0
    detected = today_cost >= min_usd and avg_daily > 0 and today_cost >= multiplier * avg_daily

    return {
        "detected": detected,
        "condition_id": "cost_anomaly",
        "title": "Unusual Cost Spike Today",
        "description": (
            f"Today's AI spend (${today_cost:.2f}) is {multiplier}x higher than "
            f"the 7-day daily average (${avg_daily:.2f})."
        ),
        "severity": "medium",
        "evidence": {
            "today_cost_usd": round(today_cost, 4),
            "avg_daily_cost_usd": round(avg_daily, 4),
            "multiplier": multiplier,
            "min_usd": min_usd,
        },
        "compliance_tags": ["Cost Governance"],
        "suggested_mitigation": (
            "Investigate which virtual keys or endpoints drove today's cost increase. "
            "Check for runaway jobs or unexpected traffic spikes."
        ),
    }


async def _evaluate_stale_virtual_key(org_id: int, threshold: dict) -> dict:
    """Find virtual keys older than N days that still have active spend."""
    days = threshold.get("days", 90)

    rows = await _fetch_all(
        """
        SELECT
            vk.id,
            vk.name,
            vk.created_at,
            SUM(sl.total_cost) AS total_spend
        FROM ai_gateway_virtual_keys vk
        JOIN ai_gateway_spend_logs sl ON sl.virtual_key_id = vk.id
        WHERE vk.org_id = :org_id
          AND vk.is_active = TRUE
          AND vk.created_at <= NOW() - INTERVAL '1 day' * :days
          AND sl.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY vk.id, vk.name, vk.created_at
        HAVING SUM(sl.total_cost) > 0
        """,
        {"org_id": org_id, "days": days},
    )

    stale_keys = [
        {
            "id": r["id"],
            "name": r["name"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "spend_last_30d_usd": round(float(r["total_spend"]), 4),
        }
        for r in rows
    ]
    detected = len(stale_keys) > 0

    return {
        "detected": detected,
        "condition_id": "stale_virtual_key",
        "title": "Stale Virtual Keys With Active Spend",
        "description": (
            f"{len(stale_keys)} virtual key(s) older than {days} days still have spend "
            "in the last 30 days. These may be leaked or forgotten credentials."
        ),
        "severity": "medium",
        "evidence": {"stale_keys": stale_keys, "days_threshold": days},
        "compliance_tags": ["Security", "Key Management", "EU AI Act Art. 9"],
        "suggested_mitigation": (
            "Rotate or deactivate stale virtual keys. "
            "Audit which services are using them and update their credentials."
        ),
    }


async def _evaluate_unused_endpoint(org_id: int, threshold: dict) -> dict:
    """Find active endpoints with zero requests in the last N days."""
    days = threshold.get("days", 30)

    rows = await _fetch_all(
        """
        SELECT ep.id, ep.name, ep.created_at
        FROM ai_gateway_endpoints ep
        WHERE ep.org_id = :org_id
          AND ep.is_active = TRUE
          AND NOT EXISTS (
              SELECT 1 FROM ai_gateway_request_logs rl
              WHERE rl.endpoint_id = ep.id
                AND rl.created_at >= NOW() - INTERVAL '1 day' * :days
          )
        """,
        {"org_id": org_id, "days": days},
    )

    unused = [
        {
            "id": r["id"],
            "name": r["name"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]
    detected = len(unused) > 0

    return {
        "detected": detected,
        "condition_id": "unused_endpoint",
        "title": "Active Endpoints With No Recent Traffic",
        "description": (
            f"{len(unused)} active endpoint(s) have received zero requests in the last {days} day(s). "
            "These may be stale configurations consuming guardrail resources."
        ),
        "severity": "low",
        "evidence": {"unused_endpoints": unused, "days_threshold": days, "count": len(unused)},
        "compliance_tags": ["Hygiene", "EU AI Act Art. 9"],
        "suggested_mitigation": (
            "Deactivate or remove unused endpoints to keep the configuration clean "
            "and reduce the attack surface."
        ),
    }


# ---------------------------------------------------------------------------
# Condition definitions registry
# ---------------------------------------------------------------------------

CONDITION_DEFINITIONS: list[dict] = [
    {
        "id": "pii_exposure",
        "label": "PII Exposure",
        "default_threshold": {"days": 7, "min_count": 1},
        "default_severity": "high",
    },
    {
        "id": "no_guardrails",
        "label": "Endpoints Without Guardrails",
        "default_threshold": {},
        "default_severity": "medium",
    },
    {
        "id": "budget_exhaustion",
        "label": "Budget Exhaustion",
        "default_threshold": {"percent": 80},
        "default_severity": "high",
    },
    {
        "id": "provider_concentration",
        "label": "Provider Concentration",
        "default_threshold": {"percent": 80},
        "default_severity": "medium",
    },
    {
        "id": "error_rate_spike",
        "label": "Error Rate Spike",
        "default_threshold": {"multiplier": 2.0, "min_requests": 10},
        "default_severity": "high",
    },
    {
        "id": "cost_anomaly",
        "label": "Cost Anomaly",
        "default_threshold": {"multiplier": 2.0, "min_usd": 1.0},
        "default_severity": "medium",
    },
    {
        "id": "stale_virtual_key",
        "label": "Stale Virtual Keys",
        "default_threshold": {"days": 90},
        "default_severity": "medium",
    },
    {
        "id": "unused_endpoint",
        "label": "Unused Endpoints",
        "default_threshold": {"days": 30},
        "default_severity": "low",
    },
]

_EVALUATOR_MAP = {
    "pii_exposure": _evaluate_pii_exposure,
    "no_guardrails": _evaluate_no_guardrails,
    "budget_exhaustion": _evaluate_budget_exhaustion,
    "provider_concentration": _evaluate_provider_concentration,
    "error_rate_spike": _evaluate_error_rate_spike,
    "cost_anomaly": _evaluate_cost_anomaly,
    "stale_virtual_key": _evaluate_stale_virtual_key,
    "unused_endpoint": _evaluate_unused_endpoint,
}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def evaluate_all_conditions(org_id: int) -> list[dict]:
    """
    Fetch enabled risk settings, run all enabled condition evaluators in
    parallel, then deduplicate against already-pending suggestions.

    Returns a list of result dicts — one per enabled condition — with an
    extra ``already_pending`` key indicating whether a suggestion already
    exists for that condition.
    """
    # Build a map of condition_id -> settings row for quick lookup
    settings_rows = await get_risk_settings(org_id)
    settings_by_id: dict[str, dict] = {row["condition_id"]: row for row in settings_rows}

    # Determine which conditions to run (enabled in settings, or not yet configured)
    enabled_definitions = []
    for defn in CONDITION_DEFINITIONS:
        cid = defn["id"]
        setting = settings_by_id.get(cid)
        if setting is None or setting.get("is_enabled", True):
            enabled_definitions.append(defn)

    # Build coroutines, resolving threshold for each condition
    async def _run(defn: dict):
        cid = defn["id"]
        setting = settings_by_id.get(cid, {})
        raw_threshold = setting.get("threshold") if setting else None
        # threshold may be stored as a dict (after JSON parsing by SQLAlchemy) or None
        threshold = raw_threshold if isinstance(raw_threshold, dict) else defn["default_threshold"]
        evaluator = _EVALUATOR_MAP[cid]
        return await evaluator(org_id, threshold)

    tasks = [_run(defn) for defn in enabled_definitions]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    # Fetch already-pending condition IDs in one query
    pending_ids = await get_all_pending_condition_ids(org_id)

    results: list[dict] = []
    for defn, outcome in zip(enabled_definitions, raw_results):
        if isinstance(outcome, Exception):
            results.append(
                {
                    "condition_id": defn["id"],
                    "detected": False,
                    "error": str(outcome),
                    "already_pending": defn["id"] in pending_ids,
                }
            )
        else:
            outcome["already_pending"] = outcome["condition_id"] in pending_ids
            results.append(outcome)

    return results
