import { getOrganizationByIdQuery } from "../organization.utils";

interface ReportingReplacementParams {
  projectDetails?: any;
  reportType: string | string[];
  frequency: string;
  organizationId: number;
  reportLevel?: string;
}

/**
 * Build replacement dictionary for scheduled report emails
 */
export async function buildReportingReplacements(
  params: ReportingReplacementParams,
): Promise<Record<string, any>> {
  const { projectDetails, reportType, frequency, organizationId, reportLevel } = params;

  const replacements: Record<string, any> = {
    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };

  // Report type
  const reportTypeDisplay = Array.isArray(reportType) ? reportType.join(", ") : reportType;
  replacements["report.type"] = reportTypeDisplay;

  // Schedule information
  replacements["schedule.frequency"] = frequency.charAt(0).toUpperCase() + frequency.slice(1);

  // Organization information
  try {
    const organization = await getOrganizationByIdQuery(organizationId);
    replacements["organization.name"] = organization?.name || "Unknown Organization";
  } catch (error) {
    replacements["organization.name"] = "Unknown Organization";
  }

  // Project information (only for project-level reports)
  if (reportLevel !== "organization" && projectDetails) {
    replacements["project.title"] = projectDetails.project_title || "Untitled Project";
    replacements["project.owner"] = projectDetails.owner_name || "Unknown";
    replacements["project.goal"] = projectDetails.goal || "Not specified";
    replacements["project.start_date"] = projectDetails.start_date
      ? new Date(projectDetails.start_date).toLocaleDateString("en-US", { dateStyle: "long" })
      : "Not set";
    replacements["project.ai_risk_classification"] =
      projectDetails.ai_risk_classification || "Not classified";
    replacements["project.status"] = projectDetails.status || "Unknown";
  }

  return replacements;
}
