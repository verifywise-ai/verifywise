import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { sanitizeUserHtml } from "./sanitization.utils";

/**
 * Organisation-owned policy templates (VW-CQ-09), raw SQL with no model —
 * mirrors utils/reportTemplate.utils.ts.
 *
 * Reads admit system templates (organization_id IS NULL) alongside the
 * caller's own; writes are guarded by `organization_id = :organization_id
 * AND is_system_template = false`, which is the whole access control: a
 * system template matches zero rows on any write.
 */

export async function getPolicyTemplatesQuery(organizationId: number): Promise<any[]> {
  return sequelize.query(
    `SELECT * FROM policy_templates
     WHERE is_active = true
       AND (organization_id IS NULL OR organization_id = :organizationId)
     ORDER BY is_system_template DESC, name ASC`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );
}

export async function getPolicyTemplateByIdQuery(id: number, organizationId: number): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT * FROM policy_templates
     WHERE id = :id AND (organization_id IS NULL OR organization_id = :organizationId)`,
    { replacements: { id, organizationId }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

function validateName(name: unknown): string {
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 255) {
    throw new ValidationException(
      "name must be a string between 2 and 255 characters",
      "name",
      name,
    );
  }
  return name.trim();
}

function validateCategory(category: unknown): string {
  if (typeof category !== "string" || !category.trim()) {
    throw new ValidationException("category is required", "category", category);
  }
  return category.trim();
}

function isUniqueViolation(error: unknown): boolean {
  const pgErr = (error as any)?.parent ?? (error as any)?.original;
  return pgErr?.code === "23505";
}

// Custom templates are always org-owned and never system templates: the
// literal false is in the SQL rather than the replacements so a caller cannot
// promote its own template by sending is_system_template: true.
export async function createPolicyTemplateQuery(
  input: any,
  organizationId: number,
  userId: number,
  transaction?: Transaction,
): Promise<any> {
  const name = validateName(input?.name);
  const category = validateCategory(input?.category);
  try {
    const rows: any = await sequelize.query(
      `INSERT INTO policy_templates
         (organization_id, name, category, description, content, tags,
          is_system_template, is_active, created_by)
       VALUES (:organizationId, :name, :category, :description, :content, ARRAY[:tags]::text[],
          false, true, :createdBy)
       RETURNING *`,
      {
        replacements: {
          organizationId,
          name,
          category,
          description: input?.description ?? null,
          content: sanitizeUserHtml(input?.content ?? "") ?? "",
          tags: Array.isArray(input?.tags) ? input.tags : [],
          createdBy: userId,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    return rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictException(
        "a template with this name already exists",
        "policy_template",
        "name",
      );
    }
    throw error;
  }
}

// The WHERE clause is the whole access control: organization_id = :org (not
// "IS NULL OR", which would match system templates) plus
// is_system_template = false. A system template matches zero rows.
export async function updatePolicyTemplateQuery(
  id: number,
  organizationId: number,
  input: any,
  transaction?: Transaction,
): Promise<any> {
  // Must stay in sync with the metadataChanged check in policyTemplate.ctrl.ts
  // and with PolicyTemplateWriteBody in i.policyTemplate.ts.
  const allowed = ["name", "category", "description", "content", "tags", "is_active"];
  const sets: string[] = [];
  const replacements: any = { id, organizationId };
  for (const field of allowed) {
    if (input[field] !== undefined) {
      if (field === "name") {
        replacements[field] = validateName(input[field]);
      } else if (field === "category") {
        replacements[field] = validateCategory(input[field]);
      } else if (field === "content") {
        replacements[field] = sanitizeUserHtml(input[field]) ?? "";
      } else {
        replacements[field] = input[field];
      }
      sets.push(`${field} = :${field}`);
    }
  }
  if (!sets.length) {
    throw new ValidationException("no updatable fields supplied", "body", input);
  }
  sets.push("updated_at = NOW()");
  try {
    const result: any = await sequelize.query(
      `UPDATE policy_templates SET ${sets.join(", ")}
        WHERE id = :id
          AND organization_id = :organizationId
          AND is_system_template = false
        RETURNING *`,
      { replacements, type: QueryTypes.UPDATE, transaction },
    );
    return result[0]?.[0] ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictException(
        "a template with this name already exists",
        "policy_template",
        "name",
      );
    }
    throw error;
  }
}

// Hard delete: unlike scheduled_reports.template_id, nothing references
// policy_templates, so no FK can block the DELETE. The org + system guards
// still apply — a caller can only remove its own templates.
export async function deletePolicyTemplateQuery(id: number, organizationId: number): Promise<any> {
  const result: any = await sequelize.query(
    `DELETE FROM policy_templates
      WHERE id = :id
        AND organization_id = :organizationId
        AND is_system_template = false
      RETURNING id`,
    { replacements: { id, organizationId }, type: QueryTypes.DELETE },
  );
  return result[0]?.[0] ?? null;
}

// "Save as template" from a policy_manager row. policy_manager carries no
// category, so copies land in a neutral bucket rather than pretending to be
// one of the advisor's curated categories.
export const POLICY_TEMPLATE_DEFAULT_CATEGORY = "General";

export async function createPolicyTemplateFromPolicyQuery(
  policyId: number,
  organizationId: number,
  userId: number,
  name?: string,
  transaction?: Transaction,
): Promise<any> {
  try {
    const rows: any = await sequelize.query(
      `INSERT INTO policy_templates
         (organization_id, name, category, description, content, tags,
          is_system_template, is_active, created_by)
       SELECT :organizationId,
              COALESCE(:name, title),
              :category,
              NULL,
              content_html,
              tags,
              false,
              true,
              :createdBy
         FROM policy_manager
        WHERE id = :policyId AND organization_id = :organizationId
       RETURNING *`,
      {
        replacements: {
          organizationId,
          name: name ? validateName(name) : null,
          category: POLICY_TEMPLATE_DEFAULT_CATEGORY,
          createdBy: userId,
          policyId,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("policy not found", "policy_manager", policyId);
    }
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictException(
        "a template with this name already exists",
        "policy_template",
        "name",
      );
    }
    throw error;
  }
}
