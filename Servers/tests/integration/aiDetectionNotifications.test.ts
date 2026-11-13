jest.setTimeout(60000);

/**
 * AI Detection scan notifier against a migrated database: the notifier's
 * queries, the new notification enum values and Automations triggers, the
 * notified_at claim, stale-scan announcements, and tenant isolation of the
 * previous-scan and recipient lookups.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import redisClient from "../../database/redis";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import * as producer from "../../services/automations/automationProducer";
import { notificationService } from "../../services/notificationService";
import {
  notifyAiDetectionScanFinished,
  notifyAiDetectionScanFailed,
} from "../../services/aiDetection/scanNotifications";
import {
  claimScanNotificationQuery,
  getCountedScanFindingsQuery,
  getPreviousCompletedScanQuery,
  getPreviousScanFindingsQuery,
  getScanRecipientsQuery,
} from "../../utils/aiDetectionNotification.utils";
import { getScanByIdQuery, markStaleScansFailed } from "../../utils/aiDetection.utils";

async function insertScan(
  orgId: number,
  triggeredBy: number,
  fields: {
    completedAt: string;
    grade?: string | null;
    status?: string;
    type?: string;
    error?: string;
  },
): Promise<number> {
  const rows = await sequelize.query<{ id: number }>(
    `INSERT INTO ai_detection_scans
       (organization_id, repository_url, repository_owner, repository_name, status, triggered_by,
        triggered_by_type, completed_at, findings_count, risk_score, risk_score_grade, error_message)
     VALUES (:orgId, 'https://github.com/acme/app', 'acme', 'app', :status, :triggeredBy,
        :type, :completedAt, 3, :score, :grade, :error)
     RETURNING id`,
    {
      replacements: {
        orgId,
        triggeredBy,
        status: fields.status ?? "completed",
        type: fields.type ?? "manual",
        completedAt: fields.completedAt,
        score: fields.grade ? 70 : null,
        grade: fields.grade ?? null,
        error: fields.error ?? null,
      },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0].id;
}

async function insertFinding(
  orgId: number,
  scanId: number,
  f: {
    name: string;
    type?: string;
    risk?: string;
    suppressed?: boolean;
    governance?: string | null;
    paths?: string[];
  },
): Promise<void> {
  await sequelize.query(
    `INSERT INTO ai_detection_findings
       (organization_id, scan_id, finding_type, name, provider, risk_level, confidence,
        suppressed, governance_status, file_count, file_paths)
     VALUES (:orgId, :scanId, :type, :name, 'OpenAI', :risk, 'high', :suppressed, :governance, 1,
        CAST(:filePaths AS jsonb))`,
    {
      replacements: {
        orgId,
        scanId,
        name: f.name,
        type: f.type ?? "library",
        risk: f.risk ?? "high",
        suppressed: f.suppressed ?? false,
        governance: f.governance ?? null,
        filePaths: JSON.stringify(
          (f.paths ?? ["src/app.ts"]).map((path) => ({
            path,
            line_number: 1,
            matched_text: "x",
          })),
        ),
      },
    },
  );
}

async function notifiedAt(orgId: number, scanId: number): Promise<Date | null> {
  const rows = await sequelize.query<{ notified_at: Date | null }>(
    `SELECT notified_at FROM ai_detection_scans WHERE id = :scanId AND organization_id = :orgId`,
    { replacements: { orgId, scanId }, type: QueryTypes.SELECT },
  );
  return rows[0]?.notified_at ?? null;
}

async function addAutomation(orgId: number, triggerKey: string): Promise<void> {
  await sequelize.query(
    `WITH a AS (
       INSERT INTO automations (organization_id, name, trigger_id, is_active)
       SELECT :orgId, 'Scan email', t.id, TRUE FROM automation_triggers t WHERE t.key = :triggerKey
       RETURNING id)
     INSERT INTO automation_actions_data (organization_id, automation_id, action_type_id, params, "order")
     SELECT :orgId, a.id, act.id,
            '{"to": ["a@b.co"], "subject": "{{scan.repository}} {{scan.grade}}", "body": "{{scan.new_high_risk_findings}}"}'::jsonb, 1
       FROM a, automation_actions act WHERE act.key = 'send_email'`,
    { replacements: { orgId, triggerKey } },
  );
}

async function notificationsFor(orgId: number, scanId: number) {
  return sequelize.query<{ user_id: number; type: string; title: string; action_url: string }>(
    `SELECT user_id, type::text AS type, title, action_url FROM notifications
      WHERE organization_id = :orgId AND entity_type = 'ai_detection_scan' AND entity_id = :scanId
      ORDER BY user_id, type`,
    { replacements: { orgId, scanId }, type: QueryTypes.SELECT },
  );
}

describe("AI Detection scan notifications (database)", () => {
  let orgA: number;
  let orgB: number;
  let adminA: number;
  let editorA: number;
  let adminB: number;
  let enqueue: jest.SpyInstance;
  let email: jest.SpyInstance;

  beforeEach(async () => {
    const suffix = Date.now();
    orgA = await createTestOrganization(`Scan org A ${suffix}`);
    orgB = await createTestOrganization(`Scan org B ${suffix}`);
    adminA = await createTestUser(orgA, 1, `scan-admin-a-${suffix}@test.com`, "Password123!");
    editorA = await createTestUser(orgA, 3, `scan-editor-a-${suffix}@test.com`, "Password123!");
    adminB = await createTestUser(orgB, 1, `scan-admin-b-${suffix}@test.com`, "Password123!");
    jest.spyOn(redisClient, "publish").mockResolvedValue(0 as any);
    email = jest.spyOn(notificationService, "sendEmailWithTemplate").mockResolvedValue();
    enqueue = jest.spyOn(producer, "enqueueAutomationAction").mockResolvedValue(undefined as any);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await cleanupDatabase();
  });

  it("seeds the three triggers, each linked to send_email", async () => {
    const rows = await sequelize.query<{ key: string; action: string }>(
      `SELECT t.key, a.key AS action FROM automation_triggers t
         JOIN automation_triggers_actions ta ON ta.trigger_id = t.id
         JOIN automation_actions a ON a.id = ta.action_id
        WHERE t.key LIKE 'ai_detection_%' ORDER BY t.key`,
      { type: QueryTypes.SELECT },
    );
    expect(rows).toEqual([
      { key: "ai_detection_high_risk_finding", action: "send_email" },
      { key: "ai_detection_scan_completed", action: "send_email" },
      { key: "ai_detection_scan_failed", action: "send_email" },
    ]);
  });

  it("finds the previous scan in the same organization only", async () => {
    await insertScan(orgB, adminB, { completedAt: "2026-11-11T12:00:00Z", grade: "A" });
    const first = await insertScan(orgA, editorA, {
      completedAt: "2026-11-10T12:00:00Z",
      grade: "B",
    });
    const second = await insertScan(orgA, editorA, {
      completedAt: "2026-11-12T12:00:00Z",
      grade: "D",
    });

    const secondScan = (await getScanByIdQuery(second, orgA))!;
    expect((await getPreviousCompletedScanQuery(secondScan, orgA))?.id).toBe(first);
    const firstScan = (await getScanByIdQuery(first, orgA))!;
    expect(await getPreviousCompletedScanQuery(firstScan, orgA)).toBeNull();
  });

  it("counts findings without suppressed or accepted ones", async () => {
    const scan = await insertScan(orgA, editorA, { completedAt: "2026-11-12T12:00:00Z" });
    await insertFinding(orgA, scan, { name: "kept" });
    await insertFinding(orgA, scan, { name: "rule", suppressed: true });
    await insertFinding(orgA, scan, { name: "accepted", governance: "accepted_risk" });
    await insertFinding(orgA, scan, { name: "hidden", governance: "suppressed" });

    const names = (await getCountedScanFindingsQuery(scan, orgA)).map((f) => f.name);
    expect(names).toEqual(["kept"]);
  });

  it("keeps reviewer decisions in the previous-scan baseline and lists secret paths", async () => {
    const scan = await insertScan(orgA, editorA, { completedAt: "2026-11-12T12:00:00Z" });
    await insertFinding(orgA, scan, { name: "accepted", governance: "accepted_risk" });
    await insertFinding(orgA, scan, { name: "rule", suppressed: true });
    await insertFinding(orgA, scan, {
      name: "AWS key",
      type: "secret",
      paths: [".env", "deploy/prod.env", ".env"],
    });

    const baseline = await getPreviousScanFindingsQuery(scan, orgA);
    expect(baseline.map((f) => f.name).sort()).toEqual(["AWS key", "accepted", "rule"]);
    const awsKey = baseline.find((f) => f.name === "AWS key")!;
    expect([...awsKey.secret_paths!].sort()).toEqual([".env", "deploy/prod.env"]);
    expect(baseline.find((f) => f.name === "accepted")!.secret_paths).toBeNull();
    // Another organization's scan id returns nothing.
    expect(await getPreviousScanFindingsQuery(scan, orgB)).toEqual([]);
  });

  it("does not report a finding accepted on the previous scan as new", async () => {
    const first = await insertScan(orgA, editorA, {
      completedAt: "2026-11-10T12:00:00Z",
      grade: "B",
    });
    await insertFinding(orgA, first, { name: "eval", governance: "accepted_risk" });
    const second = await insertScan(orgA, editorA, {
      completedAt: "2026-11-12T12:00:00Z",
      grade: "B",
    });
    await insertFinding(orgA, second, { name: "eval" });

    await notifyAiDetectionScanFinished(second, orgA);

    const rows = await notificationsFor(orgA, second);
    expect(rows.map((r) => r.type)).toEqual(["ai_detection_scan_completed"]);
    expect(email).not.toHaveBeenCalled();
  });

  it("claims a scan once, only in its own organization and with the expected status", async () => {
    const scan = await insertScan(orgA, editorA, { completedAt: "2026-11-12T12:00:00Z" });

    expect(await claimScanNotificationQuery(scan, orgB, "completed")).toBe(false);
    expect(await claimScanNotificationQuery(scan, orgA, "failed")).toBe(false);
    expect(await notifiedAt(orgA, scan)).toBeNull();

    const claims = await Promise.all([
      claimScanNotificationQuery(scan, orgA, "completed"),
      claimScanNotificationQuery(scan, orgA, "completed"),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await notifiedAt(orgA, scan)).not.toBeNull();
  });

  it("announces a scan the scheduler marks failed as stale", async () => {
    const rows = await sequelize.query<{ id: number }>(
      `INSERT INTO ai_detection_scans
         (organization_id, repository_url, repository_owner, repository_name, status, triggered_by,
          triggered_by_type, updated_at)
       VALUES (:orgId, 'https://github.com/acme/app', 'acme', 'app', 'scanning', :editorA,
          'scheduled', NOW() - INTERVAL '2 hours')
       RETURNING id`,
      { replacements: { orgId: orgA, editorA }, type: QueryTypes.SELECT },
    );
    const stale = rows[0].id;

    const ids = await markStaleScansFailed(orgA, 30);
    expect(ids).toEqual([stale]);
    expect(await markStaleScansFailed(orgB, 30)).toEqual([]);

    await notifyAiDetectionScanFailed(stale, orgA);

    const notices = await notificationsFor(orgA, stale);
    expect(notices.map((r) => [r.user_id, r.type]).sort()).toEqual(
      [
        [adminA, "ai_detection_scan_failed"],
        [editorA, "ai_detection_scan_failed"],
      ].sort(),
    );
    expect(await notifiedAt(orgA, stale)).not.toBeNull();
  });

  it("resolves recipients to members of the organization only", async () => {
    const withEditor = await getScanRecipientsQuery(orgA, editorA);
    expect(withEditor.map((r) => [r.id, r.isTriggeredBy, r.isAdmin]).sort()).toEqual(
      [
        [adminA, false, true],
        [editorA, true, false],
      ].sort(),
    );
    // A user of another organization is never a recipient.
    const withOutsider = await getScanRecipientsQuery(orgA, adminB);
    expect(withOutsider.map((r) => r.id)).toEqual([adminA]);
  });

  it("stores the notices, emails the attention notice, fires the automations, and announces a scan once", async () => {
    const first = await insertScan(orgA, editorA, {
      completedAt: "2026-11-10T12:00:00Z",
      grade: "B",
    });
    await insertFinding(orgA, first, { name: "eval" });
    const second = await insertScan(orgA, editorA, {
      completedAt: "2026-11-12T12:00:00Z",
      grade: "D",
    });
    await insertFinding(orgA, second, { name: "eval" });
    await insertFinding(orgA, second, { name: "AWS key", type: "secret" });
    await addAutomation(orgA, "ai_detection_scan_completed");
    await addAutomation(orgA, "ai_detection_high_risk_finding");
    await addAutomation(orgB, "ai_detection_scan_completed");

    await notifyAiDetectionScanFinished(second, orgA);

    const rows = await notificationsFor(orgA, second);
    expect(rows.map((r) => [r.user_id, r.type]).sort()).toEqual(
      [
        [adminA, "ai_detection_scan_attention"],
        [editorA, "ai_detection_scan_attention"],
        [editorA, "ai_detection_scan_completed"],
      ].sort(),
    );
    expect(rows.every((r) => r.action_url === `/ai-detection/scans/${second}`)).toBe(true);
    expect(email).toHaveBeenCalledTimes(2);
    // orgA's two automations only; orgB's never runs.
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls.map(([, data]) => data.organizationId)).toEqual([orgA, orgA]);
    expect(enqueue.mock.calls.map(([, data]) => data.subject)).toEqual([
      "acme/app D",
      "acme/app D",
    ]);

    expect(await notifiedAt(orgA, second)).not.toBeNull();

    await notifyAiDetectionScanFinished(second, orgA);
    expect(await notificationsFor(orgA, second)).toHaveLength(3);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("emails a failed scheduled scan to the triggering user and admins", async () => {
    const scan = await insertScan(orgA, editorA, {
      completedAt: "2026-11-12T12:00:00Z",
      status: "failed",
      type: "scheduled",
      error: "Repository not found",
    });

    await notifyAiDetectionScanFailed(scan, orgA);

    const rows = await notificationsFor(orgA, scan);
    expect(rows.map((r) => [r.user_id, r.type]).sort()).toEqual(
      [
        [adminA, "ai_detection_scan_failed"],
        [editorA, "ai_detection_scan_failed"],
      ].sort(),
    );
    expect(email).toHaveBeenCalledTimes(2);
  });
});
