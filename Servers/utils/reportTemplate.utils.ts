import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

// System templates (organization_id IS NULL) plus this org's custom templates.
export async function getTemplatesQuery(organization_id: number): Promise<any[]> {
  return sequelize.query(
    `SELECT * FROM report_templates
     WHERE is_active = true
       AND (organization_id IS NULL OR organization_id = :organization_id)
     ORDER BY is_system_template DESC, name ASC`,
    { replacements: { organization_id }, type: QueryTypes.SELECT },
  );
}

export async function getTemplateByIdQuery(id: number, organization_id: number): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT * FROM report_templates
     WHERE id = :id AND (organization_id IS NULL OR organization_id = :organization_id)`,
    { replacements: { id, organization_id }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

// Both version queries join their parent template to apply the org filter:
// report_template_versions carries no organization_id of its own. System
// templates (organization_id IS NULL) stay readable by every org.
export async function getLatestVersionQuery(
  template_id: number,
  organization_id: number,
): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT v.* FROM report_template_versions v
       JOIN report_templates t ON t.id = v.template_id
      WHERE v.template_id = :template_id
        AND (t.organization_id IS NULL OR t.organization_id = :organization_id)
      ORDER BY v.version DESC LIMIT 1`,
    { replacements: { template_id, organization_id }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

export async function getVersionByIdQuery(
  id: number,
  organization_id: number,
): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT v.* FROM report_template_versions v
       JOIN report_templates t ON t.id = v.template_id
      WHERE v.id = :id
        AND (t.organization_id IS NULL OR t.organization_id = :organization_id)`,
    { replacements: { id, organization_id }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}
