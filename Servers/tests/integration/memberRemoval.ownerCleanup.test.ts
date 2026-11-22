jest.setTimeout(60000);

// Ledger appends run after commit on their own connection; the tests assert
// them through this mock, so nothing writes after the tables are truncated.
jest.mock("../../utils/auditLedger.utils", () => ({
  ...jest.requireActual("../../utils/auditLedger.utils"),
  appendToAuditLedger: jest.fn().mockResolvedValue(undefined),
}));

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
import { appendToAuditLedger } from "../../utils/auditLedger.utils";
import { deleteOrganization, removeUserFromOrganization } from "../../services/superAdmin.service";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";
import { createTestIncident, createTestVendor, createTestVendorRisk } from "../factories";

const ledgerAppends = appendToAuditLedger as jest.MockedFunction<typeof appendToAuditLedger>;

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

async function historyCount(): Promise<number> {
  const [{ count }] = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM incident_change_history`,
    { type: QueryTypes.SELECT },
  )) as { count: number }[];
  return count;
}

const incidentLedgerAppends = () =>
  ledgerAppends.mock.calls.filter(([entry]) => entry.entityType === "incident");

describe("removing a member clears the incidents and vendor risks they own", () => {
  beforeEach(() => {
    ledgerAppends.mockClear();
  });

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

  it("records each cleared incident owner as a system change, named while still a member", async () => {
    const s = await seed();
    const incidentA2 = await createTestIncident(s.orgA, s.adminA, { assignee_id: s.member });
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
        ORDER BY incident_id`,
      { type: QueryTypes.SELECT },
    )) as Array<Record<string, unknown>>;
    const row = (incidentId: number) => ({
      incident_id: incidentId,
      organization_id: s.orgA,
      action: "updated",
      field_name: "Owner",
      old_value: `${member.name} ${member.surname}`,
      new_value: "-",
      changed_by_user_id: null,
      changed_by_system: true,
    });
    expect(history).toEqual([row(s.incidentA), row(incidentA2)]);
    expect(incidentLedgerAppends().map(([entry]) => entry.entityId)).toEqual([
      s.incidentA,
      incidentA2,
    ]);
  });

  it("clears them in the removal's transaction, so a rollback keeps the owners", async () => {
    const s = await seed();

    const transaction = await sequelize.transaction();
    try {
      await removeUserFromOrganizationQuery(s.member, s.orgA, transaction);
    } finally {
      await transaction.rollback();
    }

    expect(await incidentOwner(s.incidentA)).toBe(s.member);
    expect(await vendorRiskOwner(s.vendorRiskA)).toBe(s.member);
    expect(await historyCount()).toBe(0);
    expect(incidentLedgerAppends()).toEqual([]);
  });

  it("changes nothing for a user who is not a member of the organization", async () => {
    const s = await seed();
    // A stale owner: adminA was never a member of organization B.
    const staleIncident = await createTestIncident(s.orgB, s.member, { assignee_id: s.adminA });

    const transaction = await sequelize.transaction();
    try {
      const result = await removeUserFromOrganizationQuery(s.adminA, s.orgB, transaction);
      expect(result).toEqual({ removed: false, accountDeleted: false });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    expect(await incidentOwner(staleIncident)).toBe(s.adminA);
    expect(await historyCount()).toBe(0);
  });

  it("writes no incident owner history when the whole organization is deleted", async () => {
    const s = await seed();

    await deleteOrganization(s.orgA);

    expect(await historyCount()).toBe(0);
    expect(incidentLedgerAppends()).toEqual([]);
    expect(await incidentOwner(s.incidentB)).toBe(s.member);
    expect(await vendorRiskOwner(s.vendorRiskB)).toBe(s.member);
  });
});
