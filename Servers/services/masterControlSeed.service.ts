/**
 * Controls Hub — recommended master-control seed loader.
 *
 * Imports the curated list in `structures/master-controls-seed/mappings.seed.ts`
 * into the current organisation's master controls + framework mappings.
 *
 * Code resolution is best-effort: we try to map each seed code to a struct
 * row by direct ID match. Codes we cannot confidently resolve (EU AI Act
 * Articles, ISO 42001 Annex A.* — whose struct tables have no stable ID
 * column) are skipped with a reason so the UI can surface them.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import type {
  Framework,
  FrameworkEntityType,
} from "../domain.layer/interfaces/i.masterControlMapping";
import {
  RECOMMENDED_MASTER_CONTROLS,
  type MasterControlSeedMapping,
} from "../structures/master-controls-seed/mappings.seed";
import { MasterControlModel } from "../domain.layer/models/masterControl/masterControl.model";
import {
  createMappingQuery,
  createMasterControlQuery,
} from "../utils/masterControl.utils";

export interface SeedImportResult {
  mastersCreated: number;
  mastersSkipped: number;
  mappingsCreated: number;
  mappingsSkipped: number;
  skippedCodes: Array<{ code: string; reason: string }>;
}

/**
 * Resolve a seed code (e.g. "ISO 42001 Clause 6.1.2") to a `framework_entity_id`
 * in the struct tables. Returns `null` if the resolver cannot confidently
 * pick a row (unsupported format, unknown struct row).
 *
 * Supported today:
 *   - subclause_struct_iso   → subclauses_struct_iso.subclause_id
 *   - iso27001_subclause     → subclauses_struct_iso27001.subclause_id
 *   - iso27001_annex_category → annexcontrols_struct_iso27001.control_id
 *   - subcategory_nist       → nist_ai_rmf_subcategories_struct (function + subcategory_id)
 *
 * Intentionally unsupported (struct tables expose no stable code column):
 *   - control_eu, subcontrol_eu   (EU AI Act Articles)
 *   - annex_category_iso          (ISO 42001 Annex A.*)
 */
async function resolveEntityId(
  mapping: MasterControlSeedMapping
): Promise<number | null> {
  const code = mapping.framework_code;

  switch (mapping.framework_entity_type) {
    case "subclause_struct_iso": {
      // "ISO 42001 Clause 6.1.2" → subclause_id = "6.1.2"
      const match = code.match(/Clause\s+([\d.]+)/i);
      if (!match) return null;
      const rows = await sequelize.query<{ id: number }>(
        `SELECT id FROM subclauses_struct_iso WHERE subclause_id = :code LIMIT 1`,
        {
          replacements: { code: match[1] },
          type: QueryTypes.SELECT,
        }
      );
      return rows[0]?.id ?? null;
    }

    case "iso27001_subclause": {
      // "ISO 27001 Clause 9.2" → subclause_id = "9.2"
      const match = code.match(/Clause\s+([\d.]+)/i);
      if (!match) return null;
      const rows = await sequelize.query<{ id: number }>(
        `SELECT id FROM subclauses_struct_iso27001 WHERE subclause_id = :code LIMIT 1`,
        {
          replacements: { code: match[1] },
          type: QueryTypes.SELECT,
        }
      );
      return rows[0]?.id ?? null;
    }

    case "iso27001_annex_category": {
      // "ISO 27001 Annex A.5.15" → control_id = "A.5.15"
      const match = code.match(/Annex\s+(A\.[\d.]+)/i);
      if (!match) return null;
      const rows = await sequelize.query<{ id: number }>(
        `SELECT id FROM annexcontrols_struct_iso27001 WHERE control_id = :code LIMIT 1`,
        {
          replacements: { code: match[1] },
          type: QueryTypes.SELECT,
        }
      );
      return rows[0]?.id ?? null;
    }

    case "subcategory_nist": {
      // "NIST GOVERN-1.1" → function = "GOVERN", subcategory_id = 1.1
      const match = code.match(/NIST\s+([A-Z]+)-([\d.]+)/);
      if (!match) return null;
      const fn = match[1];
      const sub = parseFloat(match[2]);
      if (!Number.isFinite(sub)) return null;
      const rows = await sequelize.query<{ id: number }>(
        `SELECT id FROM nist_ai_rmf_subcategories_struct
          WHERE function = :fn AND subcategory_id = :sub
          LIMIT 1`,
        {
          replacements: { fn, sub },
          type: QueryTypes.SELECT,
        }
      );
      return rows[0]?.id ?? null;
    }

    case "control_eu":
    case "subcontrol_eu":
    case "annex_category_iso":
    default:
      return null;
  }
}

const UNSUPPORTED_RESOLVERS = new Set<FrameworkEntityType>([
  "control_eu",
  "subcontrol_eu",
  "annex_category_iso",
]);

/**
 * Import the recommended master controls into the target organisation.
 *
 * Each master row is created unconditionally — duplicate titles are allowed.
 * Mappings are created only when the code resolver returns a match, and the
 * UNIQUE index on (master_control_id, framework, framework_entity_type,
 * framework_entity_id) means re-running the import never creates duplicate
 * mappings.
 */
export async function importRecommendedMasterControls(
  organizationId: number
): Promise<SeedImportResult> {
  const result: SeedImportResult = {
    mastersCreated: 0,
    mastersSkipped: 0,
    mappingsCreated: 0,
    mappingsSkipped: 0,
    skippedCodes: [],
  };

  const transaction: Transaction = await sequelize.transaction();
  try {
    for (const seed of RECOMMENDED_MASTER_CONTROLS) {
      const master = await createMasterControlQuery(
        new MasterControlModel({
          title: seed.title,
          description: seed.description,
          status: seed.status ?? "Waiting",
          is_demo: false,
        }),
        organizationId,
        transaction
      );

      if (!master?.id) {
        result.mastersSkipped += 1;
        continue;
      }
      result.mastersCreated += 1;

      for (const mapping of seed.mappings) {
        if (UNSUPPORTED_RESOLVERS.has(mapping.framework_entity_type)) {
          result.mappingsSkipped += 1;
          result.skippedCodes.push({
            code: mapping.framework_code,
            reason: `Entity type ${mapping.framework_entity_type} has no stable code column — add manually via the drawer`,
          });
          continue;
        }

        const entityId = await resolveEntityId(mapping);
        if (!entityId) {
          result.mappingsSkipped += 1;
          result.skippedCodes.push({
            code: mapping.framework_code,
            reason: "No matching struct row found for this code",
          });
          continue;
        }

        await createMappingQuery(
          {
            master_control_id: master.id,
            framework: mapping.framework as Framework,
            framework_entity_type: mapping.framework_entity_type,
            framework_entity_id: entityId,
          },
          organizationId,
          transaction
        );
        result.mappingsCreated += 1;
      }
    }

    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/** Exposed for tests. */
export const __testing = { resolveEntityId, UNSUPPORTED_RESOLVERS };
