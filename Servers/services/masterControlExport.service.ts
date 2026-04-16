/**
 * Controls Hub — CSV export service.
 *
 * Builds a CSV of all master controls for an organization, one row per
 * master, with per-framework mapping counts flattened into columns.
 *
 * Keeps dependencies zero — the quoting logic is small enough to own.
 */

import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import {
  getAllMasterControlsQuery,
  type MasterControlListRow,
} from "../utils/masterControl.utils";
import type { Framework } from "../domain.layer/interfaces/i.masterControlMapping";

const FRAMEWORKS: Framework[] = [
  "eu_ai_act",
  "iso_42001",
  "iso_27001",
  "nist_ai_rmf",
];

const FRAMEWORK_LABELS: Record<Framework, string> = {
  eu_ai_act: "EU AI Act",
  iso_42001: "ISO 42001",
  iso_27001: "ISO 27001",
  nist_ai_rmf: "NIST AI RMF",
};

const CSV_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "risk_review", label: "Risk Review" },
  { key: "owner_name", label: "Owner" },
  { key: "reviewer_name", label: "Reviewer" },
  { key: "approver_name", label: "Approver" },
  { key: "due_date", label: "Due Date" },
  { key: "description", label: "Description" },
  { key: "implementation_details", label: "Implementation Details" },
  { key: "mapping_count", label: "Total Mappings" },
  { key: "eu_ai_act", label: FRAMEWORK_LABELS.eu_ai_act },
  { key: "iso_42001", label: FRAMEWORK_LABELS.iso_42001 },
  { key: "iso_27001", label: FRAMEWORK_LABELS.iso_27001 },
  { key: "nist_ai_rmf", label: FRAMEWORK_LABELS.nist_ai_rmf },
  { key: "mapped_entity_codes", label: "Mapped Entity Codes" },
  { key: "created_at", label: "Created At" },
  { key: "updated_at", label: "Updated At" },
] as const;

/** Escape a single value per RFC 4180 (quoted when containing , " or newline). */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsvLine(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(",");
}

/**
 * Build a CSV export of all master controls for the given organization.
 * Returns the CSV string — caller is responsible for setting headers.
 */
export async function buildMasterControlsCsv(
  organizationId: number
): Promise<string> {
  const rows = await getAllMasterControlsQuery(organizationId);

  // Fetch the per-row list of mapped entity codes so the CSV has human-
  // readable references (e.g., "eu_ai_act:control_eu:7, iso_42001:...").
  const entityCodesByMaster = await loadMappedEntityCodes(
    organizationId,
    rows.map((r) => r.id).filter((id): id is number => !!id)
  );

  const header = CSV_COLUMNS.map((c) => escapeCsvCell(c.label)).join(",");
  const lines = [header];

  for (const row of rows) {
    const summary = row.mapping_summary ?? {
      eu_ai_act: 0,
      iso_42001: 0,
      iso_27001: 0,
      nist_ai_rmf: 0,
    };
    const entityCodes = row.id ? entityCodesByMaster.get(row.id) ?? [] : [];

    const cells: unknown[] = CSV_COLUMNS.map((col) => {
      switch (col.key) {
        case "mapped_entity_codes":
          return entityCodes.join("; ");
        case "eu_ai_act":
        case "iso_42001":
        case "iso_27001":
        case "nist_ai_rmf":
          return summary[col.key as Framework] ?? 0;
        default:
          return (row as unknown as Record<string, unknown>)[col.key] ?? "";
      }
    });

    lines.push(rowToCsvLine(cells));
  }

  return lines.join("\r\n");
}

/**
 * Returns a map of master_control_id → list of `"framework:type:id"` strings
 * for every mapping owned by that master. Used to populate the "Mapped
 * Entity Codes" CSV column.
 */
async function loadMappedEntityCodes(
  organizationId: number,
  masterIds: number[]
): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (masterIds.length === 0) return map;

  const mappings = await sequelize.query<{
    master_control_id: number;
    framework: Framework;
    framework_entity_type: string;
    framework_entity_id: number;
  }>(
    `
    SELECT master_control_id, framework, framework_entity_type, framework_entity_id
      FROM master_control_framework_mappings
     WHERE organization_id = :organizationId
       AND master_control_id IN (:masterIds)
     ORDER BY master_control_id, framework, framework_entity_type, framework_entity_id
    `,
    {
      replacements: { organizationId, masterIds },
      type: QueryTypes.SELECT,
    }
  );

  for (const m of mappings) {
    const label = `${FRAMEWORK_LABELS[m.framework]}:${m.framework_entity_type}:${m.framework_entity_id}`;
    const list = map.get(m.master_control_id) ?? [];
    list.push(label);
    map.set(m.master_control_id, list);
  }

  return map;
}

/** Exported for tests. */
export const __testing = {
  escapeCsvCell,
  rowToCsvLine,
  CSV_COLUMNS,
  FRAMEWORKS,
  FRAMEWORK_LABELS,
  buildCsvFromRows(
    rows: MasterControlListRow[],
    entityCodesByMaster: Map<number, string[]> = new Map()
  ): string {
    const header = CSV_COLUMNS.map((c) => escapeCsvCell(c.label)).join(",");
    const lines = [header];
    for (const row of rows) {
      const summary = row.mapping_summary ?? {
        eu_ai_act: 0,
        iso_42001: 0,
        iso_27001: 0,
        nist_ai_rmf: 0,
      };
      const entityCodes = row.id ? entityCodesByMaster.get(row.id) ?? [] : [];
      const cells: unknown[] = CSV_COLUMNS.map((col) => {
        switch (col.key) {
          case "mapped_entity_codes":
            return entityCodes.join("; ");
          case "eu_ai_act":
          case "iso_42001":
          case "iso_27001":
          case "nist_ai_rmf":
            return summary[col.key as Framework] ?? 0;
          default:
            return (row as unknown as Record<string, unknown>)[col.key] ?? "";
        }
      });
      lines.push(rowToCsvLine(cells));
    }
    return lines.join("\r\n");
  },
};
