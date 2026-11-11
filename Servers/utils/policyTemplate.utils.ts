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
  // policy_templates.category is VARCHAR(100).
  if (category.trim().length > 100) {
    throw new ValidationException("category must be at most 100 characters", "category", category);
  }
  return category.trim();
}

// policy_templates.description is TEXT; the cap is ours. A summary shown in
// the templates table, so 2000 characters is plenty.
const MAX_DESCRIPTION_LENGTH = 2000;

function validateDescription(description: unknown): string | null {
  if (description === undefined || description === null) return null;
  if (typeof description !== "string") {
    throw new ValidationException("description must be a string", "description", description);
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationException(
      `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
      "description",
      description,
    );
  }
  return description;
}

// Same caps for create and update. Tags are short labels; the column is
// TEXT[] so the limits are ours, not the schema's.
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 100;

function validateTags(tags: unknown): string[] {
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) {
    throw new ValidationException("tags must be an array of strings", "tags", tags);
  }
  const cleaned = tags.map((t: string) => t.trim()).filter((t) => t.length > 0);
  if (cleaned.length > MAX_TAGS || cleaned.some((t) => t.length > MAX_TAG_LENGTH)) {
    throw new ValidationException(
      `tags must hold at most ${MAX_TAGS} entries of at most ${MAX_TAG_LENGTH} characters`,
      "tags",
      tags,
    );
  }
  return Array.from(new Set(cleaned));
}

// Sequelize expands an array replacement to a comma list ('a', 'b'), so a
// bare `tags = :tags` is a syntax error. Wrap it in ARRAY[...]; an empty
// array would render as ARRAY[] which Postgres cannot type without a cast,
// and as nothing at all in a SET clause, so use the empty literal instead.
function tagsSqlExpr(tags: string[], placeholder = ":tags"): string {
  return tags.length ? `ARRAY[${placeholder}]::text[]` : "'{}'::text[]";
}

function validateIsActive(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new ValidationException("is_active must be a boolean", "is_active", value);
  }
  return value;
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
  const description = validateDescription(input?.description);
  const tags = input?.tags === undefined || input?.tags === null ? [] : validateTags(input.tags);
  try {
    const rows: any = await sequelize.query(
      `INSERT INTO policy_templates
         (organization_id, name, category, description, content, tags,
          is_system_template, is_active, created_by)
       VALUES (:organizationId, :name, :category, :description, :content, ${tagsSqlExpr(tags)},
          false, true, :createdBy)
       RETURNING *`,
      {
        replacements: {
          organizationId,
          name,
          category,
          description,
          content: sanitizeUserHtml(input?.content ?? "") ?? "",
          tags,
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
      if (field === "tags") {
        const tags = validateTags(input.tags);
        replacements.tags = tags;
        sets.push(`tags = ${tagsSqlExpr(tags)}`);
        continue;
      }
      if (field === "name") {
        replacements[field] = validateName(input[field]);
      } else if (field === "category") {
        replacements[field] = validateCategory(input[field]);
      } else if (field === "description") {
        replacements[field] = validateDescription(input[field]);
      } else if (field === "content") {
        if (typeof input[field] !== "string") {
          throw new ValidationException("content must be a string", "content", input[field]);
        }
        replacements[field] = sanitizeUserHtml(input[field]) ?? "";
      } else if (field === "is_active") {
        replacements[field] = validateIsActive(input[field]);
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
  // With QueryTypes.DELETE the Postgres dialect returns the RETURNING rows
  // directly (not the raw [rows, metadata] pair), so the row is result[0].
  const result: any = await sequelize.query(
    `DELETE FROM policy_templates
      WHERE id = :id
        AND organization_id = :organizationId
        AND is_system_template = false
      RETURNING id`,
    { replacements: { id, organizationId }, type: QueryTypes.DELETE },
  );
  return result?.[0] ?? null;
}

// "Save as template" from a policy_manager row. policy_manager carries no
// category, so the caller picks one; without one the copy lands in the first
// of the curated categories the UI offers (PolicyTemplateCategory in
// Clients/src/domain/enums/policy.enum.ts), so the edit form can show it.
export const POLICY_TEMPLATE_DEFAULT_CATEGORY = "Core AI governance policies";

export async function createPolicyTemplateFromPolicyQuery(
  policyId: number,
  organizationId: number,
  userId: number,
  name?: string,
  category?: string,
  transaction?: Transaction,
): Promise<any> {
  const validatedName = name ? validateName(name) : null;
  const validatedCategory =
    category === undefined || category === null || category === ""
      ? POLICY_TEMPLATE_DEFAULT_CATEGORY
      : validateCategory(category);
  // Read first, then insert: policy_manager.content_html predates server-side
  // sanitization on every write path (the advisor tools wrote it raw), so it
  // goes through the same sanitizer as a template written directly. tags and
  // content_html are nullable there but NOT NULL here.
  const policies: any[] = await sequelize.query(
    `SELECT title, COALESCE(content_html, '') AS content_html, COALESCE(tags, '{}') AS tags
       FROM policy_manager
      WHERE id = :policyId AND organization_id = :organizationId`,
    { replacements: { policyId, organizationId }, type: QueryTypes.SELECT, transaction },
  );
  const policy = policies[0];
  if (!policy) {
    throw new NotFoundException("policy not found", "policy_manager", policyId);
  }
  const tags: string[] = Array.isArray(policy.tags)
    ? policy.tags.filter((t: unknown): t is string => typeof t === "string" && t.trim() !== "")
    : [];
  try {
    const rows: any = await sequelize.query(
      `INSERT INTO policy_templates
         (organization_id, name, category, description, content, tags,
          is_system_template, is_active, created_by)
       VALUES (:organizationId, :name, :category, NULL, :content, ${tagsSqlExpr(tags)},
          false, true, :createdBy)
       RETURNING *`,
      {
        replacements: {
          organizationId,
          name: validatedName ?? validateName(policy.title),
          category: validatedCategory,
          content: sanitizeUserHtml(String(policy.content_html ?? "")) ?? "",
          tags,
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
