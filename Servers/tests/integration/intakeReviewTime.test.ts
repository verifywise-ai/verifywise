/**
 * #5189: the per-form review time, the review due date stored at submit, and
 * the one-time claim for the submitter's confirmation email, against a real
 * database (the claim's atomicity is the point).
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { IntakeEntityType } from "../../domain.layer/enums/intake-entity-type.enum";
import {
  claimSubmissionConfirmationQuery,
  createIntakeFormQuery,
  createSubmissionQuery,
  getIntakeFormByIdQuery,
  getSubmissionByIdQuery,
  getSubmissionsAwaitingConfirmationQuery,
  updateIntakeFormQuery,
} from "../../utils/intakeForm.utils";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";

const migration = require("../../database/migrations/20261031120000-intake-review-time.js");

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
  const submit = (overrides: { reviewDueDate?: string | null; email?: string | null } = {}) =>
    createSubmissionQuery(
      {
        formId: form.id,
        submitterEmail: overrides.email === undefined ? "jane@example.com" : overrides.email,
        submitterName: "Jane",
        data: {},
        entityType: IntakeEntityType.USE_CASE,
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

afterEach(cleanupDatabase);

// Leave the schema as the migration left it, whatever a test did.
afterAll(() => migration.up(queryInterface));

describe("intake_forms.review_days", () => {
  it("defaults to 3 and is stored on create and update", async () => {
    const { orgId, form } = await setup();
    expect(form.reviewDays).toBe(3);

    const updated = await updateIntakeFormQuery(form.id, { reviewDays: 10 }, orgId);
    expect(updated?.reviewDays).toBe(10);
    expect((await getIntakeFormByIdQuery(form.id, orgId))?.reviewDays).toBe(10);
  });

  it("rejects values outside 1–30 in the database too", async () => {
    const { orgId, form } = await setup();
    await expect(updateIntakeFormQuery(form.id, { reviewDays: 0 }, orgId)).rejects.toThrow();
    await expect(updateIntakeFormQuery(form.id, { reviewDays: 31 }, orgId)).rejects.toThrow();
  });
});

describe("intake_submissions.review_due_date", () => {
  it("is stored at submit and read back as a plain date", async () => {
    const { orgId, submit } = await setup();
    const created = await submit({ reviewDueDate: "2026-11-05" });
    expect(created.reviewDueDate).toBe("2026-11-05");
    const read = await getSubmissionByIdQuery(created.id, orgId);
    expect(read?.reviewDueDate).toBe("2026-11-05");
    expect(read?.confirmationSentAt).toBeNull();
  });
});

describe("claimSubmissionConfirmationQuery", () => {
  it("lets exactly one of several concurrent callers claim", async () => {
    const { orgId, submit } = await setup();
    const { id } = await submit({ reviewDueDate: "2026-11-05" });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => claimSubmissionConfirmationQuery(id, orgId, "2026-12-01")),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await column(id, "confirmation_sent_at")).not.toBeNull();
    // A due date fixed at submit is kept.
    expect(await column(id, "review_due_date")).toBe("2026-11-05");
  });

  it("stores the due date when none was fixed at submit", async () => {
    const { orgId, submit } = await setup();
    const { id } = await submit({ reviewDueDate: null });
    expect(await claimSubmissionConfirmationQuery(id, orgId, "2026-11-10")).toBe(true);
    expect(await column(id, "review_due_date")).toBe("2026-11-10");
  });

  it("does not claim another organization's or a decided submission", async () => {
    const { orgId, submit } = await setup();
    const other = await setup();
    const { id } = await submit();
    expect(await claimSubmissionConfirmationQuery(id, other.orgId, "2026-11-10")).toBe(false);

    await sequelize.query(`UPDATE intake_submissions SET status = 'approved' WHERE id = :id`, {
      replacements: { id },
    });
    expect(await claimSubmissionConfirmationQuery(id, orgId, "2026-11-10")).toBe(false);
    expect(await column(id, "confirmation_sent_at")).toBeNull();
  });

  it("gives a resubmission its own claim", async () => {
    const { orgId, submit } = await setup();
    const first = await submit();
    const second = await submit();
    expect(await claimSubmissionConfirmationQuery(first.id, orgId, "2026-11-10")).toBe(true);
    expect(await claimSubmissionConfirmationQuery(second.id, orgId, "2026-11-10")).toBe(true);
  });
});

describe("getSubmissionsAwaitingConfirmationQuery", () => {
  it("lists pending, unclaimed submissions with an email, 10 minutes after submit", async () => {
    const { orgId, submit } = await setup();
    const old = await submit();
    const fresh = await submit();
    const claimed = await submit();
    const noEmail = await submit({ email: null });
    await sequelize.query(
      `UPDATE intake_submissions SET created_at = NOW() - interval '11 minutes'
       WHERE id IN (:ids)`,
      { replacements: { ids: [old.id, claimed.id, noEmail.id] } },
    );
    await claimSubmissionConfirmationQuery(claimed.id, orgId, "2026-11-10");

    const ids = (await getSubmissionsAwaitingConfirmationQuery()).map((r) => r.id);
    expect(ids).toContain(old.id);
    expect(ids).not.toContain(fresh.id);
    expect(ids).not.toContain(claimed.id);
    expect(ids).not.toContain(noEmail.id);
  });
});

describe("migration 20261031120000", () => {
  it("marks submissions made before it as confirmed, and round-trips", async () => {
    const { orgId, submit } = await setup();
    const { id } = await submit();

    await migration.down(queryInterface);
    const cols = await sequelize.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name IN ('intake_forms', 'intake_submissions')
         AND column_name IN ('review_days', 'review_due_date', 'confirmation_sent_at')`,
      { type: QueryTypes.SELECT },
    );
    expect(cols).toHaveLength(0);

    await migration.up(queryInterface);
    // The existing submission already had its confirmation: never emailed again.
    expect(await column(id, "confirmation_sent_at")).not.toBeNull();
    expect(await claimSubmissionConfirmationQuery(id, orgId, "2026-11-10")).toBe(false);

    // up() is safe to run twice.
    await migration.up(queryInterface);
  });
});
