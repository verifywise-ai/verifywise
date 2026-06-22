/**
 * Phase 2 — Default Approval Rules
 *
 * Built-in rules that apply to all tenants. Tenant custom rules
 * can override these (higher priority wins).
 */

export interface RuleDefinition {
  name: string;
  description: string;
  priority: number;
  conditions: Record<string, unknown>;
  eventType: "auto-approve" | "require-approval" | "auto-reject";
  eventParams?: Record<string, unknown>;
}

/**
 * Default rules ordered by priority (highest first).
 * Higher priority rules are evaluated first — first match wins.
 */
export const defaultRules: RuleDefinition[] = [
  // ── Auto-reject rules (highest priority) ──

  {
    name: "auditor-write-block",
    description: "Auditors cannot perform write operations",
    priority: 1000,
    conditions: {
      all: [
        { fact: "user_role", operator: "equal", value: "Auditor" },
        { fact: "operation_type", operator: "notEqual", value: "read" },
      ],
    },
    eventType: "auto-reject",
    eventParams: { reason: "Auditors have read-only access" },
  },

  // ── Require-approval rules (medium priority) ──

  {
    name: "bulk-delete-requires-admin",
    description: "Bulk delete operations (>1 entity) require admin approval",
    priority: 800,
    conditions: {
      all: [
        { fact: "operation_type", operator: "equal", value: "delete" },
        { fact: "entity_count", operator: "greaterThan", value: 1 },
      ],
    },
    eventType: "require-approval",
    eventParams: { approver_role: "Admin" },
  },
  {
    name: "admin-config-requires-approval",
    description: "Administrative and configuration operations require admin approval",
    priority: 700,
    conditions: {
      all: [{ fact: "tool_category", operator: "equal", value: "admin" }],
    },
    eventType: "require-approval",
    eventParams: { approver_role: "Admin" },
  },
  {
    name: "policy-review-requires-reviewer",
    description: "Policy approval/review actions require a reviewer",
    priority: 600,
    conditions: {
      all: [
        { fact: "tool_category", operator: "equal", value: "policy" },
        { fact: "operation_type", operator: "in", value: ["approve", "review", "submit"] },
      ],
    },
    eventType: "require-approval",
    eventParams: { approver_role: "Reviewer" },
  },
  {
    name: "danger-level-requires-approval",
    description: "High-risk (danger-level) operations always require approval",
    priority: 500,
    conditions: {
      all: [{ fact: "risk_level", operator: "equal", value: "danger" }],
    },
    eventType: "require-approval",
  },
  {
    name: "warning-level-requires-approval",
    description: "Medium-risk (warning-level) operations require approval",
    priority: 400,
    conditions: {
      all: [{ fact: "risk_level", operator: "equal", value: "warning" }],
    },
    eventType: "require-approval",
  },

  // ── Auto-approve rules (lower priority) ──

  {
    name: "read-ops-auto-approve",
    description: "Read operations are always auto-approved",
    priority: 300,
    conditions: {
      all: [{ fact: "operation_type", operator: "equal", value: "read" }],
    },
    eventType: "auto-approve",
  },
  {
    name: "low-risk-single-create",
    description: "Low-risk single entity create operations are auto-approved",
    priority: 200,
    conditions: {
      all: [
        { fact: "operation_type", operator: "equal", value: "create" },
        { fact: "entity_count", operator: "lessThanInclusive", value: 1 },
        { fact: "risk_level", operator: "equal", value: "info" },
      ],
    },
    eventType: "auto-approve",
  },
  {
    name: "info-level-auto-approve",
    description: "Info-level (low impact) operations are auto-approved",
    priority: 100,
    conditions: {
      all: [{ fact: "risk_level", operator: "equal", value: "info" }],
    },
    eventType: "auto-approve",
  },
];
