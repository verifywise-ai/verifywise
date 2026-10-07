jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createInvitationQuery } from "../../utils/invitation.utils";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const migration = require("../../database/migrations/20261006210000-revoke-invites-the-invite-rules-refuse.js");

afterEach(async () => {
  await cleanupDatabase();
});

const EXPIRES = new Date("2026-11-05T12:00:00.000Z");

const invite = async (orgId: number, email: string, roleId: number, invitedBy: number) =>
  (await createInvitationQuery(orgId, email, "In", "Vitee", roleId, invitedBy, EXPIRES))!;

const pendingEmails = async (orgId: number) =>
  (
    await sequelize.query<{ email: string }>(
      `SELECT email FROM invitations WHERE organization_id = :orgId AND status = 'pending' ORDER BY email`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    )
  ).map((r) => r.email);

// Before the /invite fix any logged-in user could invite anyone, with any
// role, into any organization. The migration removes the pending invitations
// the fixed rules would refuse, and keeps the rest.
describe("migration: revoke invitations the invite rules refuse", () => {
  it("revokes cross-org and non-admin built-in invites, keeps legitimate ones", async () => {
    const suffix = Date.now();
    const orgA = await createTestOrganization(`Org A ${suffix}`);
    const orgB = await createTestOrganization(`Org B ${suffix}`);
    const adminA = await createTestUser(orgA, 1, `admin-a-${suffix}@test.com`, "Password123!");
    const auditorA = await createTestUser(orgA, 4, `auditor-a-${suffix}@test.com`, "Password123!");
    const outsider = await createTestUser(orgB, 4, `outsider-${suffix}@test.com`, "Password123!");

    await invite(orgA, "kept-admin-invites-editor@x.com", 3, adminA);
    await invite(orgA, "kept-admin-invites-admin@x.com", 1, adminA);
    await invite(orgA, "revoked-outsider@x.com", 1, outsider);
    await invite(orgA, "revoked-auditor-grants-admin@x.com", 1, auditorA);
    await invite(orgA, "revoked-auditor-grants-auditor@x.com", 4, auditorA);
    // Accepted invitations are history, not live links: never touched.
    const accepted = await invite(orgA, "accepted-outsider@x.com", 1, outsider);
    await sequelize.query(`UPDATE invitations SET status = 'accepted' WHERE id = :id`, {
      replacements: { id: accepted.id },
    });

    await migration.up({ sequelize });

    expect(await pendingEmails(orgA)).toEqual([
      "kept-admin-invites-admin@x.com",
      "kept-admin-invites-editor@x.com",
    ]);
    const [{ count }] = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM invitations WHERE id = :id`,
      { replacements: { id: accepted.id }, type: QueryTypes.SELECT },
    );
    expect(Number(count)).toBe(1);
  });

  it("keeps invites a super admin sent from outside the organization", async () => {
    const suffix = Date.now();
    const orgA = await createTestOrganization(`Org A ${suffix}`);
    const orgB = await createTestOrganization(`Org B ${suffix}`);
    const superAdmin = await createTestUser(orgB, 1, `super-${suffix}@test.com`, "Password123!");
    await sequelize.query(`INSERT INTO super_admins (user_id) VALUES (:id)`, {
      replacements: { id: superAdmin },
    });
    await invite(orgA, "kept-super-admin-invite@x.com", 1, superAdmin);

    await migration.up({ sequelize });

    expect(await pendingEmails(orgA)).toEqual(["kept-super-admin-invite@x.com"]);
  });

  it("revokes a super admin's invites into roles the organization cannot grant", async () => {
    // A super admin skips the inviter ceiling, not the role check.
    const suffix = Date.now();
    const orgA = await createTestOrganization(`Org A ${suffix}`);
    const orgB = await createTestOrganization(`Org B ${suffix}`);
    const superAdmin = await createTestUser(orgB, 1, `super-${suffix}@test.com`, "Password123!");
    await sequelize.query(`INSERT INTO super_admins (user_id) VALUES (:id)`, {
      replacements: { id: superAdmin },
    });
    const customRole = async (name: string, orgId: number) => {
      const [{ id }] = await sequelize.query<{ id: number }>(
        `INSERT INTO roles (name, description, organization_id, created_at)
         VALUES (:name, 'Custom', :orgId, NOW()) RETURNING id`,
        { replacements: { name, orgId }, type: QueryTypes.SELECT },
      );
      return id;
    };
    const ownRole = await customRole(`Own ${suffix}`, orgA);
    const foreignRole = await customRole(`Foreign ${suffix}`, orgB);
    // The built-in SuperAdmin role is gone; the name is still never invitable.
    const superAdminRole = await customRole("SuperAdmin", orgA);

    await invite(orgA, "kept-builtin@x.com", 3, superAdmin);
    await invite(orgA, "kept-own-custom@x.com", ownRole, superAdmin);
    await invite(orgA, "revoked-foreign-custom@x.com", foreignRole, superAdmin);
    await invite(orgA, "revoked-super-admin-role@x.com", superAdminRole, superAdmin);

    await migration.up({ sequelize });

    expect(await pendingEmails(orgA)).toEqual(["kept-builtin@x.com", "kept-own-custom@x.com"]);
  });

  it("revokes an invite into another organization's custom role", async () => {
    const suffix = Date.now();
    const orgA = await createTestOrganization(`Org A ${suffix}`);
    const orgB = await createTestOrganization(`Org B ${suffix}`);
    const adminA = await createTestUser(orgA, 1, `admin-a-${suffix}@test.com`, "Password123!");
    const [{ id: foreignRole }] = await sequelize.query<{ id: number }>(
      `INSERT INTO roles (name, description, organization_id, created_at)
       VALUES (:name, 'Custom', :orgB, NOW()) RETURNING id`,
      { replacements: { name: `Foreign ${suffix}`, orgB }, type: QueryTypes.SELECT },
    );
    await invite(orgA, "revoked-foreign-role@x.com", foreignRole, adminA);

    await migration.up({ sequelize });

    expect(await pendingEmails(orgA)).toEqual([]);
  });

  it("keeps custom-role invites only from a custom role allowed to invite, within its access", async () => {
    const suffix = Date.now();
    const orgA = await createTestOrganization(`Org A ${suffix}`);
    const customRole = async (name: string, permissions: string[]) => {
      const [{ id }] = await sequelize.query<{ id: number }>(
        `INSERT INTO roles (name, description, organization_id, created_at)
         VALUES (:name, 'Custom', :orgA, NOW()) RETURNING id`,
        { replacements: { name: `${name} ${suffix}`, orgA }, type: QueryTypes.SELECT },
      );
      for (const key of permissions) {
        await sequelize.query(
          `INSERT INTO role_permissions (organization_id, role_id, permission_key, allowed)
           VALUES (:orgA, :id, :key, TRUE)`,
          { replacements: { orgA, id, key } },
        );
      }
      return id;
    };
    const teamLead = await customRole("Team lead", ["invitation.super", "risk.read", "task.read"]);
    const noInvite = await customRole("No invite", ["risk.read", "task.read"]);
    const viewer = await customRole("Viewer", ["risk.read"]);
    const bigger = await customRole("Bigger", ["risk.read", "risk.edit"]);

    const lead = await createTestUser(orgA, teamLead, `lead-${suffix}@test.com`, "Password123!");
    const plain = await createTestUser(orgA, noInvite, `plain-${suffix}@test.com`, "Password123!");
    const editor = await createTestUser(orgA, 3, `editor-${suffix}@test.com`, "Password123!");

    await invite(orgA, "kept-lead-grants-viewer@x.com", viewer, lead);
    await invite(orgA, "revoked-lead-grants-bigger@x.com", bigger, lead);
    await invite(orgA, "revoked-lead-grants-builtin@x.com", 4, lead);
    await invite(orgA, "revoked-no-invite-permission@x.com", viewer, plain);
    await invite(orgA, "revoked-editor-grants-custom@x.com", viewer, editor);

    await migration.up({ sequelize });

    expect(await pendingEmails(orgA)).toEqual(["kept-lead-grants-viewer@x.com"]);
  });

  it("revokes pending invitations with no recorded inviter", async () => {
    // Deleting a user clears invited_by on their invitations, so a forged
    // invite whose sender was removed cannot be told apart from a legacy row.
    const suffix = Date.now();
    const orgA = await createTestOrganization(`Org A ${suffix}`);
    const adminA = await createTestUser(orgA, 1, `admin-a-${suffix}@test.com`, "Password123!");
    const legacy = await invite(orgA, "revoked-no-inviter@x.com", 3, adminA);
    await sequelize.query(`UPDATE invitations SET invited_by = NULL WHERE id = :id`, {
      replacements: { id: legacy.id },
    });

    await migration.up({ sequelize });

    expect(await pendingEmails(orgA)).toEqual([]);
  });
});
