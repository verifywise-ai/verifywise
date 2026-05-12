import { sequelize } from "../database/db";
import { GovernanceScenarioModel } from "../domain.layer/models/governanceOs/governanceScenario.model";
import { GovernanceScenarioRuleModel } from "../domain.layer/models/governanceOs/governanceScenarioRule.model";
import {
  IRecommendationRequest,
  IRecommendationResult,
} from "../domain.layer/interfaces/i.governanceOs";

interface ScoredScenario {
  scenario: GovernanceScenarioModel;
  score: number;
  matchedRules: string[];
}

/**
 * Recommendation engine that scores scenarios against user inputs.
 *
 * Algorithm:
 * 1. Load all scenarios with their rules
 * 2. For each scenario, compute match score based on rule matches
 * 3. Normalize scores to 0-100
 * 4. Return top 3 scenarios with score > 40
 * 5. If no match > 40, return default "global" scenario
 */
export const computeRecommendations = async (
  input: IRecommendationRequest,
): Promise<IRecommendationResult[]> => {
  // Load all built-in scenarios
  const scenarios = await sequelize.query(
    `SELECT * FROM governance_scenarios WHERE is_builtin = TRUE`,
    { mapToModel: true, model: GovernanceScenarioModel },
  );

  // Load all rules
  const rules = await sequelize.query(`SELECT * FROM governance_scenario_rules`, {
    mapToModel: true,
    model: GovernanceScenarioRuleModel,
  });

  // Group rules by scenario
  const rulesByScenario = new Map<number, GovernanceScenarioRuleModel[]>();
  for (const rule of rules) {
    const scenarioId = rule.scenario_id;
    if (!rulesByScenario.has(scenarioId)) {
      rulesByScenario.set(scenarioId, []);
    }
    rulesByScenario.get(scenarioId)!.push(rule);
  }

  // Score each scenario
  const scored: ScoredScenario[] = [];

  for (const scenario of scenarios) {
    const scenarioRules = rulesByScenario.get(scenario.id!) || [];
    if (scenarioRules.length === 0) continue;

    let totalWeight = 0;
    let matchedWeight = 0;
    const matchedRules: string[] = [];

    for (const rule of scenarioRules) {
      const weight = Number(rule.weight);
      totalWeight += weight;

      const inputValue = getInputValueForRuleType(input, rule.rule_type);
      if (!inputValue) continue;

      const isMatch = evaluateRule(inputValue, rule.rule_operator, rule.rule_value);

      if (isMatch) {
        matchedWeight += weight;
        matchedRules.push(`${rule.rule_type}=${rule.rule_value}`);
      }
    }

    const rawScore = totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 0;
    scored.push({ scenario, score: Math.round(rawScore), matchedRules });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return top 3 with score > 40
  let results = scored.filter((s) => s.score > 40).slice(0, 3);

  // Fallback to Global Enterprise AI if no good match
  if (results.length === 0) {
    const globalScenario = scenarios.find((s) => s.name === "Global Enterprise AI");
    if (globalScenario) {
      results = [{ scenario: globalScenario, score: 30, matchedRules: ["fallback"] }];
    }
  }

  return results.map((r) => ({
    scenario: r.scenario.get({ plain: true }),
    score: r.score,
    matchedRules: r.matchedRules,
  }));
};

function getInputValueForRuleType(input: IRecommendationRequest, ruleType: string): string | null {
  switch (ruleType) {
    case "industry":
      return input.industry || null;
    case "region":
      return input.region || null;
    case "risk_level":
      return input.riskLevel || null;
    case "data_type":
      return input.dataTypes?.join(",") || null;
    case "deployment_scale":
      return input.deploymentScale || null;
    case "use_case_type":
      return input.useCaseType || null;
    default:
      return null;
  }
}

function evaluateRule(inputValue: string, operator: string, ruleValue: string): boolean {
  const normalizedInput = inputValue.toLowerCase().trim();
  const normalizedRule = ruleValue.toLowerCase().trim();

  switch (operator) {
    case "equals":
      return normalizedInput === normalizedRule;
    case "contains":
      return normalizedInput.includes(normalizedRule);
    case "in":
      return normalizedRule
        .split(",")
        .map((v) => v.trim())
        .includes(normalizedInput);
    default:
      return false;
  }
}
