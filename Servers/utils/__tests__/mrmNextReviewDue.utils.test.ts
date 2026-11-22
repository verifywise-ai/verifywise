import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  __esModule: true,
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));

import {
  computeNextReviewDue,
  rescheduleNextReviewForTierQuery,
  signoffValidationQuery,
} from "../mrm.utils";
import { sequelize } from "../../database/db";
import { MrmTier, MrmValidationOutcome } from "../../domain.layer/enums/mrm.enum";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const mockTransaction = sequelize.transaction as unknown as jest.Mock<() => Promise<any>>;

describe("computeNextReviewDue", () => {
  const from = new Date("2026-03-15T10:00:00Z");

  it("adds 12, 18 and 24 months for tiers 1, 2 and 3", () => {
    expect(computeNextReviewDue(MrmTier.TIER_1, from)?.toISOString()).toBe(
      "2027-03-15T10:00:00.000Z",
    );
    expect(computeNextReviewDue(MrmTier.TIER_2, from)?.toISOString()).toBe(
      "2027-09-15T10:00:00.000Z",
    );
    expect(computeNextReviewDue(MrmTier.TIER_3, from)?.toISOString()).toBe(
      "2028-03-15T10:00:00.000Z",
    );
  });

  it("returns null for an untiered model or an unknown tier", () => {
    expect(computeNextReviewDue(null, from)).toBeNull();
    expect(computeNextReviewDue(undefined, from)).toBeNull();
    expect(computeNextReviewDue("9", from)).toBeNull();
  });

  it("clamps to the last day of a shorter month", () => {
    // Aug 31 + 18 months = Feb 2028, which has 29 days.
    const due = computeNextReviewDue(MrmTier.TIER_2, new Date("2026-08-31T00:00:00Z"));
    expect(due?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("does not modify the date it was given", () => {
    const input = new Date("2026-01-31T00:00:00Z");
    computeNextReviewDue(MrmTier.TIER_1, input);
    expect(input.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
});

describe("signoffValidationQuery scheduling", () => {
  const tx = { commit: jest.fn(), rollback: jest.fn() };

  beforeEach(() => {
    mockQuery.mockReset();
    mockTransaction.mockReset();
    tx.commit.mockReset();
    tx.rollback.mockReset();
    mockTransaction.mockResolvedValue(tx);
  });

  it("writes next_due from the model's tier in the same transaction", async () => {
    mockQuery
      .mockResolvedValueOnce([{ mrm_tier: MrmTier.TIER_1 }])
      .mockResolvedValueOnce([{ id: 5, stage: "validated" }]);

    const before = Date.now();
    const signed = await signoffValidationQuery(5, 2, {
      outcome: MrmValidationOutcome.VALIDATED,
      signed_off_by: 9,
    });

    expect(signed).toEqual({ id: 5, stage: "validated" });
    const [tierSql, tierOpts] = mockQuery.mock.calls[0] as [string, any];
    const [updateSql, updateOpts] = mockQuery.mock.calls[1] as [string, any];
    expect(tierSql).toContain("mrm_tier");
    expect(tierOpts.replacements).toEqual({ organizationId: 2, id: 5 });
    expect(tierOpts.transaction).toBe(tx);
    expect(updateSql).toContain("next_due       = COALESCE(:nextDue,");
    const nextDue = updateOpts.replacements.nextDue as Date;
    const expected = computeNextReviewDue(MrmTier.TIER_1, new Date(before))!;
    // Within a few seconds of "sign-off time + 12 months".
    expect(Math.abs(nextDue.getTime() - expected.getTime())).toBeLessThan(5000);
    expect(tx.commit).toHaveBeenCalled();
  });

  it("passes a null date for an untiered model so the row keeps a future due date", async () => {
    mockQuery.mockResolvedValueOnce([{ mrm_tier: null }]).mockResolvedValueOnce([{ id: 5 }]);

    await signoffValidationQuery(5, 2, {
      outcome: MrmValidationOutcome.NOT_VALIDATED,
      signed_off_by: 9,
    });

    const [, updateOpts] = mockQuery.mock.calls[1] as [string, any];
    expect(updateOpts.replacements.nextDue).toBeNull();
  });

  it("rolls back and returns null when the validation is not in the org", async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const signed = await signoffValidationQuery(5, 2, {
      outcome: MrmValidationOutcome.VALIDATED,
      signed_off_by: 9,
    });

    expect(signed).toBeNull();
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });
});

describe("rescheduleNextReviewForTierQuery", () => {
  const tx = {} as any;

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("re-dates the latest signed-off validation from the new tier", async () => {
    const signedOffAt = new Date("2026-03-15T10:00:00Z");
    mockQuery
      .mockResolvedValueOnce([{ id: 7, signed_off_at: signedOffAt }])
      .mockResolvedValueOnce([]);

    const due = await rescheduleNextReviewForTierQuery(4, 2, MrmTier.TIER_3, tx);

    expect(due?.toISOString()).toBe("2028-03-15T10:00:00.000Z");
    const [selectSql, selectOpts] = mockQuery.mock.calls[0] as [string, any];
    expect(selectSql).toContain("organization_id = :organizationId");
    expect(selectOpts.replacements).toMatchObject({ organizationId: 2, modelId: 4 });
    expect(selectOpts.transaction).toBe(tx);
    const [, updateOpts] = mockQuery.mock.calls[1] as [string, any];
    expect(updateOpts.replacements).toMatchObject({ organizationId: 2, id: 7, nextDue: due });
    expect(updateOpts.transaction).toBe(tx);
  });

  it("does nothing when the model has never been signed off", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const due = await rescheduleNextReviewForTierQuery(4, 2, MrmTier.TIER_1, tx);

    expect(due).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
