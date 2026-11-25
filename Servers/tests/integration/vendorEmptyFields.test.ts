jest.setTimeout(60000);

// Automations would enqueue to Redis after commit; nothing here needs them.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestVendor } from "../factories";

// The vendor drawer sends '' for a cleared select or date. review_status and
// the scorecard fields are Postgres enums, review_date a timestamp and
// risk_score an integer, so '' used to reach the UPDATE and fail with a 500.
describe("vendor save with cleared fields", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("stores '' as none for review status, review date and scorecard fields", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    await sequelize.query(
      `UPDATE vendors
          SET assignee = :userId, review_status = 'In review', review_date = NOW(),
              data_sensitivity = 'None', risk_score = 3
        WHERE id = :vendorId`,
      { replacements: { vendorId, userId: owner.userId } },
    );

    const res = await owner.request.patch(`/api/vendors/${vendorId}`).send({
      review_status: "",
      review_date: "",
      data_sensitivity: "",
      risk_score: "",
    });

    expect(res.status).toBe(202);
    const [row] = await sequelize.query<Record<string, unknown>>(
      `SELECT review_status, review_date, data_sensitivity, risk_score
         FROM vendors WHERE id = :vendorId`,
      { replacements: { vendorId }, type: QueryTypes.SELECT },
    );
    expect(row).toEqual({
      review_status: null,
      review_date: null,
      data_sensitivity: null,
      risk_score: null,
    });
  });

  it("still saves a review status and date that are set", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    await sequelize.query("UPDATE vendors SET assignee = :userId WHERE id = :vendorId", {
      replacements: { vendorId, userId: owner.userId },
    });

    const res = await owner.request
      .patch(`/api/vendors/${vendorId}`)
      .send({ review_status: "Reviewed", review_date: "2026-11-18" });

    expect(res.status).toBe(202);
    const [row] = await sequelize.query<{ review_status: string; review_date: Date }>(
      "SELECT review_status, review_date FROM vendors WHERE id = :vendorId",
      { replacements: { vendorId }, type: QueryTypes.SELECT },
    );
    expect(row.review_status).toBe("Reviewed");
    expect(row.review_date).not.toBeNull();
  });
});
