import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

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

/** Derive a URL-safe slug from a template name. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200) || "template"
  );
}

// Custom templates are always org-owned and never system templates: the
// literal false is in the SQL rather than the replacements so a caller cannot
// promote its own template by sending is_system_template: true.
export async function createTemplateQuery(
  input: any,
  organization_id: number,
  userId: number,
  transaction?: Transaction,
): Promise<any> {
  if (!input?.name) throw new ValidationException("name is required", "name", input?.name);
  if (!input?.category) throw new ValidationException("category is required", "category", input?.category);
  if (input.default_scope !== "project" && input.default_scope !== "organization") {
    throw new ValidationException(
      "default_scope must be 'project' or 'organization'",
      "default_scope",
      input.default_scope,
    );
  }
  const rows: any = await sequelize.query(
    `INSERT INTO report_templates
       (organization_id, name, slug, description, category, default_scope,
        supported_scopes, recommended_frequency, is_system_template, is_active, created_by)
     VALUES (:organization_id, :name, :slug, :description, :category, :default_scope,
        :supported_scopes, :recommended_frequency, false, true, :created_by)
     RETURNING *`,
    {
      replacements: {
        organization_id,
        name: input.name,
        slug: slugify(input.name),
        description: input.description ?? null,
        category: input.category,
        default_scope: input.default_scope,
        supported_scopes: JSON.stringify(
          input.supported_scopes ?? ["project", "organization"],
        ),
        recommended_frequency: input.recommended_frequency ?? null,
        created_by: userId,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows[0];
}

// Metadata only. Config changes go through createTemplateVersionQuery because
// report_template_versions is append-only (unique on template_id, version).
//
// The WHERE clause is the whole access control: organization_id = :org (not
// "IS NULL OR", which would match system templates) plus
// is_system_template = false. A system template matches zero rows.
export async function updateTemplateQuery(
  id: number,
  organization_id: number,
  input: any,
): Promise<any> {
  // Must stay in sync with metadataChanged in reportTemplate.ctrl.ts and with
  // ReportTemplateWriteBody in i.reporting.ts. default_scope and
  // supported_scopes are real columns the write type advertises as PATCH-able,
  // so omitting them here would 400 a request the type says is valid.
  const allowed = [
    "name",
    "description",
    "category",
    "default_scope",
    "supported_scopes",
    "recommended_frequency",
    "is_active",
  ];
  const sets: string[] = [];
  const replacements: any = { id, organization_id };
  for (const field of allowed) {
    if (input[field] !== undefined) {
      sets.push(`${field} = :${field}`);
      replacements[field] = input[field];
    }
  }
  if (input.name !== undefined) {
    sets.push("slug = :slug");
    replacements.slug = slugify(input.name);
  }
  if (!sets.length) {
    throw new ValidationException("no updatable fields supplied", "body", input);
  }
  sets.push("updated_at = NOW()");
  const result: any = await sequelize.query(
    `UPDATE report_templates SET ${sets.join(", ")}
      WHERE id = :id
        AND organization_id = :organization_id
        AND is_system_template = false
      RETURNING *`,
    { replacements, type: QueryTypes.UPDATE },
  );
  return result[0]?.[0] ?? null;
}

// Soft delete. scheduled_reports.template_id is a NOT NULL FK with no
// ON DELETE clause, so a hard DELETE of a referenced template fails at the
// database. is_active = false already hides it from getTemplatesQuery.
export async function archiveTemplateQuery(
  id: number,
  organization_id: number,
): Promise<any> {
  const result: any = await sequelize.query(
    `UPDATE report_templates SET is_active = false, updated_at = NOW()
      WHERE id = :id
        AND organization_id = :organization_id
        AND is_system_template = false
      RETURNING *`,
    { replacements: { id, organization_id }, type: QueryTypes.UPDATE },
  );
  return result[0]?.[0] ?? null;
}

// Append-only. The version number is computed inside the INSERT for brevity,
// NOT for atomicity: under READ COMMITTED two overlapping statements both see
// the same MAX and both compute N+1, and the second one loses to
// idx_tpl_versions_unique with a 23505. That is the intended outcome —
// the constraint is the correctness guarantee, the subquery is not — but it
// means a concurrent config edit can surface as a 409 rather than silently
// serialising. Acceptable for a template editor; do not copy this into a
// high-write path without a lock.
//
// The SELECT ... WHERE EXISTS is the tenant guard: a template id belonging to
// another org inserts zero rows and returns undefined.
export async function createTemplateVersionQuery(
  template_id: number,
  organization_id: number,
  config: any,
  userId: number,
  transaction?: Transaction,
): Promise<any> {
  const rows: any = await sequelize.query(
    `INSERT INTO report_template_versions
       (template_id, version, sections_config, ai_blocks_config, format_config,
        branding_config, schedule_defaults, delivery_defaults, created_by)
     SELECT :template_id,
            (SELECT COALESCE(MAX(version), 0) + 1
               FROM report_template_versions WHERE template_id = :template_id),
            :sections_config, :ai_blocks_config, :format_config,
            :branding_config, :schedule_defaults, :delivery_defaults, :created_by
      WHERE EXISTS (
        SELECT 1 FROM report_templates
         WHERE id = :template_id
           AND organization_id = :organization_id
           AND is_system_template = false
      )
     RETURNING *`,
    {
      replacements: {
        template_id,
        organization_id,
        sections_config: JSON.stringify(config.sections_config ?? { sections: [] }),
        ai_blocks_config: JSON.stringify(config.ai_blocks_config ?? {}),
        format_config: JSON.stringify(config.format_config ?? {}),
        branding_config: JSON.stringify(config.branding_config ?? {}),
        schedule_defaults: JSON.stringify(config.schedule_defaults ?? {}),
        delivery_defaults: JSON.stringify(config.delivery_defaults ?? {}),
        created_by: userId,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows[0];
}
