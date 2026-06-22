/**
 * Phase 2 — Rule Engine
 *
 * Uses json-rules-engine to evaluate facts against approval rules.
 * Loads default + tenant-custom rules, runs the engine, returns the
 * highest-priority decision.
 */

import { Engine, RuleProperties } from "json-rules-engine";
import { getMergedRules } from "./rules/customRules";
import { logStructured } from "../../utils/logger/fileLogger";
import type { RuleDefinition } from "./rules/defaultRules";

const fileName = "ruleEngine.ts";

export type RuleDecision = "auto-approve" | "require-approval" | "auto-reject";

export interface RuleEvaluationResult {
  decision: RuleDecision;
  matchedRule: string | null;
  matchedPriority: number;
  eventParams?: Record<string, unknown>;
  allMatches: Array<{ name: string; decision: RuleDecision; priority: number }>;
}

/**
 * Fact schema for the rule engine.
 */
export interface ApprovalFacts {
  operation_type:
    | "read"
    | "create"
    | "update"
    | "delete"
    | "archive"
    | "approve"
    | "review"
    | "submit";
  entity_type?: string;
  entity_count: number;
  risk_level: "info" | "warning" | "danger";
  tool_category: string;
  tool_name: string;
  user_role: string;
  is_bulk: boolean;
  affected_fields?: string[];
}

/**
 * Convert our rule definition to json-rules-engine format.
 */
function toEngineRule(rule: RuleDefinition): RuleProperties {
  return {
    name: rule.name,
    priority: rule.priority,
    conditions: rule.conditions as any,
    event: {
      type: rule.eventType,
      params: {
        ...rule.eventParams,
        ruleName: rule.name,
        priority: rule.priority,
      },
    },
  };
}

/**
 * Derive facts from a tool operation request.
 */
export function deriveFacts(params: {
  toolName: string;
  riskLevel: "info" | "warning" | "danger";
  inputParams: Record<string, unknown>;
  userRole?: string;
}): ApprovalFacts {
  const { toolName, riskLevel, inputParams, userRole } = params;

  // Derive operation type from tool name
  let operationType: ApprovalFacts["operation_type"] = "update";
  if (toolName.includes("delete") || toolName.includes("remove")) operationType = "delete";
  else if (toolName.includes("archive")) operationType = "archive";
  else if (toolName.includes("create") || toolName.includes("register") || toolName.includes("add"))
    operationType = "create";
  else if (toolName.includes("approve")) operationType = "approve";
  else if (toolName.includes("review") || toolName.includes("submit")) operationType = "submit";
  else if (
    toolName.startsWith("get_") ||
    toolName.startsWith("fetch_") ||
    toolName.startsWith("list_") ||
    toolName.startsWith("search_") ||
    toolName.startsWith("count_")
  )
    operationType = "read";

  // Derive tool category from tool name
  let toolCategory = "general";
  if (toolName.includes("admin") || toolName.includes("config") || toolName.includes("setting"))
    toolCategory = "admin";
  else if (toolName.includes("policy")) toolCategory = "policy";
  else if (toolName.includes("risk")) toolCategory = "risk";
  else if (toolName.includes("vendor")) toolCategory = "vendor";
  else if (toolName.includes("incident")) toolCategory = "incident";
  else if (toolName.includes("model")) toolCategory = "model";
  else if (toolName.includes("task")) toolCategory = "task";
  else if (toolName.includes("training")) toolCategory = "training";
  else if (toolName.includes("evidence")) toolCategory = "evidence";
  else if (toolName.includes("notification")) toolCategory = "notification";
  else if (toolName.includes("approval")) toolCategory = "approval";

  // Derive entity count and bulk flag
  const entityCount = (inputParams.entity_count as number) || 1;
  const isBulk = toolName.includes("bulk") || entityCount > 1;

  return {
    operation_type: operationType,
    entity_type:
      toolName
        .replace(/^agent_/, "")
        .split("_")
        .slice(1)
        .join("_") || "unknown",
    entity_count: entityCount,
    risk_level: riskLevel,
    tool_category: toolCategory,
    tool_name: toolName,
    user_role: userRole || "Editor",
    is_bulk: isBulk,
    affected_fields: inputParams.affected_fields as string[] | undefined,
  };
}

/**
 * Evaluate facts against approval rules and return the decision.
 * First match (highest priority) wins.
 */
export async function evaluateRules(
  organizationId: number,
  facts: ApprovalFacts,
): Promise<RuleEvaluationResult> {
  const functionName = "evaluateRules";

  try {
    const rules = await getMergedRules(organizationId);
    const engine = new Engine([], { allowUndefinedFacts: true });

    // Add all rules to the engine
    for (const rule of rules) {
      engine.addRule(toEngineRule(rule));
    }

    const result = await engine.run(facts);

    // Collect all matches
    const allMatches = result.events.map((event) => ({
      name: (event.params as any)?.ruleName || "unknown",
      decision: event.type as RuleDecision,
      priority: (event.params as any)?.priority || 0,
    }));

    // Sort by priority descending — highest priority wins
    allMatches.sort((a, b) => b.priority - a.priority);

    if (allMatches.length === 0) {
      // No rule matched — default to require-approval (safe default)
      logStructured(
        "successful",
        `no rules matched for ${facts.tool_name}, defaulting to require-approval`,
        functionName,
        fileName,
      );
      return {
        decision: "require-approval",
        matchedRule: null,
        matchedPriority: 0,
        allMatches: [],
      };
    }

    const topMatch = allMatches[0];
    const topEvent = result.events.find((e) => (e.params as any)?.ruleName === topMatch.name);

    logStructured(
      "successful",
      `rule "${topMatch.name}" matched for ${facts.tool_name} → ${topMatch.decision}`,
      functionName,
      fileName,
    );

    return {
      decision: topMatch.decision,
      matchedRule: topMatch.name,
      matchedPriority: topMatch.priority,
      eventParams: topEvent?.params as Record<string, unknown> | undefined,
      allMatches,
    };
  } catch (error) {
    logStructured("error", `rule evaluation failed: ${error}`, functionName, fileName);
    // Safe fallback — require approval
    return {
      decision: "require-approval",
      matchedRule: null,
      matchedPriority: 0,
      allMatches: [],
    };
  }
}

/**
 * Test a single rule against sample facts (dry run).
 */
export async function testRule(
  rule: RuleDefinition,
  facts: ApprovalFacts,
): Promise<{ matched: boolean; decision?: RuleDecision }> {
  const engine = new Engine([], { allowUndefinedFacts: true });
  engine.addRule(toEngineRule(rule));

  const result = await engine.run(facts);

  if (result.events.length > 0) {
    return { matched: true, decision: result.events[0].type as RuleDecision };
  }
  return { matched: false };
}
