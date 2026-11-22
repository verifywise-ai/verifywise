jest.setTimeout(60000);

/**
 * Removing a member from an organization clears the incidents they own
 * (ai_incident_managements.assignee_id) and the vendor risks they are action
 * owner of (vendorrisks.action_owner) in that organization only, in the
 * removal's transaction. The same user's rows in another organization they
 * still belong to are left alone.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { removeUserFromOrganizationQuery } from "../../utils/user.utils";
import { removeUserFromOrganization } from "../../services/superAdmin.service";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";
import { createTestIncident, createTestVendor, createTestVendorRisk } from "../factories";

interface Seed {
  orgA: number;
  orgB: number;
  adminA: number;
  member: number;
  incidentA: number;
  incidentB: number;
  vendorRiskA: number;
  vendorRiskB: number;
}

/** A user who belongs to two organizations and owns an incident and a vendor risk in each. */
async function seed(): Promise<Seed> {
  const suffix = Date.now();
  const orgA = await createTestOrganization(`Removal A ${suffix}`);
  const orgB = await createTestOrganization(`Removal B ${suffix}`);
  const adminA = await createTestUser(orgA, 1, `admin-a-${suffix}@test.com`, "Password123!");
  const member = await createTestUser(orgA, 3, `member-${suffix}@test.com`, "Password123!");
  await createTestUser(orgB, 1, `admin-b-${suffix}@test.com`, "Password123!");
  await sequelize.query(
    `INSERT INTO organization_members (organization_id, user_id, role_id) VALUES (:orgB, :member, 3)`,
    { replacements: { orgB, member } },
  );

  const incidentA = await createTestIncident(orgA, adminA, { assignee_id: member });
  const incidentB = await createTestIncident(orgB, member, { assignee_id: member });
  const vendorA = await createTestVendor(orgA);
  const vendorB = await createTestVendor(orgB);
  const vendorRiskA = await createTestVendorRisk(orgA, {
    vendor_id: vendorA,
    action_owner: member,
  });
  const vendorRiskB = await createTestVendorRisk(orgB, {
    vendor_id: vendorB,
    action_owner: member,
  });
  return { orgA, orgB, adminA, member, incidentA, incidentB, vendorRiskA, vendorRiskB };
}

async function incidentOwner(id: number): Promise<number | null> {
  const [row] = (await sequelize.query(
    `SELECT assignee_id FROM ai_incident_managements WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  )) as { assignee_id: number | null }[];
  return row.assignee_id;
}

async function vendorRiskOwner(id: number): Promise<number | null> {
  const [row] = (await sequelize.query(`SELECT action_owner FROM vendorrisks WHERE id = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
  })) as { action_owner: number | null }[];
  return row.action_owner;
}

describe("removing a member clears the incidents and vendor risks they own", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it("clears them in that organization and leaves another organization's rows alone", async () => {
    const s = await seed();

    const transaction = await sequelize.transaction();
    try {
      const result = await removeUserFromOrganizationQuery(s.member, s.orgA, transaction);
      expect(result).toEqual({ removed: true, accountDeleted: false });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    expect(await incidentOwner(s.incidentA)).toBeNull();
    expect(await vendorRiskOwner(s.vendorRiskA)).toBeNull();
    expect(await incidentOwner(s.incidentB)).toBe(s.member);
    expect(await vendorRiskOwner(s.vendorRiskB)).toBe(s.member);
  });

  it("records the cleared incident owner as a system change, named while still a member", async () => {
    const s = await seed();
    const [member] = (await sequelize.query(`SELECT name, surname FROM users WHERE id = :id`, {
      replacements: { id: s.member },
      type: QueryTypes.SELECT,
    })) as { name: string; surname: string }[];

    await removeUserFromOrganization(s.orgA, s.member);

    const history = (await sequelize.query(
      `SELECT incident_id, organization_id, action, field_name, old_value, new_value,
              changed_by_user_id, changed_by_system
         FROM incident_change_history
        WHERE action = 'updated'
        ORDER BY id`,
      { type: QueryTypes.SELECT },
    )) as Array<Record<string, unknown>>;
    expect(history).toEqual([
      {
        incident_id: s.incidentA,
        organization_id: s.orgA,
        action: "updated",
        field_name: "Owner",
        old_value: `${member.name} ${member.surname}`,
        new_value: "-",
        changed_by_user_id: null,
        changed_by_system: true,
      },
    ]);
  });

  it("clears them in the removal's transaction, so a rollback keeps the owners", async () => {
    const s = await seed();

    const transaction = await sequelize.transaction();
    await removeUserFromOrganizationQuery(s.member, s.orgA, transaction);
    await transaction.rollback();

    expect(await incidentOwner(s.incidentA)).toBe(s.member);
    expect(await vendorRiskOwner(s.vendorRiskA)).toBe(s.member);
    const [{ count }] = (await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM incident_change_history`,
      { type: QueryTypes.SELECT },
    )) as { count: number }[];
    expect(count).toBe(0);
  });
});
