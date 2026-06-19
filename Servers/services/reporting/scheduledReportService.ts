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
  if ((d.sendEmailLink || d.attachFile) && !(d.recipients?.length)) errs.push("recipients required when email delivery is enabled");
  return errs;
}
