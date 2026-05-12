/**
 * @fileoverview AI Detection Suppression Service
 *
 * Business logic for suppression-rule CRUD. Org-scoped via IServiceContext.
 *
 * @module services/aiDetectionSuppression
 */

import {
  IServiceContext,
  ISuppression,
  ICreateSuppressionInput,
  SuppressionMatchType,
  SuppressionField,
} from "../domain.layer/interfaces/i.aiDetection";
import {
  ValidationException,
  NotFoundException,
} from "../domain.layer/exceptions/custom.exception";
import {
  createSuppressionQuery,
  listSuppressionsQuery,
  deleteSuppressionQuery,
} from "../utils/aiDetectionSuppression.utils";

const VALID_MATCH_TYPES: SuppressionMatchType[] = ["exact", "pattern"];
const VALID_FIELDS: SuppressionField[] = ["name", "finding_type", "category", "provider"];

function validateInput(input: ICreateSuppressionInput): void {
  if (!input || typeof input !== "object") {
    throw new ValidationException("Request body is required");
  }

  if (!VALID_MATCH_TYPES.includes(input.match_type)) {
    throw new ValidationException(
      `match_type must be one of: ${VALID_MATCH_TYPES.join(", ")}`,
      "match_type",
    );
  }

  if (!VALID_FIELDS.includes(input.field)) {
    throw new ValidationException(`field must be one of: ${VALID_FIELDS.join(", ")}`, "field");
  }

  if (typeof input.value !== "string" || input.value.trim().length === 0) {
    throw new ValidationException("value is required", "value");
  }

  if (input.match_type === "pattern") {
    try {
      new RegExp(input.value);
    } catch {
      throw new ValidationException("value must be a valid regular expression", "value");
    }
  }

  if (input.expires_at !== null && input.expires_at !== undefined) {
    const parsed = new Date(input.expires_at);
    if (Number.isNaN(parsed.getTime())) {
      throw new ValidationException("expires_at must be a valid date", "expires_at");
    }
  }
}

export async function createSuppression(
  input: ICreateSuppressionInput,
  ctx: IServiceContext,
): Promise<ISuppression> {
  validateInput(input);
  const normalized: ICreateSuppressionInput = {
    match_type: input.match_type,
    field: input.field,
    value: input.value.trim(),
    reason: input.reason ?? null,
    expires_at: input.expires_at ? new Date(input.expires_at) : null,
  };
  return createSuppressionQuery(ctx.organizationId, normalized, ctx.userId);
}

export async function listSuppressions(
  ctx: IServiceContext,
  options: { includeExpired?: boolean } = {},
): Promise<ISuppression[]> {
  return listSuppressionsQuery(ctx.organizationId, options);
}

export async function deleteSuppression(id: number, ctx: IServiceContext): Promise<void> {
  const deleted = await deleteSuppressionQuery(id, ctx.organizationId);
  if (!deleted) {
    throw new NotFoundException(`Suppression rule ${id} not found`);
  }
}
