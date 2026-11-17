jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../../database/db";
import { addDays } from "../sources/dateOnly";
import { incidentsSource, INCIDENTS_SQL } from "../sources/incidents.source";
import { mrmFindingsSource, MRM_FINDINGS_SQL } from "../sources/mrmFindings.source";
import { policyReviewsSource, POLICY_REVIEWS_SQL } from "../sources/policyReviews.source";
import { risksSource, RISKS_SQL } from "../sources/risks.source";
import { vendorReviewsSource, VENDOR_REVIEWS_SQL } from "../sources/vendorReviews.source";
import type { HomeQueueContext } from "../../../domain.layer/interfaces/i.homeQueue";

const query = sequelize.query as unknown as jest.Mock;

const ctx: HomeQueueContext = {
  organizationId: 7,
  userId: 5,
  can: () => false,
  isAdmin: false,
  today: "2026-11-14",
};

const created = new Date("2026-11-01T10:00:00.000Z");

beforeEach(() => query.mockReset());

describe("addDays", () => {
  it("adds days in UTC across month and year ends", () => {
    expect(addDays("2026-11-14", 14)).toBe("2026-11-28");
    expect(addDays("2026-11-14", 15)).toBe("2026-11-29");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
  });
});

describe("risksSource", () => {
  const row = (
    id: number,
    mitigation_status: string,
    deadline: string | null,
    level: string | null = "High risk",
  ) => ({
    id,
    risk_name: `Risk ${id}`,
    risk_level: level,
    mitigation_status,
    deadline,
    created_at: created,
  });

  it("is a visible Track source", () => {
    expect(risksSource.id).toBe("risks");
    expect(risksSource.part).toBe("track");
    expect(risksSource.isVisible(ctx)).toBe(true);
  });

  it("scopes by organization and owner, excludes deleted, pins the status rule", async () => {
    query.mockResolvedValueOnce([]);
    await risksSource.load(ctx);
    const [sql, options] = query.mock.calls[0];
    expect(sql).toBe(RISKS_SQL);
    expect(sql).toContain("r.organization_id = :organizationId");
    expect(sql).toContain(
      "COALESCE(r.current_risk_level::text, r.risk_level_autocalculated::text) AS risk_level",
    );
    expect(sql).toContain("r.risk_owner = :userId");
    expect(sql).toContain("r.is_deleted = false");
    // NULL mitigation_status reads as Not Started.
    expect(sql).toContain("COALESCE(r.mitigation_status::text, 'Not Started')");
    expect(sql).toContain("IN (:needsAttention)");
    expect(sql).toContain("NOT IN (:finished)");
    expect(options.replacements).toEqual({
      organizationId: 7,
      userId: 5,
      today: "2026-11-14",
      needsAttention: ["Not Started", "Requires review"],
      finished: ["Completed", "Canceled"],
    });
  });

  it("maps rows: overdue from the deadline, null deadline never overdue, meta carried", async () => {
    query.mockResolvedValueOnce([
      row(1, "Not Started", null),
      row(2, "In Progress", "2026-11-13"),
      row(3, "Requires review", "2026-11-20", "Low risk"),
      row(4, "Not Started", "2026-11-14"),
    ]);
    const items = await risksSource.load(ctx);
    const byId = Object.fromEntries(items.map((i) => [i.entityId, i]));
    expect(byId[1]).toEqual({
      id: "risks:1",
      source: "risks",
      part: "track",
      entityType: "risk",
      entityId: 1,
      name: "Risk 1",
      url: "/risk-management?riskId=1",
      dueDate: null,
      waitingSince: "2026-11-01T10:00:00.000Z",
      overdue: false,
      meta: { mitigationStatus: "Not Started", riskLevel: "High risk" },
    });
    expect(byId[2].overdue).toBe(true);
    expect(byId[2].dueDate).toBe("2026-11-13");
    expect(byId[3]).toMatchObject({ overdue: false, meta: { riskLevel: "Low risk" } });
    expect(byId[4].overdue).toBe(false);
  });
});

describe("policyReviewsSource", () => {
  const row = (id: number, next_review_date: string) => ({
    id,
    title: `Policy ${id}`,
    status: "Published",
    next_review_date,
    created_at: created,
  });

  it("is a visible Enforce source", () => {
    expect(policyReviewsSource.id).toBe("policyReviews");
    expect(policyReviewsSource.part).toBe("enforce");
    expect(policyReviewsSource.isVisible(ctx)).toBe(true);
  });

  it("owner or assigned reviewer, window today+14 (not +15), org scoped throughout", async () => {
    query.mockResolvedValueOnce([]);
    await policyReviewsSource.load(ctx);
    const [sql, options] = query.mock.calls[0];
    expect(sql).toBe(POLICY_REVIEWS_SQL);
    expect(sql).toContain("p.organization_id = :organizationId");
    expect(sql).toContain("p.policy_owner_id = :userId");
    expect(sql).toContain("policy_manager__assigned_reviewer_ids");
    expect(sql).toContain("pmr.organization_id = :organizationId");
    expect(sql).toContain("pmr.user_id = :userId");
    expect(sql).toContain("<= :windowEnd");
    // Retired policies are never due; NULL status stays in.
    expect(sql).toContain("p.status IS DISTINCT FROM 'Archived'");
    expect(sql).toContain("p.status IS DISTINCT FROM 'Deprecated'");
    // today 2026-11-14: +14 is in, +15 is out.
    expect(options.replacements).toEqual({
      organizationId: 7,
      userId: 5,
      windowEnd: "2026-11-28",
    });
  });

  it("maps rows: overdue when before today, due today is not overdue, links the editor", async () => {
    query.mockResolvedValueOnce([row(1, "2026-11-28"), row(2, "2026-11-13"), row(3, "2026-11-14")]);
    const items = await policyReviewsSource.load(ctx);
    expect(items[0]).toEqual({
      id: "policyReviews:1",
      source: "policyReviews",
      part: "enforce",
      entityType: "policy",
      entityId: 1,
      name: "Policy 1",
      url: "/policies/1/edit",
      dueDate: "2026-11-28",
      waitingSince: "2026-11-01T10:00:00.000Z",
      overdue: false,
      meta: { status: "Published" },
    });
    expect(items[1].overdue).toBe(true);
    expect(items[2].overdue).toBe(false);
  });
});

describe("vendorReviewsSource", () => {
  const row = (id: number, review_date: string) => ({
    id,
    vendor_name: `Vendor ${id}`,
    review_status: "Not started",
    review_date,
    created_at: created,
  });

  it("is a visible Track source", () => {
    expect(vendorReviewsSource.id).toBe("vendorReviews");
    expect(vendorReviewsSource.part).toBe("track");
    expect(vendorReviewsSource.isVisible(ctx)).toBe(true);
  });

  it("recipient is reviewer, else assignee; a Reviewed vendor drops out only once its date has passed", async () => {
    query.mockResolvedValueOnce([]);
    await vendorReviewsSource.load(ctx);
    const [sql, options] = query.mock.calls[0];
    expect(sql).toBe(VENDOR_REVIEWS_SQL);
    expect(sql).toContain("v.organization_id = :organizationId");
    // reviewer || assignee: a reviewer, when set, is the only recipient.
    expect(sql).toContain("COALESCE(NULLIF(v.reviewer, 0), v.assignee) = :userId");
    expect(sql).toContain("v.review_status IS DISTINCT FROM 'Reviewed' OR");
    expect(sql).toContain(">= :today");
    expect(sql).toContain("<= :windowEnd");
    expect(options.replacements).toEqual({
      organizationId: 7,
      today: "2026-11-14",
      userId: 5,
      windowEnd: "2026-11-28",
    });
  });

  it("maps rows: overdue included, links the vendor modal", async () => {
    query.mockResolvedValueOnce([row(1, "2026-11-10"), row(2, "2026-11-28")]);
    const items = await vendorReviewsSource.load(ctx);
    expect(items[0]).toEqual({
      id: "vendorReviews:1",
      source: "vendorReviews",
      part: "track",
      entityType: "vendor",
      entityId: 1,
      name: "Vendor 1",
      url: "/vendors?vendorId=1",
      dueDate: "2026-11-10",
      waitingSince: "2026-11-01T10:00:00.000Z",
      overdue: true,
      meta: { reviewStatus: "Not started" },
    });
    expect(items[1].overdue).toBe(false);
  });
});

describe("incidentsSource", () => {
  it("is a visible top-group source", () => {
    expect(incidentsSource.id).toBe("incidents");
    expect(incidentsSource.part).toBe("automate");
    expect(incidentsSource.isVisible(ctx)).toBe(true);
  });

  it("assignee = me, status not Closed, not archived, org scoped", async () => {
    query.mockResolvedValueOnce([
      {
        id: 3,
        incident_id: "INC-3",
        ai_project: "Chatbot",
        status: "Investigating",
        severity: "Serious",
        created_at: created,
      },
    ]);
    const items = await incidentsSource.load(ctx);
    const [sql, options] = query.mock.calls[0];
    expect(sql).toBe(INCIDENTS_SQL);
    expect(sql).toContain("i.organization_id = :organizationId");
    expect(sql).toContain("i.assignee_id = :userId");
    expect(sql).toContain("i.status IS DISTINCT FROM :closed");
    expect(sql).toContain("i.archived IS NOT TRUE");
    expect(options.replacements).toEqual({ organizationId: 7, userId: 5, closed: "Closed" });
    expect(items).toEqual([
      {
        id: "incidents:3",
        source: "incidents",
        part: "automate",
        entityType: "incident",
        entityId: 3,
        name: "INC-3",
        url: "/ai-incident-managements?incidentId=3",
        dueDate: null,
        waitingSince: "2026-11-01T10:00:00.000Z",
        overdue: false,
        meta: { status: "Investigating", severity: "Serious" },
      },
    ]);
  });
});

describe("mrmFindingsSource", () => {
  const row = (id: number, due_date: string | null) => ({
    id,
    title: `Finding ${id}`,
    stage: "open",
    severity: "high",
    due_date,
    created_at: created,
  });

  it("is a visible Record source", () => {
    expect(mrmFindingsSource.id).toBe("mrmFindings");
    expect(mrmFindingsSource.part).toBe("record");
    expect(mrmFindingsSource.isVisible(ctx)).toBe(true);
  });

  it("owner = me, stage not resolved or closed, org scoped", async () => {
    query.mockResolvedValueOnce([]);
    await mrmFindingsSource.load(ctx);
    const [sql, options] = query.mock.calls[0];
    expect(sql).toBe(MRM_FINDINGS_SQL);
    expect(sql).toContain("f.organization_id = :organizationId");
    expect(sql).toContain("f.owner_id = :userId");
    expect(sql).toContain("f.stage NOT IN (:doneStages)");
    expect(options.replacements).toEqual({
      organizationId: 7,
      userId: 5,
      doneStages: ["resolved", "closed"],
    });
  });

  it("maps rows: dueDate and overdue from due_date, meta carried, links the Findings tab", async () => {
    query.mockResolvedValueOnce([row(1, "2026-11-13"), row(2, null)]);
    const items = await mrmFindingsSource.load(ctx);
    expect(items[0]).toEqual({
      id: "mrmFindings:1",
      source: "mrmFindings",
      part: "record",
      entityType: "mrm_finding",
      entityId: 1,
      name: "Finding 1",
      url: "/model-inventory/model-risk-management/findings",
      dueDate: "2026-11-13",
      waitingSince: "2026-11-01T10:00:00.000Z",
      overdue: true,
      meta: { stage: "open", severity: "high" },
    });
    expect(items[1]).toMatchObject({ dueDate: null, overdue: false });
  });
});
