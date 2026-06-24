import { sequelize } from "../../database/db";
import { FILE_GROUP_LABEL_CASE_SQL } from "./fileGroupLabel.sql";

/**
 * Per-link projection used to render multi-attached files in the UI.
 * Each element carries the navigation hierarchy for a single attachment.
 */
export interface FileEntityLinkProjection {
  framework_type: string;
  entity_type: string;
  entity_id: number;
  project_id: number | null;
  link_type: string | null;
  group_label: string | null;
  parent_id: number | null;
  sub_id: number | null;
  meta_id: number | null;
  is_evidence: boolean;
  // Only populated for evidence_hub/evidence links — surfaces the actual
  // model/training the evidence is mapped to, so the dropdown can show
  // "Model ID: 12" / "Training ID: 5" instead of an opaque evidence id.
  mapped_model_ids?: number[];
  mapped_training_ids?: number[];
}

interface LinkRow {
  file_id: number;
  framework_type: string;
  entity_type: string;
  entity_id: number;
  project_id: number | null;
  link_type: string | null;
  group_label: string | null;
}

const resolveHierarchy = async (
  organizationId: number,
  link: LinkRow,
): Promise<Pick<FileEntityLinkProjection, "parent_id" | "sub_id" | "meta_id">> => {
  const out = {
    parent_id: null as number | null,
    sub_id: null as number | null,
    meta_id: link.entity_id as number,
  };
  switch (link.entity_type) {
    case "subcontrol": {
      const r = (await sequelize.query(
        `SELECT c.control_meta_id as parent_id
         FROM subcontrols_eu s
         JOIN controls_eu c ON s.control_id = c.id AND c.organization_id = :organizationId
         WHERE s.organization_id = :organizationId AND s.id = :entityId`,
        { replacements: { organizationId, entityId: link.entity_id } },
      )) as [any[], number];
      if (r[0][0]) out.parent_id = r[0][0].parent_id;
      break;
    }
    case "assessment": {
      const r = (await sequelize.query(
        `SELECT topic.id AS topic_id, subtopic.id AS subtopic_id
         FROM answers_eu ans
         JOIN questions_struct_eu question ON question.id = ans.question_id
         JOIN subtopics_struct_eu subtopic ON subtopic.id = question.subtopic_id
         JOIN topics_struct_eu topic ON topic.id = subtopic.topic_id
         WHERE ans.organization_id = :organizationId AND ans.id = :entityId`,
        { replacements: { organizationId, entityId: link.entity_id } },
      )) as [any[], number];
      if (r[0][0]) {
        out.parent_id = r[0][0].topic_id;
        out.sub_id = r[0][0].subtopic_id;
      }
      break;
    }
    case "subclause": {
      const table = link.framework_type === "iso_27001" ? "subclauses_iso27001" : "subclauses_iso";
      const structTable =
        link.framework_type === "iso_27001"
          ? "subclauses_struct_iso27001"
          : "subclauses_struct_iso";
      const r = (await sequelize.query(
        `SELECT scs.clause_id as clause_id
         FROM ${table} sc
         JOIN ${structTable} scs ON scs.id = sc.subclause_meta_id
         WHERE sc.organization_id = :organizationId AND sc.id = :entityId`,
        { replacements: { organizationId, entityId: link.entity_id } },
      )) as [any[], number];
      if (r[0][0]) out.parent_id = r[0][0].clause_id;
      break;
    }
    case "annex_control": {
      const r = (await sequelize.query(
        `SELECT acs.annex_id as annex_id
         FROM annexcontrols_iso27001 ac
         JOIN annexcontrols_struct_iso27001 acs ON acs.id = ac.annexcontrol_meta_id
         WHERE ac.organization_id = :organizationId AND ac.id = :entityId`,
        { replacements: { organizationId, entityId: link.entity_id } },
      )) as [any[], number];
      if (r[0][0]) out.parent_id = r[0][0].annex_id;
      break;
    }
    case "annex_category": {
      const r = (await sequelize.query(
        `SELECT acs.annex_id as annex_id
         FROM annexcategories_iso ac
         JOIN annexcategories_struct_iso acs ON acs.id = ac.annexcategory_meta_id
         WHERE ac.organization_id = :organizationId AND ac.id = :entityId`,
        { replacements: { organizationId, entityId: link.entity_id } },
      )) as [any[], number];
      if (r[0][0]) out.parent_id = r[0][0].annex_id;
      break;
    }
  }
  return out;
};

/**
 * Mutates each file row in place, adding `entity_links` (per-link projection
 * with parent/sub/meta navigation coords) and `link_groups` (distinct group
 * labels). Also overrides `source` to the aggregated label and back-fills
 * `parent_id`/`sub_id`/`meta_id`/`is_evidence` from the first link so legacy
 * single-link click paths keep working.
 *
 * Used by both `/files` (getUserFilesMetaData) and `/file-manager/with-metadata`
 * (getOrganizationFilesWithMetadata) so the File Manager renders identically
 * regardless of which endpoint sourced the row.
 */
export async function attachLinkProjections<T extends { id: number | string; source?: string }>(
  organizationId: number,
  files: T[],
): Promise<void> {
  const fileIds = files.map((f) => Number(f.id));
  if (fileIds.length === 0) return;

  const linksQuery = `
    SELECT
      fel.file_id,
      fel.framework_type,
      fel.entity_type,
      fel.entity_id,
      fel.project_id,
      fel.link_type,
      ${FILE_GROUP_LABEL_CASE_SQL} AS group_label
    FROM file_entity_links fel
    WHERE fel.organization_id = :organizationId AND fel.file_id IN (:fileIds)
    ORDER BY fel.id ASC`;

  const linksResult = (await sequelize.query(linksQuery, {
    replacements: { organizationId, fileIds },
  })) as [LinkRow[], number];

  const linksMap = new Map<number, LinkRow[]>();
  for (const link of linksResult[0]) {
    if (!linksMap.has(link.file_id)) linksMap.set(link.file_id, []);
    linksMap.get(link.file_id)!.push(link);
  }

  // Evidence-hub records carry their real "source" in mapped_*_ids arrays
  // (an evidence row may belong to a model, a training, or be standalone).
  // Batch-fetch those mappings so we can replace the generic group_label
  // with "Model inventory" / "Training" / "Evidence" per record.
  const evidenceIds = Array.from(
    new Set(
      linksResult[0]
        .filter((l) => l.framework_type === "evidence_hub" && l.entity_type === "evidence")
        .map((l) => l.entity_id),
    ),
  );
  const evidenceLabelMap = new Map<number, string>();
  const evidenceMappingsMap = new Map<
    number,
    { mapped_model_ids: number[]; mapped_training_ids: number[] }
  >();
  if (evidenceIds.length > 0) {
    const evRows = (await sequelize.query(
      `SELECT id, mapped_model_ids, mapped_training_ids
       FROM evidence_hub
       WHERE organization_id = :organizationId AND id IN (:evidenceIds)`,
      { replacements: { organizationId, evidenceIds } },
    )) as [
      Array<{
        id: number;
        mapped_model_ids: number[] | null;
        mapped_training_ids: number[] | null;
      }>,
      number,
    ];
    for (const ev of evRows[0]) {
      const modelIds = Array.isArray(ev.mapped_model_ids) ? ev.mapped_model_ids : [];
      const trainingIds = Array.isArray(ev.mapped_training_ids) ? ev.mapped_training_ids : [];
      evidenceLabelMap.set(
        ev.id,
        modelIds.length > 0 ? "Model inventory" : trainingIds.length > 0 ? "Training" : "Evidence",
      );
      evidenceMappingsMap.set(ev.id, {
        mapped_model_ids: modelIds,
        mapped_training_ids: trainingIds,
      });
    }
  }

  for (const file of files) {
    const f = file as any;
    f.entity_links = [];
    f.link_groups = [];

    const links = linksMap.get(Number(file.id)) || [];
    if (links.length === 0) continue;

    const projections: FileEntityLinkProjection[] = [];
    for (const link of links) {
      const hierarchy = await resolveHierarchy(organizationId, link);
      const isEvidenceHub =
        link.framework_type === "evidence_hub" && link.entity_type === "evidence";
      const groupLabel = isEvidenceHub
        ? (evidenceLabelMap.get(link.entity_id) ?? "Evidence")
        : (link.group_label ?? null);
      const mappings = isEvidenceHub ? evidenceMappingsMap.get(link.entity_id) : undefined;
      projections.push({
        framework_type: link.framework_type,
        entity_type: link.entity_type,
        entity_id: link.entity_id,
        project_id: link.project_id ?? null,
        link_type: link.link_type ?? null,
        group_label: groupLabel,
        parent_id: hierarchy.parent_id,
        sub_id: hierarchy.sub_id,
        meta_id: hierarchy.meta_id,
        is_evidence: link.link_type !== "feedback",
        ...(mappings && {
          mapped_model_ids: mappings.mapped_model_ids,
          mapped_training_ids: mappings.mapped_training_ids,
        }),
      });
    }
    f.entity_links = projections;

    const labels = Array.from(
      new Set(projections.map((p) => p.group_label).filter((l): l is string => !!l)),
    ).sort();
    f.link_groups = labels;

    if (labels.length === 1) f.source = labels[0];
    else if (labels.length > 1) f.source = `${labels.length} groups`;
    // labels.length === 0 -> keep the row's existing source (already CASE-resolved)

    const first = projections[0];
    f.is_evidence = first.link_type !== "feedback";
    f.meta_id = first.meta_id ?? undefined;
    f.parent_id = first.parent_id ?? undefined;
    f.sub_id = first.sub_id ?? undefined;
  }
}
