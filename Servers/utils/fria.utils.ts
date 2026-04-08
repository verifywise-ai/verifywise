import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { FriaRiskLevel } from "../domain.layer/enums/fria-status.enum";
import {
  IFriaAssessmentJSON,
  IFriaRight,
  IFriaRiskItemJSON,
  IFriaModelLinkJSON,
  IFriaSnapshotJSON,
  IFriaScoreResult,
} from "../domain.layer/interfaces/i.fria";

// The 10 fundamental rights from EU Charter
export const DEFAULT_RIGHTS = [
  { right_key: "dignity", right_title: "Human dignity", charter_ref: "Article 1" },
  { right_key: "privacy", right_title: "Right to privacy", charter_ref: "Article 7" },
  { right_key: "data", right_title: "Protection of personal data", charter_ref: "Article 8" },
  { right_key: "equality", right_title: "Non-discrimination and equality", charter_ref: "Article 21" },
  { right_key: "child", right_title: "Rights of the child", charter_ref: "Article 24" },
  { right_key: "worker", right_title: "Workers' rights", charter_ref: "Articles 27-31" },
  { right_key: "education", right_title: "Right to education", charter_ref: "Article 14" },
  { right_key: "effective", right_title: "Right to an effective remedy", charter_ref: "Article 47" },
  { right_key: "accessibility", right_title: "Rights of persons with disabilities", charter_ref: "Article 26" },
  { right_key: "freedom", right_title: "Freedom of expression and information", charter_ref: "Article 11" },
];

// ========================================
// FRIA ASSESSMENTS
// ========================================

export const getFriaByProjectIdQuery = async (
  projectId: number,
  organizationId: number
): Promise<IFriaAssessmentJSON | null> => {
  const query = `
    SELECT fa.*,
      u_created.name || ' ' || u_created.surname as created_by_name,
      u_updated.name || ' ' || u_updated.surname as updated_by_name,
      p.project_title,
      o.name as organization_name
    FROM fria_assessments fa
    LEFT JOIN users u_created ON fa.created_by = u_created.id
    LEFT JOIN users u_updated ON fa.updated_by = u_updated.id
    LEFT JOIN projects p ON fa.project_id = p.id
    LEFT JOIN organizations o ON fa.organization_id = o.id
    WHERE fa.project_id = :projectId
      AND fa.organization_id = :organizationId
    ORDER BY fa.version DESC
    LIMIT 1
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { projectId, organizationId },
  });
  return (results[0] as IFriaAssessmentJSON) || null;
};

export const getFriaByIdQuery = async (
  friaId: number,
  organizationId: number
): Promise<IFriaAssessmentJSON | null> => {
  const query = `
    SELECT fa.*,
      u_created.name || ' ' || u_created.surname as created_by_name,
      u_updated.name || ' ' || u_updated.surname as updated_by_name,
      p.project_title,
      o.name as organization_name
    FROM fria_assessments fa
    LEFT JOIN users u_created ON fa.created_by = u_created.id
    LEFT JOIN users u_updated ON fa.updated_by = u_updated.id
    LEFT JOIN projects p ON fa.project_id = p.id
    LEFT JOIN organizations o ON fa.organization_id = o.id
    WHERE fa.id = :friaId
      AND fa.organization_id = :organizationId
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { friaId, organizationId },
  });
  return (results[0] as IFriaAssessmentJSON) || null;
};

export const createFriaQuery = async (
  data: {
    project_id: number;
    created_by: number;
    assessment_owner?: string;
    assessment_date?: string;
  },
  organizationId: number,
  transaction?: Transaction
): Promise<IFriaAssessmentJSON | null> => {
  const query = `
    INSERT INTO fria_assessments (
      organization_id, project_id, version, status,
      assessment_owner, assessment_date, created_by
    )
    VALUES (
      :organizationId, :projectId, 1, 'draft',
      :assessmentOwner, :assessmentDate, :createdBy
    )
    RETURNING *
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.INSERT,
    replacements: {
      organizationId,
      projectId: data.project_id,
      assessmentOwner: data.assessment_owner || null,
      assessmentDate: data.assessment_date || null,
      createdBy: data.created_by,
    },
    transaction,
  });
  return (results as any)[0]?.[0] || null;
};

export const updateFriaQuery = async (
  friaId: number,
  data: Record<string, any>,
  organizationId: number,
  userId: number,
  transaction?: Transaction
): Promise<IFriaAssessmentJSON | null> => {
  const allowedFields = [
    "status", "version", "assessment_owner", "assessment_date", "operational_context",
    "is_high_risk", "high_risk_basis", "deployer_type", "annex_iii_category",
    "first_use_date", "review_cycle", "period_frequency", "fria_rationale",
    "affected_groups", "vulnerability_context", "group_flags",
    "risk_scenarios", "provider_info_used",
    "human_oversight", "transparency_measures", "redress_process", "data_governance",
    "legal_review", "dpo_review", "owner_approval", "stakeholders_consulted", "consultation_notes",
    "deployment_decision", "decision_conditions",
    "completion_pct", "risk_score", "risk_level", "rights_flagged",
  ];

  const setClauses: string[] = [];
  const replacements: Record<string, any> = { friaId, organizationId, userId };

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === "group_flags") {
        setClauses.push(`${field} = :${field}::jsonb`);
        replacements[field] = JSON.stringify(data[field]);
      } else {
        setClauses.push(`${field} = :${field}`);
        replacements[field] = data[field];
      }
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push("updated_by = :userId");
  setClauses.push("updated_at = NOW()");

  const query = `
    UPDATE fria_assessments
    SET ${setClauses.join(", ")}
    WHERE id = :friaId AND organization_id = :organizationId
    RETURNING *
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.UPDATE,
    replacements,
    transaction,
  });
  return (results as any)[0]?.[0] || null;
};

// ========================================
// FRIA RIGHTS
// ========================================

export const getFriaRightsQuery = async (
  friaId: number,
  organizationId: number
): Promise<IFriaRight[]> => {
  const query = `
    SELECT * FROM fria_rights
    WHERE fria_id = :friaId AND organization_id = :organizationId
    ORDER BY id
  `;
  return sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { friaId, organizationId },
  });
};

export const initializeFriaRightsQuery = async (
  friaId: number,
  organizationId: number,
  transaction?: Transaction
) => {
  const valuesClauses = DEFAULT_RIGHTS.map(
    (_, i) => `(:orgId, :friaId, :rk${i}, :rt${i}, :cr${i}, FALSE, 0, 0)`
  ).join(", ");

  const replacements: Record<string, unknown> = { orgId: organizationId, friaId };
  DEFAULT_RIGHTS.forEach((r, i) => {
    replacements[`rk${i}`] = r.right_key;
    replacements[`rt${i}`] = r.right_title;
    replacements[`cr${i}`] = r.charter_ref;
  });

  return sequelize.query(
    `INSERT INTO fria_rights (organization_id, fria_id, right_key, right_title, charter_ref, flagged, severity, confidence)
     VALUES ${valuesClauses}
     ON CONFLICT (fria_id, right_key) DO NOTHING
     RETURNING *`,
    { type: QueryTypes.INSERT, replacements, transaction }
  );
};

export const upsertFriaRightQuery = async (
  friaId: number,
  rightData: {
    right_key: string;
    flagged?: boolean;
    severity?: number;
    confidence?: number;
    impact_pathway?: string;
    mitigation?: string;
  },
  organizationId: number,
  transaction?: Transaction
) => {
  const query = `
    UPDATE fria_rights
    SET flagged = :flagged,
        severity = :severity,
        confidence = :confidence,
        impact_pathway = :impactPathway,
        mitigation = :mitigation
    WHERE fria_id = :friaId
      AND right_key = :rightKey
      AND organization_id = :organizationId
    RETURNING *
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.UPDATE,
    replacements: {
      friaId,
      rightKey: rightData.right_key,
      organizationId,
      flagged: rightData.flagged ?? false,
      severity: rightData.severity ?? 0,
      confidence: rightData.confidence ?? 0,
      impactPathway: rightData.impact_pathway ?? null,
      mitigation: rightData.mitigation ?? null,
    },
    transaction,
  });
  return (results as any)[0]?.[0] || null;
};

export const bulkUpsertFriaRightsQuery = async (
  friaId: number,
  rightsArray: Array<{
    right_key: string;
    flagged?: boolean;
    severity?: number;
    confidence?: number;
    impact_pathway?: string;
    mitigation?: string;
  }>,
  organizationId: number,
  transaction?: Transaction
) => {
  const results = await Promise.all(
    rightsArray.map((right) => upsertFriaRightQuery(friaId, right, organizationId, transaction))
  );
  return results;
};

// ========================================
// FRIA RISK ITEMS
// ========================================

export const getFriaRiskItemsQuery = async (
  friaId: number,
  organizationId: number
): Promise<IFriaRiskItemJSON[]> => {
  const query = `
    SELECT fri.*,
      r.risk_name as linked_risk_name,
      r.risk_description as linked_risk_description
    FROM fria_risk_items fri
    LEFT JOIN risks r ON fri.linked_project_risk_id = r.id
    WHERE fri.fria_id = :friaId AND fri.organization_id = :organizationId
    ORDER BY fri.sort_order, fri.id
  `;
  return sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { friaId, organizationId },
  });
};

export const addFriaRiskItemQuery = async (
  friaId: number,
  data: {
    risk_description: string;
    likelihood?: string;
    severity?: string;
    existing_controls?: string;
    further_action?: string;
    linked_project_risk_id?: number;
    sort_order?: number;
  },
  organizationId: number,
  transaction?: Transaction
) => {
  const query = `
    INSERT INTO fria_risk_items (
      organization_id, fria_id, risk_description,
      likelihood, severity, existing_controls, further_action,
      linked_project_risk_id, sort_order
    )
    VALUES (
      :organizationId, :friaId, :riskDescription,
      :likelihood, :severity, :existingControls, :furtherAction,
      :linkedRiskId, :sortOrder
    )
    RETURNING *
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.INSERT,
    replacements: {
      organizationId,
      friaId,
      riskDescription: data.risk_description,
      likelihood: data.likelihood || null,
      severity: data.severity || null,
      existingControls: data.existing_controls || null,
      furtherAction: data.further_action || null,
      linkedRiskId: data.linked_project_risk_id || null,
      sortOrder: data.sort_order || 0,
    },
    transaction,
  });
  return (results as any)[0]?.[0] || null;
};

export const updateFriaRiskItemQuery = async (
  itemId: number,
  data: Record<string, any>,
  organizationId: number,
  transaction?: Transaction,
  friaId?: number
) => {
  const allowedFields = [
    "risk_description", "likelihood", "severity",
    "existing_controls", "further_action",
    "linked_project_risk_id", "sort_order",
  ];

  const setClauses: string[] = [];
  const replacements: Record<string, any> = { itemId, organizationId, ...(friaId ? { friaId } : {}) };

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      setClauses.push(`${field} = :${field}`);
      replacements[field] = data[field];
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push("updated_at = NOW()");

  const query = `
    UPDATE fria_risk_items
    SET ${setClauses.join(", ")}
    WHERE id = :itemId AND organization_id = :organizationId${friaId ? " AND fria_id = :friaId" : ""}
    RETURNING *
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.UPDATE,
    replacements,
    transaction,
  });
  return (results as any)[0]?.[0] || null;
};

export const deleteFriaRiskItemQuery = async (
  itemId: number,
  organizationId: number,
  transaction?: Transaction,
  friaId?: number
) => {
  const query = `
    DELETE FROM fria_risk_items
    WHERE id = :itemId AND organization_id = :organizationId${friaId ? " AND fria_id = :friaId" : ""}
    RETURNING id
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.DELETE,
    replacements: { itemId, organizationId, ...(friaId ? { friaId } : {}) },
    transaction,
  });
  return results;
};

// ========================================
// FRIA MODEL LINKS
// ========================================

export const getFriaModelLinksQuery = async (
  friaId: number,
  organizationId: number
): Promise<IFriaModelLinkJSON[]> => {
  const query = `
    SELECT fml.*, mi.provider, mi.model, mi.version, mi.status as model_status
    FROM fria_model_links fml
    LEFT JOIN model_inventories mi ON fml.model_id = mi.id
    WHERE fml.fria_id = :friaId AND fml.organization_id = :organizationId
    ORDER BY fml.id
  `;
  return sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { friaId, organizationId },
  });
};

export const linkModelToFriaQuery = async (
  friaId: number,
  modelId: number,
  organizationId: number,
  transaction?: Transaction
) => {
  const query = `
    INSERT INTO fria_model_links (organization_id, fria_id, model_id)
    VALUES (:organizationId, :friaId, :modelId)
    ON CONFLICT (fria_id, model_id) DO NOTHING
    RETURNING *
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.INSERT,
    replacements: { organizationId, friaId, modelId },
    transaction,
  });
  return (results as any)[0]?.[0] || null;
};

export const unlinkModelFromFriaQuery = async (
  friaId: number,
  modelId: number,
  organizationId: number,
  transaction?: Transaction
) => {
  const query = `
    DELETE FROM fria_model_links
    WHERE fria_id = :friaId AND model_id = :modelId AND organization_id = :organizationId
    RETURNING id
  `;
  return sequelize.query(query, {
    type: QueryTypes.DELETE,
    replacements: { friaId, modelId, organizationId },
    transaction,
  });
};

// ========================================
// FRIA SNAPSHOTS
// ========================================

export const createFriaSnapshotQuery = async (
  friaId: number,
  version: number,
  reason: string,
  userId: number,
  organizationId: number,
  snapshotData: Record<string, any>,
  transaction?: Transaction
) => {
  const query = `
    INSERT INTO fria_snapshots (organization_id, fria_id, version, snapshot_data, snapshot_reason, created_by)
    VALUES (:organizationId, :friaId, :version, :snapshotData::jsonb, :reason, :userId)
    RETURNING *
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.INSERT,
    replacements: {
      organizationId,
      friaId,
      version,
      snapshotData: JSON.stringify(snapshotData),
      reason,
      userId,
    },
    transaction,
  });
  return (results as any)[0]?.[0] || null;
};

export const getFriaSnapshotsQuery = async (
  friaId: number,
  organizationId: number
): Promise<IFriaSnapshotJSON[]> => {
  const query = `
    SELECT fs.*, u.name || ' ' || u.surname as created_by_name
    FROM fria_snapshots fs
    LEFT JOIN users u ON fs.created_by = u.id
    WHERE fs.fria_id = :friaId AND fs.organization_id = :organizationId
    ORDER BY fs.version DESC
  `;
  return sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { friaId, organizationId },
  });
};

export const getFriaSnapshotByVersionQuery = async (
  friaId: number,
  version: number,
  organizationId: number
): Promise<IFriaSnapshotJSON | null> => {
  const query = `
    SELECT fs.*, u.name || ' ' || u.surname as created_by_name
    FROM fria_snapshots fs
    LEFT JOIN users u ON fs.created_by = u.id
    WHERE fs.fria_id = :friaId AND fs.version = :version AND fs.organization_id = :organizationId
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { friaId, version, organizationId },
  });
  return (results[0] as IFriaSnapshotJSON) || null;
};

// ========================================
// SCORING
// ========================================

export const computeFriaScore = (
  fria: Record<string, any>,
  rights: IFriaRight[],
  riskItems: IFriaRiskItemJSON[]
): IFriaScoreResult => {
  // Count flagged rights
  const rightsFlagged = rights.filter((r) => r.flagged).length;

  // Compute risk score from rights severity + confidence
  let riskScore = 0;
  for (const right of rights) {
    if (right.flagged) {
      const severityWeight = (right.severity || 0) * 15;
      const confidencePenalty = (right.confidence || 0) * 5;
      riskScore += severityWeight + confidencePenalty;
    }
  }

  // Factor in risk items
  const likelihoodMap: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
  const severityMap: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
  for (const item of riskItems) {
    const l = likelihoodMap[item.likelihood || ""] || 0;
    const s = severityMap[item.severity || ""] || 0;
    riskScore += l * s * 3;
  }

  // Cap at 100
  riskScore = Math.min(riskScore, 100);

  // Determine level
  let riskLevel = FriaRiskLevel.LOW as string;
  if (riskScore >= 60) riskLevel = FriaRiskLevel.HIGH;
  else if (riskScore >= 30) riskLevel = FriaRiskLevel.MEDIUM;

  // Compute completion percentage
  const sectionFields = [
    // Section 1
    fria.assessment_owner, fria.assessment_date, fria.operational_context,
    // Section 2
    fria.is_high_risk, fria.deployer_type, fria.annex_iii_category,
    // Section 3
    fria.affected_groups, fria.vulnerability_context,
    // Section 5
    fria.risk_scenarios,
    // Section 6
    fria.human_oversight, fria.transparency_measures, fria.redress_process, fria.data_governance,
    // Section 7
    fria.legal_review, fria.dpo_review, fria.owner_approval,
    // Section 8
    fria.deployment_decision,
  ];

  const filledFields = sectionFields.filter((v) => v !== null && v !== undefined && v !== "").length;
  const totalFields = sectionFields.length;

  // Rights contribute to completion if any right has been assessed
  // (flagged, or has severity/confidence/impact set — meaning the user reviewed it)
  const rightsAssessed = rights.some(
    (r) => r.flagged || r.severity > 0 || r.confidence > 0 || r.impact_pathway || r.mitigation
  );
  const rightsComplete = rightsAssessed ? 1 : 0;
  // Risk items contribute if any exist
  const risksComplete = riskItems.length > 0 ? 1 : 0;

  const completionPct = Math.round(
    ((filledFields + rightsComplete + risksComplete) / (totalFields + 2)) * 100
  );

  return {
    riskScore, riskLevel, completionPct, rightsFlagged,
    // Snake-case aliases for direct use with updateFriaQuery
    risk_score: riskScore,
    risk_level: riskLevel,
    completion_pct: completionPct,
    rights_flagged: rightsFlagged,
  };
};

/**
 * Fetches current FRIA data, recomputes scores, and persists them.
 * Used after mutations to rights/risk items to keep scores in sync.
 */
export const recomputeAndPersistScore = async (
  friaId: number,
  organizationId: number,
  userId: number
) => {
  const [fria, rights, riskItems] = await Promise.all([
    getFriaByIdQuery(friaId, organizationId),
    getFriaRightsQuery(friaId, organizationId),
    getFriaRiskItemsQuery(friaId, organizationId),
  ]);
  if (!fria) return;
  const scores = computeFriaScore(fria, rights, riskItems);
  await updateFriaQuery(friaId, scores, organizationId, userId);
};
