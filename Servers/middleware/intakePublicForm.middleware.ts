// Servers/middleware/intakePublicForm.middleware.ts
// Resolves the public intake form for both URL shapes (/public/by-id/:publicId
// and /public/:tenantSlug/:formSlug) with the same lookups as the public GETs,
// so the limiters that follow can key on the form id rather than on the URL.
// An unknown or inactive form answers 404 before any limiter counts.
import { NextFunction, Request, Response } from "express";
import type { IIntakeForm } from "../domain.layer/interfaces/i.intakeForm";
import { IntakeFormStatus } from "../domain.layer/enums/intake-form-status.enum";
import {
  getActivePublicFormQuery,
  getFormByPublicIdQuery,
  getIntakeFormByIdQuery,
  getTenantByPublicId,
  getTenantHashBySlug,
} from "../utils/intakeForm.utils";
import { translateRequest } from "../utils/i18n.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger from "../utils/logger/fileLogger";

export interface ResolvedIntakeForm {
  form: IIntakeForm;
  organizationId: number;
}

const param = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

async function findActivePublicForm(
  req: Request,
): Promise<{ formId: number; organizationId: number } | null> {
  if (req.params.publicId !== undefined) {
    const publicId = param(req.params.publicId);
    const tenant = await getTenantByPublicId(publicId);
    if (!tenant) return null;
    const form = await getFormByPublicIdQuery(publicId, tenant.orgId);
    return form ? { formId: form.id, organizationId: tenant.orgId } : null;
  }
  const tenant = await getTenantHashBySlug(param(req.params.tenantSlug));
  if (!tenant) return null;
  const form = await getActivePublicFormQuery(param(req.params.formSlug), tenant.id);
  return form ? { formId: form.id, organizationId: tenant.id } : null;
}

/** Sets `res.locals.intakeForm` to the full active form and its organisation, or answers 404. */
export async function resolvePublicIntakeForm(req: Request, res: Response, next: NextFunction) {
  try {
    const found = await findActivePublicForm(req);
    // The full row carries llmKeyId and liveChecksEnabled; it never leaves the server.
    const form = found ? await getIntakeFormByIdQuery(found.formId, found.organizationId) : null;
    if (!found || !form || form.status !== IntakeFormStatus.ACTIVE) {
      return res
        .status(404)
        .json(STATUS_CODE[404](translateRequest(req, "Form not found or not available")));
    }
    const resolved: ResolvedIntakeForm = { form, organizationId: found.organizationId };
    res.locals.intakeForm = resolved;
    return next();
  } catch (error) {
    logger.error("Error resolving public intake form", error);
    return res
      .status(500)
      .json(
        STATUS_CODE[500](
          translateRequest(req, "An error occurred while loading the form. Please try again."),
        ),
      );
  }
}
