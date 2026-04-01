import {
  getAllAgentPrimitivesQuery,
  getAgentStatsQuery,
} from "../../utils/agentDiscovery.utils";
import logger from "../../utils/logger/fileLogger";

export interface FetchAgentPrimitivesParams {
  source_system?: string;
  primitive_type?: string;
  review_status?: "unreviewed" | "confirmed" | "rejected";
  is_stale?: boolean;
  limit?: number;
}

const fetchAgentPrimitives = async (
  params: FetchAgentPrimitivesParams,
  organizationId: number
): Promise<any[]> => {
  try {
    // Pass filters directly to the query (it supports them natively)
    const filters: Record<string, any> = {};
    if (params.source_system) filters.source_system = params.source_system;
    if (params.primitive_type) filters.primitive_type = params.primitive_type;
    if (params.review_status) filters.review_status = params.review_status;
    if (params.is_stale !== undefined) filters.is_stale = params.is_stale;

    let agents = await getAllAgentPrimitivesQuery(organizationId, filters);

    // Limit results
    if (params.limit && params.limit > 0) {
      agents = agents.slice(0, params.limit);
    }

    // Return lightweight projections
    return agents.map((a) => ({
      id: a.id,
      display_name: a.display_name,
      source_system: a.source_system,
      primitive_type: a.primitive_type,
      review_status: a.review_status,
      is_stale: a.is_stale,
      owner_id: a.owner_id,
      permission_categories: a.permission_categories,
      last_activity: a.last_activity,
      linked_model_inventory_id: a.linked_model_inventory_id,
      created_at: a.created_at,
    }));
  } catch (error) {
    logger.error("Error fetching agent primitives:", error);
    throw new Error(
      `Failed to fetch agent primitives: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const getAgentDiscoveryAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<any> => {
  try {
    const [agents, stats] = await Promise.all([
      getAllAgentPrimitivesQuery(organizationId),
      getAgentStatsQuery(organizationId),
    ]);

    // Source system distribution
    const sourceDistribution: Record<string, number> = {};
    agents.forEach((a) => {
      const source = a.source_system || "Unknown";
      sourceDistribution[source] = (sourceDistribution[source] || 0) + 1;
    });

    // Primitive type distribution
    const typeDistribution: Record<string, number> = {};
    agents.forEach((a) => {
      const type = a.primitive_type || "Unknown";
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });

    // Review status distribution
    const reviewStatusDistribution: Record<string, number> = {
      unreviewed: stats.unreviewed,
      confirmed: stats.confirmed,
      rejected: stats.rejected,
    };

    return {
      totalAgents: stats.total,
      staleAgents: stats.stale,
      sourceDistribution,
      typeDistribution,
      reviewStatusDistribution,
    };
  } catch (error) {
    logger.error("Error getting agent discovery analytics:", error);
    throw new Error(
      `Failed to get agent discovery analytics: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const getAgentDiscoveryExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<any> => {
  try {
    const stats = await getAgentStatsQuery(organizationId);

    const reviewRate =
      stats.total > 0
        ? Math.round(
            ((stats.confirmed + stats.rejected) / stats.total) * 100
          )
        : 0;

    return {
      totalAgents: stats.total,
      unreviewedAgents: stats.unreviewed,
      confirmedAgents: stats.confirmed,
      rejectedAgents: stats.rejected,
      staleAgents: stats.stale,
      reviewRate: `${reviewRate}%`,
      riskIndicators: {
        unreviewedIsHigh: stats.unreviewed > stats.total * 0.3,
        staleIsHigh: stats.stale > stats.total * 0.2,
      },
    };
  } catch (error) {
    logger.error("Error getting agent discovery executive summary:", error);
    throw new Error(
      `Failed to get agent discovery executive summary: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const availableAgentDiscoveryTools: Record<string, Function> = {
  fetch_agent_primitives: fetchAgentPrimitives,
  get_agent_discovery_analytics: getAgentDiscoveryAnalytics,
  get_agent_discovery_executive_summary: getAgentDiscoveryExecutiveSummary,
};

export { availableAgentDiscoveryTools };
