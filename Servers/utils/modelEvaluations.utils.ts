import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

export async function getAllLinkedEvaluations(organizationId: number) {
  const [experiments, biasAudits] = await Promise.all([
    sequelize.query(
      `SELECT e.id, e.name, e.status, e.config, e.results, e.error_message,
              e.started_at, e.completed_at, e.created_at, e.created_by,
              e.model_inventory_id,
              m.provider AS model_provider, m.model AS model_name, m.version AS model_version,
              'experiment' AS eval_type
       FROM llm_evals_experiments e
       LEFT JOIN model_inventories m ON m.id = e.model_inventory_id
       WHERE e.model_inventory_id IS NOT NULL
         AND e.organization_id = :organizationId
       ORDER BY e.created_at DESC`,
      {
        replacements: { organizationId },
        type: QueryTypes.SELECT,
      },
    ),
    sequelize.query(
      `SELECT b.id, b.preset_name AS name, b.status, b.config, b.results, b.error,
              b.completed_at, b.created_at, b.created_by,
              b.model_inventory_id,
              m.provider AS model_provider, m.model AS model_name, m.version AS model_version,
              'bias_audit' AS eval_type
       FROM llm_evals_bias_audits b
       LEFT JOIN model_inventories m ON m.id = b.model_inventory_id
       WHERE b.model_inventory_id IS NOT NULL
         AND b.organization_id = :organizationId
       ORDER BY b.created_at DESC`,
      {
        replacements: { organizationId },
        type: QueryTypes.SELECT,
      },
    ),
  ]);

  return { experiments, biasAudits };
}

export async function getEvaluationsByModelInventoryId(
  modelInventoryId: number,
  organizationId: number,
) {
  const [experiments, biasAudits] = await Promise.all([
    sequelize.query(
      `SELECT id, name, status, config, results, error_message,
              started_at, completed_at, created_at, created_by,
              'experiment' AS eval_type
       FROM llm_evals_experiments
       WHERE model_inventory_id = :modelInventoryId
         AND organization_id = :organizationId
       ORDER BY created_at DESC`,
      {
        replacements: { modelInventoryId, organizationId },
        type: QueryTypes.SELECT,
      },
    ),
    sequelize.query(
      `SELECT id, preset_name AS name, status, config, results, error,
              completed_at, created_at, created_by,
              'bias_audit' AS eval_type
       FROM llm_evals_bias_audits
       WHERE model_inventory_id = :modelInventoryId
         AND organization_id = :organizationId
       ORDER BY created_at DESC`,
      {
        replacements: { modelInventoryId, organizationId },
        type: QueryTypes.SELECT,
      },
    ),
  ]);

  return { experiments, biasAudits };
}
