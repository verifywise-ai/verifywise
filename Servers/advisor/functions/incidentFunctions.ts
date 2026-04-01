import {
  AIIncidentManagementStatus,
  AIIncidentManagementApprovalStatus,
  Severity,
  IncidentType,
} from "../../domain.layer/enums/ai-incident-management.enum";
import { getAllIncidentsQuery } from "../../utils/incidentManagement.utils";
import { AIIncidentManagementModel } from "../../domain.layer/models/incidentManagement/incidemtManagement.model";
import logger from "../../utils/logger/fileLogger";

export interface FetchIncidentsParams {
  type?: "Malfunction" | "Unexpected behavior" | "Model drift" | "Misuse" | "Data corruption" | "Security breach" | "Performance degradation";
  severity?: "Minor" | "Serious" | "Very serious";
  status?: "Open" | "Investigating" | "Mitigated" | "Closed";
  approval_status?: "Approved" | "Rejected" | "Pending" | "Not required";
  ai_project?: string;
  archived?: boolean;
  limit?: number;
}

const fetchIncidents = async (
  params: FetchIncidentsParams,
  organizationId: number,
): Promise<Partial<AIIncidentManagementModel>[]> => {
  let incidents: AIIncidentManagementModel[] = [];

  try {
    incidents = await getAllIncidentsQuery(organizationId) as AIIncidentManagementModel[];

    // Apply filters
    if (params.archived !== undefined) {
      incidents = incidents.filter((i) => i.archived === params.archived);
    } else {
      // Default to non-archived incidents
      incidents = incidents.filter((i) => !i.archived);
    }

    if (params.type) {
      incidents = incidents.filter((i) => i.type === params.type);
    }
    if (params.severity) {
      incidents = incidents.filter((i) => i.severity === params.severity);
    }
    if (params.status) {
      incidents = incidents.filter((i) => i.status === params.status);
    }
    if (params.approval_status) {
      incidents = incidents.filter((i) => i.approval_status === params.approval_status);
    }
    if (params.ai_project) {
      incidents = incidents.filter(
        (i) =>
          i.ai_project &&
          i.ai_project.toLowerCase().includes(params.ai_project!.toLowerCase()),
      );
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      incidents = incidents.slice(0, params.limit);
    }

    // Return lightweight projections — exclude verbose text fields
    return incidents.map((i) => ({
      id: i.id,
      incident_id: i.incident_id,
      ai_project: i.ai_project,
      type: i.type,
      severity: i.severity,
      status: i.status,
      occurred_date: i.occurred_date,
      date_detected: i.date_detected,
      approval_status: i.approval_status,
      categories_of_harm: i.categories_of_harm,
      archived: i.archived,
      created_at: i.created_at,
    }));
  } catch (error) {
    logger.error("Error fetching incidents:", error);
    throw new Error(
      `Failed to fetch incidents: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface IncidentAnalytics {
  typeDistribution: {
    [type: string]: number;
  };
  severityDistribution: {
    [severity: string]: number;
  };
  statusDistribution: {
    [status: string]: number;
  };
  approvalStatusDistribution: {
    [status: string]: number;
  };
  incidentsByProject: Array<{
    project: string;
    count: number;
    seriousCount: number;
  }>;
  categoriesOfHarmDistribution: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  totalIncidents: number;
  activeIncidents: number;
  archivedIncidents: number;
}

const getIncidentAnalytics = async (
  params: { includeArchived?: boolean },
  organizationId: number,
): Promise<IncidentAnalytics> => {
  try {
    let incidents = await getAllIncidentsQuery(organizationId) as AIIncidentManagementModel[];

    const archivedIncidents = incidents.filter((i) => i.archived).length;
    const activeIncidents = incidents.filter((i) => !i.archived).length;

    // Filter by archived status if specified
    if (!params.includeArchived) {
      incidents = incidents.filter((i) => !i.archived);
    }

    const totalIncidents = incidents.length;

    // 1. Type Distribution
    const typeDistribution: { [type: string]: number } = {};
    Object.values(IncidentType).forEach((type) => {
      typeDistribution[type] = 0;
    });

    incidents.forEach((incident) => {
      if (incident.type) {
        typeDistribution[incident.type] = (typeDistribution[incident.type] || 0) + 1;
      }
    });

    // 2. Severity Distribution
    const severityDistribution: { [severity: string]: number } = {};
    Object.values(Severity).forEach((severity) => {
      severityDistribution[severity] = 0;
    });

    incidents.forEach((incident) => {
      if (incident.severity) {
        severityDistribution[incident.severity] =
          (severityDistribution[incident.severity] || 0) + 1;
      }
    });

    // 3. Status Distribution
    const statusDistribution: { [status: string]: number } = {};
    Object.values(AIIncidentManagementStatus).forEach((status) => {
      statusDistribution[status] = 0;
    });

    incidents.forEach((incident) => {
      if (incident.status) {
        statusDistribution[incident.status] =
          (statusDistribution[incident.status] || 0) + 1;
      }
    });

    // 4. Approval Status Distribution
    const approvalStatusDistribution: { [status: string]: number } = {};
    Object.values(AIIncidentManagementApprovalStatus).forEach((status) => {
      approvalStatusDistribution[status] = 0;
    });

    incidents.forEach((incident) => {
      if (incident.approval_status) {
        approvalStatusDistribution[incident.approval_status] =
          (approvalStatusDistribution[incident.approval_status] || 0) + 1;
      }
    });

    // 5. Incidents by Project
    const projectMap = new Map<string, { count: number; seriousCount: number }>();
    incidents.forEach((incident) => {
      if (incident.ai_project) {
        const existing = projectMap.get(incident.ai_project) || { count: 0, seriousCount: 0 };
        existing.count++;
        if (incident.severity === Severity.SERIOUS || incident.severity === Severity.VERY_SERIOUS) {
          existing.seriousCount++;
        }
        projectMap.set(incident.ai_project, existing);
      }
    });

    const incidentsByProject = Array.from(projectMap.entries())
      .map(([project, data]) => ({
        project,
        count: data.count,
        seriousCount: data.seriousCount,
      }))
      .sort((a, b) => b.count - a.count);

    // 6. Categories of Harm Distribution
    const harmCategoryMap = new Map<string, number>();
    incidents.forEach((incident) => {
      if (incident.categories_of_harm && Array.isArray(incident.categories_of_harm)) {
        incident.categories_of_harm.forEach((category: string) => {
          harmCategoryMap.set(category, (harmCategoryMap.get(category) || 0) + 1);
        });
      }
    });

    const categoriesOfHarmDistribution = Array.from(harmCategoryMap.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: totalIncidents > 0 ? Math.round((count / totalIncidents) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      typeDistribution,
      severityDistribution,
      statusDistribution,
      approvalStatusDistribution,
      incidentsByProject,
      categoriesOfHarmDistribution,
      totalIncidents,
      activeIncidents,
      archivedIncidents,
    };
  } catch (error) {
    logger.error("Error getting incident analytics:", error);
    throw new Error(
      `Failed to get incident analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface IncidentExecutiveSummary {
  totalIncidents: number;
  activeIncidents: number;
  openIncidents: number;
  investigatingIncidents: number;
  mitigatedIncidents: number;
  closedIncidents: number;
  minorIncidents: number;
  seriousIncidents: number;
  verySeriousIncidents: number;
  pendingApproval: number;
  incidentsNeedingAttention: Array<{
    id: number;
    ai_project: string;
    type: string;
    severity: string;
    status: string;
    occurred_date: Date | string;
    daysSinceOccurrence: number;
  }>;
  topIncidentTypes: Array<{
    type: string;
    count: number;
  }>;
  resolutionProgress: {
    resolved: number;
    total: number;
    percentage: number;
  };
  recentIncidents: Array<{
    id: number;
    ai_project: string;
    type: string;
    severity: string;
    occurred_date: Date | string;
  }>;
}

const getIncidentExecutiveSummary = async (
  params: { includeArchived?: boolean },
  organizationId: number,
): Promise<IncidentExecutiveSummary> => {
  try {
    let incidents = await getAllIncidentsQuery(organizationId) as AIIncidentManagementModel[];

    const activeIncidents = incidents.filter((i) => !i.archived).length;

    // Filter by archived status if specified
    if (!params.includeArchived) {
      incidents = incidents.filter((i) => !i.archived);
    }

    const totalIncidents = incidents.length;

    // Count by status
    const openIncidents = incidents.filter(
      (i) => i.status === AIIncidentManagementStatus.OPEN,
    ).length;
    const investigatingIncidents = incidents.filter(
      (i) => i.status === AIIncidentManagementStatus.INVESTIGATING,
    ).length;
    const mitigatedIncidents = incidents.filter(
      (i) => i.status === AIIncidentManagementStatus.MITIGATED,
    ).length;
    const closedIncidents = incidents.filter(
      (i) => i.status === AIIncidentManagementStatus.CLOSED,
    ).length;

    // Count by severity
    const minorIncidents = incidents.filter(
      (i) => i.severity === Severity.MINOR,
    ).length;
    const seriousIncidents = incidents.filter(
      (i) => i.severity === Severity.SERIOUS,
    ).length;
    const verySeriousIncidents = incidents.filter(
      (i) => i.severity === Severity.VERY_SERIOUS,
    ).length;

    // Pending approval
    const pendingApproval = incidents.filter(
      (i) => i.approval_status === AIIncidentManagementApprovalStatus.PENDING,
    ).length;

    // Incidents needing attention (open or investigating, serious or very serious)
    const now = new Date();
    const incidentsNeedingAttention = incidents
      .filter(
        (i) =>
          (i.status === AIIncidentManagementStatus.OPEN ||
            i.status === AIIncidentManagementStatus.INVESTIGATING) &&
          (i.severity === Severity.SERIOUS || i.severity === Severity.VERY_SERIOUS),
      )
      .map((i) => {
        const occurredDate = i.occurred_date ? new Date(i.occurred_date) : now;
        const daysSinceOccurrence = Math.floor(
          (now.getTime() - occurredDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        return {
          id: i.id || 0,
          ai_project: i.ai_project,
          type: i.type,
          severity: i.severity,
          status: i.status,
          occurred_date: i.occurred_date,
          daysSinceOccurrence,
        };
      })
      .sort((a, b) => b.daysSinceOccurrence - a.daysSinceOccurrence)
      .slice(0, 5);

    // Top incident types
    const typeMap = new Map<string, number>();
    incidents.forEach((incident) => {
      if (incident.type) {
        typeMap.set(incident.type, (typeMap.get(incident.type) || 0) + 1);
      }
    });

    const topIncidentTypes = Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Resolution progress
    const resolved = mitigatedIncidents + closedIncidents;
    const resolutionProgress = {
      resolved,
      total: totalIncidents,
      percentage: totalIncidents > 0 ? Math.round((resolved / totalIncidents) * 100) : 0,
    };

    // Recent incidents (last 5)
    const recentIncidents = incidents
      .sort((a, b) => {
        const dateA = a.occurred_date ? new Date(a.occurred_date).getTime() : 0;
        const dateB = b.occurred_date ? new Date(b.occurred_date).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 5)
      .map((i) => ({
        id: i.id || 0,
        ai_project: i.ai_project,
        type: i.type,
        severity: i.severity,
        occurred_date: i.occurred_date,
      }));

    return {
      totalIncidents,
      activeIncidents,
      openIncidents,
      investigatingIncidents,
      mitigatedIncidents,
      closedIncidents,
      minorIncidents,
      seriousIncidents,
      verySeriousIncidents,
      pendingApproval,
      incidentsNeedingAttention,
      topIncidentTypes,
      resolutionProgress,
      recentIncidents,
    };
  } catch (error) {
    logger.error("Error getting incident executive summary:", error);
    throw new Error(
      `Failed to get incident executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const availableIncidentTools: any = {
  fetch_incidents: fetchIncidents,
  get_incident_analytics: getIncidentAnalytics,
  get_incident_executive_summary: getIncidentExecutiveSummary,
};

export { availableIncidentTools };
