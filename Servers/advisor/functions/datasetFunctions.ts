import { getAllDatasetsQuery } from "../../utils/dataset.utils";
import logger from "../../utils/logger/fileLogger";

export interface FetchDatasetsParams {
  type?: string;
  classification?: string;
  contains_pii?: boolean;
  status?: string;
  limit?: number;
}

const fetchDatasets = async (
  params: FetchDatasetsParams,
  organizationId: number
): Promise<any[]> => {
  try {
    let datasets = await getAllDatasetsQuery(organizationId);

    // Apply filters
    if (params.type) {
      datasets = datasets.filter((d: any) => d.type === params.type);
    }
    if (params.classification) {
      datasets = datasets.filter(
        (d: any) => d.classification === params.classification
      );
    }
    if (params.contains_pii !== undefined) {
      datasets = datasets.filter(
        (d: any) => d.contains_pii === params.contains_pii
      );
    }
    if (params.status) {
      datasets = datasets.filter((d: any) => d.status === params.status);
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      datasets = datasets.slice(0, params.limit);
    }

    // Return lightweight projections
    return datasets.map((d: any) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      classification: d.classification,
      contains_pii: d.contains_pii,
      pii_types: d.pii_types,
      status: d.status,
      known_biases: d.known_biases,
      owner: d.owner,
      source: d.source,
      format: d.format,
      created_at: d.created_at,
    }));
  } catch (error) {
    logger.error("Error fetching datasets:", error);
    throw new Error(
      `Failed to fetch datasets: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const getDatasetAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<any> => {
  try {
    const datasets = await getAllDatasetsQuery(organizationId);
    const total = datasets.length;

    // Type distribution
    const typeDistribution: Record<string, number> = {};
    datasets.forEach((d: any) => {
      const type = d.type || "Unknown";
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });

    // Classification distribution
    const classificationDistribution: Record<string, number> = {};
    datasets.forEach((d: any) => {
      const classification = d.classification || "Unclassified";
      classificationDistribution[classification] =
        (classificationDistribution[classification] || 0) + 1;
    });

    // PII exposure
    const piiCount = datasets.filter((d: any) => d.contains_pii).length;
    const noPiiCount = total - piiCount;

    // Status distribution
    const statusDistribution: Record<string, number> = {};
    datasets.forEach((d: any) => {
      const status = d.status || "Unknown";
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;
    });

    // Bias flags
    const datasetsWithBiases = datasets.filter(
      (d: any) => d.known_biases &&
        (typeof d.known_biases === "string"
          ? d.known_biases.trim() !== ""
          : Array.isArray(d.known_biases)
            ? d.known_biases.length > 0
            : true)
    ).length;

    return {
      totalDatasets: total,
      typeDistribution,
      classificationDistribution,
      piiExposure: { withPii: piiCount, withoutPii: noPiiCount },
      statusDistribution,
      datasetsWithKnownBiases: datasetsWithBiases,
    };
  } catch (error) {
    logger.error("Error getting dataset analytics:", error);
    throw new Error(
      `Failed to get dataset analytics: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const getDatasetExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<any> => {
  try {
    const datasets = await getAllDatasetsQuery(organizationId);
    const total = datasets.length;

    const piiCount = datasets.filter((d: any) => d.contains_pii).length;
    const piiExposureRate =
      total > 0 ? Math.round((piiCount / total) * 100) : 0;

    const datasetsWithBiases = datasets.filter(
      (d: any) => d.known_biases &&
        (typeof d.known_biases === "string"
          ? d.known_biases.trim() !== ""
          : Array.isArray(d.known_biases)
            ? d.known_biases.length > 0
            : true)
    ).length;

    // Classification breakdown
    const classificationBreakdown: Record<string, number> = {};
    datasets.forEach((d: any) => {
      const classification = d.classification || "Unclassified";
      classificationBreakdown[classification] =
        (classificationBreakdown[classification] || 0) + 1;
    });

    // Recent datasets (last 5)
    const recentDatasets = [...datasets]
      .sort((a: any, b: any) => {
        const dateA = a.created_at
          ? new Date(a.created_at).getTime()
          : 0;
        const dateB = b.created_at
          ? new Date(b.created_at).getTime()
          : 0;
        return dateB - dateA;
      })
      .slice(0, 5)
      .map((d: any) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        classification: d.classification,
        contains_pii: d.contains_pii,
      }));

    return {
      totalDatasets: total,
      piiExposureRate: `${piiExposureRate}%`,
      datasetsWithPii: piiCount,
      datasetsWithKnownBiases: datasetsWithBiases,
      classificationBreakdown,
      recentDatasets,
    };
  } catch (error) {
    logger.error("Error getting dataset executive summary:", error);
    throw new Error(
      `Failed to get dataset executive summary: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const availableDatasetTools: Record<string, Function> = {
  fetch_datasets: fetchDatasets,
  get_dataset_analytics: getDatasetAnalytics,
  get_dataset_executive_summary: getDatasetExecutiveSummary,
};

export { availableDatasetTools };
