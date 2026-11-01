jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts, assertCreateStampsCallerOrg } from "./tenantIsolation.harness";
import type { TenantContext } from "./tenantIsolation.harness";
import { createTestVendor } from "../../factories";

const ROUTES = {
  list: "/api/vendors",
  get: (id: number) => `/api/vendors/${id}`,
  create: "/api/vendors",
  update: (id: number) => `/api/vendors/${id}`,
  delete: (id: number) => `/api/vendors/${id}`,
  // The create and the update that take the other names and the identifiers (ADR 0001 sections 2 and 5).
  createV1: "/api/v1/vendors",
  updateV1: (id: number) => `/api/v1/vendors/${id}`,
};

/** A body that creates a vendor for `owner`. */
const createPayload = (owner: TenantContext) => ({
  vendor_name: "Cross-tenant vendor",
  vendor_provides: "Services",
  website: "https://example.com",
  vendor_contact_person: "Contact Person",
  assignee: owner.userId,
});

describe("Vendors tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only vendors in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    await createTestVendor(owner.orgId);

    const ownerList = await owner.request.get(ROUTES.list);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body?.data?.length ?? 0).toBeGreaterThan(0);

    const attackerList = await attacker.request.get(ROUTES.list);
    // The vendor endpoint returns 204 when no vendors exist, but Jest/supertest
    // still exposes the parsed body as an empty object.
    expect([200, 204]).toContain(attackerList.status);
    expect(attackerList.body?.data?.length ?? 0).toBe(0);
  });

  it("denies cross-tenant read, update, and delete", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);

    const getRes = await attacker.request.get(ROUTES.get(vendorId));
    expect(getRes.status).toBe(404);

    const patchRes = await attacker.request
      .patch(ROUTES.update(vendorId))
      .send({ vendor_name: "Hacked" });
    expect([404, 403]).toContain(patchRes.status);

    const deleteRes = await attacker.request.delete(ROUTES.delete(vendorId));
    expect([404, 403]).toContain(deleteRes.status);
  });

  it("denies a cross-tenant update through /api/v1/vendors", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Owner vendor" });
    // The factory stores no assignee, which an update of the vendor would refuse with a 400.
    await sequelize.query(
      "UPDATE vendors SET assignee = :assignee WHERE id = :vendorId AND organization_id = :organizationId",
      { replacements: { assignee: owner.userId, vendorId, organizationId: owner.orgId } },
    );
    const readRow = () =>
      sequelize.query(
        "SELECT * FROM vendors WHERE id = :vendorId AND organization_id = :organizationId",
        { replacements: { vendorId, organizationId: owner.orgId }, type: QueryTypes.SELECT },
      );
    const before = await readRow();
    expect(before).toHaveLength(1);
    const body = { vendor_name: "Hacked", country: "fr", sec_cik: "320193" };

    const denied = await attacker.request.patch(ROUTES.updateV1(vendorId)).send(body);

    expect(denied.status).toBe(404);
    expect(await readRow()).toEqual(before);

    // Positive control: the same request is an update for the owner, so the 404 above is the
    // tenancy and not a missing route.
    const own = await owner.request.patch(ROUTES.updateV1(vendorId)).send(body);
    expect(own.status).toBe(202);
    expect(await readRow()).toMatchObject([
      { vendor_name: "Hacked", country: "FR", sec_cik: "0000320193" },
    ]);
  });

  it("stamps the caller's organization_id on create", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await assertCreateStampsCallerOrg(
      owner,
      attacker.orgId,
      { create: ROUTES.create },
      () => createPayload(owner),
      "vendors",
      (res) => res.body?.data?.id,
    );
  });

  it("stamps the caller's organization_id on a create through /api/v1/vendors", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const vendorId = await assertCreateStampsCallerOrg(
      owner,
      attacker.orgId,
      { create: ROUTES.createV1 },
      // The body names the other organization: the vendor is stored for the caller's.
      (foreignOrgId) => ({ ...createPayload(owner), organization_id: foreignOrgId, country: "de" }),
      "vendors",
      (res) => res.body?.data?.id,
    );

    const [row] = await sequelize.query<{ organization_id: number; country: string }>(
      "SELECT organization_id, country FROM vendors WHERE id = :vendorId",
      { replacements: { vendorId }, type: QueryTypes.SELECT },
    );
    expect(row).toEqual({ organization_id: owner.orgId, country: "DE" });
  });
});
