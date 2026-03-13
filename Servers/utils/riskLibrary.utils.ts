import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { IRiskLibrarySearchParams } from "../domain.layer/interfaces/i.riskLibrary";

/**
 * Search/list risk library entries with multi-dimensional filters and full-text search.
 */
export const searchRiskLibraryQuery = async (params: IRiskLibrarySearchParams) => {
  const {
    search,
    source,
    risk_type,
    risk_source,
    domain,
    eu_ai_act_tier,
    severity,
    likelihood,
    industry,
    lifecycle_phase,
    model_type,
    page = 1,
    limit = 25,
  } = params;

  const offset = (page - 1) * limit;

  const conditions: string[] = ["e.is_active = true"];
  const replacements: Record<string, any> = { limit, offset };

  if (search) {
    conditions.push(
      "to_tsvector('english', COALESCE(e.summary, '') || ' ' || COALESCE(e.description, '')) @@ plainto_tsquery('english', :search)"
    );
    replacements.search = search;
  }
  if (source) {
    conditions.push("e.source = :source");
    replacements.source = source;
  }
  if (risk_type) {
    conditions.push("e.risk_type = :risk_type");
    replacements.risk_type = risk_type;
  }
  if (risk_source) {
    conditions.push("e.risk_source = :risk_source");
    replacements.risk_source = risk_source;
  }
  if (domain) {
    conditions.push("e.domain = :domain");
    replacements.domain = domain;
  }
  if (eu_ai_act_tier) {
    conditions.push("e.eu_ai_act_tier = :eu_ai_act_tier");
    replacements.eu_ai_act_tier = eu_ai_act_tier;
  }
  if (severity) {
    conditions.push("e.severity = :severity");
    replacements.severity = severity;
  }
  if (likelihood) {
    conditions.push("e.likelihood = :likelihood");
    replacements.likelihood = likelihood;
  }
  if (industry) {
    conditions.push("e.industry = :industry");
    replacements.industry = industry;
  }
  if (lifecycle_phase) {
    conditions.push("e.ai_lifecycle_phase = :lifecycle_phase");
    replacements.lifecycle_phase = lifecycle_phase;
  }
  if (model_type) {
    conditions.push(":model_type = ANY(e.applicable_model_types)");
    replacements.model_type = model_type;
  }

  const whereClause = conditions.join(" AND ");

  // Count query
  const countResult = (await sequelize.query(
    `SELECT COUNT(*) as total FROM risk_library_entries e WHERE ${whereClause}`,
    { replacements }
  )) as [{ total: string }[], number];

  const total = parseInt(countResult[0][0].total, 10);

  // Data query with mitigation count
  const dataResult = (await sequelize.query(
    `SELECT e.*,
       (SELECT COUNT(*) FROM risk_library_mitigations m WHERE m.risk_entry_id = e.id) as mitigation_count
     FROM risk_library_entries e
     WHERE ${whereClause}
     ORDER BY e.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { replacements }
  )) as [any[], number];

  return {
    entries: dataResult[0],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get a single risk library entry by ID with mitigations, incidents, org customizations, and feedback.
 */
export const getRiskLibraryEntryByIdQuery = async (
  id: number,
  organizationId: number,
  userId: number
) => {
  // Entry
  const entryResult = (await sequelize.query(
    `SELECT * FROM risk_library_entries WHERE id = :id AND is_active = true`,
    { replacements: { id } }
  )) as [any[], number];

  if (!entryResult[0].length) return null;

  // Mitigations
  const mitigationsResult = (await sequelize.query(
    `SELECT * FROM risk_library_mitigations WHERE risk_entry_id = :id ORDER BY strategy, created_at`,
    { replacements: { id } }
  )) as [any[], number];

  // Incidents
  const incidentsResult = (await sequelize.query(
    `SELECT * FROM risk_library_incidents WHERE risk_entry_id = :id ORDER BY incident_date DESC NULLS LAST`,
    { replacements: { id } }
  )) as [any[], number];

  // Org customization
  const customResult = (await sequelize.query(
    `SELECT * FROM risk_library_org_customizations
     WHERE library_entry_id = :id AND organization_id = :organizationId`,
    { replacements: { id, organizationId } }
  )) as [any[], number];

  // Aggregated feedback
  const feedbackResult = (await sequelize.query(
    `SELECT
       COUNT(*) FILTER (WHERE feedback_type = 'upvote') as upvotes,
       COUNT(*) FILTER (WHERE feedback_type = 'downvote') as downvotes,
       COUNT(*) FILTER (WHERE feedback_type = 'flag') as flags
     FROM risk_library_feedback
     WHERE library_entry_id = :id`,
    { replacements: { id } }
  )) as [any[], number];

  // User's own vote
  const userVoteResult = (await sequelize.query(
    `SELECT feedback_type FROM risk_library_feedback
     WHERE library_entry_id = :id AND organization_id = :organizationId AND user_id = :userId`,
    { replacements: { id, organizationId, userId } }
  )) as [any[], number];

  const fb = feedbackResult[0][0] || { upvotes: 0, downvotes: 0, flags: 0 };

  return {
    entry: entryResult[0][0],
    mitigations: mitigationsResult[0],
    incidents: incidentsResult[0],
    orgCustomization: customResult[0][0] || null,
    feedback: {
      upvotes: parseInt(fb.upvotes, 10) || 0,
      downvotes: parseInt(fb.downvotes, 10) || 0,
      flags: parseInt(fb.flags, 10) || 0,
      userVote: userVoteResult[0][0]?.feedback_type || null,
    },
  };
};

/**
 * Get distinct values for all filter dimensions (for populating dropdown menus).
 */
export const getRiskLibraryFiltersQuery = async () => {
  const queries = [
    "SELECT DISTINCT source FROM risk_library_entries WHERE is_active = true AND source IS NOT NULL ORDER BY source",
    "SELECT DISTINCT risk_type FROM risk_library_entries WHERE is_active = true AND risk_type IS NOT NULL ORDER BY risk_type",
    "SELECT DISTINCT risk_source FROM risk_library_entries WHERE is_active = true AND risk_source IS NOT NULL ORDER BY risk_source",
    "SELECT DISTINCT domain FROM risk_library_entries WHERE is_active = true AND domain IS NOT NULL ORDER BY domain",
    "SELECT DISTINCT eu_ai_act_tier FROM risk_library_entries WHERE is_active = true AND eu_ai_act_tier IS NOT NULL ORDER BY eu_ai_act_tier",
    "SELECT DISTINCT severity FROM risk_library_entries WHERE is_active = true AND severity IS NOT NULL ORDER BY severity",
    "SELECT DISTINCT likelihood FROM risk_library_entries WHERE is_active = true AND likelihood IS NOT NULL ORDER BY likelihood",
    "SELECT DISTINCT industry FROM risk_library_entries WHERE is_active = true AND industry IS NOT NULL ORDER BY industry",
    "SELECT DISTINCT ai_lifecycle_phase FROM risk_library_entries WHERE is_active = true AND ai_lifecycle_phase IS NOT NULL ORDER BY ai_lifecycle_phase",
  ];

  const results = await Promise.all(
    queries.map((q) => sequelize.query(q) as Promise<[any[], number]>)
  );

  return {
    sources: results[0][0].map((r: any) => r.source),
    riskTypes: results[1][0].map((r: any) => r.risk_type),
    riskSources: results[2][0].map((r: any) => r.risk_source),
    domains: results[3][0].map((r: any) => r.domain),
    euAiActTiers: results[4][0].map((r: any) => r.eu_ai_act_tier),
    severities: results[5][0].map((r: any) => r.severity),
    likelihoods: results[6][0].map((r: any) => r.likelihood),
    industries: results[7][0].map((r: any) => r.industry),
    lifecyclePhases: results[8][0].map((r: any) => r.ai_lifecycle_phase),
  };
};

/**
 * Get library statistics (counts by source, risk_type, domain, severity, eu_ai_act_tier).
 */
export const getRiskLibraryStatsQuery = async () => {
  const totalResult = (await sequelize.query(
    `SELECT COUNT(*) as total FROM risk_library_entries WHERE is_active = true`
  )) as [{ total: string }[], number];

  const bySourceResult = (await sequelize.query(
    `SELECT source, COUNT(*) as count FROM risk_library_entries WHERE is_active = true GROUP BY source ORDER BY count DESC`
  )) as [any[], number];

  const byRiskTypeResult = (await sequelize.query(
    `SELECT risk_type, COUNT(*) as count FROM risk_library_entries WHERE is_active = true AND risk_type IS NOT NULL GROUP BY risk_type ORDER BY count DESC`
  )) as [any[], number];

  const byDomainResult = (await sequelize.query(
    `SELECT domain, COUNT(*) as count FROM risk_library_entries WHERE is_active = true AND domain IS NOT NULL GROUP BY domain ORDER BY count DESC`
  )) as [any[], number];

  const bySeverityResult = (await sequelize.query(
    `SELECT severity, COUNT(*) as count FROM risk_library_entries WHERE is_active = true AND severity IS NOT NULL GROUP BY severity ORDER BY count DESC`
  )) as [any[], number];

  const byTierResult = (await sequelize.query(
    `SELECT eu_ai_act_tier, COUNT(*) as count FROM risk_library_entries WHERE is_active = true AND eu_ai_act_tier IS NOT NULL GROUP BY eu_ai_act_tier ORDER BY count DESC`
  )) as [any[], number];

  const mitigationCountResult = (await sequelize.query(
    `SELECT COUNT(*) as total FROM risk_library_mitigations`
  )) as [{ total: string }[], number];

  const incidentCountResult = (await sequelize.query(
    `SELECT COUNT(*) as total FROM risk_library_incidents`
  )) as [{ total: string }[], number];

  return {
    total: parseInt(totalResult[0][0].total, 10),
    totalMitigations: parseInt(mitigationCountResult[0][0].total, 10),
    totalIncidents: parseInt(incidentCountResult[0][0].total, 10),
    bySource: bySourceResult[0],
    byRiskType: byRiskTypeResult[0],
    byDomain: byDomainResult[0],
    bySeverity: bySeverityResult[0],
    byEuAiActTier: byTierResult[0],
  };
};

// ========================================
// FEEDBACK QUERIES
// ========================================

/**
 * Submit feedback (upvote/downvote/flag) on a risk library entry.
 * Upserts: one vote per user per entry.
 */
export const upsertRiskLibraryFeedbackQuery = async (
  organizationId: number,
  userId: number,
  libraryEntryId: number,
  feedbackType: string,
  flagReason?: string | null,
  context?: string | null
) => {
  const result = (await sequelize.query(
    `INSERT INTO risk_library_feedback
       (organization_id, user_id, library_entry_id, feedback_type, flag_reason, context)
     VALUES (:organizationId, :userId, :libraryEntryId, :feedbackType, :flagReason, :context)
     ON CONFLICT (organization_id, user_id, library_entry_id)
     DO UPDATE SET feedback_type = :feedbackType, flag_reason = :flagReason
     RETURNING *`,
    {
      replacements: {
        organizationId,
        userId,
        libraryEntryId,
        feedbackType,
        flagReason: flagReason || null,
        context: context || null,
      },
    }
  )) as [any[], number];

  return result[0][0];
};

/**
 * Remove feedback for a user on a risk library entry.
 */
export const deleteRiskLibraryFeedbackQuery = async (
  organizationId: number,
  userId: number,
  libraryEntryId: number
) => {
  const result = (await sequelize.query(
    `DELETE FROM risk_library_feedback
     WHERE organization_id = :organizationId AND user_id = :userId AND library_entry_id = :libraryEntryId
     RETURNING id`,
    {
      replacements: { organizationId, userId, libraryEntryId },
    }
  )) as [any[], number];

  return result[0].length > 0;
};

/**
 * Get aggregated feedback for a risk library entry + current user's vote.
 */
export const getRiskLibraryFeedbackQuery = async (
  libraryEntryId: number,
  organizationId: number,
  userId: number
) => {
  const feedbackResult = (await sequelize.query(
    `SELECT
       COUNT(*) FILTER (WHERE feedback_type = 'upvote') as upvotes,
       COUNT(*) FILTER (WHERE feedback_type = 'downvote') as downvotes,
       COUNT(*) FILTER (WHERE feedback_type = 'flag') as flags
     FROM risk_library_feedback
     WHERE library_entry_id = :libraryEntryId`,
    { replacements: { libraryEntryId } }
  )) as [any[], number];

  const userVoteResult = (await sequelize.query(
    `SELECT feedback_type FROM risk_library_feedback
     WHERE library_entry_id = :libraryEntryId AND organization_id = :organizationId AND user_id = :userId`,
    { replacements: { libraryEntryId, organizationId, userId } }
  )) as [any[], number];

  const fb = feedbackResult[0][0] || { upvotes: 0, downvotes: 0, flags: 0 };

  return {
    upvotes: parseInt(fb.upvotes, 10) || 0,
    downvotes: parseInt(fb.downvotes, 10) || 0,
    flags: parseInt(fb.flags, 10) || 0,
    userVote: userVoteResult[0][0]?.feedback_type || null,
  };
};

// ========================================
// ORG CUSTOMIZATION QUERIES
// ========================================

/**
 * Upsert org-specific customization for a risk library entry.
 */
export const upsertRiskLibraryCustomizationQuery = async (
  organizationId: number,
  libraryEntryId: number,
  data: {
    custom_mitigations?: string | null;
    custom_notes?: string | null;
    is_hidden?: boolean;
  },
  transaction: Transaction
) => {
  const result = (await sequelize.query(
    `INSERT INTO risk_library_org_customizations
       (organization_id, library_entry_id, custom_mitigations, custom_notes, is_hidden)
     VALUES (:organizationId, :libraryEntryId, :customMitigations, :customNotes, :isHidden)
     ON CONFLICT (organization_id, library_entry_id)
     DO UPDATE SET
       custom_mitigations = COALESCE(:customMitigations, risk_library_org_customizations.custom_mitigations),
       custom_notes = COALESCE(:customNotes, risk_library_org_customizations.custom_notes),
       is_hidden = :isHidden,
       updated_at = now()
     RETURNING *`,
    {
      replacements: {
        organizationId,
        libraryEntryId,
        customMitigations: data.custom_mitigations !== undefined
          ? (data.custom_mitigations ?? null)
          : null,
        customNotes: data.custom_notes !== undefined
          ? (data.custom_notes ?? null)
          : null,
        isHidden: data.is_hidden ?? false,
      },
      transaction,
    }
  )) as [any[], number];

  return result[0][0];
};
