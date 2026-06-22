import { getAllDatasetsQuery } from "../../utils/dataset.utils";
import logger from "../../utils/logger/fileLogger";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";

export interface FetchDatasetsParams {
  type?: string;
  classification?: string;
  contains_pii?: boolean;
  status?: string;
  limit?: number;
}

const fetchDatasets = async (
  params: FetchDatasetsParams,
  organizationId: number,
): Promise<any[]> => {
  try {
    let datasets = await getAllDatasetsQuery(organizationId);

    // Apply filters
    if (params.type) {
      datasets = datasets.filter((d: any) => d.type === params.type);
    }
    if (params.classification) {
      datasets = datasets.filter((d: any) => d.classification === params.classification);
    }
    if (params.contains_pii !== undefined) {
      datasets = datasets.filter((d: any) => d.contains_pii === params.contains_pii);
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
      `Failed to fetch datasets: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getDatasetAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number,
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
      (d: any) =>
        d.known_biases &&
        (typeof d.known_biases === "string"
          ? d.known_biases.trim() !== ""
          : Array.isArray(d.known_biases)
            ? d.known_biases.length > 0
            : true),
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
      `Failed to get dataset analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getDatasetExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const datasets = await getAllDatasetsQuery(organizationId);
    const total = datasets.length;

    const piiCount = datasets.filter((d: any) => d.contains_pii).length;
    const piiExposureRate = total > 0 ? Math.round((piiCount / total) * 100) : 0;

    const datasetsWithBiases = datasets.filter(
      (d: any) =>
        d.known_biases &&
        (typeof d.known_biases === "string"
          ? d.known_biases.trim() !== ""
          : Array.isArray(d.known_biases)
            ? d.known_biases.length > 0
            : true),
    ).length;

    // Classification breakdown
    const classificationBreakdown: Record<string, number> = {};
    datasets.forEach((d: any) => {
      const classification = d.classification || "Unclassified";
      classificationBreakdown[classification] = (classificationBreakdown[classification] || 0) + 1;
    });

    // Recent datasets (last 5)
    const recentDatasets = [...datasets]
      .sort((a: any, b: any) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
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
      `Failed to get dataset executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write tools (Human Confirmation Flow) ---

const agentRegisterDataset = createWriteToolFn({
  toolName: "agent_register_dataset",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Register dataset "${params.name}"${params.classification ? ` (${params.classification})` : ""}${params.pii_flag ? " — contains PII" : ""}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const now = new Date();
      const result = await sequelize.query(
        `INSERT INTO datasets (
          organization_id, name, description, type, classification,
          contains_pii, status, created_at, updated_at
        ) VALUES (
          :organization_id, :name, :description, :type, :classification,
          :contains_pii, :status, :created_at, :updated_at
        ) RETURNING *`,
        {
          replacements: {
            organization_id: organizationId,
            name: params.name as string,
            description: (params.description as string) || null,
            type: (params.type as string) || null,
            classification: (params.classification as string) || null,
            contains_pii: params.pii_flag === true,
            status: "Active",
            created_at: now,
            updated_at: now,
          },
          transaction,
        },
      );
      const created = (result as any)[0]?.[0] || (result as any)[0];

      // Link to model if provided
      if (params.model_id) {
        await sequelize.query(
          `INSERT INTO dataset_model_inventories (organization_id, dataset_id, model_inventory_id, relationship_type, created_at)
           VALUES (:organization_id, :dataset_id, :model_inventory_id, 'trained_on', NOW())`,
          {
            replacements: {
              organization_id: organizationId,
              dataset_id: created.id,
              model_inventory_id: params.model_id,
            },
            transaction,
          },
        );
      }

      await transaction.commit();
      return { success: true, dataset: created };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentUpdateDataset = createWriteToolFn({
  toolName: "agent_update_dataset",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update dataset #${params.dataset_id}${params.name ? ` — rename to "${params.name}"` : ""}`,
  executeFn: async (params, organizationId) => {
    const fields: Record<string, { column: string; value: unknown }> = {
      name: { column: "name", value: params.name },
      description: { column: "description", value: params.description },
      type: { column: "type", value: params.type },
      classification: { column: "classification", value: params.classification },
      pii_flag: { column: "contains_pii", value: params.pii_flag },
      status: { column: "status", value: params.status },
    };

    const setClauses: string[] = [];
    const replacements: Record<string, unknown> = {
      organizationId,
      id: params.dataset_id,
      updated_at: new Date(),
    };

    for (const [key, { column, value }] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        setClauses.push(`${column} = :${key}`);
        replacements[key] = value;
      }
    }

    if (setClauses.length === 0) {
      return { success: false, message: "No fields to update" };
    }

    setClauses.push("updated_at = :updated_at");

    const result = await sequelize.query(
      `UPDATE datasets SET ${setClauses.join(", ")} WHERE organization_id = :organizationId AND id = :id RETURNING *`,
      { replacements },
    );
    const updated = (result as any)[0]?.[0] || (result as any)[0];
    return { success: true, dataset: updated };
  },
});

const agentLinkDatasetToModel = createWriteToolFn({
  toolName: "agent_link_dataset_to_model",
  warningLevel: "warning",
  descriptionFn: (params) => `Link dataset #${params.dataset_id} to model #${params.model_id}`,
  executeFn: async (params, organizationId) => {
    // Check if link already exists
    const existing = await sequelize.query(
      `SELECT id FROM dataset_model_inventories WHERE organization_id = :organizationId AND dataset_id = :dataset_id AND model_inventory_id = :model_id`,
      {
        replacements: {
          organizationId,
          dataset_id: params.dataset_id,
          model_id: params.model_id,
        },
        type: QueryTypes.SELECT,
      },
    );

    if ((existing as any[]).length > 0) {
      return { success: false, message: "Dataset is already linked to this model" };
    }

    await sequelize.query(
      `INSERT INTO dataset_model_inventories (organization_id, dataset_id, model_inventory_id, relationship_type, created_at)
       VALUES (:organization_id, :dataset_id, :model_inventory_id, 'trained_on', NOW())`,
      {
        replacements: {
          organization_id: organizationId,
          dataset_id: params.dataset_id,
          model_inventory_id: params.model_id,
        },
      },
    );
    return {
      success: true,
      message: `Dataset #${params.dataset_id} linked to model #${params.model_id}`,
    };
  },
});

const agentDeleteDataset = createWriteToolFn({
  toolName: "agent_delete_dataset",
  warningLevel: "danger",
  descriptionFn: (params) =>
    `Permanently delete dataset #${params.dataset_id} and all associations`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      // Delete associations first
      await sequelize.query(
        `DELETE FROM dataset_model_inventories WHERE organization_id = :organizationId AND dataset_id = :id`,
        { replacements: { organizationId, id: params.dataset_id }, transaction },
      );
      await sequelize.query(
        `DELETE FROM dataset_projects WHERE organization_id = :organizationId AND dataset_id = :id`,
        { replacements: { organizationId, id: params.dataset_id }, transaction },
      );

      const result = await sequelize.query(
        `DELETE FROM datasets WHERE organization_id = :organizationId AND id = :id RETURNING id, name`,
        { replacements: { organizationId, id: params.dataset_id }, transaction },
      );
      await transaction.commit();
      const deleted = (result as any)[0]?.[0] || (result as any)[0];
      return { success: true, deleted_dataset: deleted };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const availableDatasetTools: Record<string, Function> = {
  fetch_datasets: fetchDatasets,
  get_dataset_analytics: getDatasetAnalytics,
  get_dataset_executive_summary: getDatasetExecutiveSummary,
  agent_register_dataset: agentRegisterDataset,
  agent_update_dataset: agentUpdateDataset,
  agent_link_dataset_to_model: agentLinkDatasetToModel,
  agent_delete_dataset: agentDeleteDataset,
};

export { availableDatasetTools };
