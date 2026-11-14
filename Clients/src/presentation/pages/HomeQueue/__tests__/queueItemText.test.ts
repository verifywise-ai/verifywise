import { describe, it, expect } from "vitest";
import { queueItemText } from "../queueItemText";
import type { HomeQueueItem } from "../../../../domain/types/homeQueue.types";

// Identity translator: the English templates are the dictionary keys.
const t = (key: string) => key;
const NOW = new Date("2026-11-14T12:00:00Z");
const opts = { lang: "en", now: NOW };

const item = (overrides: Partial<HomeQueueItem>): HomeQueueItem => ({
  id: "x:1",
  source: "tasks",
  part: "automate",
  entityType: "task",
  entityId: 1,
  name: "Item",
  url: "/",
  dueDate: null,
  waitingSince: null,
  overdue: false,
  meta: {},
  ...overrides,
});

describe("queueItemText", () => {
  it("approvals: step of steps and how long it has waited", () => {
    const text = queueItemText(
      item({
        source: "approvals",
        part: "enforce",
        name: "Deploy CV screener",
        waitingSince: "2026-11-12T09:00:00Z",
        meta: { stepNumber: 2, stepCount: 3 },
      }),
      t,
      opts,
    );
    expect(text).toEqual({
      title: "Approval: Deploy CV screener",
      context: "Approval workflows · step 2 of 3 · waiting 2 days",
      action: "Review",
    });
  });

  it("approvals: step alone when the step count is unknown, waiting since today", () => {
    const text = queueItemText(
      item({
        source: "approvals",
        name: "Chatbot",
        waitingSince: "2026-11-14T08:00:00Z",
        meta: { stepNumber: 1, stepCount: null },
      }),
      t,
      opts,
    );
    expect(text.context).toBe("Approval workflows · step 1 · waiting since today");
  });

  it("tasks: overdue title and due date", () => {
    const text = queueItemText(
      item({ source: "tasks", name: "Update DPIA", dueDate: "2026-11-10", overdue: true }),
      t,
      opts,
    );
    expect(text).toEqual({
      title: "Task overdue: Update DPIA",
      context: "Tasks · due Nov 10",
      action: "Open",
    });
  });

  it("tasks: plain title when not overdue, waiting 1 day without a due date", () => {
    const text = queueItemText(
      item({ source: "tasks", name: "Write memo", waitingSince: "2026-11-13T10:00:00Z" }),
      t,
      opts,
    );
    expect(text.title).toBe("Task: Write memo");
    expect(text.context).toBe("Tasks · waiting 1 day");
  });

  it("intake: second review", () => {
    const text = queueItemText(
      item({
        source: "intake",
        part: "record",
        name: "Legal team",
        waitingSince: "2026-11-11T10:00:00Z",
        meta: { kind: "second-review", formName: "AI use request", lane: "senior" },
      }),
      t,
      opts,
    );
    expect(text.title.startsWith("Second review:")).toBe(true);
    expect(text).toEqual({
      title: "Second review: Legal team",
      context: "Intake · AI use request · waiting 3 days",
      action: "Review",
    });
  });

  it("intake: first review, anonymous submitter", () => {
    const text = queueItemText(
      item({ source: "intake", name: "", meta: { kind: "review", formName: null, lane: null } }),
      t,
      opts,
    );
    expect(text.title).toBe("Intake review: Anonymous");
    expect(text.context).toBe("Intake");
  });

  it("risks: sentence-case mitigation status and due date", () => {
    const text = queueItemText(
      item({
        source: "risks",
        part: "track",
        name: "Bias in hiring",
        dueDate: "2026-11-20",
        meta: { mitigationStatus: "Not Started", riskLevel: "High risk" },
      }),
      t,
      opts,
    );
    expect(text).toEqual({
      title: "Risk: Bias in hiring",
      context: "AI risks · Not started · due Nov 20",
      action: "Open",
    });
  });

  it("policy reviews: review due date", () => {
    const text = queueItemText(
      item({
        source: "policyReviews",
        part: "enforce",
        name: "Acceptable use",
        dueDate: "2026-11-25",
        meta: { status: "Published" },
      }),
      t,
      opts,
    );
    expect(text).toEqual({
      title: "Policy review: Acceptable use",
      context: "Policy manager · review due Nov 25",
      action: "Review",
    });
  });

  it("vendor reviews: a reviewed vendor is its next review", () => {
    const text = queueItemText(
      item({
        source: "vendorReviews",
        part: "track",
        name: "Acme AI",
        dueDate: "2026-11-21",
        meta: { reviewStatus: "Reviewed" },
      }),
      t,
      opts,
    );
    expect(text).toEqual({
      title: "Next vendor review: Acme AI",
      context: "Vendors · review due Nov 21",
      action: "Review",
    });
  });

  it("vendor reviews: any other status is a vendor review", () => {
    const text = queueItemText(
      item({
        source: "vendorReviews",
        name: "Acme AI",
        dueDate: "2026-11-21",
        meta: { reviewStatus: "In review" },
      }),
      t,
      opts,
    );
    expect(text.title).toBe("Vendor review: Acme AI");
  });

  it("incidents: severity and status", () => {
    const text = queueItemText(
      item({
        source: "incidents",
        name: "INC-4",
        waitingSince: "2026-11-04T12:00:00Z",
        meta: { status: "Investigated", severity: "Serious" },
      }),
      t,
      opts,
    );
    expect(text).toEqual({
      title: "Incident: INC-4",
      context: "Incidents · Serious · Investigated · waiting 10 days",
      action: "Open",
    });
  });

  it("MRM findings: severity and due date", () => {
    const text = queueItemText(
      item({
        source: "mrmFindings",
        part: "record",
        name: "Drift threshold missing",
        dueDate: "2026-12-01",
        meta: { stage: "open", severity: "high" },
      }),
      t,
      opts,
    );
    expect(text).toEqual({
      title: "Finding: Drift threshold missing",
      context: "Model risk management · High · due Dec 1",
      action: "Open",
    });
  });

  it("translates the templates through t", () => {
    const marked = (key: string) => `«${key}»`;
    const text = queueItemText(
      item({ source: "tasks", name: "Write memo", dueDate: "2026-11-10" }),
      marked,
      opts,
    );
    // The template is translated, the user's data is not.
    expect(text.title).toBe("«Task: Write memo»");
    expect(text.action).toBe("«Open»");
    expect(text.context).toBe("«Tasks» · «due Nov 10»");
  });
});
