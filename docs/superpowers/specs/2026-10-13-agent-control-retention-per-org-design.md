# Agent Control log retention per organization

## Problem

Agent Control tool-call logs (`ai_gateway_mcp_audit_logs`) and decided approval requests (`ai_gateway_mcp_approval_requests`) are deleted by one daily cleanup that uses a single deployment setting, `MCP_AUDIT_RETENTION_DAYS` (default 30). On a multi-tenant SaaS deployment no organization can choose its own period, so the retention answer for customers has to carry a caveat. Both tables already have `organization_id`.

Server logs stay per deployment (operator-managed operational logs; out of scope).

## Decisions

1. **Where the period lives.** A new nullable column `mcp_audit_retention_days` on `ai_gateway_guardrail_settings`, the per-organization AI Gateway settings row that already holds the guardrail and spend log periods. `NULL` means "use the deployment default". Reusing this row reuses its partial-update save, input validation, previous-value read under a row lock, and the Express handler that writes retention changes to the audit ledger.
2. **Deployment default stays.** `MCP_AUDIT_RETENTION_DAYS` remains the period for every organization that has not set its own. Self-hosted installs behave exactly as today until an Admin sets a value.
3. **Operator floor.** A new deployment setting `MCP_AUDIT_RETENTION_MIN_DAYS` (default 7) is the shortest period an organization may set. Saves accept whole numbers from the floor to 3650 days, or `null` to return to the default; anything else is a 400. The cleanup also applies the floor to an organization's own period (`GREATEST(period, floor)`), so raising the floor later protects data an organization set shorter before. The floor never applies to the deployment default, so a self-hosted install that set `MCP_AUDIT_RETENTION_DAYS` below the floor keeps today's behaviour.
4. **Cleanup turned off.** A deployment default of 0 or less keeps logs indefinitely for organizations without their own period. Organizations with their own period are still cleaned. **This is a fix, not unchanged behaviour:** before this change the cleanup had no guard, so a default of 0 or less deleted every Agent Control log and decided approval each night (`created_at < NOW() - 0 days`), while the Data retention tab showed "kept indefinitely".
5. **No "keep indefinitely" choice per organization.** The organization picks a number of days or the deployment default, like the other AI Gateway rows.
6. **Who can change it.** Admins only, as for the other AI Gateway retention settings (`require_admin` in the gateway; the Data retention tab is gated on `organization.admin`).

## Design

### AI Gateway

- Alembic `a0012_agent_control_retention.py`: `ALTER TABLE ai_gateway_guardrail_settings ADD COLUMN IF NOT EXISTS mcp_audit_retention_days INTEGER NULL CHECK (mcp_audit_retention_days IS NULL OR mcp_audit_retention_days >= 1)`. Full `downgrade()`.
- `config.py`: `mcp_audit_retention_min_days: int = 7`.
- `crud/guardrails.py`:
  - `mcp_audit_retention_days` joins the settings columns, default `None`, and the nullable keys (an explicit `null` is stored, meaning "use the default").
  - Validation: an integer (not a boolean) from `mcp_audit_retention_min_days` to 3650, or `null`; otherwise 400 naming the range.
  - Added to `_PREVIOUS_RETENTION_KEYS`, so the save returns its previous value.
- Cleanup (`batch_delete_expired` callers in `crud/mcp_audit.py` and `crud/mcp_approvals.py`): one batched statement per table that joins the settings row and deletes rows older than the organization's effective period:
  `effective = CASE WHEN s.mcp_audit_retention_days IS NULL THEN :default_days ELSE GREATEST(s.mcp_audit_retention_days, :min_days) END`, with organizations whose `s.mcp_audit_retention_days` is NULL skipped when `:default_days <= 0`. Approvals keep their existing condition (`status != 'pending' OR expires_at < NOW()`). The helper gains a per-organization variant rather than changing its existing callers.
- `GET /internal/retention/config` returns `{ mcp_audit_retention_days, mcp_audit_retention_min_days }`.

### Backend (Express)

- `controllers/aiGatewaySettings.ctrl.ts`: `mcp_audit_retention_days` joins the retention keys that produce a ledger entry ("Agent Control log retention"); `null` is described as "the deployment default".
- `controllers/dataRetention.ctrl.ts`: the `agent_control_logs` row becomes `source: "app"`. Its period is the organization's own value, or the deployment default. New row fields: `usesDeploymentDefault` (boolean), `deploymentDefaultDays` (number or null) and `minDays`. When either the guardrail settings or the retention config cannot be read, the row is unavailable, as now.

### Frontend

- `EditRetentionModal`: for `agent_control_logs`, a days field (min = `minDays`, max 3650) and a "Use the deployment default (N days)" choice. Saves `PUT /api/ai-gateway/guardrails/settings` with `{ mcp_audit_retention_days: N | null }`.
- Shortening the effective period opens a confirmation: older tool-call logs and decided approvals will be deleted permanently at the next daily cleanup.
- The table shows "N days (deployment default)" when the organization has no own value.
- New strings in de, fr and es.

### Docs

`docs/technical/domains/data-retention.md` (table and AI Gateway section), `docs/technical/domains/agent-control.md` (retention note), and `MCP_AUDIT_RETENTION_MIN_DAYS` in `docs/deployment/CONFIGURATION_REFERENCE.md`.

## Tests

- Gateway (pytest): validation (range, floor, boolean, null resets); the save returns the previous value; cleanup per organization (own period, default, floor raised above a stored value, default 0 with and without an own period); approvals keep pending rows.
- Express: the tab row in all states (own value, default, unavailable); a ledger entry for a changed value and for a reset to default.
- Client: the modal saves a number and the default choice, enforces the range, and confirms before shortening.

## Out of scope

- Per-organization server log retention.
- "Last cleanup" for the Agent Control row (the cleanup records no runs today).
- Retention controls on the Agent Control pages themselves.
