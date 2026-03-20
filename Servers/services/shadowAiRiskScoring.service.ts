/**
 * Shadow AI Risk Scoring Service
 *
 * Composite risk score per tool:
 *   approval_weight    × 40%  (100 if not in model inventory, 0 if approved)
 *   data_policy_weight × 25%  (based on tool's risk profile flags)
 *   usage_volume_weight × 15% (normalized event count vs org average)
 *   department_weight  × 20%  (max sensitivity of departments using this tool)
 */

import { sequelize } from "../database/db";

// Default department sensitivity scores (configurable per tenant)
const DEFAULT_DEPARTMENT_SENSITIVITY: Record<string, number> = {
  finance: 80,
  legal: 80,
  hr: 80,
  "human resources": 80,
  engineering: 50,
  product: 50,
  marketing: 20,
  sales: 20,
};

/**
 * Calculate the data policy score for a tool based on its risk profile flags.
 *
 * | Factor              | Yes = | No = |
 * |---------------------|-------|------|
 * | Trains on user data | +30   | 0    |
 * | SOC 2 certified     | 0     | +25  |
 * | GDPR compliant      | 0     | +25  |
 * | SSO support         | 0     | +10  |
 * | Encryption at rest  | 0     | +10  |
 */
function calculateDataPolicyScore(tool: {
  trains_on_data?: boolean | null;
  soc2_certified?: boolean | null;
  gdpr_compliant?: boolean | null;
  sso_support?: boolean | null;
  encryption_at_rest?: boolean | null;
}): number {
  let score = 0;
  if (tool.trains_on_data === true) score += 30;
  if (tool.soc2_certified !== true) score += 25;
  if (tool.gdpr_compliant !== true) score += 25;
  if (tool.sso_support !== true) score += 10;
  if (tool.encryption_at_rest !== true) score += 10;
  return score;
}

/**
 * Calculate risk scores for all tools in an organization.
 * Updates the risk_score column in shadow_ai_tools.
 */
export async function calculateRiskScoresForOrganization(
  organizationId: number
): Promise<void> {
  // Get all tools
  const [tools] = await sequelize.query(
    `SELECT id, name, model_inventory_id, status,
            trains_on_data, soc2_certified, gdpr_compliant,
            sso_support, encryption_at_rest, total_events
     FROM shadow_ai_tools
     WHERE organization_id = :organizationId`,
    { replacements: { organizationId } }
  );

  if ((tools as any[]).length === 0) return;

  // Calculate org-wide average event count for normalization
  const totalEvents = (tools as any[]).reduce(
    (sum: number, t: any) => sum + (t.total_events || 0),
    0
  );
  const avgEvents = totalEvents / (tools as any[]).length || 1;

  // Get department usage per tool
  const [deptUsage] = await sequelize.query(
    `SELECT detected_tool_id, department
     FROM shadow_ai_events
     WHERE organization_id = :organizationId
       AND event_timestamp > NOW() - INTERVAL '30 days'
       AND department IS NOT NULL
     GROUP BY detected_tool_id, department`,
    { replacements: { organizationId } }
  );

  // Build department map per tool
  const toolDepartments = new Map<number, Set<string>>();
  for (const row of deptUsage as any[]) {
    if (!toolDepartments.has(row.detected_tool_id)) {
      toolDepartments.set(row.detected_tool_id, new Set());
    }
    toolDepartments.get(row.detected_tool_id)!.add(
      (row.department || "").toLowerCase()
    );
  }

  // Calculate and update each tool's risk score
  for (const tool of tools as any[]) {
    // 1. Approval weight (40%): 100 if not in model inventory, 0 if approved
    const approvalWeight =
      tool.model_inventory_id && tool.status === "approved" ? 0 : 100;

    // 2. Data policy weight (25%)
    const dataPolicyWeight = calculateDataPolicyScore(tool);

    // 3. Usage volume weight (15%): normalized against org average
    const volumeRatio = (tool.total_events || 0) / avgEvents;
    const usageVolumeWeight = Math.min(Math.round(volumeRatio * 50), 100);

    // 4. Department weight (20%): max sensitivity of departments using this tool
    const departments = toolDepartments.get(tool.id) || new Set<string>();
    let departmentWeight = 0;
    for (const dept of departments) {
      const sensitivity =
        DEFAULT_DEPARTMENT_SENSITIVITY[dept] || 30; // default 30 for unknown depts
      departmentWeight = Math.max(departmentWeight, sensitivity);
    }

    // Composite score
    const riskScore = Math.round(
      approvalWeight * 0.4 +
        dataPolicyWeight * 0.25 +
        usageVolumeWeight * 0.15 +
        departmentWeight * 0.2
    );

    await sequelize.query(
      `UPDATE shadow_ai_tools
       SET risk_score = :riskScore, updated_at = NOW()
       WHERE organization_id = :organizationId AND id = :toolId`,
      { replacements: { organizationId, riskScore, toolId: tool.id } }
    );
  }
}
