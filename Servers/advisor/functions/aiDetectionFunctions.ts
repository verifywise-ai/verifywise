import {
  getScansListQuery,
  getScanByIdQuery,
  getScanWithUserQuery,
  getFindingsForScanQuery,
  getFindingsSummaryQuery,
  getGovernanceSummaryQuery,
  getAIDetectionStatsQuery,
  createScanQuery,
  updateScanProgressQuery,
  updateFindingGovernanceStatusQuery,
} from "../../utils/aiDetection.utils";
import { getRepositoryByIdQuery } from "../../utils/aiDetectionRepository.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

// ============================================================================
// Read Tools
// ============================================================================

const fetchAiDetectionScans = async (
  params: { status?: string; limit?: number },
  organizationId: number,
): Promise<unknown> => {
  try {
    const limit = params.limit || 20;
    const result = await getScansListQuery(organizationId, 1, limit, params.status as any);
    return result;
  } catch (error) {
    logger.error("Error fetching AI Detection scans:", error);
    throw new Error(
      `Failed to fetch AI Detection scans: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAiDetectionScanDetail = async (
  params: { scan_id: number },
  organizationId: number,
): Promise<unknown> => {
  try {
    const scan = await getScanWithUserQuery(params.scan_id, organizationId);
    if (!scan) {
      return { message: `Scan with ID ${params.scan_id} not found` };
    }
    return scan;
  } catch (error) {
    logger.error("Error fetching AI Detection scan detail:", error);
    throw new Error(
      `Failed to fetch AI Detection scan detail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAiDetectionFindings = async (
  params: { scan_id: number; severity?: string; limit?: number },
  organizationId: number,
): Promise<unknown> => {
  try {
    const limit = params.limit || 50;
    const result = await getFindingsForScanQuery(
      params.scan_id,
      organizationId,
      1,
      limit,
      params.severity,
    );
    return result;
  } catch (error) {
    logger.error("Error fetching AI Detection findings:", error);
    throw new Error(
      `Failed to fetch AI Detection findings: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAiDetectionSecurityFindings = async (
  params: { scan_id?: number; severity?: string; limit?: number },
  organizationId: number,
): Promise<unknown> => {
  try {
    const limit = params.limit || 50;
    const replacements: Record<string, unknown> = { organizationId, limit };
    const conditions: string[] = ["s.organization_id = :organizationId", "s.status = 'completed'"];

    if (params.scan_id) {
      conditions.push("msf.scan_id = :scanId");
      replacements.scanId = params.scan_id;
    }

    if (params.severity) {
      conditions.push("msf.severity = :severity");
      replacements.severity = params.severity;
    }

    const whereClause = "WHERE " + conditions.join(" AND ");

    const [rows] = await sequelize.query(
      `SELECT msf.*
       FROM ai_detection_model_security_findings msf
       JOIN ai_detection_scans s ON msf.scan_id = s.id
       ${whereClause}
       ORDER BY
         CASE msf.severity
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
           WHEN 'info' THEN 5
         END,
         msf.name ASC
       LIMIT :limit`,
      { replacements },
    );

    return { findings: rows, total: (rows as any[]).length };
  } catch (error) {
    logger.error("Error fetching AI Detection security findings:", error);
    throw new Error(
      `Failed to fetch AI Detection security findings: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAiDetectionSecuritySummary = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<unknown> => {
  try {
    // Get the most recent completed scan to provide a summary
    const scansResult = await getScansListQuery(organizationId, 1, 1, "completed" as any);
    if (scansResult.scans.length === 0) {
      return { message: "No completed scans found", total: 0 };
    }

    const latestScan = scansResult.scans[0];
    const summary = await getFindingsSummaryQuery(latestScan.id!, organizationId);
    return {
      scan_id: latestScan.id,
      repository: `${latestScan.repository_owner}/${latestScan.repository_name}`,
      ...summary,
    };
  } catch (error) {
    logger.error("Error fetching AI Detection security summary:", error);
    throw new Error(
      `Failed to fetch AI Detection security summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAiDetectionGovernanceSummary = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<unknown> => {
  try {
    // Get the most recent completed scan for governance overview
    const scansResult = await getScansListQuery(organizationId, 1, 1, "completed" as any);
    if (scansResult.scans.length === 0) {
      return { message: "No completed scans found", total: 0 };
    }

    const latestScan = scansResult.scans[0];
    const summary = await getGovernanceSummaryQuery(latestScan.id!, organizationId);
    return {
      scan_id: latestScan.id,
      repository: `${latestScan.repository_owner}/${latestScan.repository_name}`,
      ...summary,
    };
  } catch (error) {
    logger.error("Error fetching AI Detection governance summary:", error);
    throw new Error(
      `Failed to fetch AI Detection governance summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAiDetectionStats = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<unknown> => {
  try {
    const stats = await getAIDetectionStatsQuery(organizationId);
    return stats;
  } catch (error) {
    logger.error("Error fetching AI Detection stats:", error);
    throw new Error(
      `Failed to fetch AI Detection stats: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAiDetectionComplianceMapping = async (
  params: { scan_id: number },
  organizationId: number,
): Promise<unknown> => {
  try {
    const scan = await getScanByIdQuery(params.scan_id, organizationId);
    if (!scan) {
      return { message: `Scan with ID ${params.scan_id} not found` };
    }

    const [findings, governance] = await Promise.all([
      getFindingsSummaryQuery(params.scan_id, organizationId),
      getGovernanceSummaryQuery(params.scan_id, organizationId),
    ]);

    // Build compliance mapping based on findings types
    const complianceMapping = {
      scan_id: params.scan_id,
      repository: `${scan.repository_owner}/${scan.repository_name}`,
      findings_summary: findings,
      governance_summary: governance,
      framework_relevance: {
        eu_ai_act: {
          relevant: findings.total > 0,
          ai_components_detected:
            findings.by_finding_type.library + findings.by_finding_type.api_call,
          transparency_items: findings.by_finding_type.model_ref + findings.by_finding_type.agent,
          data_processing_items: findings.by_finding_type.rag_component,
        },
        iso_42001: {
          relevant: findings.total > 0,
          inventory_items: findings.total,
          high_risk_items: findings.by_confidence.high,
          governance_coverage:
            governance.total > 0
              ? Math.round(((governance.reviewed + governance.approved) / governance.total) * 100)
              : 0,
        },
      },
    };

    return complianceMapping;
  } catch (error) {
    logger.error("Error fetching AI Detection compliance mapping:", error);
    throw new Error(
      `Failed to fetch AI Detection compliance mapping: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ============================================================================
// Write Tools
// ============================================================================

const agentStartAiDetectionScan = createWriteToolFn({
  toolName: "agent_start_ai_detection_scan",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Start ${params.scan_type || "full"} AI Detection scan for repository #${params.repository_id}`,
  executeFn: async (params, organizationId) => {
    const repositoryId = params.repository_id as number;
    const scanType = (params.scan_type as string) || "full";

    // Look up the repository
    const repo = await getRepositoryByIdQuery(repositoryId, organizationId);
    if (!repo) {
      throw new Error(`Repository with ID ${repositoryId} not found`);
    }

    const transaction = await sequelize.transaction();
    try {
      const scan = await createScanQuery(
        {
          repository_url: repo.repository_url,
          repository_owner: repo.repository_owner,
          repository_name: repo.repository_name,
          status: "pending",
          triggered_by: (params._userId as number) || 0,
          repository_id: repositoryId,
          triggered_by_type: "manual",
          scan_mode: scanType as "full" | "incremental",
          trigger_type: "manual",
        },
        organizationId,
        transaction,
      );

      await transaction.commit();
      return {
        id: scan.id,
        repository: `${repo.repository_owner}/${repo.repository_name}`,
        status: "pending",
        scan_mode: scanType,
        message: "Scan started successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentCancelAiDetectionScan = createWriteToolFn({
  toolName: "agent_cancel_ai_detection_scan",
  warningLevel: "warning",
  descriptionFn: (params) => `Cancel AI Detection scan #${params.scan_id}`,
  executeFn: async (params, organizationId) => {
    const scanId = params.scan_id as number;

    // Verify the scan exists and is cancellable
    const scan = await getScanByIdQuery(scanId, organizationId);
    if (!scan) {
      throw new Error(`Scan with ID ${scanId} not found`);
    }

    const cancellableStatuses = ["pending", "cloning", "scanning"];
    if (!cancellableStatuses.includes(scan.status)) {
      throw new Error(
        `Scan #${scanId} cannot be cancelled — current status is "${scan.status}". Only pending, cloning, or scanning scans can be cancelled.`,
      );
    }

    await updateScanProgressQuery(
      scanId,
      { status: "cancelled" as any, completed_at: new Date() },
      organizationId,
    );

    return {
      id: scanId,
      status: "cancelled",
      message: "Scan cancelled successfully",
    };
  },
});

const agentUpdateFindingGovernanceStatus = createWriteToolFn({
  toolName: "agent_update_finding_governance_status",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update governance status of finding #${params.finding_id} to "${params.governance_status}"`,
  executeFn: async (params, organizationId) => {
    const findingId = params.finding_id as number;
    const governanceStatus = params.governance_status as "reviewed" | "approved" | "flagged";
    const userId = (params._userId as number) || 0;

    // Find which scan this finding belongs to
    const [rows] = await sequelize.query(
      `SELECT scan_id FROM ai_detection_findings WHERE id = :findingId AND organization_id = :organizationId`,
      { replacements: { findingId, organizationId } },
    );

    const findingRow = (rows as any[])[0];
    if (!findingRow) {
      throw new Error(`Finding with ID ${findingId} not found`);
    }

    const result = await updateFindingGovernanceStatusQuery(
      findingId,
      findingRow.scan_id,
      governanceStatus,
      userId,
      organizationId,
    );

    if (!result) {
      throw new Error(`Failed to update governance status for finding #${findingId}`);
    }

    return {
      id: findingId,
      governance_status: governanceStatus,
      message: "Finding governance status updated successfully",
    };
  },
});

// ============================================================================
// Export
// ============================================================================

const availableAiDetectionTools: any = {
  fetch_ai_detection_scans: fetchAiDetectionScans,
  get_ai_detection_scan_detail: getAiDetectionScanDetail,
  get_ai_detection_findings: getAiDetectionFindings,
  get_ai_detection_security_findings: getAiDetectionSecurityFindings,
  get_ai_detection_security_summary: getAiDetectionSecuritySummary,
  get_ai_detection_governance_summary: getAiDetectionGovernanceSummary,
  get_ai_detection_stats: getAiDetectionStats,
  get_ai_detection_compliance_mapping: getAiDetectionComplianceMapping,
  agent_start_ai_detection_scan: agentStartAiDetectionScan,
  agent_cancel_ai_detection_scan: agentCancelAiDetectionScan,
  agent_update_finding_governance_status: agentUpdateFindingGovernanceStatus,
};

export { availableAiDetectionTools };
