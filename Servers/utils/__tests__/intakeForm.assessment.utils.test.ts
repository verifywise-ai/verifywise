import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  __esModule: true,
  sequelize: { query: jest.fn() },
}));

import {
  updateSubmissionAssessmentV2Query,
  updateSubmissionSuggestionsQuery,
  updateSuggestedRiskItemQuery,
  setAllSuggestionStatesQuery,
  claimSubmissionNotificationQuery,
  getSubmissionsNeedingAssessmentQuery,
  getSubmissionByIdQuery,
} from "../intakeForm.utils";
import {
  isAssessmentV2,
  IRiskAssessmentV2,
  ISuggestedRisksBlock,
} from "../../domain.layer/interfaces/i.intakeSubmission";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

const sqlOf = (call = 0) => String(mockQuery.mock.calls[call][0]);
const optsOf = (call = 0) => mockQuery.mock.calls[call][1] as any;

const assessment: IRiskAssessmentV2 = {
  version: 2,
  status: "complete",
  notRuleChecked: false,
  classificationLevel: "High risk",
  ruleMinimum: 70,
  ai: {
    runs: [60, 72, 80],
    failedRuns: 2,
    validRuns: 3,
    median: 72,
    min: 60,
    max: 80,
    reasons: [],
  },
  finalScore: 72,
  source: "ai",
  rulesOnly: false,
  overallScore: 72,
  tier: "High",
  stageStartedAt: "2026-10-21T12:00:00.000Z",
  scoredAt: "2026-10-21T12:00:10.000Z",
};

beforeEach(() => {
  mockQuery.mockReset();
});

describe("isAssessmentV2", () => {
  it("is true only for version 2", () => {
    expect(isAssessmentV2(assessment)).toBe(true);
    expect(isAssessmentV2(null)).toBe(false);
    expect(
      isAssessmentV2({
        dimensions: [],
        overallScore: 1,
        tier: "Low",
        tierSystem: "x",
        llmEnhanced: false,
      }),
    ).toBe(false);
    expect(isAssessmentV2({ version: 1 } as any)).toBe(false);
  });
});

describe("updateSubmissionAssessmentV2Query", () => {
  it("writes the JSON and the band as risk_tier, scoped to the org", async () => {
    mockQuery.mockResolvedValue([[], 1] as any);
    await updateSubmissionAssessmentV2Query(5, assessment, 9);
    expect(sqlOf()).toContain("risk_assessment = :riskAssessment");
    // a reviewer override keeps its band; only pending submissions change
    expect(sqlOf()).toContain("risk_tier = COALESCE(risk_override->>'tier', :riskTier)");
    expect(sqlOf()).toContain("status = :pending");
    expect(sqlOf()).toContain("organization_id = :organizationId");
    expect(optsOf().replacements).toEqual({
      id: 5,
      organizationId: 9,
      riskAssessment: JSON.stringify(assessment),
      riskTier: "High",
      pending: "pending",
    });
  });
});

describe("updateSubmissionSuggestionsQuery", () => {
  it("stringifies the block and filters by org", async () => {
    mockQuery.mockResolvedValue([[], 1] as any);
    const block: ISuggestedRisksBlock = {
      status: "complete",
      items: [],
      droppedCount: 0,
      stageStartedAt: "2026-10-21T12:00:00.000Z",
      generatedAt: "2026-10-21T12:00:05.000Z",
    };
    await updateSubmissionSuggestionsQuery(5, block, 9);
    expect(sqlOf()).toContain("suggested_risks = :suggestedRisks");
    expect(sqlOf()).toContain("organization_id = :organizationId");
    expect(sqlOf()).toContain("status = :pending");
    expect(optsOf().replacements.suggestedRisks).toBe(JSON.stringify(block));
    expect(optsOf().replacements.organizationId).toBe(9);
  });
});

describe("updateSuggestedRiskItemQuery", () => {
  it("is one atomic UPDATE with jsonb_set on the matching element and no prior SELECT", async () => {
    mockQuery.mockResolvedValue([{ item: { id: "s1", state: "accepted" } }] as any);
    const item = await updateSuggestedRiskItemQuery(
      5,
      "s1",
      { state: "accepted", decidedBy: 3 },
      9,
    );
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = sqlOf();
    expect(sql.trimStart().toUpperCase().startsWith("UPDATE")).toBe(true);
    expect(sql).toContain("jsonb_set");
    expect(sql).toContain("jsonb_array_elements");
    expect(sql).toContain("WITH ORDINALITY");
    expect(sql).toContain("organization_id = :organizationId");
    expect(sql).toContain("|| :patch::jsonb");
    expect(sql).toContain("RETURNING");
    expect(sql).toContain("s.status = :pending");
    // accepting can't leave an item without a mitigation plan, even in a race
    expect(sql).toContain("(e.item || :patch::jsonb)->>'mitigationPlan'");
    expect(optsOf().replacements).toEqual({
      id: 5,
      organizationId: 9,
      suggestionId: "s1",
      patch: JSON.stringify({ state: "accepted", decidedBy: 3 }),
      pending: "pending",
    });
    expect(item).toEqual({ id: "s1", state: "accepted" });
  });

  it("returns null when no element matched", async () => {
    mockQuery.mockResolvedValue([] as any);
    expect(await updateSuggestedRiskItemQuery(5, "nope", { state: "dismissed" }, 9)).toBeNull();
  });
});

describe("setAllSuggestionStatesQuery", () => {
  it("moves items between states in one statement and returns the count", async () => {
    mockQuery.mockResolvedValue([{ count: "4" }] as any);
    const n = await setAllSuggestionStatesQuery(5, "suggested", "dismissed", 3, 9);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(sqlOf()).toContain("organization_id = :organizationId");
    expect(sqlOf()).toContain("FOR UPDATE");
    expect(sqlOf()).toContain("status = :pending");
    expect(sqlOf()).toContain("CASE WHEN e.item->>'state' = :from");
    expect(sqlOf()).toContain("ORDER BY e.ord");
    expect(sqlOf()).toContain("'decidedBy', CAST(:userId AS integer)");
    expect(sqlOf()).not.toContain("mitigationPlan");
    expect(optsOf().replacements).toEqual({
      id: 5,
      organizationId: 9,
      from: "suggested",
      to: "dismissed",
      userId: 3,
      pending: "pending",
    });
    expect(n).toBe(4);
  });

  it("can leave items without a mitigation plan unchanged", async () => {
    mockQuery.mockResolvedValue([{ count: 2 }] as any);
    await setAllSuggestionStatesQuery(5, "suggested", "accepted", 3, 9, {
      requireMitigationPlan: true,
    });
    const sql = sqlOf();
    const condition = "btrim(COALESCE(e.item->>'mitigationPlan', '')) <> ''";
    // both in the count and in the CASE that changes the item
    expect(sql.split(condition).length - 1).toBe(2);
  });

  it("returns 0 when the submission has no suggestions", async () => {
    mockQuery.mockResolvedValue([] as any);
    expect(await setAllSuggestionStatesQuery(5, "suggested", "dismissed", 3, 9)).toBe(0);
  });
});

describe("claimSubmissionNotificationQuery", () => {
  it("is true iff a row came back", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 5 }] as any);
    expect(await claimSubmissionNotificationQuery(5, 9)).toBe(true);
    expect(sqlOf()).toContain("notification_sent_at IS NULL");
    expect(sqlOf()).toContain("organization_id = :organizationId");
    expect(sqlOf()).toContain("RETURNING id");
    expect(optsOf().replacements).toEqual({ id: 5, organizationId: 9 });
  });

  it("is false on an empty RETURNING", async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    expect(await claimSubmissionNotificationQuery(5, 9)).toBe(false);
  });
});

describe("getSubmissionsNeedingAssessmentQuery", () => {
  it("covers legacy, stale assessment and stale suggestion rows", async () => {
    mockQuery.mockResolvedValue([{ id: 1, organizationId: 2 }] as any);
    const rows = await getSubmissionsNeedingAssessmentQuery();
    const sql = sqlOf();
    expect(sql).toContain("status = :status");
    expect(sql).toContain("risk_assessment IS NULL");
    expect(sql).toContain("risk_assessment->>'version' IS NULL");
    expect(sql).toContain("risk_assessment->>'status' = 'pending'");
    expect(sql).toContain(
      "(risk_assessment->>'stageStartedAt')::timestamptz < NOW() - interval '10 minutes'",
    );
    expect(sql).toContain("suggested_risks->>'status' = 'pending'");
    expect(sql).toContain(
      "(suggested_risks->>'stageStartedAt')::timestamptz < NOW() - interval '10 minutes'",
    );
    expect(optsOf().replacements).toEqual({ status: "pending" });
    expect(rows).toEqual([{ id: 1, organizationId: 2 }]);
  });

  it("reports which stage each row needs and lists a missing suggestion block", async () => {
    mockQuery.mockResolvedValue([] as any);
    await getSubmissionsNeedingAssessmentQuery();
    const sql = sqlOf();
    expect(sql).toContain('AS "needsScoring"');
    expect(sql).toContain('AS "needsSuggestions"');
    expect(sql).toContain("suggested_risks IS NULL");
    expect(sql).toContain('WHERE "needsScoring" OR "needsSuggestions"');
  });
});

describe("submission row mapping", () => {
  it("selects suggested_risks and notification_sent_at under camelCase aliases", async () => {
    mockQuery.mockResolvedValue([{ id: 5 }] as any);
    await getSubmissionByIdQuery(5, 9);
    expect(sqlOf()).toContain('suggested_risks as "suggestedRisks"');
    expect(sqlOf()).toContain('notification_sent_at as "notificationSentAt"');
  });
});
