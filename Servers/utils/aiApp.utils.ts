import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { AiAppModel } from "../domain.layer/models/aiApp/aiApp.model";
import {
  AiAppDiscoveredSource,
  AiAppPolicyStatus,
  AiAppStatus,
} from "../domain.layer/enums/ai-app-status.enum";
import {
  IAIApp,
  IAIAppCreatePayload,
  IAIAppDetail,
  IAIAppUpdatePayload,
} from "../domain.layer/interfaces/i.aiApp";
import {
  ValidationException,
  NotFoundException,
} from "../domain.layer/exceptions/custom.exception";

const DATA_EXPOSURE_DEFAULTS = [
  { data_type: "Public Data", allowed: true },
  { data_type: "Internal Data", allowed: true },
  { data_type: "Confidential", allowed: false },
  { data_type: "Customer PII", allowed: false },
  { data_type: "Financial Records", allowed: false },
  { data_type: "Source Code", allowed: false },
  { data_type: "Health Data", allowed: false },
];

const POLICY_SUGGESTION_MAP: Record<string, string[]> = {
  chatgpt: ["Acceptable AI Use", "Data Classification", "AI Usage Policy"],
  claude: ["Acceptable AI Use", "Data Classification", "AI Usage Policy"],
  "github copilot": ["Secure Coding Policy", "Open Source Policy", "IP Protection Policy"],
  copilot: ["Secure Coding Policy", "Open Source Policy", "IP Protection Policy"],
  midjourney: ["Brand Policy", "Copyright Policy"],
  grammarly: ["Data Classification", "Acceptable AI Use"],
  perplexity: ["Acceptable AI Use", "Data Classification"],
  cursor: ["Secure Coding Policy", "Open Source Policy", "IP Protection Policy"],
  deepseek: ["Acceptable AI Use", "Data Classification"],
  "notion ai": ["Acceptable AI Use", "Data Classification"],
};

interface GetAllAiAppsOptions {
  status?: AiAppStatus;
  vendorId?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: "asc" | "desc";
}

function parseAiAppRow(row: any): IAIApp {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    description: row.description,
    vendor_id: row.vendor_id,
    vendor_name: row.vendor_name ?? null,
    owner_id: row.owner_id,
    status: row.status,
    risk_score: row.risk_score,
    discovered_source: row.discovered_source,
    shadow_ai_tool_id: row.shadow_ai_tool_id,
    required_training: row.required_training,
    is_demo: row.is_demo,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getAllAiAppsQuery(
  organizationId: number,
  options: GetAllAiAppsOptions = {},
): Promise<{ ai_apps: IAIApp[]; total: number }> {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const offset = (page - 1) * limit;

  // Columns are qualified with ai_apps.* because the list query LEFT JOINs vendors,
  // which also has organization_id (would be ambiguous unqualified).
  const whereConditions: string[] = ["ai_apps.organization_id = :organizationId"];
  const replacements: Record<string, any> = { organizationId, limit, offset };

  if (options.status) {
    whereConditions.push("ai_apps.status = :status");
    replacements.status = options.status;
  }

  if (options.vendorId) {
    whereConditions.push("ai_apps.vendor_id = :vendorId");
    replacements.vendorId = options.vendorId;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  // Qualified with ai_apps. because the list query joins vendors (shared column names
  // like created_at/status/risk_score would otherwise be ambiguous in ORDER BY).
  const validSortColumns: Record<string, string> = {
    name: "ai_apps.name",
    status: "ai_apps.status",
    risk_score: "ai_apps.risk_score",
    created_at: "ai_apps.created_at",
    updated_at: "ai_apps.updated_at",
  };

  const sortColumn = validSortColumns[options.sortBy || "created_at"] || "created_at";
  const sortOrder = options.order === "asc" ? "ASC" : "DESC";

  // LEFT JOIN vendors so the list can show the vendor name instead of a raw id.
  // whereClause/sortColumn reference unqualified ai_apps columns, so alias the table.
  // The join is also constrained to the same organization so a stray cross-org
  // vendor_id can never surface another tenant's vendor name.
  const [rows] = await sequelize.query(
    `SELECT ai_apps.*, v.vendor_name
     FROM ai_apps
     LEFT JOIN vendors v ON v.id = ai_apps.vendor_id AND v.organization_id = ai_apps.organization_id
     ${whereClause}
     ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
     LIMIT :limit OFFSET :offset`,
    { replacements },
  );

  const [countResult] = await sequelize.query(
    `SELECT COUNT(*) as total FROM ai_apps ${whereClause}`,
    { replacements },
  );

  return {
    ai_apps: (rows as any[]).map(parseAiAppRow),
    total: parseInt((countResult as any[])[0].total, 10),
  };
}

export async function getAiAppByIdQuery(
  id: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<IAIAppDetail | null> {
  // `transaction` is optional: when this runs as a read-your-own-write step inside an
  // open create/update transaction it must share that transaction to see uncommitted
  // rows; standalone GET calls pass nothing and read with autocommit as before.
  const [rows] = await sequelize.query(
    `SELECT * FROM ai_apps WHERE organization_id = :organizationId AND id = :id`,
    { replacements: { organizationId, id }, transaction },
  );

  const apps = rows as any[];
  if (apps.length === 0) return null;

  const app = apps[0];

  const [vendorRows] = await sequelize.query(
    `SELECT id, vendor_name, review_status, risk_score
     FROM vendors
     WHERE id = :vendorId AND organization_id = :organizationId`,
    { replacements: { vendorId: app.vendor_id, organizationId }, transaction },
  );

  const [ownerRows] = await sequelize.query(
    `SELECT id, name, surname, email FROM users
     WHERE id = :ownerId AND organization_id = :organizationId`,
    { replacements: { ownerId: app.owner_id, organizationId }, transaction },
  );

  // model_inventories has no risk_score column (risk there is captured via
  // security_assessment); the IAIAppDetail.models.risk_score field is optional and
  // intentionally omitted here rather than mapped from an unrelated column.
  // The org filter on mi/pm is defense in depth: links can only be created for
  // same-org models/policies (enforced on write), but the read enforces it too.
  const [modelRows] = await sequelize.query(
    `SELECT mi.id, mi.provider, mi.model, mi.version, mi.status
     FROM model_inventories mi
     JOIN ai_apps_model_inventories j ON j.model_inventory_id = mi.id
     WHERE j.ai_app_id = :aiAppId AND mi.organization_id = :organizationId
     ORDER BY mi.provider, mi.model`,
    { replacements: { aiAppId: id, organizationId }, transaction },
  );

  const [policyRows] = await sequelize.query(
    `SELECT pm.id, pm.title, jap.status
     FROM policy_manager pm
     JOIN ai_apps_policy_manager jap ON jap.policy_id = pm.id
     WHERE jap.ai_app_id = :aiAppId AND pm.organization_id = :organizationId
     ORDER BY pm.title`,
    { replacements: { aiAppId: id, organizationId }, transaction },
  );

  const [dataExposureRows] = await sequelize.query(
    `SELECT data_type, allowed FROM ai_apps_data_exposure
     WHERE ai_app_id = :aiAppId
     ORDER BY data_type`,
    { replacements: { aiAppId: id }, transaction },
  );

  const [departmentRows] = await sequelize.query(
    `SELECT department, user_count FROM ai_apps_departments
     WHERE ai_app_id = :aiAppId
     ORDER BY user_count DESC, department`,
    { replacements: { aiAppId: id }, transaction },
  );

  return {
    ...parseAiAppRow(app),
    vendor:
      vendorRows.length > 0
        ? {
            id: (vendorRows[0] as any).id,
            vendor_name: (vendorRows[0] as any).vendor_name,
            review_status: (vendorRows[0] as any).review_status,
            risk_score: (vendorRows[0] as any).risk_score,
          }
        : null,
    owner:
      ownerRows.length > 0
        ? {
            id: (ownerRows[0] as any).id,
            name: (ownerRows[0] as any).name,
            surname: (ownerRows[0] as any).surname,
            email: (ownerRows[0] as any).email,
          }
        : null,
    models: modelRows as any[],
    policies: policyRows as any[],
    data_exposure: dataExposureRows as any[],
    departments: departmentRows as any[],
  };
}

export async function createAiAppQuery(
  data: IAIAppCreatePayload,
  organizationId: number,
  transaction: Transaction,
): Promise<IAIAppDetail> {
  const app = AiAppModel.createNewAiApp(organizationId, data);
  await app.validateAiAppData();

  const [createdRows] = await sequelize.query(
    `INSERT INTO ai_apps (
      organization_id, name, description, vendor_id, owner_id, status,
      discovered_source, shadow_ai_tool_id, required_training, risk_score, is_demo,
      created_at, updated_at
    ) VALUES (
      :organizationId, :name, :description, :vendorId, :ownerId, :status,
      :discoveredSource, :shadowAiToolId, :requiredTraining, :riskScore, :isDemo,
      NOW(), NOW()
    ) RETURNING *`,
    {
      replacements: {
        organizationId,
        name: app.name,
        description: app.description ?? null,
        vendorId: app.vendor_id ?? null,
        ownerId: app.owner_id ?? null,
        status: app.status,
        discoveredSource: app.discovered_source,
        shadowAiToolId: app.shadow_ai_tool_id ?? null,
        requiredTraining: app.required_training ?? null,
        riskScore: app.risk_score ?? null,
        isDemo: app.is_demo ?? false,
      },
      transaction,
    },
  );

  const createdApp = (createdRows as any[])[0];

  await linkModelsToAiAppQuery(
    createdApp.id,
    data.model_inventory_ids || [],
    organizationId,
    transaction,
  );
  await setDataExposureForAiAppQuery(
    createdApp.id,
    data.data_exposure || DATA_EXPOSURE_DEFAULTS,
    transaction,
  );
  await setDepartmentsForAiAppQuery(createdApp.id, data.departments || [], transaction);

  const policyIds = data.policy_ids || [];
  if (policyIds.length > 0) {
    await setPoliciesForAiAppQuery(
      createdApp.id,
      policyIds.map((policyId) => ({ policy_id: policyId, status: AiAppPolicyStatus.APPLICABLE })),
      organizationId,
      transaction,
    );
  }

  const detail = await getAiAppByIdQuery(createdApp.id, organizationId, transaction);
  if (!detail) {
    throw new NotFoundException("AI App not found after creation", "AiApp", createdApp.id);
  }
  return detail;
}

export async function updateAiAppByIdQuery(
  id: number,
  data: IAIAppUpdatePayload,
  organizationId: number,
  transaction: Transaction,
): Promise<IAIAppDetail | null> {
  const [existingRows] = await sequelize.query(
    `SELECT * FROM ai_apps WHERE organization_id = :organizationId AND id = :id`,
    { replacements: { organizationId, id }, transaction },
  );

  const apps = existingRows as any[];
  if (apps.length === 0) return null;

  const existingApp = AiAppModel.fromJSON(apps[0]);
  AiAppModel.updateAiApp(existingApp, data);

  const setClauses: string[] = [];
  const replacements: Record<string, any> = { organizationId, id };

  const updatableFields: Array<keyof IAIAppUpdatePayload> = [
    "name",
    "description",
    "vendor_id",
    "owner_id",
    "status",
    "discovered_source",
    "shadow_ai_tool_id",
    "required_training",
    "risk_score",
  ];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      setClauses.push(`${field} = :${field}`);
      replacements[field] = data[field];
    }
  }

  if (setClauses.length === 0) {
    return getAiAppByIdQuery(id, organizationId, transaction);
  }

  setClauses.push("updated_at = NOW()");

  await sequelize.query(
    `UPDATE ai_apps SET ${setClauses.join(", ")}
     WHERE organization_id = :organizationId AND id = :id`,
    { replacements, transaction },
  );

  return getAiAppByIdQuery(id, organizationId, transaction);
}

export async function deleteAiAppByIdQuery(
  id: number,
  organizationId: number,
  transaction: Transaction,
): Promise<boolean> {
  const [rows] = await sequelize.query(
    `DELETE FROM ai_apps WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      transaction,
    },
  );
  return (rows as any[]).length > 0;
}

export async function linkModelsToAiAppQuery(
  aiAppId: number,
  modelInventoryIds: number[],
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(`DELETE FROM ai_apps_model_inventories WHERE ai_app_id = :aiAppId`, {
    replacements: { aiAppId },
    transaction,
  });

  if (modelInventoryIds.length === 0) return;

  const candidateIds = modelInventoryIds.filter((id) => Number.isInteger(id) && id > 0);
  if (candidateIds.length === 0) return;

  // Validate that every model inventory belongs to the organization before linking.
  const candidateReplacements: Record<string, any> = { organizationId };
  candidateIds.forEach((modelId, index) => {
    candidateReplacements[`candidateId${index}`] = modelId;
  });
  const candidatePlaceholders = candidateIds.map((_, index) => `:candidateId${index}`).join(", ");

  const [ownedRows] = await sequelize.query(
    `SELECT id FROM model_inventories
     WHERE id IN (${candidatePlaceholders}) AND organization_id = :organizationId`,
    { replacements: candidateReplacements, transaction },
  );

  const ownedIds = new Set((ownedRows as any[]).map((row) => row.id));
  const validIds = candidateIds.filter((id) => ownedIds.has(id));
  if (validIds.length === 0) return;

  const replacements: Record<string, any> = { aiAppId };
  validIds.forEach((modelId, index) => {
    replacements[`modelId${index}`] = modelId;
  });

  const queryPlaceholders = validIds.map((_, index) => `(:aiAppId, :modelId${index})`).join(", ");

  await sequelize.query(
    `INSERT INTO ai_apps_model_inventories (ai_app_id, model_inventory_id) VALUES ${queryPlaceholders}`,
    { replacements, transaction },
  );
}

export async function setPoliciesForAiAppQuery(
  aiAppId: number,
  policies: Array<{ policy_id: number; status: AiAppPolicyStatus }>,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(`DELETE FROM ai_apps_policy_manager WHERE ai_app_id = :aiAppId`, {
    replacements: { aiAppId },
    transaction,
  });

  if (policies.length === 0) return;

  const candidatePolicies = policies.filter(
    (p) => Number.isInteger(p.policy_id) && p.policy_id > 0,
  );
  if (candidatePolicies.length === 0) return;

  // Validate that every policy belongs to the organization before linking.
  const candidateReplacements: Record<string, any> = { organizationId };
  candidatePolicies.forEach((policy, index) => {
    candidateReplacements[`candidatePolicyId${index}`] = policy.policy_id;
  });
  const candidatePlaceholders = candidatePolicies
    .map((_, index) => `:candidatePolicyId${index}`)
    .join(", ");

  const [ownedRows] = await sequelize.query(
    `SELECT id FROM policy_manager
     WHERE id IN (${candidatePlaceholders}) AND organization_id = :organizationId`,
    { replacements: candidateReplacements, transaction },
  );

  const ownedIds = new Set((ownedRows as any[]).map((row) => row.id));
  const validPolicies = candidatePolicies.filter((p) => ownedIds.has(p.policy_id));
  if (validPolicies.length === 0) return;

  const replacements: Record<string, any> = { aiAppId };
  const placeholders = validPolicies
    .map((_, index) => `(:aiAppId, :policyId${index}, :policyStatus${index})`)
    .join(", ");

  validPolicies.forEach((policy, index) => {
    replacements[`policyId${index}`] = policy.policy_id;
    replacements[`policyStatus${index}`] = Object.values(AiAppPolicyStatus).includes(policy.status)
      ? policy.status
      : AiAppPolicyStatus.APPLICABLE;
  });

  await sequelize.query(
    `INSERT INTO ai_apps_policy_manager (ai_app_id, policy_id, status) VALUES ${placeholders}`,
    { replacements, transaction },
  );
}

export async function setDataExposureForAiAppQuery(
  aiAppId: number,
  dataExposure: Array<{ data_type: string; allowed: boolean }>,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(`DELETE FROM ai_apps_data_exposure WHERE ai_app_id = :aiAppId`, {
    replacements: { aiAppId },
    transaction,
  });

  if (dataExposure.length === 0) return;

  const replacements: Record<string, any> = { aiAppId };
  const placeholders = dataExposure
    .map((_, index) => `(:aiAppId, :dataType${index}, :allowed${index})`)
    .join(", ");

  dataExposure.forEach((item, index) => {
    replacements[`dataType${index}`] = item.data_type;
    replacements[`allowed${index}`] = item.allowed;
  });

  await sequelize.query(
    `INSERT INTO ai_apps_data_exposure (ai_app_id, data_type, allowed) VALUES ${placeholders}`,
    { replacements, transaction },
  );
}

export async function setDepartmentsForAiAppQuery(
  aiAppId: number,
  departments: Array<{ department: string; user_count: number }>,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(`DELETE FROM ai_apps_departments WHERE ai_app_id = :aiAppId`, {
    replacements: { aiAppId },
    transaction,
  });

  if (departments.length === 0) return;

  const replacements: Record<string, any> = { aiAppId };
  const placeholders = departments
    .map((_, index) => `(:aiAppId, :department${index}, :userCount${index})`)
    .join(", ");

  departments.forEach((dept, index) => {
    replacements[`department${index}`] = dept.department;
    replacements[`userCount${index}`] = dept.user_count ?? 0;
  });

  await sequelize.query(
    `INSERT INTO ai_apps_departments (ai_app_id, department, user_count) VALUES ${placeholders}`,
    { replacements, transaction },
  );
}

export async function getPolicySuggestionsQuery(
  appName: string,
  organizationId: number,
): Promise<Array<{ id: number | null; title: string; suggested: boolean }>> {
  if (!appName || appName.trim().length === 0) {
    return [];
  }

  const normalizedName = appName.toLowerCase().trim();
  const suggestionTitles =
    POLICY_SUGGESTION_MAP[normalizedName] ||
    Object.entries(POLICY_SUGGESTION_MAP).find(([key]) => normalizedName.includes(key))?.[1] ||
    [];

  const [policyRows] = await sequelize.query(
    `SELECT id, title FROM policy_manager WHERE organization_id = :organizationId ORDER BY title`,
    { replacements: { organizationId } },
  );

  return (policyRows as any[]).map((policy) => ({
    id: policy.id,
    title: policy.title,
    suggested: suggestionTitles.some((title) =>
      policy.title.toLowerCase().includes(title.toLowerCase()),
    ),
  }));
}

export async function promoteFromShadowAiQuery(
  shadowAiToolId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<IAIAppDetail> {
  const [toolRows] = await sequelize.query(
    `SELECT * FROM shadow_ai_tools WHERE organization_id = :organizationId AND id = :shadowAiToolId`,
    { replacements: { organizationId, shadowAiToolId }, transaction },
  );

  const tools = toolRows as any[];
  if (tools.length === 0) {
    throw new NotFoundException("Shadow AI tool not found", "ShadowAiTool", shadowAiToolId);
  }

  const tool = tools[0];

  const [existingAppRows] = await sequelize.query(
    `SELECT id FROM ai_apps WHERE organization_id = :organizationId AND shadow_ai_tool_id = :shadowAiToolId`,
    { replacements: { organizationId, shadowAiToolId }, transaction },
  );

  if ((existingAppRows as any[]).length > 0) {
    throw new ValidationException(
      "An AI App already exists for this Shadow AI tool",
      "shadow_ai_tool_id",
      shadowAiToolId,
    );
  }

  const [departmentRows] = await sequelize.query(
    `SELECT
       COALESCE(department, 'Unknown') as department,
       COUNT(DISTINCT user_email) as user_count
     FROM shadow_ai_events
     WHERE organization_id = :organizationId
       AND detected_tool_id = :shadowAiToolId
       AND event_timestamp > NOW() - INTERVAL '30 days'
     GROUP BY department
     ORDER BY user_count DESC`,
    { replacements: { organizationId, shadowAiToolId }, transaction },
  );

  const payload: IAIAppCreatePayload = {
    name: tool.name,
    description: `Promoted from Shadow AI detection. Vendor: ${tool.vendor || "Unknown"}`,
    discovered_source: AiAppDiscoveredSource.SHADOW_AI,
    shadow_ai_tool_id: shadowAiToolId,
    status: AiAppStatus.DRAFT,
    departments: (departmentRows as any[]).map((d) => ({
      department: d.department,
      user_count: parseInt(d.user_count, 10) || 0,
    })),
  };

  return createAiAppQuery(payload, organizationId, transaction);
}
