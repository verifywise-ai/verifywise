import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { defaultRules } from "../advisor/approval/rules/defaultRules";
import { validateRuleConditions } from "../advisor/approval/rules/customRules";
import { testRule, deriveFacts } from "../advisor/approval/ruleEngine";
import type { RuleDefinition } from "../advisor/approval/rules/defaultRules";

const fileName = "aiApprovalRules.ctrl.ts";

/**
 * GET /api/ai-approval-rules
 * List all rules (default + custom) for the tenant.
 */
export async function listRulesCtrl(req: Request, res: Response) {
  const functionName = "listRulesCtrl";
  const organizationId = req.organizationId!;

  try {
    // Get custom rules from DB
    const customRules = (await sequelize.query(
      `SELECT * FROM ai_approval_rules
       WHERE organization_id = :organizationId
       ORDER BY priority DESC`,
      { replacements: { organizationId }, type: QueryTypes.SELECT },
    )) as any[];

    // Merge with defaults
    const customNames = new Set(customRules.map((r: any) => r.name));
    const defaults = defaultRules
      .filter((d) => !customNames.has(d.name))
      .map((d) => ({
        id: null,
        name: d.name,
        description: d.description,
        conditions: d.conditions,
        event_type: d.eventType,
        event_params: d.eventParams || {},
        priority: d.priority,
        is_active: true,
        is_default: true,
        organization_id: organizationId,
      }));

    const allRules = [...customRules, ...defaults].sort(
      (a: any, b: any) => (b.priority || 0) - (a.priority || 0),
    );

    logStructured("successful", `listed ${allRules.length} rules`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](allRules));
  } catch (error) {
    logStructured("error", "failed to list rules", functionName, fileName);
    logger.error("Error in listRulesCtrl:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * POST /api/ai-approval-rules
 * Create a custom rule.
 */
export async function createRuleCtrl(req: Request, res: Response) {
  const functionName = "createRuleCtrl";
  const organizationId = req.organizationId!;
  const userId = Number(req.userId);

  try {
    const { name, description, conditions, event_type, event_params, priority } = req.body;

    // Validate required fields
    if (!name || !conditions || !event_type) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("name, conditions, and event_type are required"));
    }

    const validEventTypes = ["auto-approve", "require-approval", "auto-reject"];
    if (!validEventTypes.includes(event_type)) {
      return res
        .status(400)
        .json(STATUS_CODE[400](`event_type must be one of: ${validEventTypes.join(", ")}`));
    }

    // Validate conditions structure
    const validationError = validateRuleConditions(conditions);
    if (validationError) {
      return res.status(400).json(STATUS_CODE[400](validationError));
    }

    const [result] = (await sequelize.query(
      `INSERT INTO ai_approval_rules
        (organization_id, name, description, conditions, event_type, event_params, priority, is_active, is_default, created_by, created_at, updated_at)
       VALUES
        (:organizationId, :name, :description, :conditions, :eventType, :eventParams, :priority, true, false, :createdBy, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          organizationId,
          name,
          description: description || null,
          conditions: JSON.stringify(conditions),
          eventType: event_type,
          eventParams: JSON.stringify(event_params || {}),
          priority: priority || 100,
          createdBy: userId,
        },
        type: QueryTypes.INSERT,
      },
    )) as any;

    logStructured("successful", `created rule "${name}"`, functionName, fileName);
    return res.status(201).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to create rule", functionName, fileName);
    logger.error("Error in createRuleCtrl:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * PUT /api/ai-approval-rules/:id
 * Update a custom rule.
 */
export async function updateRuleCtrl(req: Request, res: Response) {
  const functionName = "updateRuleCtrl";
  const organizationId = req.organizationId!;
  const ruleId = Number(req.params.id);

  try {
    // Check exists and not a default
    const existing = (await sequelize.query(
      `SELECT * FROM ai_approval_rules WHERE id = :ruleId AND organization_id = :organizationId`,
      { replacements: { ruleId, organizationId }, type: QueryTypes.SELECT },
    )) as any[];

    if (!existing[0]) {
      return res.status(404).json(STATUS_CODE[404]("Rule not found"));
    }
    if (existing[0].is_default) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            "Cannot modify default rules. Create a custom rule with the same name to override.",
          ),
        );
    }

    const { name, description, conditions, event_type, event_params, priority, is_active } =
      req.body;

    // Validate conditions if provided
    if (conditions) {
      const validationError = validateRuleConditions(conditions);
      if (validationError) {
        return res.status(400).json(STATUS_CODE[400](validationError));
      }
    }

    if (event_type) {
      const validEventTypes = ["auto-approve", "require-approval", "auto-reject"];
      if (!validEventTypes.includes(event_type)) {
        return res
          .status(400)
          .json(STATUS_CODE[400](`event_type must be one of: ${validEventTypes.join(", ")}`));
      }
    }

    const setClauses: string[] = ["updated_at = NOW()"];
    const replacements: Record<string, unknown> = { ruleId, organizationId };

    if (name !== undefined) {
      setClauses.push("name = :name");
      replacements.name = name;
    }
    if (description !== undefined) {
      setClauses.push("description = :description");
      replacements.description = description;
    }
    if (conditions !== undefined) {
      setClauses.push("conditions = :conditions");
      replacements.conditions = JSON.stringify(conditions);
    }
    if (event_type !== undefined) {
      setClauses.push("event_type = :eventType");
      replacements.eventType = event_type;
    }
    if (event_params !== undefined) {
      setClauses.push("event_params = :eventParams");
      replacements.eventParams = JSON.stringify(event_params);
    }
    if (priority !== undefined) {
      setClauses.push("priority = :priority");
      replacements.priority = priority;
    }
    if (is_active !== undefined) {
      setClauses.push("is_active = :isActive");
      replacements.isActive = is_active;
    }

    await sequelize.query(
      `UPDATE ai_approval_rules SET ${setClauses.join(", ")}
       WHERE id = :ruleId AND organization_id = :organizationId`,
      { replacements, type: QueryTypes.UPDATE },
    );

    const [updated] = (await sequelize.query(
      `SELECT * FROM ai_approval_rules WHERE id = :ruleId AND organization_id = :organizationId`,
      { replacements: { ruleId, organizationId }, type: QueryTypes.SELECT },
    )) as any[];

    logStructured("successful", `updated rule ${ruleId}`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    logStructured("error", "failed to update rule", functionName, fileName);
    logger.error("Error in updateRuleCtrl:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * DELETE /api/ai-approval-rules/:id
 * Delete a custom rule (cannot delete default rules).
 */
export async function deleteRuleCtrl(req: Request, res: Response) {
  const functionName = "deleteRuleCtrl";
  const organizationId = req.organizationId!;
  const ruleId = Number(req.params.id);

  try {
    const existing = (await sequelize.query(
      `SELECT * FROM ai_approval_rules WHERE id = :ruleId AND organization_id = :organizationId`,
      { replacements: { ruleId, organizationId }, type: QueryTypes.SELECT },
    )) as any[];

    if (!existing[0]) {
      return res.status(404).json(STATUS_CODE[404]("Rule not found"));
    }
    if (existing[0].is_default) {
      return res.status(400).json(STATUS_CODE[400]("Cannot delete default rules"));
    }

    await sequelize.query(
      `DELETE FROM ai_approval_rules WHERE id = :ruleId AND organization_id = :organizationId`,
      { replacements: { ruleId, organizationId }, type: QueryTypes.DELETE },
    );

    logStructured("successful", `deleted rule ${ruleId}`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    logStructured("error", "failed to delete rule", functionName, fileName);
    logger.error("Error in deleteRuleCtrl:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * POST /api/ai-approval-rules/test
 * Test a rule against sample facts (dry run).
 */
export async function testRuleCtrl(req: Request, res: Response) {
  const functionName = "testRuleCtrl";

  try {
    const { rule, facts } = req.body;

    if (!rule || !facts) {
      return res.status(400).json(STATUS_CODE[400]("rule and facts are required"));
    }

    // Validate the rule conditions
    const validationError = validateRuleConditions(rule.conditions);
    if (validationError) {
      return res.status(400).json(STATUS_CODE[400](validationError));
    }

    const ruleDef: RuleDefinition = {
      name: rule.name || "test-rule",
      description: rule.description || "",
      priority: rule.priority || 100,
      conditions: rule.conditions,
      eventType: rule.event_type || "require-approval",
      eventParams: rule.event_params,
    };

    // Derive full facts from partial input
    const fullFacts = deriveFacts({
      toolName: facts.tool_name || "agent_test_tool",
      riskLevel: facts.risk_level || "warning",
      inputParams: facts,
      userRole: facts.user_role,
    });

    // Override with any explicitly provided facts
    const mergedFacts = { ...fullFacts, ...facts };

    const result = await testRule(ruleDef, mergedFacts);

    logStructured(
      "successful",
      `tested rule "${ruleDef.name}": matched=${result.matched}`,
      functionName,
      fileName,
    );
    return res.status(200).json(
      STATUS_CODE[200]({
        ...result,
        evaluatedFacts: mergedFacts,
      }),
    );
  } catch (error) {
    logStructured("error", "failed to test rule", functionName, fileName);
    logger.error("Error in testRuleCtrl:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
