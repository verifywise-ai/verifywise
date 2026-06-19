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

export async function getLatestVersionQuery(template_id: number): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT * FROM report_template_versions
     WHERE template_id = :template_id ORDER BY version DESC LIMIT 1`,
    { replacements: { template_id }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

export async function getVersionByIdQuery(id: number): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT * FROM report_template_versions WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}
