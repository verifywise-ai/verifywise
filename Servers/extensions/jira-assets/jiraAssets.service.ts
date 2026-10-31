import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { encryptText, decryptText } from "../../tools/createSecureValue";
import {
  JiraAssetsClient,
  JiraObject,
  JiraUpstreamError,
  MAX_PAGES,
  PAGE_SIZE,
  WORKER_SYNC_DEADLINE_MS,
} from "./jira.client";
import { transformAttributes } from "./jira.constants";
import { logStructured } from "../../utils/logger/fileLogger";
import { SQL_NOW_UTC } from "../scheduledSync.utils";
import { deleteProjectWithSideEffects } from "../../utils/projectDeletion.utils";
import { withClaim } from "../sync-engine/claim";
import {
  errorMessage,
  isUniqueViolation,
  RunSupersededError,
  SyncValidationError,
} from "../sync-engine/errors";
import { parseIntervalHours, saveSchedule } from "../sync-engine/schedule";
import { sqlLastFinishedRun } from "../sync-engine/sql";
import { legacyHighRiskRole, normalizeHighRiskRoles } from "../../utils/highRiskRoles.utils";
import { getRunStatus, listRuns, type RunListRow, type RunView } from "../sync-engine/status";
import { ABANDONED_RUN_MESSAGE, SKIPPED_RUN_MESSAGE } from "../sync-engine/types";
import type { Readiness, RunContext, RunResult, RunStatus } from "../sync-engine/types";

export { ABANDONED_RUN_MESSAGE, errorMessage, RunSupersededError, SKIPPED_RUN_MESSAGE };

const fileName = "jiraAssets.service.ts";

/**
 * DB-facing helpers for the jira-assets extension.
 *
 * Encryption note: the `api_token` submitted through /config is encrypted
 * with AES-256-CBC via `encryptText`/`decryptText` (see
 * Servers/tools/createSecureValue.ts). The `jira_assets_config` table
 * stores `api_token_encrypted` + `api_token_iv` for that pair. The
 * original plugin used base64 "encryption" — this port replaces it with
 * proper crypto to match the standard the slack_webhooks table already
 * uses in core.
 */

export interface JiraAssetsConfig {
  jira_base_url?: string;
  workspace_id?: string;
  email?: string;
  api_token?: string;
  deployment_type?: "cloud" | "datacenter";
  selected_schema_id?: string | null;
  selected_object_type_id?: string | null;
  sync_enabled?: boolean;
  sync_interval_hours?: number;
}

export interface JiraAssetsConfigRow {
  id: number;
  jira_base_url: string;
  workspace_id: string;
  email: string;
  deployment_type: string;
  selected_schema_id: string | null;
  selected_object_type_id: string | null;
  sync_enabled: boolean;
  sync_interval_hours: number;
  last_sync_at: Date | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
  has_api_token: boolean;
}

export const JIRA_ASSETS_KEY = "jira-assets";
/** Every exclusive Jira Assets operation runs under the engine claim as one of these kinds. */
export const JIRA_RUN_KINDS = ["manual", "scheduled", "import", "remove_missing"] as const;

/** `sync_interval_hours` when POST /config leaves it out. */
const DEFAULT_SYNC_INTERVAL_HOURS = 24;
/** A run heartbeats every this many objects, and after every fetched page. */
export const HEARTBEAT_EVERY_OBJECTS = 25;

/**
 * Machine-readable outcome codes the panel switches on (never on message
 * text): on 409 bodies for an interrupted import or removal, and on
 * `latest_run.code` in GET /sync/status.
 */
export const JIRA_RUN_CODES = {
  abandoned: "abandoned",
  skipped: "skipped",
  importInterrupted: "import_interrupted",
  removalInterrupted: "removal_interrupted",
} as const;

/** Most objects one import request may name; keeps the request well inside the client timeout. */
export const IMPORT_MAX_OBJECTS = 100;

export const JIRA_NOT_CONFIGURED_MESSAGE =
  "Jira Assets is not configured. Save the connection first.";
export const JIRA_SYNC_IN_PROGRESS_MESSAGE =
  "A Jira Assets sync is already running for this organization";

/** No Jira connection saved for the organization (404). */
export class JiraNotConfiguredError extends Error {
  constructor(message = JIRA_NOT_CONFIGURED_MESSAGE) {
    super(message);
    this.name = "JiraNotConfiguredError";
  }
}

/**
 * An import was stopped part-way because another run closed it as abandoned.
 * Objects imported before that stay imported; the controller returns 409.
 */
export class JiraImportInterruptedError extends Error {
  constructor(
    public readonly imported: number,
    public readonly skipped: number,
  ) {
    super(
      `The import was interrupted because another sync took over. ${imported} object(s) were imported before it stopped.`,
    );
    this.name = "JiraImportInterruptedError";
  }
}

/** No Jira Assets use case with that project id in the organization (404). */
export class JiraUseCaseNotFoundError extends Error {
  constructor() {
    super("Use case not found");
    this.name = "JiraUseCaseNotFoundError";
  }
}

/**
 * A use case's project was locked in this organization but could not be
 * deleted. The whole request rolls back; the controller returns 500 with this
 * message, which names the use case, so the panel can show it.
 */
export class JiraUseCaseDeleteFailedError extends Error {
  constructor(
    public readonly projectId: number,
    public readonly title: string | null,
    public readonly objectKey: string | null,
  ) {
    const name = title ? `"${title}"` : "A use case";
    const key = objectKey ? ` (${objectKey})` : "";
    super(`${name}${key} could not be deleted, so nothing was removed. Try again.`);
    this.name = "JiraUseCaseDeleteFailedError";
  }
}

/** The error for a locked project that failed to delete, named by the requested link's title and key. */
async function deleteFailedError(
  linkId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<JiraUseCaseDeleteFailedError> {
  const rows = (await sequelize.query(
    `SELECT p.project_title AS title, j.data->>'objectKey' AS object_key
       FROM jira_assets_use_cases j
  LEFT JOIN projects p ON p.id = j.project_id AND p.organization_id = :organizationId
      WHERE j.id = :linkId AND j.organization_id = :organizationId;`,
    { replacements: { linkId, organizationId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ title: string | null; object_key: string | null }>;
  return new JiraUseCaseDeleteFailedError(
    projectId,
    rows[0]?.title ?? null,
    rows[0]?.object_key ?? null,
  );
}

/** Thrown for bad input; the controller maps it to 400. */
export class JiraConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraConfigValidationError";
  }
}

/**
 * Validate `sync_interval_hours` from a request body. Missing → default (24).
 * Otherwise the engine's rule (whole hours from 1 to 168; numeric strings are
 * accepted because the old panel's select handed one back), reported as a
 * Jira validation error (400).
 */
export function parseSyncIntervalHours(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_SYNC_INTERVAL_HOURS;
  try {
    return parseIntervalHours(raw);
  } catch (err) {
    if (err instanceof SyncValidationError) throw new JiraConfigValidationError(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Config CRUD
// ---------------------------------------------------------------------------

export async function getPublicConfig(organizationId: number): Promise<JiraAssetsConfigRow | null> {
  // The schedule and the last-sync fields come from the sync engine. last_sync_*
  // is the newest finished manual or scheduled run that completed or failed;
  // abandoned and skipped runs never replace it, as before.
  const rows = (await sequelize.query(
    `SELECT c.id, c.jira_base_url, c.workspace_id, c.email, c.deployment_type,
            c.selected_schema_id, c.selected_object_type_id,
            COALESCE(s.enabled, FALSE) AS sync_enabled,
            COALESCE(s.interval_hours, :defaultInterval) AS sync_interval_hours,
            lf.completed_at AS last_sync_at,
            CASE lf.status WHEN 'completed' THEN 'success' WHEN 'failed' THEN 'failed' END
              AS last_sync_status,
            lf.message AS last_sync_message,
            CASE WHEN c.api_token_encrypted IS NOT NULL AND c.api_token_encrypted <> ''
                 THEN TRUE ELSE FALSE END AS has_api_token
       FROM jira_assets_config c
       LEFT JOIN extension_sync_settings s
         ON s.organization_id = c.organization_id AND s.extension_key = :key
       LEFT JOIN LATERAL (
         ${sqlLastFinishedRun(
           "c.organization_id",
           ":key",
           "'manual', 'scheduled'",
           "r.status, r.message, r.completed_at",
         )}
       ) lf ON TRUE
      WHERE c.organization_id = :organizationId
      LIMIT 1;`,
    {
      replacements: {
        organizationId,
        key: JIRA_ASSETS_KEY,
        defaultInterval: DEFAULT_SYNC_INTERVAL_HOURS,
      },
      type: QueryTypes.SELECT,
    },
  )) as JiraAssetsConfigRow[];
  return rows[0] ?? null;
}

/**
 * Load config + decrypt api_token in one shot. Used by every route handler
 * that needs to talk to JIRA. Returns null when no config row exists.
 */
export async function loadFullConfig(organizationId: number): Promise<JiraAssetsConfig | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM jira_assets_config WHERE organization_id = :organizationId LIMIT 1;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  const row = rows[0];
  if (!row) return null;
  let apiToken: string | undefined;
  if (row.api_token_encrypted && row.api_token_iv) {
    const result = decryptText({ value: row.api_token_encrypted, iv: row.api_token_iv });
    if (!result.success) {
      throw new Error(`Failed to decrypt jira_assets api token: ${result.error}`);
    }
    apiToken = result.data;
  }
  return {
    jira_base_url: row.jira_base_url,
    workspace_id: row.workspace_id,
    email: row.email,
    api_token: apiToken,
    deployment_type: row.deployment_type ?? "cloud",
    selected_schema_id: row.selected_schema_id,
    selected_object_type_id: row.selected_object_type_id,
  };
}

/**
 * Upsert config for the caller org. `api_token` in `body` is optional on
 * update — omit it to keep the previously-stored value (matches the
 * password-preservation semantics of the extensions registry).
 */
export async function saveConfig(
  organizationId: number,
  userId: number,
  body: JiraAssetsConfig,
): Promise<void> {
  const existing = (await sequelize.query(
    `SELECT id, api_token_encrypted FROM jira_assets_config
      WHERE organization_id = :organizationId LIMIT 1;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number; api_token_encrypted: string | null }>;
  const row = existing[0];
  const hasExistingToken = !!(row && row.api_token_encrypted);

  if (!body.jira_base_url) throw new JiraConfigValidationError("JIRA Base URL is required");
  if (!body.workspace_id) throw new JiraConfigValidationError("Workspace ID is required");
  if (!body.email) throw new JiraConfigValidationError("Email is required");
  if (!body.api_token && !hasExistingToken) {
    throw new JiraConfigValidationError("API Token is required");
  }
  if (body.sync_enabled !== undefined && typeof body.sync_enabled !== "boolean") {
    throw new JiraConfigValidationError("sync_enabled must be true or false");
  }
  const syncIntervalHours =
    body.sync_interval_hours === undefined
      ? undefined
      : parseSyncIntervalHours(body.sync_interval_hours);

  const commonReplacements = {
    organizationId,
    jiraBaseUrl: body.jira_base_url,
    workspaceId: body.workspace_id,
    email: body.email,
    deploymentType: body.deployment_type ?? "cloud",
    selectedSchemaId: body.selected_schema_id ?? null,
    selectedObjectTypeId: body.selected_object_type_id ?? null,
    userId,
  };

  // The connection and its schedule are saved together or not at all.
  await sequelize.transaction(async (transaction) => {
    if (row) {
      if (body.api_token) {
        const { value, iv } = encryptText(body.api_token);
        await sequelize.query(
          `UPDATE jira_assets_config
              SET jira_base_url = :jiraBaseUrl, workspace_id = :workspaceId, email = :email,
                  api_token_encrypted = :apiTokenEncrypted, api_token_iv = :apiTokenIv,
                  deployment_type = :deploymentType,
                  selected_schema_id = :selectedSchemaId,
                  selected_object_type_id = :selectedObjectTypeId,
                  updated_by = :userId, updated_at = NOW()
            WHERE id = :id AND organization_id = :organizationId;`,
          {
            replacements: {
              ...commonReplacements,
              apiTokenEncrypted: value,
              apiTokenIv: iv,
              id: row.id,
            },
            transaction,
          },
        );
      } else {
        await sequelize.query(
          `UPDATE jira_assets_config
              SET jira_base_url = :jiraBaseUrl, workspace_id = :workspaceId, email = :email,
                  deployment_type = :deploymentType,
                  selected_schema_id = :selectedSchemaId,
                  selected_object_type_id = :selectedObjectTypeId,
                  updated_by = :userId, updated_at = NOW()
            WHERE id = :id AND organization_id = :organizationId;`,
          { replacements: { ...commonReplacements, id: row.id }, transaction },
        );
      }
    } else {
      const { value, iv } = encryptText(body.api_token as string);
      await sequelize.query(
        `INSERT INTO jira_assets_config
           (organization_id, jira_base_url, workspace_id, email,
            api_token_encrypted, api_token_iv, deployment_type,
            selected_schema_id, selected_object_type_id,
            created_by)
         VALUES (:organizationId, :jiraBaseUrl, :workspaceId, :email,
                 :apiTokenEncrypted, :apiTokenIv, :deploymentType,
                 :selectedSchemaId, :selectedObjectTypeId,
                 :userId);`,
        {
          replacements: {
            ...commonReplacements,
            apiTokenEncrypted: value,
            apiTokenIv: iv,
          },
          transaction,
        },
      );
    }

    // The schedule lives in the sync engine. Each sync field the body carries is
    // saved; one it leaves out keeps its stored value (a new schedule starts off,
    // every 24 hours). The panel no longer sends them here.
    if (body.sync_enabled !== undefined || syncIntervalHours !== undefined) {
      await saveSchedule(
        JIRA_ASSETS_KEY,
        organizationId,
        { enabled: body.sync_enabled, intervalHours: syncIntervalHours },
        { userId, transaction },
      );
    }
  });
}

/**
 * PATCH /config/sync (deprecated): change only the automatic-sync settings,
 * now kept by the sync engine. At least one field; 404 when no connection is
 * saved yet. Answers in the old shape.
 */
export async function updateSyncSettings(
  organizationId: number,
  userId: number | null,
  body: { sync_enabled?: unknown; sync_interval_hours?: unknown },
): Promise<{ sync_enabled: boolean; sync_interval_hours: number }> {
  const hasEnabled = body?.sync_enabled !== undefined;
  const hasInterval = body?.sync_interval_hours !== undefined;
  if (!hasEnabled && !hasInterval) {
    throw new JiraConfigValidationError("Provide sync_enabled or sync_interval_hours");
  }
  if (hasEnabled && typeof body.sync_enabled !== "boolean") {
    throw new JiraConfigValidationError("sync_enabled must be true or false");
  }
  const interval = hasInterval ? parseSyncIntervalHours(body.sync_interval_hours) : undefined;
  throwIfNotReady(await jiraCanSchedule(organizationId));
  const saved = await saveSchedule(
    JIRA_ASSETS_KEY,
    organizationId,
    { enabled: hasEnabled ? (body.sync_enabled as boolean) : undefined, intervalHours: interval },
    { userId },
  );
  return { sync_enabled: saved.enabled, sync_interval_hours: saved.interval_hours };
}

const JIRA_ID_PATTERN = /^[A-Za-z0-9:_-]{1,100}$/;

function parseSelectionId(raw: unknown, field: string): string | null {
  if (raw === null || raw === "") return null;
  const value = typeof raw === "number" ? String(raw) : raw;
  if (typeof value !== "string" || !JIRA_ID_PATTERN.test(value)) {
    throw new JiraConfigValidationError(`${field} must be a Jira id or empty`);
  }
  return value;
}

/**
 * Change only the selected schema and/or object type. A field left out of
 * the body is kept; null or "" clears it. Nothing else in the config is
 * touched.
 */
export async function updateSelection(
  organizationId: number,
  userId: number,
  body: { selected_schema_id?: unknown; selected_object_type_id?: unknown },
): Promise<{ selected_schema_id: string | null; selected_object_type_id: string | null }> {
  const setSchema = body?.selected_schema_id !== undefined;
  const setObjectType = body?.selected_object_type_id !== undefined;
  if (!setSchema && !setObjectType) {
    throw new JiraConfigValidationError("Provide selected_schema_id or selected_object_type_id");
  }
  const schemaId = setSchema
    ? parseSelectionId(body.selected_schema_id, "selected_schema_id")
    : null;
  const objectTypeId = setObjectType
    ? parseSelectionId(body.selected_object_type_id, "selected_object_type_id")
    : null;

  const [rows] = (await sequelize.query(
    `UPDATE jira_assets_config
        SET selected_schema_id = CASE WHEN :setSchema THEN :schemaId ELSE selected_schema_id END,
            selected_object_type_id =
              CASE WHEN :setObjectType THEN :objectTypeId ELSE selected_object_type_id END,
            updated_by = :userId, updated_at = NOW()
      WHERE organization_id = :organizationId
      RETURNING selected_schema_id, selected_object_type_id;`,
    {
      replacements: {
        setSchema,
        schemaId,
        setObjectType,
        objectTypeId,
        userId,
        organizationId,
      },
    },
  )) as unknown as [
    Array<{ selected_schema_id: string | null; selected_object_type_id: string | null }>,
    unknown,
  ];
  if (!rows || rows.length === 0) throw new JiraNotConfiguredError();
  return rows[0];
}

// ---------------------------------------------------------------------------
// Client builder
// ---------------------------------------------------------------------------

export function clientFromConfig(config: JiraAssetsConfig): JiraAssetsClient {
  if (!config.jira_base_url || !config.workspace_id || !config.email || !config.api_token) {
    throw new JiraNotConfiguredError("Jira connection is not fully configured");
  }
  return new JiraAssetsClient(
    config.jira_base_url,
    config.workspace_id,
    config.email,
    config.api_token,
    config.deployment_type ?? "cloud",
  );
}

// ---------------------------------------------------------------------------
// Readiness (sync engine)
// ---------------------------------------------------------------------------

const NOT_CONFIGURED: Readiness = {
  ready: false,
  status: 404,
  reason: JIRA_NOT_CONFIGURED_MESSAGE,
};

/**
 * Whether a run of `kind` can start for the org (the provider's readiness):
 * - manual: a config (404) and a selected object type (400); existing use
 *   cases are not needed, because the first manual sync creates them;
 * - scheduled: a config, an object type and at least one use case; the tick
 *   records and logs nothing for an org that is not ready;
 * - import: a config (404);
 * - remove_missing: always (removal and single delete check no config).
 */
export async function jiraReadiness(organizationId: number, kind: string): Promise<Readiness> {
  if (kind === "remove_missing") return { ready: true };
  if (kind === "scheduled") {
    const rows = (await sequelize.query(
      `SELECT (c.selected_object_type_id IS NOT NULL AND c.selected_object_type_id <> '')
                AS has_object_type,
              EXISTS (SELECT 1 FROM jira_assets_use_cases u
                       WHERE u.organization_id = c.organization_id) AS has_use_cases
         FROM jira_assets_config c
        WHERE c.organization_id = :organizationId
        LIMIT 1;`,
      { replacements: { organizationId }, type: QueryTypes.SELECT },
    )) as Array<{ has_object_type: boolean; has_use_cases: boolean }>;
    const row = rows[0];
    if (!row) return NOT_CONFIGURED;
    if (!row.has_object_type) {
      return { ready: false, status: 400, reason: "No object type selected for sync" };
    }
    if (!row.has_use_cases) {
      return { ready: false, status: 400, reason: "No imported use cases to refresh" };
    }
    return { ready: true };
  }
  const config = await getPublicConfig(organizationId);
  if (!config) return NOT_CONFIGURED;
  if (kind === "manual" && !config.selected_object_type_id) {
    return { ready: false, status: 400, reason: "Select an object type before syncing" };
  }
  return { ready: true };
}

/** Schedule changes need a saved connection (404 otherwise), as PATCH /config/sync always did. */
export async function jiraCanSchedule(organizationId: number): Promise<Readiness> {
  return (await getPublicConfig(organizationId)) ? { ready: true } : NOT_CONFIGURED;
}

export function throwIfNotReady(readiness: Readiness): void {
  if (readiness.ready) return;
  if (readiness.status === 404) throw new JiraNotConfiguredError(readiness.reason);
  throw new JiraConfigValidationError(readiness.reason);
}

// ---------------------------------------------------------------------------
// Shared sync building blocks
// ---------------------------------------------------------------------------

async function nextUcId(organizationId: number, transaction?: Transaction): Promise<string> {
  const rows = (await sequelize.query(
    `SELECT nextval('verifywise.jira_use_case_uc_id_seq') AS seq;`,
    { type: QueryTypes.SELECT, transaction },
  )) as Array<{ seq: string }>;
  return `UC-J${organizationId}-${rows[0].seq}`;
}

interface DescribedObject {
  jiraObjectId: string;
  name: string;
  goal: string;
  data: Record<string, unknown>;
}

function describeObject(
  jiraObj: JiraObject,
  attrIdToName: Record<string, string>,
): DescribedObject {
  const transformedAttrs = transformAttributes(jiraObj.attributes || [], attrIdToName);
  const name = jiraObj.label || transformedAttrs["Name"] || `JIRA-${jiraObj.objectKey}`;
  const description =
    transformedAttrs["Description / Purpose"] || transformedAttrs["Description"] || "";
  return {
    jiraObjectId: String(jiraObj.id),
    name,
    goal: description || "Imported from JIRA Assets",
    data: {
      id: jiraObj.id,
      objectKey: jiraObj.objectKey,
      label: jiraObj.label,
      objectType: jiraObj.objectType,
      attributes: transformedAttrs,
      created: jiraObj.created,
      updated: jiraObj.updated,
    },
  };
}

/**
 * Create the native project and its jira_assets_use_cases link in one
 * transaction, so a failure can't leave a project without a link (or the
 * reverse). The transaction first proves the run still owns its claim
 * (`assertOwned`, which throws RunSupersededError otherwise). Returns "exists" if the object is already
 * linked (unique violation on organization_id + jira_object_id) instead of
 * throwing.
 */
async function createLinkedUseCase(
  assertOwned: (transaction: Transaction) => Promise<void>,
  organizationId: number,
  ownerId: number | null,
  obj: DescribedObject,
  now: Date,
): Promise<"created" | "exists"> {
  try {
    await sequelize.transaction(async (transaction) => {
      await assertOwned(transaction);
      const ucId = await nextUcId(organizationId, transaction);
      const projectRows = (await sequelize.query(
        `INSERT INTO projects
           (organization_id, uc_id, project_title, owner, start_date, goal,
            geography, last_updated, created_at, _source, is_organizational)
         VALUES (:organizationId, :ucId, :title, :owner, :now, :goal,
                 1, :now, :now, 'jira-assets', FALSE)
         RETURNING id;`,
        {
          replacements: {
            organizationId,
            ucId,
            title: obj.name,
            owner: ownerId ?? null,
            goal: obj.goal,
            now,
          },
          type: QueryTypes.INSERT,
          transaction,
        },
      )) as unknown as [Array<{ id: number }>, number];
      const projectId = (projectRows[0] as any)[0].id;

      await sequelize.query(
        `INSERT INTO jira_assets_use_cases
           (organization_id, jira_object_id, project_id, data, last_synced_at, sync_status)
         VALUES (:organizationId, :jiraObjectId, :projectId, CAST(:data AS JSONB), :now, 'synced');`,
        {
          replacements: {
            organizationId,
            jiraObjectId: obj.jiraObjectId,
            projectId,
            data: JSON.stringify(obj.data),
            now,
          },
          transaction,
        },
      );
    });
    return "created";
  } catch (err) {
    if (isUniqueViolation(err)) return "exists";
    throw err;
  }
}

const MISSING_IDS_IN_NOTE = 20;

function idList(ids: string[]): string {
  const shown = ids.slice(0, MISSING_IDS_IN_NOTE).join(", ");
  const more =
    ids.length > MISSING_IDS_IN_NOTE ? ` and ${ids.length - MISSING_IDS_IN_NOTE} more` : "";
  return `${shown}${more}`;
}

// ---------------------------------------------------------------------------
// Import selected objects (creates native projects + JIRA link rows)
// ---------------------------------------------------------------------------

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors?: string[];
  /** Ids of the objects in `errors`, so the panel can keep them selected for a retry. */
  failed_ids?: string[];
}

/**
 * Import the selected objects. Takes the same engine claim as syncs (kind
 * 'import'), so an import and a sync never overlap. The outcome is recorded on
 * the import's run only; imports never count as a sync for the schedule.
 */
export async function importObjects(
  organizationId: number,
  userId: number,
  objectIds: string[],
): Promise<ImportResult> {
  if (!Array.isArray(objectIds) || objectIds.length === 0) {
    throw new JiraConfigValidationError("No objects selected for import");
  }
  if (objectIds.length > IMPORT_MAX_OBJECTS) {
    throw new JiraConfigValidationError(
      `Select up to ${IMPORT_MAX_OBJECTS} objects per import. ${objectIds.length} were selected.`,
    );
  }
  throwIfNotReady(await jiraReadiness(organizationId, "import"));

  let imported = 0;
  let skipped = 0;
  try {
    return await withClaim(JIRA_ASSETS_KEY, organizationId, "import", userId, async (ctx) => {
      const errors: string[] = [];
      const failedIds: string[] = [];
      const config = await loadFullConfig(organizationId);
      if (!config) throw new JiraNotConfiguredError();
      const client = clientFromConfig(config);

      // ID→name mapping so JIRA attribute IDs resolve to human names.
      const attrIdToName: Record<string, string> = {};
      if (config.selected_object_type_id) {
        const defs = await client.getAttributes(config.selected_object_type_id);
        for (const attr of defs) attrIdToName[attr.id] = attr.name;
      }

      const now = new Date();
      for (const [index, objectId] of objectIds.entries()) {
        try {
          const existing = (await sequelize.query(
            `SELECT id FROM jira_assets_use_cases
              WHERE jira_object_id = :objectId AND organization_id = :organizationId;`,
            {
              replacements: { objectId: String(objectId), organizationId },
              type: QueryTypes.SELECT,
            },
          )) as Array<{ id: number }>;
          if (existing.length > 0) {
            skipped++;
          } else {
            const jiraObj = await client.getObjectById(objectId);
            const outcome = await createLinkedUseCase(
              (t) => ctx.assertOwned(t),
              organizationId,
              userId ?? null,
              describeObject(jiraObj, attrIdToName),
              now,
            );
            if (outcome === "created") imported++;
            else skipped++;
          }
        } catch (err) {
          // Lost the claim: stop now rather than record it as one failed object.
          if (err instanceof RunSupersededError) throw err;
          errors.push(`Failed to import ${objectId}: ${errorMessage(err)}`);
          failedIds.push(String(objectId));
        }
        // Skipped objects count too, so a run of already-linked ones still heartbeats.
        if ((index + 1) % HEARTBEAT_EVERY_OBJECTS === 0) {
          await ctx.heartbeat();
        }
      }

      return {
        value: {
          success: true,
          imported,
          skipped,
          errors: errors.length > 0 ? errors : undefined,
          failed_ids: failedIds.length > 0 ? failedIds : undefined,
        },
        result: {
          counts: { fetched: objectIds.length, created: imported, updated: 0, deleted: 0 },
          message: errors.length > 0 ? `${errors.length} object(s) failed to import` : null,
        },
      };
    });
  } catch (err) {
    if (err instanceof RunSupersededError) {
      // Another claim closed this import as abandoned. Report how far it got.
      throw new JiraImportInterruptedError(imported, skipped);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Removing use cases flagged as missing in Jira (explicit, admin only)
// ---------------------------------------------------------------------------

/**
 * Most projects (use cases) one removal request may delete. The cost of a
 * removal is one full project deletion per project, inside one transaction
 * that holds the run's row lock, so this is what keeps the request short. Same
 * number as the import limit.
 */
export const REMOVE_MISSING_MAX_PROJECTS = IMPORT_MAX_OBJECTS;

/**
 * Most link ids one removal request may name. Higher than the project limit
 * because every link of a project must be sent together (a removal deletes a
 * project only when all its links are selected) and a project can have many
 * links; the panel sends at most 100 links per request unless one project has
 * more, which then goes alone.
 */
export const REMOVE_MISSING_MAX_IDS = 1000;

/**
 * A request covering exactly one use case is exempt from REMOVE_MISSING_MAX_IDS
 * (all links of one use case must be sent together), bounded instead by the
 * most objects a sync can walk (MAX_PAGES × PAGE_SIZE = 25,000).
 */
export const REMOVE_MISSING_SINGLE_USE_CASE_MAX_IDS = MAX_PAGES * PAGE_SIZE;

/**
 * The size rule for one removal request: at most REMOVE_MISSING_MAX_PROJECTS
 * use cases, and at most REMOVE_MISSING_MAX_IDS ids unless they all belong to
 * one use case. Checked before claiming and again under the locks.
 */
function checkRemovalSize(idCount: number, projectCount: number): void {
  if (projectCount > REMOVE_MISSING_MAX_PROJECTS) {
    throw new JiraConfigValidationError(
      `A removal may cover at most ${REMOVE_MISSING_MAX_PROJECTS} use cases; these ids cover ${projectCount}`,
    );
  }
  if (idCount > REMOVE_MISSING_MAX_IDS && projectCount > 1) {
    throw new JiraConfigValidationError(
      `A removal may name at most ${REMOVE_MISSING_MAX_IDS} ids unless they all belong to one use case`,
    );
  }
}

/**
 * Delete the use cases an admin chose from the "Missing in Jira" list. Only
 * ids that belong to the org AND are still flagged are removed — one that a
 * sync found again in the meantime is skipped. Takes the same per-org claim
 * as syncs and imports (history row 'remove_missing', objects_deleted = the
 * number of use cases removed), so it cannot race a sync. At most
 * REMOVE_MISSING_MAX_PROJECTS distinct projects per request (checked before
 * claiming). The work is deleteUseCasesUnderClaim.
 */
export async function removeMissingUseCases(
  organizationId: number,
  userId: number,
  useCaseIds: unknown,
): Promise<{
  removed: number;
  links_removed: number;
  unlinked: number;
  skipped: number;
  skipped_items: Array<{ id: number; reason: RemovalSkipReason }>;
}> {
  if (
    !Array.isArray(useCaseIds) ||
    useCaseIds.length === 0 ||
    useCaseIds.length > REMOVE_MISSING_SINGLE_USE_CASE_MAX_IDS ||
    !useCaseIds.every((id) => Number.isInteger(id) && id > 0)
  ) {
    throw new JiraConfigValidationError(
      `use_case_ids must be a list of 1 to ${REMOVE_MISSING_MAX_IDS} use case ids (up to ${REMOVE_MISSING_SINGLE_USE_CASE_MAX_IDS} for one use case)`,
    );
  }
  const ids = Array.from(new Set(useCaseIds as number[]));
  // Cheap unlocked pre-check before claiming; checked again under the locks.
  const [{ projects }] = (await sequelize.query(
    `SELECT COUNT(DISTINCT project_id)::int AS projects FROM jira_assets_use_cases
      WHERE organization_id = :organizationId AND id IN (:ids);`,
    { replacements: { organizationId, ids }, type: QueryTypes.SELECT },
  )) as Array<{ projects: number }>;
  checkRemovalSize(ids.length, projects);
  const outcome = await deleteUseCasesUnderClaim(organizationId, userId, {
    by: "id",
    ids,
    onlyMissing: true,
    requireAll: false,
  });
  return {
    removed: outcome.removedProjectIds.length,
    links_removed: outcome.linksRemoved,
    unlinked: outcome.unlinkedIds.length,
    skipped: outcome.skipped.length,
    skipped_items: outcome.skipped,
  };
}

/**
 * Why a requested use case was not removed:
 * - no_longer_missing: a sync found it in Jira again (it leaves the list);
 * - not_found: there is no such use case any more (it leaves the list);
 * - changed: its link now points at another project, changed during the
 *   request (still flagged; try again);
 * - has_live_links: its project also backs a link that is not flagged missing
 *   (an object Jira still returns), so deleting the project would remove a
 *   live use case;
 * - other_links_not_selected: its project also backs flagged links that were
 *   not in this request; a removal deletes a project only when every link of
 *   it was selected, so nothing the admin did not tick goes by cascade.
 */
export const REMOVAL_SKIP_REASONS = [
  "no_longer_missing",
  "not_found",
  "changed",
  "has_live_links",
  "other_links_not_selected",
] as const;
/** Mirrored by the panel (Clients/.../jira-assets/batching.ts); documented in swagger and extensions.md. */
export type RemovalSkipReason = (typeof REMOVAL_SKIP_REASONS)[number];

interface DeletionOutcome {
  /** Projects (use cases) deleted. */
  removedProjectIds: number[];
  /** Link rows that went with those projects (cascade), selected or not. */
  linksRemoved: number;
  /** Caller ids whose link alone was deleted (no project in this organization). */
  unlinkedIds: number[];
  skipped: Array<{ id: number; reason: RemovalSkipReason }>;
}

type LinkRow = { id: number; project_id: number | null; missing_in_jira_since: Date | null };

/**
 * The one flow that deletes imported use cases (missing-use-case removal and
 * DELETE /use-cases/:id). Takes the per-org claim ('remove_missing'), then in
 * one transaction:
 *
 * 1. share-locks the run's own history row (no other claim can close it
 *    mid-way);
 * 2. reads the requested links unlocked, for their project ids;
 * 3. locks those projects (and, for a single delete, the requested project
 *    itself) in this organization in one statement, ordered by id; what it
 *    locks is what is in this organization;
 * 4. locks the requested links, then every link of a locked project (two
 *    queries, each ordered by id), and decides each request from those
 *    locked rows.
 *
 * Lock order: a project row before anything that references it. Every path
 * deletes a project through deleteProjectWithSideEffects (lock, approval
 * withdrawal, change history, delete — in that order); the core "Delete use
 * case" lets it take the lock as the first statement of its transaction, and
 * this flow takes the project locks itself before any link row and passes
 * alreadyLocked. Every path takes the project lock first.
 *
 * A requested link whose project is in this organization deletes that
 * project (once) through deleteProjectWithSideEffects; every link of it goes
 * with it (cascade). For a removal (`onlyMissing`), a project is deleted only
 * when every link of it was requested and flagged: one that also backs a link
 * that is not flagged is skipped (`has_live_links`), and one with flagged
 * links that were not requested is skipped (`other_links_not_selected`), so
 * nothing the admin did not tick is removed by cascade. The panel sends all
 * links of one project in the same request. A single delete is an explicit
 * action on the project and deletes it with all its links (reported in
 * linksRemoved). A link with no project, or whose project is not in this
 * organization, has only its link row deleted (unlinked): no project, no
 * change history, no automation. Since migration
 * 20261012165625-jira-assets-link-same-org-fk the database enforces
 * same-organization links (composite FK; the migration backed up and deleted
 * existing cross-organization links), so in practice this path only handles a
 * NULL project_id. The cross-organization branches here are unreachable now
 * and are kept only until that migration's rollback window has passed (its
 * down() drops the composite FK); remove them after that. A project that is locked here but fails to
 * delete throws JiraUseCaseDeleteFailedError, naming the use case by its
 * title and Jira key, and everything rolls back.
 *
 * With `requireAll` (single delete), nothing handled is
 * JiraUseCaseNotFoundError: the transaction rolls back and the claim is
 * released (it never did anything). Other errors close the run as failed; a
 * lost claim (RunSupersededError) writes nothing more. The run records
 * counts.deleted = projects (use cases) deleted, finalized inside the data
 * transaction, so a lost claim rolls the deletes back.
 */
async function deleteUseCasesUnderClaim(
  organizationId: number,
  userId: number,
  target: { by: "id" | "project_id"; ids: number[]; onlyMissing: boolean; requireAll: boolean },
): Promise<DeletionOutcome> {
  const matchColumn = target.by === "id" ? "id" : "project_id";
  return withClaim(
    JIRA_ASSETS_KEY,
    organizationId,
    "remove_missing",
    userId,
    async (ctx) => {
      const outcome: DeletionOutcome = {
        removedProjectIds: [],
        linksRemoved: 0,
        unlinkedIds: [],
        skipped: [],
      };
      await sequelize.transaction(async (transaction) => {
        await ctx.assertOwned(transaction);

        // 2. The requested links, unlocked: only to learn their project ids.
        const candidates = (await sequelize.query(
          `SELECT id, project_id FROM jira_assets_use_cases
          WHERE organization_id = :organizationId AND ${matchColumn} IN (:ids);`,
          {
            replacements: { organizationId, ids: target.ids },
            type: QueryTypes.SELECT,
            transaction,
          },
        )) as Array<{ id: number; project_id: number | null }>;

        // 3. Lock and classify the projects first.
        const toLock = new Set<number>(target.by === "project_id" ? target.ids : []);
        for (const c of candidates) if (c.project_id !== null) toLock.add(c.project_id);
        const inOrg = new Set<number>();
        if (toLock.size > 0) {
          const locked = (await sequelize.query(
            `SELECT id FROM projects
            WHERE organization_id = :organizationId AND id IN (:projectIds)
            ORDER BY id
            FOR UPDATE;`,
            {
              replacements: { organizationId, projectIds: [...toLock] },
              type: QueryTypes.SELECT,
              transaction,
            },
          )) as Array<{ id: number }>;
          for (const p of locked) inOrg.add(p.id);
        }

        // 4. Then the links, each query ordered by id: the requested ones, and
        //    every link of a locked project (to see whether the project backs a
        //    use case that is not missing).
        const requestedLinks = (await sequelize.query(
          `SELECT id, project_id, missing_in_jira_since FROM jira_assets_use_cases
          WHERE organization_id = :organizationId AND ${matchColumn} IN (:ids)
          ORDER BY id
          FOR UPDATE;`,
          {
            replacements: { organizationId, ids: target.ids },
            type: QueryTypes.SELECT,
            transaction,
          },
        )) as LinkRow[];
        if (target.onlyMissing) {
          // The size rule again, on the locked rows (the pre-check was unlocked).
          const lockedProjects = new Set(
            requestedLinks.map((l) => l.project_id).filter((id) => id !== null),
          );
          checkRemovalSize(target.ids.length, lockedProjects.size);
        }
        const projectLinks =
          inOrg.size === 0
            ? []
            : ((await sequelize.query(
                `SELECT id, project_id, missing_in_jira_since FROM jira_assets_use_cases
                WHERE organization_id = :organizationId AND project_id IN (:lockedProjects)
                ORDER BY id
                FOR UPDATE;`,
                {
                  replacements: { organizationId, lockedProjects: [...inOrg] },
                  type: QueryTypes.SELECT,
                  transaction,
                },
              )) as LinkRow[]);
        const linkById = new Map<number, LinkRow>();
        for (const link of [...requestedLinks, ...projectLinks]) linkById.set(link.id, link);
        const links = [...linkById.values()].sort((a, b) => a.id - b.id);

        const linksByProject = new Map<number, LinkRow[]>();
        for (const link of links) {
          if (link.project_id === null || !inOrg.has(link.project_id)) continue;
          const group = linksByProject.get(link.project_id);
          if (group) group.push(link);
          else linksByProject.set(link.project_id, [link]);
        }

        // Decide each requested link once, carrying its caller id.
        // project id -> the caller ids and link ids requested for it
        const accepted = new Map<number, { callerIds: number[]; linkIds: number[] }>();
        const toUnlink: Array<{ id: number; callerId: number }> = [];
        const seen = new Set<number>();
        for (const link of requestedLinks) {
          const callerId = target.by === "id" ? link.id : (link.project_id as number);
          seen.add(callerId);
          if (target.onlyMissing && !link.missing_in_jira_since) {
            outcome.skipped.push({ id: callerId, reason: "no_longer_missing" });
          } else if (link.project_id !== null && inOrg.has(link.project_id)) {
            const group = accepted.get(link.project_id);
            if (group) {
              group.callerIds.push(callerId);
              group.linkIds.push(link.id);
            } else {
              accepted.set(link.project_id, { callerIds: [callerId], linkIds: [link.id] });
            }
          } else if (link.project_id === null || toLock.has(link.project_id)) {
            toUnlink.push({ id: link.id, callerId });
          } else {
            // Its project changed after step 2; locking it now would break the
            // lock order.
            outcome.skipped.push({ id: callerId, reason: "changed" });
          }
        }
        for (const id of target.ids) {
          if (!seen.has(id) && !(target.by === "project_id" && accepted.has(id))) {
            outcome.skipped.push({ id, reason: "not_found" });
          }
        }

        // No savepoint per project: a savepoint's afterCommit hooks fire when
        // it is released, not when this transaction commits.
        for (const [projectId, { callerIds, linkIds }] of [...accepted].sort(([a], [b]) => a - b)) {
          const ofProject = linksByProject.get(projectId) ?? [];
          if (target.onlyMissing) {
            // A removal deletes a project only when every link of it was
            // requested, so nothing the admin did not tick goes by cascade.
            const requestedLinks = new Set(linkIds);
            const reason: RemovalSkipReason | null = ofProject.some((l) => !l.missing_in_jira_since)
              ? "has_live_links"
              : ofProject.some((l) => !requestedLinks.has(l.id))
                ? "other_links_not_selected"
                : null;
            if (reason) {
              for (const id of callerIds) outcome.skipped.push({ id, reason });
              continue;
            }
          }
          // Same order as the core delete; the project is already locked.
          const { deleted } = await deleteProjectWithSideEffects(
            projectId,
            organizationId,
            transaction,
            { userId, alreadyLocked: true, enqueueAutomationAfterCommit: true },
          );
          if (!deleted) {
            throw await deleteFailedError(linkIds[0], projectId, organizationId, transaction);
          }
          outcome.removedProjectIds.push(projectId);
          outcome.linksRemoved += ofProject.length;
        }

        if (toUnlink.length > 0) {
          const [deleted] = (await sequelize.query(
            `DELETE FROM jira_assets_use_cases
            WHERE organization_id = :organizationId AND id IN (:linkIds)
            RETURNING id;`,
            { replacements: { organizationId, linkIds: toUnlink.map((l) => l.id) }, transaction },
          )) as unknown as [Array<{ id: number }>, unknown];
          const gone = new Set((deleted ?? []).map((r) => r.id));
          for (const link of toUnlink)
            if (gone.has(link.id)) outcome.unlinkedIds.push(link.callerId);
        }

        if (
          target.requireAll &&
          outcome.removedProjectIds.length === 0 &&
          outcome.unlinkedIds.length === 0
        ) {
          throw new JiraUseCaseNotFoundError();
        }
        // Recorded in the same transaction: if this run lost its claim, the
        // deletes roll back with it.
        await ctx.finalize(
          {
            counts: {
              fetched: 0,
              created: 0,
              updated: 0,
              deleted: outcome.removedProjectIds.length,
            },
            message:
              outcome.unlinkedIds.length > 0
                ? `${outcome.unlinkedIds.length} link(s) with no project in this organization were cleaned up.`
                : null,
          },
          transaction,
        );
      });
      return { value: outcome };
    },
    {
      // Nothing was done: the claim is released, not recorded as a failed run.
      releaseOn: (err) =>
        err instanceof JiraUseCaseNotFoundError || err instanceof JiraConfigValidationError,
    },
  );
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/**
 * The Jira Assets run body: the provider's `run` for a manual or scheduled run
 * the engine has already claimed. Syncs never delete anything.
 *
 * - **Scheduled** (`ctx.kind = "scheduled"`) is refresh-only: it updates
 *   projects and links that already exist and creates nothing.
 * - **Manual** also creates use cases for new objects of the selected type,
 *   owned by the user who started it (`ctx.triggeredBy`).
 *
 * Both flag linked objects Jira no longer returns: `missing_in_jira_since` is
 * set (keeping the earliest date), but only when the walk was complete and
 * returned at least one object. An incomplete or empty walk sets no flags.
 * Every object Jira returns has its flag cleared, complete walk or not.
 * Admins remove flagged use cases explicitly (removeMissingUseCases).
 *
 * The engine records the outcome: it finalizes the returned counts and note,
 * and a thrown error (missing config, token decrypt, client construction, Jira
 * and network errors, the walk deadline `ctx.signal`) closes the run as
 * failed. Every write is guarded by the run's claim; once it is lost the run
 * stops with RunSupersededError and writes nothing more.
 */
export async function runJiraSync(ctx: RunContext): Promise<RunResult> {
  const organizationId = ctx.orgId;
  const refreshOnly = ctx.kind === "scheduled";

  const config = await loadFullConfig(organizationId);
  if (!config) throw new JiraNotConfiguredError();
  const objectTypeId = config.selected_object_type_id;
  if (!objectTypeId) throw new JiraConfigValidationError("No object type selected for sync");
  const client = clientFromConfig(config);

  const fetched = await client.getAllObjects(objectTypeId, {
    deadline: ctx.signal,
    onPage: () => ctx.heartbeat(),
  });
  if (fetched.stoppedReason === "deadline") {
    throw new JiraUpstreamError(
      `Jira did not return every object within ${WORKER_SYNC_DEADLINE_MS / 60000} minutes, so nothing was changed`,
    );
  }
  const { objects: jiraObjects, complete } = fetched;
  const objectsFetched = jiraObjects.length;

  const existingRows = (await sequelize.query(
    `SELECT jira_object_id, project_id, data->'objectType'->>'id' AS object_type_id
       FROM jira_assets_use_cases
      WHERE organization_id = :organizationId;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as Array<{
    jira_object_id: string;
    project_id: number | null;
    object_type_id: string | null;
  }>;
  const existingMap = new Map(existingRows.map((r) => [r.jira_object_id, r]));

  let objectsCreated = 0;
  let objectsUpdated = 0;
  const now = new Date();

  for (const [index, jiraObj] of jiraObjects.entries()) {
    const obj = describeObject(jiraObj, (jiraObj as any)._attrIdToName || {});
    const existing = existingMap.get(obj.jiraObjectId);

    if (!existing) {
      if (!refreshOnly) {
        const outcome = await createLinkedUseCase(
          (t) => ctx.assertOwned(t),
          organizationId,
          ctx.triggeredBy,
          obj,
          now,
        );
        if (outcome === "created") objectsCreated++;
      }
    } else {
      // One statement: the link update (clearing any missing flag) and the
      // project update run only while this run owns its claim. sqlOwnsRun
      // share-locks the run's row, so a claim closing it must wait for this
      // statement; nothing lands after the run lost its claim. `owned`
      // reports the same check.
      const [outcome] = (await sequelize.query(
        `WITH link AS (
           UPDATE jira_assets_use_cases
              SET data = CAST(:data AS JSONB),
                  last_synced_at = :now,
                  sync_status = 'synced',
                  missing_in_jira_since = NULL,
                  updated_at = NOW()
            WHERE jira_object_id = :jiraObjectId AND organization_id = :organizationId
              AND ${ctx.sqlOwnsRun()}
            RETURNING project_id
         ), proj AS (
           UPDATE projects p
              SET project_title = :title, goal = :goal, last_updated = :now
             FROM link
            WHERE p.id = link.project_id AND p.organization_id = :organizationId
         )
         -- proj is a data-modifying CTE: it runs even though nothing reads it.
         -- A link whose project row is gone has nothing to update; it
         -- cannot happen in practice (the link cascades with its project).
         SELECT ${ctx.sqlOwnsRun()} AS owned,
                (SELECT COUNT(*) FROM link)::int AS links;`,
        {
          replacements: {
            data: JSON.stringify(obj.data),
            now,
            title: obj.name,
            goal: obj.goal,
            jiraObjectId: obj.jiraObjectId,
            organizationId,
          },
          type: QueryTypes.SELECT,
        },
      )) as Array<{ owned: boolean; links: number }>;
      if (!outcome || !outcome.owned) throw new RunSupersededError(ctx.runId);
      // Owned but no link row: it was deleted since the walk began; skip it.
      if (outcome.links > 0) objectsUpdated++;
    }
    existingMap.delete(obj.jiraObjectId);
    if ((index + 1) % HEARTBEAT_EVERY_OBJECTS === 0) {
      await ctx.heartbeat();
    }
  }

  // Whatever is left in existingMap was not returned by Jira. Only links
  // imported from the object type just walked can be judged missing; links
  // from another or an unknown type are left exactly as they are.
  const missingIds = Array.from(existingMap.values())
    .filter((r) => r.object_type_id !== null && r.object_type_id === String(objectTypeId))
    .map((r) => r.jira_object_id);
  const otherTypeCount = existingMap.size - missingIds.length;
  let objectsNewlyMissing = 0;
  let note: string | null = null;
  const otherTypeNote =
    otherTypeCount > 0
      ? ` ${otherTypeCount} use case(s) from another or an unknown object type were left as they were.`
      : "";
  if (missingIds.length === 0 && otherTypeCount > 0) {
    note = otherTypeNote.trim();
  } else if (missingIds.length > 0) {
    if (complete && objectsFetched > 0) {
      await ctx.heartbeat();
      // Same type only (checked again in SQL), still unflagged, and only
      // while this run owns its claim.
      const [flagged] = (await sequelize.query(
        `UPDATE jira_assets_use_cases
            SET missing_in_jira_since = ${SQL_NOW_UTC}, updated_at = NOW()
          WHERE organization_id = :organizationId
            AND jira_object_id IN (:missingIds)
            AND data->'objectType'->>'id' = :objectTypeId
            AND missing_in_jira_since IS NULL
            AND ${ctx.sqlOwnsRun()}
          RETURNING id;`,
        {
          replacements: {
            organizationId,
            missingIds,
            objectTypeId: String(objectTypeId),
          },
        },
      )) as unknown as [Array<{ id: number }>, unknown];
      objectsNewlyMissing = flagged?.length ?? 0;
      note = `${missingIds.length} use case(s) not found in Jira are flagged as missing (nothing was removed): ${idList(missingIds)}.${otherTypeNote}`;
    } else {
      const why =
        objectsFetched === 0
          ? "Jira returned no objects for the selected object type"
          : "Jira did not confirm it returned every object";
      note = `${why}, so ${missingIds.length} use case(s) not seen this time were not flagged as missing: ${idList(missingIds)}.${otherTypeNote}`;
    }
    logStructured("processing", `Jira Assets run ${ctx.runId}: ${note}`, "runJiraSync", fileName);
  }

  return {
    counts: {
      fetched: objectsFetched,
      created: objectsCreated,
      updated: objectsUpdated,
      deleted: 0,
      missing: missingIds.length,
      newly_missing: objectsNewlyMissing,
    },
    message: note,
  };
}

// ---------------------------------------------------------------------------
// Use-case reads / delete
// ---------------------------------------------------------------------------

export async function listUseCases(organizationId: number): Promise<any[]> {
  return (await sequelize.query(
    `SELECT j.*, p.uc_id, p.project_title AS name
       FROM jira_assets_use_cases j
  LEFT JOIN projects p ON j.project_id = p.id AND p.organization_id = :organizationId
      WHERE j.organization_id = :organizationId
      ORDER BY j.created_at DESC;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];
}

export async function getUseCaseByProjectId(
  projectId: number,
  organizationId: number,
): Promise<any | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM jira_assets_use_cases
      WHERE project_id = :projectId AND organization_id = :organizationId;`,
    { replacements: { projectId, organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  const uc = rows[0];
  if (!uc) return null;
  const data = typeof uc.data === "string" ? JSON.parse(uc.data) : uc.data;

  const projects = (await sequelize.query(
    `SELECT * FROM projects WHERE id = :projectId AND organization_id = :organizationId;`,
    { replacements: { projectId, organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  const nativeProject = projects[0] || {};

  const frameworks = (await sequelize.query(
    `SELECT pf.id, pf.framework_id, pf.id AS project_framework_id
       FROM projects_frameworks pf
      WHERE pf.project_id = :projectId AND pf.organization_id = :organizationId;`,
    { replacements: { projectId, organizationId }, type: QueryTypes.SELECT },
  )) as any[];

  return {
    id: uc.project_id,
    uc_id: nativeProject.uc_id ?? uc.uc_id,
    project_title: nativeProject.project_title ?? data?.label ?? data?.attributes?.Name ?? uc.uc_id,
    owner: nativeProject.owner ?? null,
    members: [],
    start_date: nativeProject.start_date ?? data?.created ?? uc.created_at,
    ai_risk_classification: nativeProject.ai_risk_classification ?? null,
    high_risk_roles: normalizeHighRiskRoles(nativeProject.high_risk_roles),
    // Deprecated single role, kept for existing Jira Assets mappings.
    type_of_high_risk_role: legacyHighRiskRole(nativeProject.high_risk_roles),
    goal: nativeProject.goal ?? data?.attributes?.Description ?? data?.attributes?.Purpose ?? "",
    last_updated: nativeProject.last_updated ?? data?.updated ?? uc.updated_at,
    last_updated_by: nativeProject.last_updated_by ?? null,
    is_organizational: nativeProject.is_organizational ?? false,
    framework: frameworks,
    monitored_regulations_and_standards: [],
    _source: "jira-assets",
    _jira_use_case_id: uc.id,
    _jira_data: data,
    _sync_status: uc.sync_status,
    _missing_in_jira_since: uc.missing_in_jira_since ?? null,
  };
}

/**
 * DELETE /use-cases/:id — delete one imported use case (a project linked in
 * jira_assets_use_cases) the same way as the core "Delete use case", through
 * the same claimed flow as removals (deleteUseCasesUnderClaim). This is an
 * explicit action on the project: it is deleted with all its links, and
 * `links_removed` reports how many went. A link whose project is not in this
 * organization has only its link row deleted (`unlinked: true`); no project
 * is touched (the database now enforces same-organization links, so this
 * branch is unreachable and kept only for that migration's rollback window). A project id with no link is JiraUseCaseNotFoundError (404) and
 * no run is recorded: rejected before claiming, or, if the link vanished in
 * the meantime, rolled back with the claimed history row released. The
 * requested project itself is locked, so a link that changed between the
 * unlocked read and the lock is still found. 409 while a sync, import or
 * removal runs.
 */
export async function deleteUseCaseByProjectId(
  projectId: number,
  organizationId: number,
  userId: number,
): Promise<{ unlinked: boolean; links_removed: number }> {
  // Cheap unlocked check first, so a request for a project that is not a
  // Jira Assets use case is 404 at once and never takes (or waits on) the
  // per-org claim. The flow below checks again under the claim, locked.
  const linked = (await sequelize.query(
    `SELECT id FROM jira_assets_use_cases
      WHERE project_id = :projectId AND organization_id = :organizationId LIMIT 1;`,
    { replacements: { projectId, organizationId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  if (linked.length === 0) throw new JiraUseCaseNotFoundError();

  const outcome = await deleteUseCasesUnderClaim(organizationId, userId, {
    by: "project_id",
    ids: [projectId],
    onlyMissing: false,
    requireAll: true,
  });
  return { unlinked: outcome.unlinkedIds.length > 0, links_removed: outcome.linksRemoved };
}

// ---------------------------------------------------------------------------
// Sync status + history: the old response shapes, served by the sync engine
// ---------------------------------------------------------------------------

/** One row of the old GET /sync/history (`SELECT *` on jira_assets_sync_history). */
export interface LegacySyncHistoryRow {
  id: number;
  organization_id: number;
  sync_type: string;
  status: "started" | "completed" | "failed";
  objects_fetched: number;
  objects_created: number;
  objects_updated: number;
  objects_deleted: number;
  error_message: string | null;
  started_at: Date;
  completed_at: Date | null;
  triggered_by: number | null;
  heartbeat_at: Date | null;
  /** Always null: the token is the engine's ownership secret. */
  run_token: null;
}

/** `latest_run` of the old GET /sync/status. */
export interface LegacyLatestRun {
  id: number;
  sync_type: string;
  status: "started" | "completed" | "failed";
  objects_fetched: number;
  objects_created: number;
  objects_updated: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  is_live: boolean;
  code: "abandoned" | "skipped" | null;
}

export interface LegacySyncStatus {
  last_sync_at: Date | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
  sync_enabled: boolean;
  sync_interval_hours: number;
  running: boolean;
  latest_run: LegacyLatestRun | null;
}

/** Abandoned and skipped runs were `failed` history rows. */
function legacyStatus(status: RunStatus): "started" | "completed" | "failed" {
  return status === "started" || status === "completed" ? status : "failed";
}

function legacyCode(status: RunStatus): "abandoned" | "skipped" | null {
  if (status === "abandoned") return JIRA_RUN_CODES.abandoned;
  if (status === "skipped") return JIRA_RUN_CODES.skipped;
  return null;
}

function countOf(counts: Record<string, number> | null | undefined, name: string): number {
  const value = counts?.[name];
  return typeof value === "number" ? value : 0;
}

export function toLegacyLatestRun(run: RunView): LegacyLatestRun {
  return {
    id: run.id,
    sync_type: run.kind,
    status: legacyStatus(run.status),
    objects_fetched: countOf(run.counts, "fetched"),
    objects_created: countOf(run.counts, "created"),
    objects_updated: countOf(run.counts, "updated"),
    error_message: run.message,
    started_at: run.started_at,
    completed_at: run.completed_at,
    is_live: run.is_live,
    code: legacyCode(run.status),
  };
}

export function toLegacyHistoryRow(run: RunListRow, organizationId: number): LegacySyncHistoryRow {
  return {
    id: run.id,
    organization_id: organizationId,
    sync_type: run.kind,
    status: legacyStatus(run.status),
    objects_fetched: countOf(run.counts, "fetched"),
    objects_created: countOf(run.counts, "created"),
    objects_updated: countOf(run.counts, "updated"),
    objects_deleted: countOf(run.counts, "deleted"),
    error_message: run.message,
    started_at: run.started_at,
    completed_at: run.completed_at,
    triggered_by: run.triggered_by,
    heartbeat_at: run.heartbeat_at,
    run_token: null,
  };
}

/**
 * GET /sync/status (deprecated) in its old shape: last_sync_* and the schedule
 * (as GET /config derives them), `running`, and the newest manual or scheduled
 * run (`latest_run`, `code` "abandoned" or "skipped"). Null when Jira is not
 * configured. The controller adds `queued`.
 */
export async function getSyncStatus(organizationId: number): Promise<LegacySyncStatus | null> {
  const config = await getPublicConfig(organizationId);
  if (!config) return null;
  const status = await getRunStatus(JIRA_ASSETS_KEY, organizationId);
  return {
    last_sync_at: config.last_sync_at,
    last_sync_status: config.last_sync_status,
    last_sync_message: config.last_sync_message,
    sync_enabled: config.sync_enabled,
    sync_interval_hours: config.sync_interval_hours,
    running: status.running,
    latest_run: status.latest_run ? toLegacyLatestRun(status.latest_run) : null,
  };
}

/** GET /sync/history (deprecated): every Jira Assets run, newest first, in the old row shape. */
export async function getSyncHistory(
  organizationId: number,
  limit: number,
): Promise<LegacySyncHistoryRow[]> {
  const runs = await listRuns(JIRA_ASSETS_KEY, organizationId, limit);
  return runs.map((run) => toLegacyHistoryRow(run, organizationId));
}

// ---------------------------------------------------------------------------
// Custom-frameworks progress (used by JIRA use-case Overview UI)
// ---------------------------------------------------------------------------

export async function getCustomFrameworksProgress(
  projectId: number,
  organizationId: number,
): Promise<Array<Record<string, unknown>>> {
  const tables = (await sequelize.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'verifywise' AND table_name = 'custom_frameworks' LIMIT 1;`,
    { type: QueryTypes.SELECT },
  )) as Array<{ table_name: string }>;
  if (tables.length === 0) return [];

  const frameworks = (await sequelize.query(
    `SELECT cf.id, cf.name, cf.plugin_key, cf.hierarchy_type,
            cfp.id AS project_framework_id
       FROM custom_frameworks cf
       JOIN custom_framework_projects cfp
         ON cf.id = cfp.framework_id
        AND cfp.organization_id = :organizationId
      WHERE cfp.project_id = :projectId AND cf.organization_id = :organizationId
      ORDER BY cf.name;`,
    { replacements: { projectId, organizationId }, type: QueryTypes.SELECT },
  )) as Array<{
    id: number;
    name: string;
    plugin_key: string | null;
    hierarchy_type: string;
    project_framework_id: number;
  }>;

  const results: Array<Record<string, unknown>> = [];
  for (const fw of frameworks) {
    let total = 0;
    let completed = 0;
    try {
      if (fw.hierarchy_type === "three_level") {
        const stats = (await sequelize.query(
          `SELECT COUNT(*)::int AS total,
                  SUM(CASE WHEN l3.status = 'Implemented' THEN 1 ELSE 0 END)::int AS completed
             FROM custom_framework_level3_impl l3
             JOIN custom_framework_level2_impl l2
               ON l3.level2_impl_id = l2.id AND l2.organization_id = :organizationId
            WHERE l2.project_framework_id = :projectFrameworkId
              AND l3.organization_id = :organizationId;`,
          {
            replacements: {
              projectFrameworkId: fw.project_framework_id,
              organizationId,
            },
            type: QueryTypes.SELECT,
          },
        )) as Array<{ total: number; completed: number }>;
        total = stats[0]?.total ?? 0;
        completed = stats[0]?.completed ?? 0;
      } else {
        const stats = (await sequelize.query(
          `SELECT COUNT(*)::int AS total,
                  SUM(CASE WHEN status = 'Implemented' THEN 1 ELSE 0 END)::int AS completed
             FROM custom_framework_level2_impl
            WHERE project_framework_id = :projectFrameworkId
              AND organization_id = :organizationId;`,
          {
            replacements: {
              projectFrameworkId: fw.project_framework_id,
              organizationId,
            },
            type: QueryTypes.SELECT,
          },
        )) as Array<{ total: number; completed: number }>;
        total = stats[0]?.total ?? 0;
        completed = stats[0]?.completed ?? 0;
      }
    } catch (err: any) {
      // Progress query is best-effort — an oddly-shaped framework shouldn't
      // 500 the whole endpoint.
      console.error(`[jira-assets] progress query failed for '${fw.name}': ${err.message}`);
    }
    results.push({
      framework_id: fw.id,
      name: fw.name,
      plugin_key: fw.plugin_key,
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    });
  }
  return results;
}
