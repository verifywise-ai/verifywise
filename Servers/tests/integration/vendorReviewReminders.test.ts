// Integration suites share one Postgres instance; see deadline-summary.test.ts.
jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { dayOffset, seedVendor, utcToday } from "../factories/home-queue.factory";
import { VENDORS_DUE_ON_SQL } from "../../services/automations/vendorReviewReminders";

/** Names of the organization's vendors the sweep would remind about on `reviewDate`. */
const dueOn = async (organizationId: number, reviewDate: string): Promise<string[]> => {
  const rows = await sequelize.query<{ id: number }>(VENDORS_DUE_ON_SQL, {
    replacements: { organizationId, today: utcToday(), reviewDate },
    type: QueryTypes.SELECT,
  });
  if (rows.length === 0) return [];
  const names = await sequelize.query<{ vendor_name: string }>(
    `SELECT vendor_name FROM vendors WHERE id IN (:ids) ORDER BY vendor_name`,
    { replacements: { ids: rows.map((r) => r.id) }, type: QueryTypes.SELECT },
  );
  return names.map((n) => n.vendor_name);
};

describe("vendor review reminder lookup against a real database", () => {
  let orgId: number;
  let me: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    me = await createTestUser(orgId, 3, "reminder-me@test.com", "Reminder1!");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("matches the review date's UTC day, whatever the time of day", async () => {
    const late = await seedVendor(orgId, {
      name: "late in the day",
      reviewerId: me,
      reviewDate: dayOffset(7),
    });
    const early = await seedVendor(orgId, {
      name: "early in the day",
      reviewerId: me,
      reviewDate: dayOffset(7),
    });
    await sequelize.query(`UPDATE vendors SET review_date = :at WHERE id = :id`, {
      replacements: { at: `${dayOffset(7)}T23:45:00.000Z`, id: late },
    });
    await sequelize.query(`UPDATE vendors SET review_date = :at WHERE id = :id`, {
      replacements: { at: `${dayOffset(7)}T00:15:00.000Z`, id: early },
    });
    await seedVendor(orgId, { name: "a day later", reviewerId: me, reviewDate: dayOffset(8) });

    expect(await dueOn(orgId, dayOffset(7))).toEqual(["early in the day", "late in the day"]);
  });

  it("still reminds a Reviewed vendor about its next review, as the Home queue shows it", async () => {
    await seedVendor(orgId, {
      name: "reviewed, next in 7",
      reviewerId: me,
      reviewDate: dayOffset(7),
      reviewStatus: "Reviewed",
    });
    await seedVendor(orgId, {
      name: "follow-up in 7",
      reviewerId: me,
      reviewDate: dayOffset(7),
      reviewStatus: "Requires follow-up",
    });

    expect(await dueOn(orgId, dayOffset(7))).toEqual(["follow-up in 7", "reviewed, next in 7"]);
  });

  it("skips vendors with no review date and vendors of other organizations", async () => {
    await seedVendor(orgId, { name: "no date", reviewerId: me, reviewDate: null });
    const otherOrg = await createTestOrganization();
    await seedVendor(otherOrg, { name: "someone else's", reviewDate: dayOffset(7) });

    expect(await dueOn(orgId, dayOffset(7))).toEqual([]);
  });
});
