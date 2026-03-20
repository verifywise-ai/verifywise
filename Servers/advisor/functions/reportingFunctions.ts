import { getGeneratedReportsQuery } from "../../utils/reporting.utils";
import logger from "../../utils/logger/fileLogger";

export interface FetchReportsParams {
  source?: string;
  limit?: number;
}

const fetchReports = async (
  params: FetchReportsParams,
  organizationId: number
): Promise<any[]> => {
  try {
    // Use Admin role to get all reports for the advisor
    let reports = await getGeneratedReportsQuery(
      { userId: 0, role: "Admin" },
      organizationId
    );

    if (!Array.isArray(reports)) reports = [];

    // Apply filters
    if (params.source) {
      reports = reports.filter(
        (r: any) =>
          r.source &&
          r.source.toLowerCase().includes(params.source!.toLowerCase())
      );
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      reports = reports.slice(0, params.limit);
    }

    // Return lightweight projections
    return reports.map((r: any) => ({
      id: r.id,
      filename: r.filename,
      source: r.source,
      project_title: r.project_title,
      uploader_name: r.uploader_name
        ? `${r.uploader_name} ${r.uploader_surname || ""}`.trim()
        : undefined,
      uploaded_time: r.uploaded_time,
    }));
  } catch (error) {
    logger.error("Error fetching reports:", error);
    throw new Error(
      `Failed to fetch reports: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const getReportingAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<any> => {
  try {
    let reports = await getGeneratedReportsQuery(
      { userId: 0, role: "Admin" },
      organizationId
    );

    if (!Array.isArray(reports)) reports = [];
    const total = reports.length;

    // Distribution by source/type
    const sourceDistribution: Record<string, number> = {};
    reports.forEach((r: any) => {
      const source = r.source || "Unknown";
      sourceDistribution[source] = (sourceDistribution[source] || 0) + 1;
    });

    // Distribution by project
    const projectDistribution: Record<string, number> = {};
    reports.forEach((r: any) => {
      const project = r.project_title || "Unknown";
      projectDistribution[project] =
        (projectDistribution[project] || 0) + 1;
    });

    // Recent reports (last 5)
    const recentReports = [...reports]
      .sort((a: any, b: any) => {
        const dateA = a.uploaded_time
          ? new Date(a.uploaded_time).getTime()
          : 0;
        const dateB = b.uploaded_time
          ? new Date(b.uploaded_time).getTime()
          : 0;
        return dateB - dateA;
      })
      .slice(0, 5)
      .map((r: any) => ({
        filename: r.filename,
        source: r.source,
        project_title: r.project_title,
        uploaded_time: r.uploaded_time,
      }));

    return {
      totalReports: total,
      sourceDistribution,
      projectDistribution,
      recentReports,
    };
  } catch (error) {
    logger.error("Error getting reporting analytics:", error);
    throw new Error(
      `Failed to get reporting analytics: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const availableReportingTools: Record<string, Function> = {
  fetch_reports: fetchReports,
  get_reporting_analytics: getReportingAnalytics,
};

export { availableReportingTools };
