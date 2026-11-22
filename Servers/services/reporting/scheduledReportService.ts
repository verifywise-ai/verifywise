import { getTemplateByIdQuery, getVersionByIdQuery } from "../../utils/reportTemplate.utils";
import { isValidEmail } from "../email/types";
import { validateScheduleConfig } from "./scheduleCalculator";
import { ReportParameterError, sectionKeysOf, validateRunInput } from "./reportParameters";
import type { ReportParameters } from "../../domain.layer/interfaces/i.reportTemplate";

export interface ScheduledReportInput {
  templateId: number;
  templateVersionId: number;
  name: string;
  scope: "project" | "organization";
  projectId?: number | null;
  frameworkId?: number | null;
  projectFrameworkId?: number | null;
  sectionsConfig: { sections: any[] };
  aiBlocksConfig: any;
  format: "pdf" | "docx";
  scheduleConfig: any;
  deliveryConfig: any;
  reportParameters?: unknown;
}

export function validateScheduledReportInput(input: ScheduledReportInput): string[] {
  const errs: string[] = [];
  if (input.scope === "project" && !input.projectId) errs.push("project scope requires projectId");
  if (input.scope === "organization" && input.projectId)
    errs.push("organization scope must not set projectId");
  if (!input.sectionsConfig?.sections?.length) errs.push("at least one section is required");
  errs.push(...validateScheduleConfig(input.scheduleConfig));
  const d = input.deliveryConfig || {};
  if (!d.saveToStorage && !d.sendEmailLink && !d.attachFile)
    errs.push("at least one delivery option is required");
  if ((d.sendEmailLink || d.attachFile) && !d.recipients?.length) {
    errs.push("recipients required when email delivery is enabled");
  } else if ((d.sendEmailLink || d.attachFile) && d.recipients?.length) {
    // Format-check at creation. sendAutomationEmail validates again at send
    // time, but by then the person who typed the address is long gone and the
    // failure is buried in a worker log.
    const bad = (d.recipients as string[]).filter((r) => !isValidEmail(r));
    if (bad.length) errs.push(`invalid recipient address: ${bad.join(", ")}`);
  }
  return errs;
}

/**
 * Confirm templateVersionId belongs to templateId and both are reachable from
 * this organization.
 *
 * createScheduledReportQuery takes both ids straight from the request body and
 * only a plain FK constraint stands behind them, which proves the row exists —
 * not that the caller may reference it. template_version_id is audit-only
 * today (reportRunOrchestrator passes it to createRunQuery and never reads
 * template content from it), so this closes a cross-org attribution gap rather
 * than a content-injection one.
 *
 * Async because it hits the database. It MUST be awaited: an un-awaited
 * Promise reports `.length` as undefined, which is falsy, so a dropped await
 * silently disables the check.
 */
export async function validateTemplateVersionOwnership(
  templateId: number,
  templateVersionId: number,
  organizationId: number,
): Promise<string[]> {
  if (!templateId || !templateVersionId) {
    return ["templateId and templateVersionId are required"];
  }
  const template = await getTemplateByIdQuery(templateId, organizationId);
  if (!template) {
    return ["templateId does not exist or is not accessible to this organization"];
  }
  const version = await getVersionByIdQuery(templateVersionId, organizationId);
  if (!version) {
    return ["templateVersionId does not exist or is not accessible to this organization"];
  }
  if (Number(version.template_id) !== Number(templateId)) {
    return ["templateVersionId does not belong to templateId"];
  }
  return [];
}

/**
 * Check a schedule's sections and stored parameter answers against its
 * template version. A schedule never stores the reporting period: each run
 * derives it (see rollingPeriod), so a period sent here is refused.
 *
 * An unknown or foreign version yields no errors here;
 * validateTemplateVersionOwnership reports that case.
 */
export async function validateScheduledReportParameters(input: {
  templateVersionId: number;
  organizationId: number;
  sectionsConfig: unknown;
  reportParameters: unknown;
  /** The schedule's scope as it will be stored (after a PATCH, not before). */
  scope: string | undefined;
}): Promise<{ value: ReportParameters; errors: ReportParameterError[] }> {
  const version = input.templateVersionId
    ? await getVersionByIdQuery(Number(input.templateVersionId), input.organizationId)
    : null;
  if (!version) return { value: {}, errors: [] };
  return validateRunInput(
    version.parameters_config ?? {},
    sectionKeysOf(input.sectionsConfig),
    input.reportParameters,
    { now: new Date(), requirePeriod: false, scope: input.scope },
  );
}
