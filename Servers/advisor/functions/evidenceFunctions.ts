import {
  getAllEvidencesQuery,
  createNewEvidenceQuery,
  updateEvidenceByIdQuery,
  deleteEvidenceByIdQuery,
} from "../../utils/evidenceHub.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

export interface FetchEvidenceParams {
  evidence_type?: string;
  expired_only?: boolean;
  expiring_soon?: boolean;
  limit?: number;
}

const fetchEvidence = async (
  params: FetchEvidenceParams,
  organizationId: number,
): Promise<any[]> => {
  try {
    let evidences = await getAllEvidencesQuery(organizationId);
    const now = new Date();

    // Apply filters
    if (params.evidence_type) {
      evidences = evidences.filter(
        (e: any) =>
          e.evidence_type &&
          e.evidence_type.toLowerCase().includes(params.evidence_type!.toLowerCase()),
      );
    }
    if (params.expired_only) {
      evidences = evidences.filter((e: any) => {
        if (!e.expiry_date) return false;
        return new Date(e.expiry_date) < now;
      });
    }
    if (params.expiring_soon) {
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      evidences = evidences.filter((e: any) => {
        if (!e.expiry_date) return false;
        const expiry = new Date(e.expiry_date);
        return expiry >= now && expiry <= thirtyDaysFromNow;
      });
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      evidences = evidences.slice(0, params.limit);
    }

    // Return lightweight projections
    return evidences.map((e: any) => ({
      id: e.id,
      evidence_name: e.evidence_name,
      evidence_type: e.evidence_type,
      description: e.description,
      expiry_date: e.expiry_date,
      mapped_model_ids: e.mapped_model_ids,
      created_at: e.created_at,
    }));
  } catch (error) {
    logger.error("Error fetching evidence:", error);
    throw new Error(
      `Failed to fetch evidence: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getEvidenceAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const evidences = await getAllEvidencesQuery(organizationId);
    const total = evidences.length;
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Type distribution
    const typeDistribution: Record<string, number> = {};
    evidences.forEach((e: any) => {
      const type = e.evidence_type || "Unknown";
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });

    // Expiry status
    let expired = 0;
    let expiringSoon = 0;
    let valid = 0;
    let noExpiry = 0;

    evidences.forEach((e: any) => {
      if (!e.expiry_date) {
        noExpiry++;
      } else {
        const expiry = new Date(e.expiry_date);
        if (expiry < now) {
          expired++;
        } else if (expiry <= thirtyDaysFromNow) {
          expiringSoon++;
        } else {
          valid++;
        }
      }
    });

    // Model coverage (how many unique models have evidence)
    const coveredModelIds = new Set<number>();
    evidences.forEach((e: any) => {
      if (e.mapped_model_ids && Array.isArray(e.mapped_model_ids)) {
        e.mapped_model_ids.forEach((id: number) => coveredModelIds.add(id));
      }
    });

    return {
      totalEvidence: total,
      typeDistribution,
      expiryStatus: { expired, expiringSoon, valid, noExpiry },
      modelsWithEvidence: coveredModelIds.size,
    };
  } catch (error) {
    logger.error("Error getting evidence analytics:", error);
    throw new Error(
      `Failed to get evidence analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getEvidenceExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const evidences = await getAllEvidencesQuery(organizationId);
    const total = evidences.length;
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiredItems = evidences.filter((e: any) => {
      if (!e.expiry_date) return false;
      return new Date(e.expiry_date) < now;
    });

    const expiringSoonItems = evidences.filter((e: any) => {
      if (!e.expiry_date) return false;
      const expiry = new Date(e.expiry_date);
      return expiry >= now && expiry <= thirtyDaysFromNow;
    });

    // Items needing attention (expired or expiring soon)
    const itemsNeedingAttention = [
      ...expiredItems.map((e: any) => ({
        id: e.id,
        name: e.evidence_name,
        type: e.evidence_type,
        expiry_date: e.expiry_date,
        status: "Expired",
      })),
      ...expiringSoonItems.map((e: any) => ({
        id: e.id,
        name: e.evidence_name,
        type: e.evidence_type,
        expiry_date: e.expiry_date,
        status: "Expiring soon",
      })),
    ].slice(0, 10);

    return {
      totalEvidence: total,
      expiredCount: expiredItems.length,
      expiringSoonCount: expiringSoonItems.length,
      itemsNeedingAttention,
    };
  } catch (error) {
    logger.error("Error getting evidence executive summary:", error);
    throw new Error(
      `Failed to get evidence executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools (Human Confirmation Flow) ---

const agentCreateEvidence = createWriteToolFn({
  toolName: "agent_create_evidence",
  warningLevel: "warning",
  descriptionFn: (params) => `Create evidence "${params.name}" of type "${params.type}"`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const evidenceData: any = {
        evidence_name: params.name,
        evidence_type: params.type,
        description: params.description || "",
        expiry_date: params.expiry_date || null,
        mapped_model_ids: params.model_id ? [params.model_id] : [],
      };
      const result = await createNewEvidenceQuery(evidenceData, organizationId, transaction);
      await transaction.commit();
      return {
        id: result.id,
        evidence_name: result.evidence_name,
        message: "Evidence created successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentUpdateEvidence = createWriteToolFn({
  toolName: "agent_update_evidence",
  warningLevel: "warning",
  descriptionFn: (params) => {
    const fields = Object.keys(params).filter((k) => k !== "evidence_id");
    return `Update evidence #${params.evidence_id} — fields: ${fields.join(", ")}`;
  },
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const evidenceId = params.evidence_id as number;
      const updateData: any = {};
      if (params.name !== undefined) updateData.evidence_name = params.name;
      if (params.type !== undefined) updateData.evidence_type = params.type;
      if (params.description !== undefined) updateData.description = params.description;
      if (params.expiry_date !== undefined) updateData.expiry_date = params.expiry_date || null;

      await updateEvidenceByIdQuery(evidenceId, updateData, organizationId, transaction);
      await transaction.commit();
      return {
        id: evidenceId,
        updated: true,
        message: "Evidence updated successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentDeleteEvidence = createWriteToolFn({
  toolName: "agent_delete_evidence",
  warningLevel: "danger",
  descriptionFn: (params) => `Delete evidence #${params.evidence_id}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const evidenceId = params.evidence_id as number;
      await deleteEvidenceByIdQuery(evidenceId, organizationId, transaction);
      await transaction.commit();
      return {
        id: evidenceId,
        deleted: true,
        message: "Evidence deleted successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const availableEvidenceTools: Record<string, Function> = {
  fetch_evidence: fetchEvidence,
  get_evidence_analytics: getEvidenceAnalytics,
  get_evidence_executive_summary: getEvidenceExecutiveSummary,
  agent_create_evidence: agentCreateEvidence,
  agent_update_evidence: agentUpdateEvidence,
  agent_delete_evidence: agentDeleteEvidence,
};

export { availableEvidenceTools };
