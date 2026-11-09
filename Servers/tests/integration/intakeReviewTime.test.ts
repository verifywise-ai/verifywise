/**
 * #5189: the per-form review time, the review time and due date stored at
 * submit, and the one-time claim for the submitter's confirmation email,
 * against a real database (the claim's atomicity is the point).
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { IntakeEntityType } from "../../domain.layer/enums/intake-entity-type.enum";
import {
  claimSubmissionConfirmationQuery,
  createIntakeFormQuery,
  createSubmissionQuery,
  getFormReviewDaysQuery,
  getIntakeFormByIdQuery,
  getSubmissionByIdQuery,
  getSubmissionForConfirmationQuery,
  getSubmissionsAwaitingConfirmationQuery,
  releaseSubmissionConfirmationQuery,
  updateFormReviewDaysQuery,
} from "../../utils/intakeForm.utils";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";

const migration = require("../../database/migrations/20261031120000-intake-review-time.js");
const retryMigration = require("../../database/migrations/20261031130000-intake-confirmation-retry.js");

const queryInterface = { sequelize };

const setup = async () => {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const orgId = await createTestOrganization(`Org ${suffix}`);
  const userId = await createTestUser(orgId, 1, `admin-${suffix}@test.com`, "Password123!");
  const form = await createIntakeFormQuery(
    {
      name: `Form ${suffix}`,
      description: "",
      entityType: IntakeEntityType.USE_CASE,
      createdBy: userId,
    },
    orgId,
  );
  const submit = (
    overrides: {
      reviewDays?: number | null;
      reviewDueDate?: string | null;
      email?: string | null;
    } = {},
  ) =>
    createSubmissionQuery(
      {
        formId: form.id,
        submitterEmail: overrides.email === undefined ? "jane@example.com" : overrides.email,
        submitterName: "Jane",
        data: {},
        entityType: IntakeEntityType.USE_CASE,
        reviewDays: overrides.reviewDays,
        reviewDueDate: overrides.reviewDueDate,
      },
      orgId,
    );
  return { orgId, userId, form, submit };
};

const column = async (id: number, name: string) =>
  (
    await sequelize.query<Record<string, unknown>>(
      `SELECT ${name}::text AS value FROM intake_submissions WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    )
  )[0].value;

const setCreatedAt = (ids: number[], interval: string) =>
  sequelize.query(
    `UPDATE intake_submissions SET created_at = NOW() - CAST(:interval AS interval) WHERE id IN (:ids)`,
    { replacements: { ids, interval } },
  );

afterEach(cleanupDatabase);

// Leave the schema as the migration left it, whatever a test did.
afterAll(async () => {
  await migration.up(queryInterface);
  await retryMigration.up(queryInterface);
});

describe("intake_forms.review_days", () => {
  it("defaults to 3 and is read and set through its own queries", async () => {
    const { orgId, form } = await setup();
    expect(await getFormReviewDaysQuery(form.id, orgId)).toBe(3);
    expect(await updateFormReviewDaysQuery(form.id, orgId, 10)).toBe(10);
    expect(await getFormReviewDaysQuery(form.id, orgId)).toBe(10);
  });

  it("is not part of the frozen legacy form contract, only read on request for submit", async () => {
    const { orgId, form } = await setup();
    const legacy = (await getIntakeFormByIdQuery(form.id, orgId)) as unknown as Record<
      string,
      unknown
    >;
    expect(legacy).not.toHaveProperty("reviewDays");
    expect(
      (await getIntakeFormByIdQuery(form.id, orgId, { withReviewDays: true }))?.reviewDays,
    ).toBe(3);
  });

  it("is scoped to the organization", async () => {
    const { form } = await setup();
    const other = await setup();
    expect(await getFormReviewDaysQuery(form.id, other.orgId)).toBeNull();
    expect(await updateFormReviewDaysQuery(form.id, other.orgId, 5)).toBeNull();
  });

  it("rejects values outside 1–30 in the database too", async () => {
    const { orgId, form } = await setup();
    await expect(updateFormReviewDaysQuery(form.id, orgId, 0)).rejects.toThrow();
    await expect(updateFormReviewDaysQuery(form.id, orgId, 31)).rejects.toThrow();
  });
});

describe("review time stored at submit", () => {
  it("keeps the days and due date of submit, whatever the form says later", async () => {
    const { orgId, form, submit } = await setup();
    const created = await submit({ reviewDays: 3, reviewDueDate: "2026-11-05" });
    await updateFormReviewDaysQuery(form.id, orgId, 10);

    const row = await getSubmissionForConfirmationQuery(created.id, orgId);
    expect(row).toMatchObject({
      reviewDays: 3,
      reviewDueDate: "2026-11-05",
      confirmationSentAt: null,
      formExists: true,
      formName: form.name,
    });
    // Not part of the frozen legacy submission contract.
    const legacy = (await getSubmissionByIdQuery(created.id, orgId)) as unknown as Record<
      string,
      unknown
    >;
    expect(legacy).not.toHaveProperty("reviewDueDate");
    expect(legacy).not.toHaveProperty("reviewDays");
  });
});

describe("claimSubmissionConfirmationQuery", () => {
  it("lets exactly one of several concurrent callers claim", async () => {
    const { orgId, submit } = await setup();
    const { id } = await submit();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => claimSubmissionConfirmationQuery(id, orgId)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await column(id, "confirmation_sent_at")).not.toBeNull();
  });

  it("can be released after a failed send, counting it and scheduling the retry", async () => {
    const { orgId, submit } = await setup();
    const { id } = await submit();
    expect(await claimSubmissionConfirmationQuery(id, orgId)).toBe(true);
    expect(await releaseSubmissionConfirmationQuery(id, orgId, [5, 15])).toBe(1);
    expect(await column(id, "confirmation_sent_at")).toBeNull();
    const [{ minutes }] = await sequelize.query<{ minutes: number }>(
      `SELECT ROUND(EXTRACT(EPOCH FROM confirmation_next_attempt_at - NOW()) / 60)::int AS minutes
       FROM intake_submissions WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    expect(minutes).toBe(5);

    expect(await claimSubmissionConfirmationQuery(id, orgId)).toBe(true);
    expect(await releaseSubmissionConfirmationQuery(id, orgId, [5, 15])).toBe(2);
    expect(await claimSubmissionConfirmationQuery(id, orgId)).toBe(true);
    // Past the last gap: counted, with no further try scheduled.
    expect(await releaseSubmissionConfirmationQuery(id, orgId, [5, 15])).toBe(3);
    expect(await column(id, "confirmation_next_attempt_at")).toBeNull();
  });

  it("does not claim another organization's or a decided submission", async () => {
    const { orgId, submit } = await setup();
    const other = await setup();
    const { id } = await submit();
    expect(await claimSubmissionConfirmationQuery(id, other.orgId)).toBe(false);

    await sequelize.query(`UPDATE intake_submissions SET status = 'approved' WHERE id = :id`, {
      replacements: { id },
    });
    expect(await claimSubmissionConfirmationQuery(id, orgId)).toBe(false);
    expect(await column(id, "confirmation_sent_at")).toBeNull();
  });

  it("gives a resubmission its own claim", async () => {
    const { orgId, submit } = await setup();
    const first = await submit();
    const second = await submit();
    expect(await claimSubmissionConfirmationQuery(first.id, orgId)).toBe(true);
    expect(await claimSubmissionConfirmationQuery(second.id, orgId)).toBe(true);
  });
});

describe("getSubmissionsAwaitingConfirmationQuery", () => {
  it("lists pending, unclaimed submissions with an email, past 3 minutes and within 7 days", async () => {
    const { orgId, submit } = await setup();
    const due = await submit();
    const fresh = await submit();
    const claimed = await submit();
    const noEmail = await submit({ email: null });
    const stale = await submit();
    await setCreatedAt([due.id, claimed.id, noEmail.id], "4 minutes");
    await setCreatedAt([stale.id], "8 days");
    await claimSubmissionConfirmationQuery(claimed.id, orgId);

    const ids = (await getSubmissionsAwaitingConfirmationQuery(3, 7, 5)).map((r) => r.id);
    expect(ids).toContain(due.id);
    expect(ids).not.toContain(fresh.id);
    expect(ids).not.toContain(claimed.id);
    expect(ids).not.toContain(noEmail.id);
    expect(ids).not.toContain(stale.id);
  });

  it("lists a failed send again only once its retry is due, and not after the last one", async () => {
    const { submit } = await setup();
    const waiting = await submit();
    const retryDue = await submit();
    const givenUp = await submit();
    await setCreatedAt([waiting.id, retryDue.id, givenUp.id], "1 hour");
    await sequelize.query(
      `UPDATE intake_submissions SET confirmation_attempts = 1,
         confirmation_next_attempt_at = NOW() + interval '10 minutes' WHERE id = :id`,
      { replacements: { id: waiting.id } },
    );
    await sequelize.query(
      `UPDATE intake_submissions SET confirmation_attempts = 2,
         confirmation_next_attempt_at = NOW() - interval '1 minute' WHERE id = :id`,
      { replacements: { id: retryDue.id } },
    );
    await sequelize.query(
      `UPDATE intake_submissions SET confirmation_attempts = 6,
         confirmation_next_attempt_at = NULL WHERE id = :id`,
      { replacements: { id: givenUp.id } },
    );

    const ids = (await getSubmissionsAwaitingConfirmationQuery(3, 7, 5)).map((r) => r.id);
    expect(ids).toContain(retryDue.id);
    expect(ids).not.toContain(waiting.id);
    expect(ids).not.toContain(givenUp.id);
  });
});

describe("migrations 20261031120000 and 20261031130000", () => {
  it("mark submissions made before them as confirmed, and round-trip", async () => {
    const { orgId, submit } = await setup();
    const { id } = await submit();

    await retryMigration.down(queryInterface);
    const retryCols = await sequelize.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'intake_submissions'
         AND column_name IN ('review_days', 'confirmation_attempts', 'confirmation_next_attempt_at')`,
      { type: QueryTypes.SELECT },
    );
    expect(retryCols).toHaveLength(0);
    await migration.down(queryInterface);
    const cols = await sequelize.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name IN ('intake_forms', 'intake_submissions')
         AND column_name IN ('review_days', 'review_due_date', 'confirmation_sent_at')`,
      { type: QueryTypes.SELECT },
    );
    expect(cols).toHaveLength(0);

    await migration.up(queryInterface);
    await retryMigration.up(queryInterface);
    // The existing submission already had its confirmation: never emailed again.
    expect(await column(id, "confirmation_sent_at")).not.toBeNull();
    expect(await column(id, "confirmation_attempts")).toBe("0");
    expect(await claimSubmissionConfirmationQuery(id, orgId)).toBe(false);

    // up() is safe to run twice.
    await migration.up(queryInterface);
    await retryMigration.up(queryInterface);
  });
});
