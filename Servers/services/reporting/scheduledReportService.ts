import {
  getTemplateByIdQuery,
  getVersionByIdQuery,
} from "../../utils/reportTemplate.utils";
import { isValidEmail } from "../email/types";

export interface ScheduledReportInput {
  templateId: number; templateVersionId: number; name: string;
  scope: "project" | "organization"; projectId?: number | null;
  frameworkId?: number | null; projectFrameworkId?: number | null;
  sectionsConfig: { sections: any[] };
  aiBlocksConfig: any; format: "pdf" | "docx";
  scheduleConfig: any; deliveryConfig: any;
}

export function validateScheduledReportInput(input: ScheduledReportInput): string[] {
  const errs: string[] = [];
  if (input.scope === "project" && !input.projectId) errs.push("project scope requires projectId");
  if (input.scope === "organization" && input.projectId) errs.push("organization scope must not set projectId");
  if (!input.sectionsConfig?.sections?.length) errs.push("at least one section is required");
  const d = input.deliveryConfig || {};
  if (!d.saveToStorage && !d.sendEmailLink && !d.attachFile) errs.push("at least one delivery option is required");
  if ((d.sendEmailLink || d.attachFile) && !(d.recipients?.length)) {
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
