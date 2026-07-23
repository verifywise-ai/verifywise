import { sequelize } from "../database/db";
import { MrmRevalidationEventModel } from "../domain.layer/models/mrm/mrmRevalidationEvent.model";

/**
 * MRM (Model Risk Management) — Branch 3 revalidation-events audit read path.
 * Append-only log; there is intentionally no update/delete here.
 *
 * Tenant-isolated by organization_id. Unqualified table name (search_path).
 */

/**
 * Per-model revalidation-trigger firing history, newest first. Matches the
 * (organization_id, model_inventory_id, fired_at) index.
 */
export const getRevalidationEventsQuery = async (
  organizationId: number,
  modelInventoryId: number,
): Promise<MrmRevalidationEventModel[]> => {
  return (await sequelize.query(
    `SELECT * FROM mrm_revalidation_events
      WHERE organization_id = :organizationId
        AND model_inventory_id = :modelInventoryId
      ORDER BY fired_at DESC, id DESC`,
    {
      replacements: { organizationId, modelInventoryId },
      mapToModel: true,
      model: MrmRevalidationEventModel,
    },
  )) as MrmRevalidationEventModel[];
};
