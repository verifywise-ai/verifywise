// Integration suites share one Postgres instance; see deadline-summary.test.ts.
jest.setTimeout(60000);

import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import {
  dayOffset,
  homeQueueContext,
  seedIncident,
  seedMrmFinding,
  seedPolicy,
  seedRisk,
  seedVendor,
} from "../factories/home-queue.factory";
import { incidentsSource } from "../../services/homeQueue/sources/incidents.source";
import { mrmFindingsSource } from "../../services/homeQueue/sources/mrmFindings.source";
import { policyReviewsSource } from "../../services/homeQueue/sources/policyReviews.source";
import { risksSource } from "../../services/homeQueue/sources/risks.source";
import { vendorReviewsSource } from "../../services/homeQueue/sources/vendorReviews.source";
import type {
  HomeQueueContext,
  HomeQueueItem,
  HomeQueueSource,
} from "../../domain.layer/interfaces/i.homeQueue";

/** Runs a source and returns its items keyed by name, so a test names what it expects. */
const run = async (source: HomeQueueSource, ctx: HomeQueueContext) => {
  const items = await source.load(ctx);
  const byName = new Map<string, HomeQueueItem>(items.map((i) => [i.name, i]));
  return { names: [...byName.keys()].sort(), byName };
};

describe("Home queue ownership sources against a real database", () => {
  let orgId: number;
  let me: number;
  let other: number;
  let ctx: HomeQueueContext;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    me = await createTestUser(orgId, 3, "hq-me@test.com", "HomeQueue1!");
    other = await createTestUser(orgId, 3, "hq-other@test.com", "HomeQueue1!");
    ctx = homeQueueContext(orgId, me);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("risks", () => {
    it("includes unstarted, requires-review, NULL-status and overdue risks I own", async () => {
      await seedRisk(orgId, { name: "not started", ownerId: me, mitigationStatus: "Not Started" });
      await seedRisk(orgId, {
        name: "requires review",
        ownerId: me,
        mitigationStatus: "Requires review",
      });
      await seedRisk(orgId, { name: "null status", ownerId: me, mitigationStatus: null });
      await seedRisk(orgId, {
        name: "overdue in progress",
        ownerId: me,
        mitigationStatus: "In Progress",
        deadline: dayOffset(-1),
      });
      await seedRisk(orgId, {
        name: "in progress on track",
        ownerId: me,
        mitigationStatus: "In Progress",
        deadline: dayOffset(5),
      });

      const { names, byName } = await run(risksSource, ctx);

      expect(names).toEqual([
        "not started",
        "null status",
        "overdue in progress",
        "requires review",
      ]);
      expect(byName.get("null status")?.meta.mitigationStatus).toBe("Not Started");
      expect(byName.get("overdue in progress")).toMatchObject({
        overdue: true,
        dueDate: dayOffset(-1),
      });
      expect(byName.get("not started")?.overdue).toBe(false);
    });

    it("excludes finished, deleted and other owners' risks", async () => {
      await seedRisk(orgId, {
        name: "completed past deadline",
        ownerId: me,
        mitigationStatus: "Completed",
        deadline: dayOffset(-3),
      });
      await seedRisk(orgId, {
        name: "canceled past deadline",
        ownerId: me,
        mitigationStatus: "Canceled",
        deadline: dayOffset(-3),
      });
      await seedRisk(orgId, {
        name: "deleted",
        ownerId: me,
        mitigationStatus: "Not Started",
        deleted: true,
      });
      await seedRisk(orgId, {
        name: "someone else's",
        ownerId: other,
        mitigationStatus: "Not Started",
      });

      expect((await run(risksSource, ctx)).names).toEqual([]);
    });
  });

  describe("policy reviews", () => {
    it("includes policies I own or review inside the window, today + 14 included", async () => {
      await seedPolicy(orgId, {
        title: "owned, due in 14",
        ownerId: me,
        nextReviewDate: dayOffset(14),
      });
      await seedPolicy(orgId, {
        title: "reviewing, due today",
        ownerId: other,
        reviewerIds: [me],
        nextReviewDate: dayOffset(0),
      });
      await seedPolicy(orgId, {
        title: "owned, overdue",
        ownerId: me,
        nextReviewDate: dayOffset(-1),
      });

      const { names, byName } = await run(policyReviewsSource, ctx);

      expect(names).toEqual(["owned, due in 14", "owned, overdue", "reviewing, due today"]);
      expect(byName.get("owned, overdue")?.overdue).toBe(true);
      expect(byName.get("owned, due in 14")).toMatchObject({
        overdue: false,
        dueDate: dayOffset(14),
      });
      expect(byName.get("reviewing, due today")?.overdue).toBe(false);
    });

    it("excludes policies due after the window, with no review date, or not mine", async () => {
      await seedPolicy(orgId, { title: "due in 15", ownerId: me, nextReviewDate: dayOffset(15) });
      await seedPolicy(orgId, { title: "no review date", ownerId: me, nextReviewDate: null });
      await seedPolicy(orgId, {
        title: "not mine",
        ownerId: other,
        reviewerIds: [other],
        nextReviewDate: dayOffset(1),
      });

      expect((await run(policyReviewsSource, ctx)).names).toEqual([]);
    });
  });

  describe("vendor reviews", () => {
    it("routes to the reviewer, or to the assignee when no reviewer is set", async () => {
      await seedVendor(orgId, {
        name: "I review",
        reviewerId: me,
        assigneeId: other,
        reviewDate: dayOffset(14),
      });
      await seedVendor(orgId, {
        name: "I am assignee, no reviewer",
        assigneeId: me,
        reviewDate: dayOffset(-2),
      });

      const { names, byName } = await run(vendorReviewsSource, ctx);

      expect(names).toEqual(["I am assignee, no reviewer", "I review"]);
      expect(byName.get("I am assignee, no reviewer")?.overdue).toBe(true);
      expect(byName.get("I review")?.overdue).toBe(false);
    });

    it("leaves an overdue Reviewed vendor out, keeps NULL and other statuses in", async () => {
      await seedVendor(orgId, {
        name: "reviewed overdue",
        reviewerId: me,
        reviewDate: dayOffset(-3),
        reviewStatus: "Reviewed",
      });
      await seedVendor(orgId, {
        name: "null status overdue",
        reviewerId: me,
        reviewDate: dayOffset(-3),
        reviewStatus: null,
      });
      await seedVendor(orgId, {
        name: "follow-up overdue",
        reviewerId: me,
        reviewDate: dayOffset(-3),
        reviewStatus: "Requires follow-up",
      });

      expect((await run(vendorReviewsSource, ctx)).names).toEqual([
        "follow-up overdue",
        "null status overdue",
      ]);
    });

    it("keeps a Reviewed vendor whose next review is today or later in the window", async () => {
      await seedVendor(orgId, {
        name: "reviewed, next in 5",
        reviewerId: me,
        reviewDate: dayOffset(5),
        reviewStatus: "Reviewed",
      });
      await seedVendor(orgId, {
        name: "reviewed, next today",
        reviewerId: me,
        reviewDate: dayOffset(0),
        reviewStatus: "Reviewed",
      });

      expect((await run(vendorReviewsSource, ctx)).names).toEqual([
        "reviewed, next in 5",
        "reviewed, next today",
      ]);
    });

    it("excludes an assignee when a reviewer is set, vendors past the window and other people's", async () => {
      await seedVendor(orgId, {
        name: "assignee, reviewer set",
        assigneeId: me,
        reviewerId: other,
        reviewDate: dayOffset(1),
      });
      await seedVendor(orgId, { name: "review in 15", reviewerId: me, reviewDate: dayOffset(15) });
      await seedVendor(orgId, { name: "no review date", reviewerId: me, reviewDate: null });
      await seedVendor(orgId, { name: "not mine", reviewerId: other, reviewDate: dayOffset(1) });

      expect((await run(vendorReviewsSource, ctx)).names).toEqual([]);
    });
  });

  describe("incidents", () => {
    it("includes my open incidents with their status and severity", async () => {
      const id = await seedIncident(orgId, {
        assigneeId: me,
        status: "Investigating",
        severity: "Serious",
      });

      const items = await incidentsSource.load(ctx);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        entityId: id,
        overdue: false,
        meta: { status: "Investigating", severity: "Serious" },
      });
    });

    it("excludes closed, archived and other assignees' incidents", async () => {
      await seedIncident(orgId, { assigneeId: me, status: "Closed" });
      await seedIncident(orgId, { assigneeId: me, archived: true });
      await seedIncident(orgId, { assigneeId: other });

      expect(await incidentsSource.load(ctx)).toEqual([]);
    });
  });

  describe("MRM findings", () => {
    it("includes my unresolved findings and flags overdue ones", async () => {
      await seedMrmFinding(orgId, {
        title: "open",
        ownerId: me,
        stage: "open",
        dueDate: dayOffset(3),
      });
      await seedMrmFinding(orgId, {
        title: "in progress, overdue",
        ownerId: me,
        stage: "in_progress",
        dueDate: dayOffset(-1),
      });
      await seedMrmFinding(orgId, {
        title: "planned, no due date",
        ownerId: me,
        stage: "remediation_planned",
      });

      const { names, byName } = await run(mrmFindingsSource, ctx);

      expect(names).toEqual(["in progress, overdue", "open", "planned, no due date"]);
      expect(byName.get("in progress, overdue")).toMatchObject({
        overdue: true,
        dueDate: dayOffset(-1),
      });
      expect(byName.get("open")?.overdue).toBe(false);
      expect(byName.get("planned, no due date")).toMatchObject({ overdue: false, dueDate: null });
    });

    it("excludes resolved, closed and other owners' findings", async () => {
      await seedMrmFinding(orgId, { title: "resolved", ownerId: me, stage: "resolved" });
      await seedMrmFinding(orgId, { title: "closed", ownerId: me, stage: "closed" });
      await seedMrmFinding(orgId, { title: "not mine", ownerId: other, stage: "open" });

      expect((await run(mrmFindingsSource, ctx)).names).toEqual([]);
    });
  });
});
