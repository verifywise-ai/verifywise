import { getAllFrameworksQuery } from "../../utils/framework.utils";
import logger from "../../utils/logger/fileLogger";

export interface FetchFrameworksParams {
  limit?: number;
}

const fetchFrameworks = async (
  params: FetchFrameworksParams,
  organizationId: number
): Promise<any[]> => {
  try {
    let frameworks = await getAllFrameworksQuery(organizationId);

    // Limit results
    if (params.limit && params.limit > 0) {
      frameworks = frameworks.slice(0, params.limit);
    }

    // Return lightweight projections
    return frameworks.map((f: any) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      projectCount: Array.isArray((f as any).projects)
        ? (f as any).projects.length
        : 0,
      created_at: f.created_at,
    }));
  } catch (error) {
    logger.error("Error fetching frameworks:", error);
    throw new Error(
      `Failed to fetch frameworks: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const getFrameworkAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<any> => {
  try {
    const frameworks = await getAllFrameworksQuery(organizationId);
    const total = frameworks.length;

    // Framework adoption (project count per framework)
    const frameworkAdoption = frameworks.map((f: any) => ({
      name: f.name,
      projectCount: Array.isArray((f as any).projects)
        ? (f as any).projects.length
        : 0,
    })).sort((a: any, b: any) => b.projectCount - a.projectCount);

    // Total projects using any framework
    const allProjectIds = new Set<number>();
    frameworks.forEach((f: any) => {
      if (Array.isArray((f as any).projects)) {
        (f as any).projects.forEach((p: any) => {
          const pid = p.project_id ?? p.id;
          if (pid != null) allProjectIds.add(pid);
        });
      }
    });

    return {
      totalFrameworks: total,
      totalProjectsWithFrameworks: allProjectIds.size,
      frameworkAdoption,
    };
  } catch (error) {
    logger.error("Error getting framework analytics:", error);
    throw new Error(
      `Failed to get framework analytics: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const availableFrameworkTools: Record<string, Function> = {
  fetch_frameworks: fetchFrameworks,
  get_framework_analytics: getFrameworkAnalytics,
};

export { availableFrameworkTools };
