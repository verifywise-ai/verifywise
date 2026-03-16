import {
  searchRiskLibraryQuery,
  getRiskLibraryEntryByIdQuery,
  getRiskLibraryStatsQuery,
} from "../../utils/riskLibrary.utils";
import logger from "../../utils/logger/fileLogger";

// ============================================================================
// search_risk_library
// ============================================================================

interface SearchRiskLibraryParams {
  search?: string;
  source?: string;
  risk_type?: string;
  domain?: string;
  eu_ai_act_tier?: string;
  severity?: string;
  likelihood?: string;
  industry?: string;
  limit?: number;
}

const searchRiskLibrary = async (
  params: SearchRiskLibraryParams,
  _organizationId: number,
): Promise<any> => {
  try {
    const result = await searchRiskLibraryQuery({
      search: params.search,
      source: params.source,
      risk_type: params.risk_type,
      domain: params.domain,
      eu_ai_act_tier: params.eu_ai_act_tier,
      severity: params.severity,
      likelihood: params.likelihood,
      industry: params.industry,
      page: 1,
      limit: params.limit || 10,
    });

    return {
      entries: result.entries.map((e: any) => ({
        id: e.id,
        source: e.source,
        summary: e.summary,
        description: e.description,
        risk_type: e.risk_type,
        risk_source: e.risk_source,
        domain: e.domain,
        eu_ai_act_tier: e.eu_ai_act_tier,
        severity: e.severity,
        likelihood: e.likelihood,
        industry: e.industry,
        mitigation_count: e.mitigation_count,
      })),
      total: result.pagination.total,
    };
  } catch (error) {
    logger.error("Error searching risk library:", error);
    throw new Error(
      `Failed to search risk library: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ============================================================================
// get_risk_library_entry
// ============================================================================

interface GetRiskLibraryEntryParams {
  id: number;
}

const getRiskLibraryEntry = async (
  params: GetRiskLibraryEntryParams,
  organizationId: number,
): Promise<any> => {
  try {
    const result = await getRiskLibraryEntryByIdQuery(
      params.id,
      organizationId,
      0, // userId not needed for advisor
    );

    if (!result) {
      return { error: `Risk library entry ${params.id} not found.` };
    }

    return {
      entry: {
        id: result.entry.id,
        source: result.entry.source,
        summary: result.entry.summary,
        description: result.entry.description,
        risk_type: result.entry.risk_type,
        risk_source: result.entry.risk_source,
        domain: result.entry.domain,
        eu_ai_act_tier: result.entry.eu_ai_act_tier,
        severity: result.entry.severity,
        likelihood: result.entry.likelihood,
        marginal_risk_description: result.entry.marginal_risk_description,
        industry: result.entry.industry,
      },
      mitigations: result.mitigations.map((m: any) => ({
        strategy: m.strategy,
        title: m.title,
        description: m.description,
        implementation_guidance: m.implementation_guidance,
        evidence_requirements: m.evidence_requirements,
        framework_ref: m.framework_ref,
      })),
      incidents: result.incidents.map((i: any) => ({
        incident_title: i.incident_title,
        incident_description: i.incident_description,
        harm_type: i.harm_type,
        sector: i.sector,
        source_url: i.source_url,
      })),
    };
  } catch (error) {
    logger.error("Error getting risk library entry:", error);
    throw new Error(
      `Failed to get risk library entry: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ============================================================================
// suggest_mitigations_from_library
// ============================================================================

interface SuggestMitigationsParams {
  risk_description: string;
  risk_id?: number;
}

const suggestMitigationsFromLibrary = async (
  params: SuggestMitigationsParams,
  organizationId: number,
): Promise<any> => {
  try {
    // If a direct risk_id is provided, get that entry's mitigations
    if (params.risk_id) {
      const result = await getRiskLibraryEntryByIdQuery(
        params.risk_id,
        organizationId,
        0,
      );
      if (!result) {
        return { error: `Risk library entry ${params.risk_id} not found.` };
      }
      return {
        risk_summary: result.entry.summary,
        mitigations: result.mitigations.map((m: any) => ({
          strategy: m.strategy,
          title: m.title,
          description: m.description,
          implementation_guidance: m.implementation_guidance,
          evidence_requirements: m.evidence_requirements,
          framework_ref: m.framework_ref,
        })),
      };
    }

    // Otherwise search by description
    const searchResult = await searchRiskLibraryQuery({
      search: params.risk_description,
      page: 1,
      limit: 5,
    });

    if (searchResult.entries.length === 0) {
      return {
        message: "No matching risks found in the library.",
        suggestion: "Try using the AI generation features to create mitigations for this risk.",
      };
    }

    // Fetch mitigations for the top matches
    const results = [];
    for (const entry of searchResult.entries.slice(0, 3)) {
      const detail = await getRiskLibraryEntryByIdQuery(
        entry.id,
        organizationId,
        0,
      );
      if (detail && detail.mitigations.length > 0) {
        results.push({
          risk_id: entry.id,
          risk_summary: entry.summary,
          mitigations: detail.mitigations.map((m: any) => ({
            strategy: m.strategy,
            title: m.title,
            description: m.description,
            implementation_guidance: m.implementation_guidance,
            framework_ref: m.framework_ref,
          })),
        });
      }
    }

    if (results.length === 0) {
      return {
        message: "Found matching risks but none have mitigations yet.",
        matched_risks: searchResult.entries.slice(0, 3).map((e: any) => ({
          id: e.id,
          summary: e.summary,
        })),
      };
    }

    return { results };
  } catch (error) {
    logger.error("Error suggesting mitigations from library:", error);
    throw new Error(
      `Failed to suggest mitigations: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ============================================================================
// get_risk_library_stats
// ============================================================================

const getRiskLibraryStats = async (
  _params: Record<string, never>,
  _organizationId: number,
): Promise<any> => {
  try {
    return await getRiskLibraryStatsQuery();
  } catch (error) {
    logger.error("Error getting risk library stats:", error);
    throw new Error(
      `Failed to get risk library stats: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ============================================================================
// EXPORT
// ============================================================================

const availableRiskLibraryTools: any = {
  search_risk_library: searchRiskLibrary,
  get_risk_library_entry: getRiskLibraryEntry,
  suggest_mitigations_from_library: suggestMitigationsFromLibrary,
  get_risk_library_stats: getRiskLibraryStats,
};

export { availableRiskLibraryTools };
