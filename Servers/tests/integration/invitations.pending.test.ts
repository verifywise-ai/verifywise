jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import {
  CheckedInvitation,
  checkedInvitation,
  createInvitationQuery,
  getInvitationByIdQuery,
  getPendingInvitationQuery,
  markInvitationAcceptedQuery,
  revokeInvitationQuery,
  updateInvitationExpiryQuery,
} from "../../utils/invitation.utils";

afterEach(async () => {
  await cleanupDatabase();
});

// register.middleware compares an invite link's `expire` (epoch ms) with the
// stored expires_at, a TIMESTAMP without zone. The round trip must give back
// the exact instant, whatever the database session's time zone.
describe("getPendingInvitationQuery", () => {
  it("returns the stored expiry as the same epoch milliseconds", async () => {
    const { owner } = await seedTwoTenantContexts();
    const expiresAt = new Date("2026-11-05T13:14:15.678Z");
    await createInvitationQuery(
      owner.orgId,
      "invitee@example.com",
      "In",
      "Vitee",
      3,
      owner.userId,
      expiresAt,
    );

    const invitation = await getPendingInvitationQuery(owner.orgId, "invitee@example.com");

    expect(invitation).not.toBeNull();
    expect(invitation!.role_id).toBe(3);
    expect(invitation!.expires_at_ms).toBe(expiresAt.getTime());
  });

  it("round-trips the same instant in a non-UTC session time zone", async () => {
    const { owner } = await seedTwoTenantContexts();
    const expiresAt = new Date("2026-11-05T13:14:15.678Z");

    // SET LOCAL needs one connection, so write and read in one transaction.
    const expiresAtMs = await sequelize.transaction(async (transaction) => {
      await sequelize.query("SET LOCAL TIME ZONE 'America/Toronto'", { transaction });
      await createInvitationQuery(
        owner.orgId,
        "invitee@example.com",
        "In",
        "Vitee",
        3,
        owner.userId,
        expiresAt,
        { transaction },
      );
      const [zone] = (await sequelize.query("SELECT current_setting('TimeZone') AS tz", {
        transaction,
        type: QueryTypes.SELECT,
      })) as { tz: string }[];
      expect(zone.tz).toBe("America/Toronto");
      return (await getPendingInvitationQuery(owner.orgId, "invitee@example.com", transaction))!
        .expires_at_ms;
    });

    expect(expiresAtMs).toBe(expiresAt.getTime());
  });

  it("follows a resend's new expiry and ignores other organizations", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const first = new Date("2026-11-05T12:00:00.000Z");
    const row = (await createInvitationQuery(
      owner.orgId,
      "invitee@example.com",
      "In",
      "Vitee",
      3,
      owner.userId,
      first,
    ))!;
    const resent = new Date("2026-11-06T09:30:00.250Z");
    const checked = { id: row.id, roleId: 3, expiresAtMs: first.getTime() };
    expect(await updateInvitationExpiryQuery(attacker.orgId, checked, resent)).toBeNull();
    expect(await updateInvitationExpiryQuery(owner.orgId, checked, resent)).toMatchObject({
      email: "invitee@example.com",
      role_id: 3,
    });

    expect(
      (await getPendingInvitationQuery(owner.orgId, "invitee@example.com"))!.expires_at_ms,
    ).toBe(resent.getTime());
    expect(await getPendingInvitationQuery(attacker.orgId, "invitee@example.com")).toBeNull();
  });

  it("does not extend an invitation that is no longer pending", async () => {
    const { owner } = await seedTwoTenantContexts();
    const first = new Date("2026-11-05T12:00:00.000Z");
    const row = (await createInvitationQuery(
      owner.orgId,
      "invitee@example.com",
      "In",
      "Vitee",
      3,
      owner.userId,
      first,
    ))!;
    const checked = { id: row.id, roleId: 3, expiresAtMs: first.getTime() };
    expect(await markInvitationAcceptedQuery(owner.orgId, checked)).toBe(1);

    expect(
      await updateInvitationExpiryQuery(owner.orgId, checked, new Date("2026-11-06T09:30:00Z")),
    ).toBeNull();
  });
});

describe("markInvitationAcceptedQuery", () => {
  const EXPIRES = new Date("2026-11-05T12:00:00.000Z");

  it("accepts the checked invitation once, and only from its organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const row = (await createInvitationQuery(
      owner.orgId,
      "invitee@example.com",
      "In",
      "Vitee",
      3,
      owner.userId,
      EXPIRES,
    ))!;
    const checked = { id: row.id, roleId: 3, expiresAtMs: EXPIRES.getTime() };

    expect(await markInvitationAcceptedQuery(attacker.orgId, checked)).toBe(0);
    expect(await markInvitationAcceptedQuery(owner.orgId, checked)).toBe(1);
    expect(await markInvitationAcceptedQuery(owner.orgId, checked)).toBe(0);
    expect(await getPendingInvitationQuery(owner.orgId, "invitee@example.com")).toBeNull();
  });

  it("does not accept a row a re-invite rewrote after the link was checked", async () => {
    // A re-invite of a pending email updates the same row (same id) with the
    // new role and expiry; the link that was checked must no longer count.
    const { owner } = await seedTwoTenantContexts();
    const row = (await createInvitationQuery(
      owner.orgId,
      "invitee@example.com",
      "In",
      "Vitee",
      3,
      owner.userId,
      EXPIRES,
    ))!;
    const checked = { id: row.id, roleId: 3, expiresAtMs: EXPIRES.getTime() };
    const reinvited = (await createInvitationQuery(
      owner.orgId,
      "invitee@example.com",
      "In",
      "Vitee",
      4,
      owner.userId,
      new Date("2026-11-06T12:00:00.000Z"),
    ))!;
    expect(reinvited.id).toBe(row.id);

    expect(await markInvitationAcceptedQuery(owner.orgId, checked)).toBe(0);
  });
});

// Resend, revoke and re-invite check the caller against the invitation as
// they read it; each write must miss when anything changed it in between.
describe("guarded invitation writes", () => {
  const EMAIL = "invitee@example.com";
  const EXPIRES = new Date("2026-11-05T12:00:00.000Z");
  const LATER = new Date("2026-11-06T12:00:00.000Z");
  const invite = (
    orgId: number,
    roleId: number,
    invitedBy: number,
    expiresAt: Date,
    replace?: CheckedInvitation | null,
  ) =>
    createInvitationQuery(orgId, EMAIL, "In", "Vitee", roleId, invitedBy, expiresAt, { replace });
  const checkedNow = async (orgId: number, id: number) =>
    checkedInvitation((await getInvitationByIdQuery(orgId, id))!);

  it("reads back the state a guarded write compares", async () => {
    const { owner } = await seedTwoTenantContexts();
    const row = (await invite(owner.orgId, 3, owner.userId, EXPIRES))!;
    expect(await checkedNow(owner.orgId, row.id)).toEqual({
      id: row.id,
      roleId: 3,
      expiresAtMs: EXPIRES.getTime(),
    });
  });

  it("does not extend or revoke an invitation whose role changed since it was checked", async () => {
    const { owner } = await seedTwoTenantContexts();
    const row = (await invite(owner.orgId, 3, owner.userId, EXPIRES))!;
    const checked = await checkedNow(owner.orgId, row.id);
    await invite(owner.orgId, 1, owner.userId, LATER);

    expect(await updateInvitationExpiryQuery(owner.orgId, checked, LATER)).toBeNull();
    expect(await revokeInvitationQuery(owner.orgId, checked)).toBe(false);
    expect(await getPendingInvitationQuery(owner.orgId, EMAIL)).toMatchObject({ role_id: 1 });
    expect(await revokeInvitationQuery(owner.orgId, await checkedNow(owner.orgId, row.id))).toBe(
      true,
    );
  });

  it("still revokes after a resend: the check depends on the role only", async () => {
    const { owner } = await seedTwoTenantContexts();
    const row = (await invite(owner.orgId, 3, owner.userId, EXPIRES))!;
    const checked = await checkedNow(owner.orgId, row.id);
    expect(await updateInvitationExpiryQuery(owner.orgId, checked, LATER)).not.toBeNull();

    expect(await revokeInvitationQuery(owner.orgId, checked)).toBe(true);
  });

  it("does not overwrite a same-role re-invite with a stale resend", async () => {
    // The re-invite emailed a link for its new expiry; a resend checked
    // before it must not move that expiry and break the link.
    const { owner } = await seedTwoTenantContexts();
    const row = (await invite(owner.orgId, 3, owner.userId, EXPIRES))!;
    const stale = await checkedNow(owner.orgId, row.id);
    await invite(owner.orgId, 3, owner.userId, LATER);

    expect(
      await updateInvitationExpiryQuery(owner.orgId, stale, new Date("2026-11-07T12:00:00Z")),
    ).toBeNull();
    expect((await getPendingInvitationQuery(owner.orgId, EMAIL))!.expires_at_ms).toBe(
      LATER.getTime(),
    );
  });

  it("replaces a pending invitation only while it is unchanged since the check", async () => {
    const { owner } = await seedTwoTenantContexts();
    const row = (await invite(owner.orgId, 1, owner.userId, EXPIRES))!;
    const checked = await checkedNow(owner.orgId, row.id);

    // Checked against another state (or against no invitation): it stays.
    expect(await invite(owner.orgId, 4, owner.userId, LATER, { ...checked, roleId: 3 })).toBeNull();
    expect(
      await invite(owner.orgId, 4, owner.userId, LATER, { ...checked, expiresAtMs: 1 }),
    ).toBeNull();
    expect(await invite(owner.orgId, 4, owner.userId, LATER, null)).toBeNull();
    expect(await getPendingInvitationQuery(owner.orgId, EMAIL)).toMatchObject({ role_id: 1 });

    expect(await invite(owner.orgId, 4, owner.userId, LATER, checked)).toMatchObject({
      role_id: 4,
    });
  });

  it("inserts when there is no pending invitation, guarded or not", async () => {
    const { owner } = await seedTwoTenantContexts();
    expect(await invite(owner.orgId, 3, owner.userId, EXPIRES, null)).toMatchObject({
      role_id: 3,
    });
  });
});
