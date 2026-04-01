import { getAllTrainingRegistarQuery } from "../../utils/trainingRegistar.utils";
import logger from "../../utils/logger/fileLogger";

export interface FetchTrainingRecordsParams {
  status?: "Planned" | "In Progress" | "Completed";
  department?: string;
  provider?: string;
  limit?: number;
}

const fetchTrainingRecords = async (
  params: FetchTrainingRecordsParams,
  organizationId: number
): Promise<any[]> => {
  try {
    let records = await getAllTrainingRegistarQuery(organizationId);

    // Apply filters
    if (params.status) {
      records = records.filter((r: any) => r.status === params.status);
    }
    if (params.department) {
      records = records.filter(
        (r: any) =>
          r.department &&
          r.department.toLowerCase().includes(params.department!.toLowerCase())
      );
    }
    if (params.provider) {
      records = records.filter(
        (r: any) =>
          r.provider &&
          r.provider.toLowerCase().includes(params.provider!.toLowerCase())
      );
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      records = records.slice(0, params.limit);
    }

    // Return lightweight projections
    return records.map((r: any) => ({
      id: r.id,
      training_name: r.training_name,
      status: r.status,
      department: r.department,
      provider: r.provider,
      duration: r.duration,
      numberOfPeople: r.numberOfPeople || r.people,
    }));
  } catch (error) {
    logger.error("Error fetching training records:", error);
    throw new Error(
      `Failed to fetch training records: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const getTrainingAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<any> => {
  try {
    const records = await getAllTrainingRegistarQuery(organizationId);
    const total = records.length;

    // Status distribution
    const statusDistribution: Record<string, number> = {};
    records.forEach((r: any) => {
      const status = r.status || "Unknown";
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;
    });

    // Department distribution
    const departmentDistribution: Record<string, number> = {};
    records.forEach((r: any) => {
      if (r.department) {
        departmentDistribution[r.department] =
          (departmentDistribution[r.department] || 0) + 1;
      }
    });

    // Provider distribution
    const providerDistribution: Record<string, number> = {};
    records.forEach((r: any) => {
      if (r.provider) {
        providerDistribution[r.provider] =
          (providerDistribution[r.provider] || 0) + 1;
      }
    });

    // Total people trained
    const totalPeopleTrained = records.reduce(
      (sum: number, r: any) => sum + (r.numberOfPeople || r.people || 0),
      0
    );

    return {
      totalTrainingRecords: total,
      statusDistribution,
      departmentDistribution,
      providerDistribution,
      totalPeopleTrained,
    };
  } catch (error) {
    logger.error("Error getting training analytics:", error);
    throw new Error(
      `Failed to get training analytics: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const getTrainingExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<any> => {
  try {
    const records = await getAllTrainingRegistarQuery(organizationId);
    const total = records.length;

    const completedCount = records.filter(
      (r: any) => r.status === "Completed"
    ).length;
    const inProgressCount = records.filter(
      (r: any) => r.status === "In Progress"
    ).length;
    const plannedCount = records.filter(
      (r: any) => r.status === "Planned"
    ).length;

    const completionRate =
      total > 0 ? Math.round((completedCount / total) * 100) : 0;

    // Department coverage
    const departments = new Set<string>();
    records.forEach((r: any) => {
      if (r.department) departments.add(r.department);
    });

    // Total people
    const totalPeopleTrained = records.reduce(
      (sum: number, r: any) => sum + (r.numberOfPeople || r.people || 0),
      0
    );

    return {
      totalTrainingRecords: total,
      completedTrainings: completedCount,
      inProgressTrainings: inProgressCount,
      plannedTrainings: plannedCount,
      completionRate: `${completionRate}%`,
      departmentsCovered: departments.size,
      departments: Array.from(departments),
      totalPeopleTrained,
    };
  } catch (error) {
    logger.error("Error getting training executive summary:", error);
    throw new Error(
      `Failed to get training executive summary: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const availableTrainingTools: Record<string, Function> = {
  fetch_training_records: fetchTrainingRecords,
  get_training_analytics: getTrainingAnalytics,
  get_training_executive_summary: getTrainingExecutiveSummary,
};

export { availableTrainingTools };
