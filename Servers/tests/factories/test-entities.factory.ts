/**
 * Persistence helpers for integration tests.
 *
 * These functions insert rows directly into the database. They are used by the
 * tenant-isolation harness and by any integration test that needs seed data.
 */

import { sequelize } from "../../database/db";

export interface CreateTestProjectOptions {
  project_title?: string;
  uc_id?: string;
}

export async function createTestProject(
  orgId: number,
  ownerId: number,
  options: CreateTestProjectOptions = {},
): Promise<number> {
  const suffix = Date.now();
  const title = options.project_title ?? `Test Project ${suffix}`;
  const ucId = options.uc_id ?? `UC-${suffix}`;
  const [result] = await sequelize.query(
    `INSERT INTO projects (organization_id, project_title, owner, uc_id, created_at)
     VALUES (:orgId, :title, :ownerId, :ucId, NOW()) RETURNING id`,
    { replacements: { orgId, title, ownerId, ucId } },
  );
  return (result as any[])[0].id;
}

export interface CreateTestFileOptions {
  filename?: string;
  project_id?: number;
}

export async function createTestFile(
  orgId: number,
  uploadedBy: number,
  options: CreateTestFileOptions = {},
): Promise<number> {
  const filename = options.filename ?? `file-${Date.now()}.txt`;
  const [result] = await sequelize.query(
    `INSERT INTO files (organization_id, filename, uploaded_by, org_id, project_id)
     VALUES (:orgId, :filename, :uploadedBy, :orgId, :projectId) RETURNING id`,
    {
      replacements: {
        orgId,
        filename,
        uploadedBy,
        projectId: options.project_id ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestRiskOptions {
  risk_name?: string;
  risk_owner?: number;
}

export async function createTestRisk(
  orgId: number,
  options: CreateTestRiskOptions = {},
): Promise<number> {
  const name = options.risk_name ?? `Risk ${Date.now()}`;
  const [result] = await sequelize.query(
    `INSERT INTO risks (organization_id, risk_name, risk_owner, created_at, updated_at)
     VALUES (:orgId, :name, :riskOwner, NOW(), NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        name,
        riskOwner: options.risk_owner ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestTaskOptions {
  title?: string;
  creator_id?: number;
  due_date?: Date | string;
  status?: string;
}

export async function createTestTask(
  orgId: number,
  options: CreateTestTaskOptions = {},
): Promise<number> {
  const title = options.title ?? `Task ${Date.now()}`;
  const dueDate = options.due_date ?? null;
  const status = options.status ?? "Open";
  const [result] = await sequelize.query(
    `INSERT INTO tasks (organization_id, title, creator_id, due_date, status, created_at, updated_at)
     VALUES (:orgId, :title, :creatorId, :dueDate, :status, NOW(), NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        title,
        creatorId: options.creator_id ?? null,
        dueDate,
        status,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestVendorOptions {
  vendor_name?: string;
  vendor_provides?: string;
  website?: string;
  vendor_contact_person?: string;
}

export async function createTestVendor(
  orgId: number,
  options: CreateTestVendorOptions = {},
): Promise<number> {
  const suffix = Date.now();
  const [result] = await sequelize.query(
    `INSERT INTO vendors (organization_id, vendor_name, vendor_provides, website, vendor_contact_person, created_at, updated_at)
     VALUES (:orgId, :name, :provides, :website, :contact, NOW(), NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        name: options.vendor_name ?? `Vendor ${suffix}`,
        provides: options.vendor_provides ?? "Services",
        website: options.website ?? "https://example.com",
        contact: options.vendor_contact_person ?? "Contact Person",
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestAssessmentOptions {
  project_id?: number;
  projects_frameworks_id?: number;
}

export async function createTestAssessment(
  orgId: number,
  options: CreateTestAssessmentOptions = {},
): Promise<number> {
  const [result] = await sequelize.query(
    `INSERT INTO assessments (organization_id, project_id, projects_frameworks_id, created_at)
     VALUES (:orgId, :projectId, :projectsFrameworksId, NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        projectId: options.project_id ?? null,
        projectsFrameworksId: options.projects_frameworks_id ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestControlEUOptions {
  projects_frameworks_id?: number;
}

export async function createTestControlEU(
  orgId: number,
  options: CreateTestControlEUOptions = {},
): Promise<number> {
  const [result] = await sequelize.query(
    `INSERT INTO controls_eu (organization_id, projects_frameworks_id, created_at)
     VALUES (:orgId, :projectsFrameworksId, NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        projectsFrameworksId: options.projects_frameworks_id ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export async function createTestProjectFramework(
  orgId: number,
  projectId: number,
  frameworkId: number,
): Promise<number> {
  const [result] = await sequelize.query(
    `INSERT INTO projects_frameworks (organization_id, project_id, framework_id)
     VALUES (:orgId, :projectId, :frameworkId) RETURNING id`,
    { replacements: { orgId, projectId, frameworkId } },
  );
  return (result as any[])[0].id;
}

export async function linkRiskToProject(
  orgId: number,
  riskId: number,
  projectId: number,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO projects_risks (organization_id, risk_id, project_id)
     VALUES (:orgId, :riskId, :projectId)
     ON CONFLICT (risk_id, project_id) DO NOTHING`,
    { replacements: { orgId, riskId, projectId } },
  );
}

export async function linkVendorToProject(
  orgId: number,
  vendorId: number,
  projectId: number,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO vendors_projects (organization_id, vendor_id, project_id)
     VALUES (:orgId, :vendorId, :projectId)
     ON CONFLICT (vendor_id, project_id) DO NOTHING`,
    { replacements: { orgId, vendorId, projectId } },
  );
}

export async function assignTaskToUser(
  orgId: number,
  taskId: number,
  userId: number,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO task_assignees (organization_id, task_id, user_id)
     VALUES (:orgId, :taskId, :userId)
     ON CONFLICT (task_id, user_id) DO NOTHING`,
    { replacements: { orgId, taskId, userId } },
  );
}

export interface CreateTestEvidenceHubOptions {
  evidence_name?: string;
  evidence_type?: string;
  description?: string | null;
}

export async function createTestEvidenceHub(
  orgId: number,
  options: CreateTestEvidenceHubOptions = {},
): Promise<number> {
  const suffix = Date.now();
  const [result] = await sequelize.query(
    `INSERT INTO evidence_hub (organization_id, evidence_name, evidence_type, description, created_at, updated_at)
     VALUES (:orgId, :name, :type, :description, NOW(), NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        name: options.evidence_name ?? `Evidence ${suffix}`,
        type: options.evidence_type ?? "document",
        description: options.description ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestAuditLedgerOptions {
  entry_type?: string;
  event_type?: string;
  entity_type?: string;
  entity_id?: number;
  action?: string;
}

export async function createTestAuditLedger(
  orgId: number,
  userId: number,
  options: CreateTestAuditLedgerOptions = {},
): Promise<number> {
  const hash = "0".repeat(64);
  const [result] = await sequelize.query(
    `INSERT INTO audit_ledger (organization_id, entry_type, user_id, event_type, entity_type, entity_id, action, entry_hash, prev_hash, occurred_at)
     VALUES (:orgId, :entryType, :userId, :eventType, :entityType, :entityId, :action, :entryHash, :prevHash, NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        userId,
        entryType: options.entry_type ?? "Create",
        eventType: options.event_type ?? "Create",
        entityType: options.entity_type ?? "project",
        entityId: options.entity_id ?? null,
        action: options.action ?? "create",
        entryHash: hash,
        prevHash: hash,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestEventLogOptions {
  event_type?: string;
  description?: string;
}

export async function createTestEventLog(
  orgId: number,
  userId: number,
  options: CreateTestEventLogOptions = {},
): Promise<number> {
  const [result] = await sequelize.query(
    `INSERT INTO event_logs (organization_id, event_type, description, user_id, timestamp)
     VALUES (:orgId, :eventType, :description, :userId, NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        userId,
        eventType: options.event_type ?? "Read",
        description: options.description ?? "Test event log",
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestFileEntityLinkOptions {
  file_id?: number;
  framework_type?: string;
  entity_type?: string;
  entity_id?: number;
  project_id?: number;
  created_by?: number;
}

export async function createTestFileEntityLink(
  orgId: number,
  options: CreateTestFileEntityLinkOptions = {},
): Promise<number> {
  const suffix = Date.now();
  const [result] = await sequelize.query(
    `INSERT INTO file_entity_links (organization_id, file_id, framework_type, entity_type, entity_id, project_id, link_type, created_at)
     VALUES (:orgId, :fileId, :frameworkType, :entityType, :entityId, :projectId, 'evidence', NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        fileId: options.file_id ?? null,
        frameworkType: options.framework_type ?? "eu-ai-act",
        entityType: options.entity_type ?? "control",
        entityId: options.entity_id ?? suffix,
        projectId: options.project_id ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestFileChangeHistoryOptions {
  file_id?: number;
  field_name?: string;
  changed_by_user_id?: number;
}

export async function createTestFileChangeHistory(
  orgId: number,
  options: CreateTestFileChangeHistoryOptions = {},
): Promise<number> {
  const suffix = Date.now();
  const [result] = await sequelize.query(
    `INSERT INTO file_change_history (organization_id, file_id, field_name, old_value, new_value, action, changed_by_user_id, changed_at, created_at)
     VALUES (:orgId, :fileId, :fieldName, 'old', 'new', 'update', :changedBy, NOW(), NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        fileId: options.file_id ?? suffix,
        fieldName: options.field_name ?? "filename",
        changedBy: options.changed_by_user_id ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

// ── MRM (Model Risk Management) factories ──

export interface CreateTestModelInventoryOptions {
  provider?: string;
  model?: string;
  version?: string;
}

export async function createTestModelInventory(
  orgId: number,
  options: CreateTestModelInventoryOptions = {},
): Promise<number> {
  const suffix = Date.now();
  const [result] = await sequelize.query(
    `INSERT INTO model_inventories (organization_id, provider, model, version, created_at, updated_at)
     VALUES (:orgId, :provider, :model, :version, NOW(), NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        provider: options.provider ?? `Provider ${suffix}`,
        model: options.model ?? `Model ${suffix}`,
        version: options.version ?? "1.0",
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestMrmValidationOptions {
  model_inventory_id?: number;
  validator_id?: number;
}

export async function createTestMrmValidation(
  orgId: number,
  modelInventoryId: number,
  options: CreateTestMrmValidationOptions = {},
): Promise<number> {
  const [result] = await sequelize.query(
    `INSERT INTO mrm_validations (organization_id, model_inventory_id, stage, validator_id, report, created_at, updated_at)
     VALUES (:orgId, :modelInventoryId, 'not_started', :validatorId, '{}'::jsonb, NOW(), NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        modelInventoryId: options.model_inventory_id ?? modelInventoryId,
        validatorId: options.validator_id ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestMrmFindingOptions {
  validation_id?: number;
  title?: string;
  owner_id?: number;
  severity?: string;
  stage?: string;
}

export async function createTestMrmFinding(
  orgId: number,
  modelInventoryId: number,
  options: CreateTestMrmFindingOptions = {},
): Promise<number> {
  const suffix = Date.now();
  const [result] = await sequelize.query(
    `INSERT INTO mrm_findings (organization_id, model_inventory_id, validation_id, title, severity, stage, owner_id, created_at, updated_at)
     VALUES (:orgId, :modelInventoryId, :validationId, :title, :severity, :stage, :ownerId, NOW(), NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        modelInventoryId,
        validationId: options.validation_id ?? null,
        title: options.title ?? `Finding ${suffix}`,
        severity: options.severity ?? "medium",
        stage: options.stage ?? "open",
        ownerId: options.owner_id ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestMrmModelRoleOptions {
  role?: string;
}

export async function createTestMrmModelRole(
  orgId: number,
  modelInventoryId: number,
  userId: number,
  options: CreateTestMrmModelRoleOptions = {},
): Promise<number> {
  const [result] = await sequelize.query(
    `INSERT INTO mrm_model_roles (organization_id, model_inventory_id, role, user_id, created_at)
     VALUES (:orgId, :modelInventoryId, :role, :userId, NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        modelInventoryId,
        role: options.role ?? "owner",
        userId,
      },
    },
  );
  return (result as any[])[0].id;
}

// ---------------------------------------------------------------------------
// MRM Branch 2 (monitoring / ingestion) factories
// ---------------------------------------------------------------------------

export interface CreateTestMrmMetricKeyOptions {
  key?: string;
  display_name?: string;
}

export async function createTestMrmMetricKey(
  orgId: number,
  options: CreateTestMrmMetricKeyOptions = {},
): Promise<number> {
  const suffix = Date.now();
  const [result] = await sequelize.query(
    `INSERT INTO mrm_metric_keys (organization_id, key, display_name, created_at)
     VALUES (:orgId, :key, :displayName, NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        key: options.key ?? `metric_${suffix}`,
        displayName: options.display_name ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestMrmThresholdOptions {
  metric?: string;
  segment?: string | null;
  window?: string | null;
  op?: string;
  value_num?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  severity?: string;
  breach_action?: string;
  active?: boolean;
}

export async function createTestMrmThreshold(
  orgId: number,
  modelInventoryId: number,
  options: CreateTestMrmThresholdOptions = {},
): Promise<number> {
  const [result] = await sequelize.query(
    `INSERT INTO mrm_thresholds
       (organization_id, model_inventory_id, metric, segment, window, op,
        value_num, value_lo, value_hi, severity, breach_action, active, created_at, updated_at)
     VALUES (:orgId, :modelInventoryId, :metric, :segment, :window, :op,
             :valueNum, :valueLo, :valueHi, :severity, :breachAction, :active, NOW(), NOW())
     RETURNING id`,
    {
      replacements: {
        orgId,
        modelInventoryId,
        metric: options.metric ?? "psi",
        segment: options.segment ?? null,
        window: options.window ?? null,
        op: options.op ?? "gt",
        valueNum: options.value_num ?? 0.25,
        valueLo: options.value_lo ?? null,
        valueHi: options.value_hi ?? null,
        severity: options.severity ?? "high",
        breachAction: options.breach_action ?? "notify",
        active: options.active ?? true,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestMrmIngestionTokenOptions {
  name?: string;
  token_hash?: string;
  model_inventory_id?: number | null;
  created_by?: number | null;
  revoked_at?: string | null;
}

export async function createTestMrmIngestionToken(
  orgId: number,
  options: CreateTestMrmIngestionTokenOptions = {},
): Promise<number> {
  const suffix = Date.now();
  const [result] = await sequelize.query(
    `INSERT INTO mrm_ingestion_tokens
       (organization_id, name, token_hash, model_inventory_id, revoked_at, created_by, created_at)
     VALUES (:orgId, :name, :tokenHash, :modelInventoryId, :revokedAt, :createdBy, NOW())
     RETURNING id`,
    {
      replacements: {
        orgId,
        name: options.name ?? `token_${suffix}`,
        tokenHash: options.token_hash ?? `hash_${suffix}`,
        modelInventoryId: options.model_inventory_id ?? null,
        revokedAt: options.revoked_at ?? null,
        createdBy: options.created_by ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestMrmMetricOptions {
  metric?: string;
  value?: number;
  at?: string;
  window?: string | null;
  segment?: string;
  context?: Record<string, unknown>;
  ingestion_token_id?: number | null;
}

export async function createTestMrmMetric(
  orgId: number,
  modelInventoryId: number,
  options: CreateTestMrmMetricOptions = {},
): Promise<number> {
  const [result] = await sequelize.query(
    `INSERT INTO mrm_metrics
       (organization_id, model_inventory_id, metric, value, at, window, segment,
        context, ingestion_token_id, received_at, created_at)
     VALUES (:orgId, :modelInventoryId, :metric, :value, :at, :window, :segment,
             CAST(:context AS jsonb), :ingestionTokenId, NOW(), NOW())
     RETURNING id`,
    {
      replacements: {
        orgId,
        modelInventoryId,
        metric: options.metric ?? "psi",
        value: options.value ?? 0.28,
        at: options.at ?? "2026-07-02T00:00:00Z",
        window: options.window ?? null,
        segment: options.segment ?? "overall",
        context: JSON.stringify(options.context ?? {}),
        ingestionTokenId: options.ingestion_token_id ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestMrmMetricEvaluationOptions {
  threshold_id?: number | null;
  status?: string;
  threshold_snapshot?: Record<string, unknown> | null;
}

export async function createTestMrmMetricEvaluation(
  orgId: number,
  metricId: number,
  options: CreateTestMrmMetricEvaluationOptions = {},
): Promise<number> {
  const snapshot = options.threshold_snapshot ?? null;
  const [result] = await sequelize.query(
    `INSERT INTO mrm_metric_evaluations
       (organization_id, metric_id, threshold_id, status, threshold_snapshot, evaluated_at)
     VALUES (:orgId, :metricId, :thresholdId, :status,
             CASE WHEN :snapshot IS NULL THEN NULL ELSE CAST(:snapshot AS jsonb) END, NOW())
     RETURNING id`,
    {
      replacements: {
        orgId,
        metricId,
        thresholdId: options.threshold_id ?? null,
        status: options.status ?? "ok",
        snapshot: snapshot === null ? null : JSON.stringify(snapshot),
      },
    },
  );
  return (result as any[])[0].id;
}

// ---------------------------------------------------------------------------
// MRM Branch 3 (revalidation triggers) factories
// ---------------------------------------------------------------------------

export interface CreateTestMrmRevalidationEventOptions {
  trigger_source?: string;
  reason?: string | null;
  resulting_validation_id?: number | null;
  created_validation?: boolean;
  source_ref?: Record<string, unknown> | null;
}

export async function createTestMrmRevalidationEvent(
  orgId: number,
  modelInventoryId: number,
  options: CreateTestMrmRevalidationEventOptions = {},
): Promise<number> {
  const sourceRef = options.source_ref ?? null;
  const [result] = await sequelize.query(
    `INSERT INTO mrm_revalidation_events
       (organization_id, model_inventory_id, trigger_source, reason,
        resulting_validation_id, created_validation, source_ref, fired_at, created_at)
     VALUES (:orgId, :modelInventoryId, :triggerSource, :reason,
             :resultingValidationId, :createdValidation,
             CASE WHEN :sourceRef IS NULL THEN NULL ELSE CAST(:sourceRef AS jsonb) END, NOW(), NOW())
     RETURNING id`,
    {
      replacements: {
        orgId,
        modelInventoryId,
        triggerSource: options.trigger_source ?? "breach",
        reason: options.reason ?? null,
        resultingValidationId: options.resulting_validation_id ?? null,
        createdValidation: options.created_validation ?? false,
        sourceRef: sourceRef === null ? null : JSON.stringify(sourceRef),
      },
    },
  );
  return (result as any[])[0].id;
}
