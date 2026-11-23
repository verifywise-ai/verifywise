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

export async function getVersionByIdQuery(id: number, organization_id: number): Promise<any> {
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
      // Single-character anchors, not `^-+|-+$`: the collapse above already
      // reduced every run of non-alphanumerics to one dash, so at most one
      // dash can sit at either end. The quantified form backtracks on a name
      // that is all separators ("----…"), which is caller-supplied.
      .replace(/^-/, "")
      .replace(/-$/, "")
      .slice(0, 200) || "template"
  );
}

// Every slug the organization's own templates hold, archived ones included:
// uq_report_templates_org_slug covers inactive rows too, so an archived
// template's slug is still taken.
export async function getOrganizationTemplateSlugsQuery(
  organization_id: number,
): Promise<Set<string>> {
  const rows: any[] = await sequelize.query(
    `SELECT slug FROM report_templates WHERE organization_id = :organization_id`,
    { replacements: { organization_id }, type: QueryTypes.SELECT },
  );
  return new Set(rows.map((r) => r.slug));
}

// report_templates.name is VARCHAR(255) and slugify keeps 200 characters.
const MAX_TEMPLATE_NAME = 255;
const MAX_SLUG = 200;
const MAX_COPY_NUMBER = 1000;

const copySuffix = (n: number) => (n === 1 ? " (copy)" : ` (copy ${n})`);

/**
 * The name of copy number `n` of a template: "<name> (copy)", then
 * "<name> (copy 2)", ... The base name is trimmed, never the suffix, by code
 * points so a character outside the BMP is not cut in half: first to fit the
 * name column, then until the slug is short enough that slugify's 200-character
 * cut does not drop the suffix (two copies of a long name would otherwise share
 * a slug).
 */
export function copyName(name: string, n: number): string {
  const suffix = copySuffix(n);
  const base = Array.from(String(name)).slice(0, MAX_TEMPLATE_NAME - Array.from(suffix).length);
  while (base.length && slugify(base.join("") + suffix).length >= MAX_SLUG) base.pop();
  return base.join("") + suffix;
}

/**
 * The first copy name whose slug is not in `takenSlugs`, or null when the first
 * MAX_COPY_NUMBER are all taken.
 */
export function freeCopyName(name: string, takenSlugs: Set<string>): string | null {
  for (let n = 1; n <= MAX_COPY_NUMBER; n++) {
    const candidate = copyName(name, n);
    if (!takenSlugs.has(slugify(candidate))) return candidate;
  }
  return null;
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
  if (!input?.category)
    throw new ValidationException("category is required", "category", input?.category);
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
        supported_scopes: JSON.stringify(input.supported_scopes ?? ["project", "organization"]),
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
  transaction?: Transaction,
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
    { replacements, type: QueryTypes.UPDATE, transaction },
  );
  return result[0]?.[0] ?? null;
}

// Soft delete. scheduled_reports.template_id is a NOT NULL FK with no
// ON DELETE clause, so a hard DELETE of a referenced template fails at the
// database. is_active = false already hides it from getTemplatesQuery.
export async function archiveTemplateQuery(id: number, organization_id: number): Promise<any> {
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
//
// Every config column inherits: a version written without a column (or with
// null) keeps the previous version's value, so a PATCH that edits one part of
// a template never resets the rest. An explicit value, {} included, is stored
// as sent, so a caller can still clear a column. A first version (no previous
// one) gets the column default. This matters most for:
// - framework_config: {} means EVERY framework in scope, so a reset would not
//   merely lose a preference but widen what the template reports on.
// - parameters_config: holds the report kind (e.g. "osfi_e23") that unlocks
//   the kind's sections; losing it would turn an E-23 template into a general
//   one whose sections every run then refuses.
// - sections_config and ai_blocks_config: a reset empties the report.
// Duplicating a template passes every column of the source's latest version.
const VERSION_JSON_COLUMNS: Array<{ column: string; fallback: string }> = [
  { column: "sections_config", fallback: "jsonb_build_object('sections', jsonb_build_array())" },
  { column: "ai_blocks_config", fallback: "'{}'::jsonb" },
  { column: "framework_config", fallback: "'{}'::jsonb" },
  { column: "parameters_config", fallback: "'{}'::jsonb" },
  { column: "format_config", fallback: "'{}'::jsonb" },
  { column: "branding_config", fallback: "'{}'::jsonb" },
  { column: "schedule_defaults", fallback: "'{}'::jsonb" },
  { column: "delivery_defaults", fallback: "'{}'::jsonb" },
];

export async function createTemplateVersionQuery(
  template_id: number,
  organization_id: number,
  config: any,
  userId: number,
  transaction?: Transaction,
): Promise<any> {
  const parametersConfig = config.parameters_config;
  if (
    parametersConfig !== undefined &&
    parametersConfig !== null &&
    (typeof parametersConfig !== "object" || Array.isArray(parametersConfig))
  ) {
    throw new ValidationException(
      "parameters_config must be an object",
      "parameters_config",
      parametersConfig,
    );
  }
  const replacements: Record<string, unknown> = {
    template_id,
    organization_id,
    created_by: userId,
  };
  for (const { column } of VERSION_JSON_COLUMNS) {
    const value = config[column];
    replacements[column] = value === undefined || value === null ? null : JSON.stringify(value);
  }
  const columns = VERSION_JSON_COLUMNS.map((c) => c.column).join(", ");
  const values = VERSION_JSON_COLUMNS.map(
    ({ column, fallback }) => `COALESCE(CAST(:${column} AS JSONB), prev.${column}, ${fallback})`,
  ).join(",\n            ");
  const rows: any = await sequelize.query(
    `INSERT INTO report_template_versions
       (template_id, version, ${columns}, created_by)
     SELECT :template_id,
            (SELECT COALESCE(MAX(version), 0) + 1
               FROM report_template_versions WHERE template_id = :template_id),
            ${values},
            :created_by
       FROM (SELECT 1) AS one
       LEFT JOIN LATERAL (
         SELECT * FROM report_template_versions
          WHERE template_id = :template_id
          ORDER BY version DESC LIMIT 1
       ) AS prev ON true
      WHERE EXISTS (
        SELECT 1 FROM report_templates
         WHERE id = :template_id
           AND organization_id = :organization_id
           AND is_system_template = false
      )
     RETURNING *`,
    { replacements, type: QueryTypes.SELECT, transaction },
  );
  return rows[0];
}
