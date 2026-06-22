/**
 * Phase 3 — Cost Tracker
 *
 * Tracks token usage and cost per agent, model, and time period.
 * In-memory accumulator flushed periodically to the database.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { logStructured } from "../../utils/logger/fileLogger";

const fileName = "costTracker.ts";

interface CostEntry {
  organizationId: number;
  agentName: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  cost: number;
  timestamp: string;
}

const costBuffer: CostEntry[] = [];

/**
 * Record a cost entry (buffered in memory).
 */
export function recordCost(entry: CostEntry): void {
  costBuffer.push(entry);
}

/**
 * Flush cost buffer to database.
 * Note: Uses ai_action_audit_log metadata field for now.
 * A dedicated cost table can be added in a future iteration.
 */
export async function flushCosts(): Promise<void> {
  if (costBuffer.length === 0) return;

  const entries = costBuffer.splice(0);
  try {
    for (const entry of entries) {
      await sequelize.query(
        `INSERT INTO ai_action_audit_log
          (organization_id, action_approval_id, from_state, to_state, actor_type, metadata, created_at)
         VALUES (:organizationId, NULL, NULL, 'cost_record', 'system', :metadata, :timestamp)`,
        {
          replacements: {
            organizationId: entry.organizationId,
            metadata: JSON.stringify({
              agent: entry.agentName,
              model: entry.model,
              tokens_input: entry.tokensInput,
              tokens_output: entry.tokensOutput,
              cost: entry.cost,
            }),
            timestamp: entry.timestamp,
          },
          type: QueryTypes.INSERT,
        },
      );
    }
  } catch (error) {
    logStructured("error", `cost flush failed: ${error}`, "flushCosts", fileName);
    // Re-add entries that failed
    costBuffer.unshift(...entries);
  }
}

/**
 * Get cost summary for an organization.
 */
export async function getCostSummary(
  organizationId: number,
  dateFrom?: string,
  dateTo?: string,
): Promise<Record<string, unknown>> {
  const conditions = ["organization_id = :organizationId", "to_state = 'cost_record'"];
  const replacements: Record<string, unknown> = { organizationId };

  if (dateFrom) {
    conditions.push("created_at >= :dateFrom");
    replacements.dateFrom = dateFrom;
  }
  if (dateTo) {
    conditions.push("created_at <= :dateTo");
    replacements.dateTo = dateTo;
  }

  const where = conditions.join(" AND ");

  const rows = (await sequelize.query(
    `SELECT
       metadata->>'agent' as agent,
       metadata->>'model' as model,
       SUM((metadata->>'tokens_input')::int) as total_input_tokens,
       SUM((metadata->>'tokens_output')::int) as total_output_tokens,
       SUM((metadata->>'cost')::numeric) as total_cost,
       COUNT(*) as total_calls
     FROM ai_action_audit_log
     WHERE ${where}
     GROUP BY metadata->>'agent', metadata->>'model'
     ORDER BY total_cost DESC`,
    { replacements, type: QueryTypes.SELECT },
  )) as any[];

  return { breakdown: rows };
}
