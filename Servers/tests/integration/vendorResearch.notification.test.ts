jest.setTimeout(60000);

// Mock only the Redis transport: the notifier under test is REAL, so this file proves that actual
// `notifications` rows are written and that the unique index suppresses a repeat. The integration
// setup module is deliberately NOT imported: it replaces the in-app notification service.
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
  REDIS_URL: "redis://localhost:6379/0",
}));

// The tests of the job at the end of this file load it with its real queries and its real notifier.
// Three of its collaborators are stood in for: the vendor lookup of the job loads the automation
// producer, which opens a BullMQ queue as soon as it is imported; the pipeline is replaced by a
// stand-in that completes the run in the table (see `completingPipeline`), because what is under
// test there is the notice that follows a run; and the model call is out of reach in any case.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../services/vendorResearch/pipeline", () => ({
  resolveOrgModel: jest.fn(),
  runVendorResearch: jest.fn(),
}));
jest.mock("../../advisor/llmSelfCorrect", () => ({ generateObjectWithSelfCorrection: jest.fn() }));

import { QueryTypes } from "sequelize";
import { cleanupDatabase, seedTwoOrgsAndUsers } from "./helpers";
import { sequelize } from "../../database/db";
import { createTestVendor } from "../factories";
import { notifyAssigneeOfVendorResearch } from "../../services/inAppNotification.service";
import { handleVendorResearchJob } from "../../services/vendorResearch/job";
import { runVendorResearch } from "../../services/vendorResearch/pipeline";
import {
  createRunQuery,
  finishRunQuery,
  getRunByIdQuery,
  markRunRunningQuery,
} from "../../utils/vendorResearch.utils";

afterEach(async () => {
  await cleanupDatabase();
});

interface NotificationRow {
  user_id: number;
  type: string;
  title: string;
  message: string;
  entity_type: string;
  entity_id: number;
  entity_name: string;
  action_url: string;
  is_read: boolean;
  metadata: { run_id: number; vendor_id: number; count: number };
}

const notificationRows = async (orgId: number): Promise<NotificationRow[]> =>
  (await sequelize.query(
    `SELECT user_id, type, title, message, entity_type, entity_id, entity_name, action_url,
            is_read, metadata
       FROM notifications
      WHERE organization_id = :orgId
      ORDER BY id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as NotificationRow[];

const savePreferredLanguage = (orgId: number, userId: number, language: string) =>
  sequelize.query(
    `INSERT INTO user_preferences (organization_id, user_id, language)
     VALUES (:orgId, :userId, :language)`,
    { replacements: { orgId, userId, language } },
  );

describe("notifyAssigneeOfVendorResearch", () => {
  it("stores one notice for the assignee that links to the findings of the vendor", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const vendor = await createTestVendor(seed.orgA, { vendor_name: "Acme Cloud" });

    const sent = await notifyAssigneeOfVendorResearch(
      seed.orgA,
      { id: vendor, name: "Acme Cloud", assignee: seed.userA },
      41,
      2,
    );

    expect(sent).toBe(true);
    const rows = await notificationRows(seed.orgA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: seed.userA,
      type: "vendor_research_findings",
      title: "Vendor research findings",
      entity_type: "vendor",
      entity_id: vendor,
      entity_name: "Acme Cloud",
      action_url: `/vendors/risks?findingsVendorId=${vendor}`,
      is_read: false,
      metadata: { run_id: 41, vendor_id: vendor, count: 2 },
    });
    expect(rows[0].message).toBe(
      '2 potential risks found for "Acme Cloud". Review them in Vendors > Risks.',
    );
  });

  it("words a single finding in the singular", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const vendor = await createTestVendor(seed.orgA, { vendor_name: "Acme Cloud" });

    await notifyAssigneeOfVendorResearch(
      seed.orgA,
      { id: vendor, name: "Acme Cloud", assignee: seed.userA },
      41,
      1,
    );

    const [row] = await notificationRows(seed.orgA);
    expect(row.message).toBe(
      '1 potential risk found for "Acme Cloud". Review it in Vendors > Risks.',
    );
  });

  it("stores one row for a run however often it is called, and tells the caller about the repeat", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const vendor = await createTestVendor(seed.orgA, { vendor_name: "Acme Cloud" });
    const target = { id: vendor, name: "Acme Cloud", assignee: seed.userA };

    expect(await notifyAssigneeOfVendorResearch(seed.orgA, target, 41, 2)).toBe(true);
    expect(await notifyAssigneeOfVendorResearch(seed.orgA, target, 41, 2)).toBe(false);
    expect(await notificationRows(seed.orgA)).toHaveLength(1);

    // The next run of the same vendor is news again.
    expect(await notifyAssigneeOfVendorResearch(seed.orgA, target, 42, 3)).toBe(true);
    expect(await notificationRows(seed.orgA)).toHaveLength(2);
  });

  it("sends nothing when the vendor has no assignee", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const vendor = await createTestVendor(seed.orgA, { vendor_name: "Acme Cloud" });

    const sent = await notifyAssigneeOfVendorResearch(
      seed.orgA,
      { id: vendor, name: "Acme Cloud", assignee: null },
      41,
      2,
    );

    expect(sent).toBe(false);
    expect(await notificationRows(seed.orgA)).toEqual([]);
  });

  it.each([
    ["de", "Ergebnisse der Anbieterrecherche"],
    ["fr", "Résultats de la recherche sur le fournisseur"],
  ])("words the notice in the language the assignee saved (%s)", async (language, title) => {
    const seed = await seedTwoOrgsAndUsers();
    const vendor = await createTestVendor(seed.orgA, { vendor_name: "Acme Cloud" });
    await savePreferredLanguage(seed.orgA, seed.userA, language);

    await notifyAssigneeOfVendorResearch(
      seed.orgA,
      { id: vendor, name: "Acme Cloud", assignee: seed.userA },
      41,
      3,
    );

    const [row] = await notificationRows(seed.orgA);
    expect(row.title).toBe(title);
    // The placeholders are filled in, not left in the text, and the text is not the English one.
    expect(row.message).toContain("Acme Cloud");
    expect(row.message).toContain("3");
    expect(row.message).not.toContain("{");
    expect(row.message).not.toContain("potential risks found");
  });
});

// The job tells the assignee of the vendor that an automatic run stored findings. Vendor writes do
// not check the assignee, so it can be a user of another organization, and the notice would then be
// stored under the vendor's organization for a user who never sees it (R30 stops the same thing for
// the action owner of an accepted finding).
describe("the notice of the research job", () => {
  /**
   * What the pipeline does to the table for a run that found something: it starts the run and
   * completes it. The findings themselves are not stored, since the notice only needs the count.
   */
  const completingPipeline = async (args: {
    organizationId: number;
    vendorId: number;
    runId: number;
  }) => {
    await markRunRunningQuery(args.organizationId, args.runId);
    await finishRunQuery({
      organizationId: args.organizationId,
      runId: args.runId,
      status: "completed",
      categories: [],
      categorySummary: [],
      evidence: null,
      model: "test-model",
      promptVersion: "test",
      searchesUsed: 0,
      pagesRead: 0,
      duplicatesDropped: 0,
      error: null,
      trace: null,
      coverage: null,
      registryVersion: null,
    });
    return { outcome: "completed" as const, findingsCreated: 2 };
  };

  // The job needs no search settings: the researcher it builds searches the web without a key.
  beforeEach(() => {
    (runVendorResearch as jest.Mock).mockReset().mockImplementation(completingPipeline);
  });

  /** A vendor of `orgId` assigned to `assignee`, and an automatic run of it that is queued. */
  const seedQueuedRun = async (orgId: number, assignee: number) => {
    const vendorId = await createTestVendor(orgId, { vendor_name: "Acme Cloud" });
    await sequelize.query("UPDATE vendors SET assignee = :assignee WHERE id = :vendorId", {
      replacements: { assignee, vendorId },
    });
    const run = await createRunQuery({
      organizationId: orgId,
      vendorId,
      triggerType: "auto",
      requestedBy: null,
    });
    return { vendorId, runId: run.id };
  };

  const notificationCount = async (): Promise<number> => {
    const [row] = (await sequelize.query("SELECT COUNT(*)::int AS count FROM notifications", {
      type: QueryTypes.SELECT,
    })) as Array<{ count: number }>;
    return row.count;
  };

  it("writes the notice for an assignee who is a user of the vendor's organization", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const { vendorId, runId } = await seedQueuedRun(seed.orgA, seed.userA);

    await handleVendorResearchJob({ organizationId: seed.orgA, vendorId, runId });

    expect((await getRunByIdQuery(seed.orgA, runId))?.status).toBe("completed");
    const rows = await notificationRows(seed.orgA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: seed.userA,
      type: "vendor_research_findings",
      entity_id: vendorId,
      entity_name: "Acme Cloud",
      metadata: { run_id: runId, vendor_id: vendorId, count: 2 },
    });
  });

  it("writes no notice for an assignee who is a user of another organization, and the run stays completed", async () => {
    const seed = await seedTwoOrgsAndUsers();
    // The same vendor, run and pipeline as above; only the assignee belongs to the other organization.
    const { vendorId, runId } = await seedQueuedRun(seed.orgA, seed.userB);

    await expect(
      handleVendorResearchJob({ organizationId: seed.orgA, vendorId, runId }),
    ).resolves.toBeUndefined();

    expect(runVendorResearch).toHaveBeenCalledTimes(1);
    expect(await getRunByIdQuery(seed.orgA, runId)).toMatchObject({
      status: "completed",
      error: null,
    });
    // No row for the vendor's organization, none for the foreign user's, none anywhere.
    expect(await notificationRows(seed.orgA)).toEqual([]);
    expect(await notificationRows(seed.orgB)).toEqual([]);
    expect(await notificationCount()).toBe(0);
  });
});
