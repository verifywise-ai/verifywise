// Integration suites share one Postgres instance; see deadline-summary.test.ts.
jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { setDismissed, viewNotice } from "../../services/changeNotice";

const ID = "ai-detection";

const view = (userId: number, orgId: number, id = ID, now = new Date()) =>
  viewNotice({ userId, organizationId: orgId, id, now });

const prefsOf = async (userId: number): Promise<Record<string, any> | undefined> => {
  const [row] = await sequelize.query<{ preferences: Record<string, any> }>(
    `SELECT preferences FROM user_preferences WHERE user_id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  return row?.preferences;
};

describe("change notice state against a real database", () => {
  let orgId: number;
  let userId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    userId = await createTestUser(orgId, 3, "cn-user@test.com", "ChangeNotice1!");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("shows to a user with no preferences row and creates it", async () => {
    expect(await prefsOf(userId)).toBeUndefined();
    expect(await view(userId, orgId)).toEqual({ show: true });
    const state = (await prefsOf(userId))!.change_notices[ID];
    expect(state.views).toBe(1);
    expect(state.dismissed_at).toBeNull();
    expect(new Date(state.first_seen_at).getTime()).not.toBeNaN();
  });

  it("stops after three visits and writes nothing on the fourth", async () => {
    for (let i = 0; i < 3; i++) expect(await view(userId, orgId)).toEqual({ show: true });
    expect(await view(userId, orgId)).toEqual({ show: false });
    expect((await prefsOf(userId))!.change_notices[ID].views).toBe(3);
  });

  it("stays hidden after a dismiss and returns after Undo", async () => {
    await view(userId, orgId);
    expect(await setDismissed({ userId, id: ID, dismissed: true, now: new Date() })).toEqual({
      dismissed: true,
    });
    expect(await view(userId, orgId)).toEqual({ show: false });
    await setDismissed({ userId, id: ID, dismissed: false, now: new Date() });
    expect((await prefsOf(userId))!.change_notices[ID].dismissed_at).toBeNull();
    expect(await view(userId, orgId)).toEqual({ show: true });
    expect((await prefsOf(userId))!.change_notices[ID].views).toBe(2);
  });

  it("dismissing a notice never seen keeps it hidden", async () => {
    await setDismissed({ userId, id: ID, dismissed: true, now: new Date() });
    expect(await view(userId, orgId)).toEqual({ show: false });
  });

  it("hides from a member created after the organization's first view", async () => {
    await view(userId, orgId);
    const later = await createTestUser(orgId, 3, "cn-later@test.com", "ChangeNotice1!");
    expect(await view(later, orgId)).toEqual({ show: false });
    expect(await prefsOf(later)).toBeUndefined();
  });

  it("still shows to a member created before the first view", async () => {
    const earlier = await createTestUser(orgId, 3, "cn-earlier@test.com", "ChangeNotice1!");
    await view(userId, orgId);
    expect(await view(earlier, orgId)).toEqual({ show: true });
  });

  it("keeps existing preference keys and other notices", async () => {
    await sequelize.query(
      `INSERT INTO user_preferences (user_id, preferences)
       VALUES (:userId, '{"date_format":"DD/MM/YYYY","parallel_agents":true,"change_notices":{"other":{"first_seen_at":"2026-11-01T00:00:00Z","views":1,"dismissed_at":null}}}'::jsonb)`,
      { replacements: { userId } },
    );
    await view(userId, orgId);
    await setDismissed({ userId, id: ID, dismissed: true, now: new Date() });
    const prefs = (await prefsOf(userId))!;
    expect(prefs.date_format).toBe("DD/MM/YYYY");
    expect(prefs.parallel_agents).toBe(true);
    expect(prefs.change_notices.other.views).toBe(1);
    expect(prefs.change_notices[ID].views).toBe(1);
    expect(prefs.change_notices[ID].dismissed_at).not.toBeNull();
  });

  it("counts two concurrent views as two", async () => {
    // Seed the row so both calls take the conflict-update path.
    await sequelize.query(
      `INSERT INTO user_preferences (user_id, preferences) VALUES (:userId, '{}')`,
      {
        replacements: { userId },
      },
    );
    await Promise.all([view(userId, orgId), view(userId, orgId)]);
    expect((await prefsOf(userId))!.change_notices[ID].views).toBe(2);
  });

  it("counts two concurrent first views as two when no row exists yet", async () => {
    await Promise.all([view(userId, orgId), view(userId, orgId)]);
    expect((await prefsOf(userId))!.change_notices[ID].views).toBe(2);
  });

  it("refuses a new id at the key limit and writes nothing", async () => {
    const notices: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++)
      notices[`n-${i}`] = { first_seen_at: "2026-11-01T00:00:00Z", views: 1, dismissed_at: null };
    await sequelize.query(
      `INSERT INTO user_preferences (user_id, preferences) VALUES (:userId, :prefs::jsonb)`,
      { replacements: { userId, prefs: JSON.stringify({ change_notices: notices }) } },
    );
    expect(await view(userId, orgId, "one-too-many")).toEqual({ show: false });
    expect((await prefsOf(userId))!.change_notices["one-too-many"]).toBeUndefined();
    expect(await view(userId, orgId, "n-1")).toEqual({ show: true });
  });

  const seedKeys = async (count: number) => {
    const notices: Record<string, unknown> = {};
    for (let i = 0; i < count; i++)
      notices[`n-${i}`] = { first_seen_at: "2026-11-01T00:00:00Z", views: 1, dismissed_at: null };
    await sequelize.query(
      `INSERT INTO user_preferences (user_id, preferences) VALUES (:userId, :prefs::jsonb)`,
      { replacements: { userId, prefs: JSON.stringify({ change_notices: notices }) } },
    );
  };

  it("does not show when the cap made the write a no-op after the rules said yes", async () => {
    await seedKeys(199);
    // 199 keys passes the rules (keyCount < 200); a second id sneaking in first fills the cap
    // before this write runs, so the statement writes nothing.
    const { recordViewQuery } = await import("../../utils/changeNotice.utils");
    await view(userId, orgId, "filler");
    expect(await recordViewQuery(userId, "late", new Date().toISOString(), 200)).toBe(false);
    expect((await prefsOf(userId))!.change_notices.late).toBeUndefined();
  });

  it("reads the organization anchor only for a user with no state", async () => {
    const { getNoticeContextQuery } = await import("../../utils/changeNotice.utils");
    await view(userId, orgId);
    const seen = await getNoticeContextQuery(userId, orgId, ID);
    expect(seen!.state).toBeDefined();
    expect(seen!.orgFirstSeenAt).toBeNull();
    const unseen = await getNoticeContextQuery(userId, orgId, "other-notice");
    expect(unseen!.state).toBeUndefined();
  });

  it("concurrent first views of new ids at 199 keys cannot overshoot the key limit", async () => {
    await seedKeys(199);
    await Promise.all([view(userId, orgId, "race-a"), view(userId, orgId, "race-b")]);
    expect(Object.keys((await prefsOf(userId))!.change_notices)).toHaveLength(200);
  });

  it("dismiss of an unseen id stores a null first_seen_at and zero views", async () => {
    expect(await setDismissed({ userId, id: ID, dismissed: true, now: new Date() })).toEqual({
      dismissed: true,
    });
    const state = (await prefsOf(userId))!.change_notices[ID];
    expect(state.first_seen_at).toBeNull();
    expect(state.views).toBe(0);
    expect(state.dismissed_at).not.toBeNull();
  });

  it("dismiss refuses a new id at the key limit, writes nothing, and still answers dismissed", async () => {
    await seedKeys(200);
    expect(
      await setDismissed({ userId, id: "one-too-many", dismissed: true, now: new Date() }),
    ).toEqual({
      dismissed: true,
    });
    const notices = (await prefsOf(userId))!.change_notices;
    expect(notices["one-too-many"]).toBeUndefined();
    expect(Object.keys(notices)).toHaveLength(200);
    await setDismissed({ userId, id: "n-1", dismissed: true, now: new Date() });
    expect((await prefsOf(userId))!.change_notices["n-1"].dismissed_at).not.toBeNull();
  });

  it("dismissed:false on an id with no state is a no-op", async () => {
    expect(await setDismissed({ userId, id: ID, dismissed: false, now: new Date() })).toEqual({
      dismissed: false,
    });
    expect(await prefsOf(userId)).toBeUndefined();
    await seedKeys(1);
    await setDismissed({ userId, id: ID, dismissed: false, now: new Date() });
    expect(Object.keys((await prefsOf(userId))!.change_notices)).toEqual(["n-0"]);
  });

  it("a view after a dismiss-created state fills first_seen_at", async () => {
    await setDismissed({ userId, id: ID, dismissed: true, now: new Date() });
    await setDismissed({ userId, id: ID, dismissed: false, now: new Date() });
    expect(await view(userId, orgId)).toEqual({ show: true });
    const state = (await prefsOf(userId))!.change_notices[ID];
    expect(state.first_seen_at).not.toBeNull();
    expect(state.views).toBe(1);
  });

  it("a dismiss on an unseen id does not move the organization anchor", async () => {
    const earlier = await createTestUser(orgId, 3, "cn-anchor-a@test.com", "ChangeNotice1!");
    await setDismissed({ userId: earlier, id: ID, dismissed: true, now: new Date() });
    const later = await createTestUser(orgId, 3, "cn-anchor-b@test.com", "ChangeNotice1!");
    expect(await view(later, orgId)).toEqual({ show: true });
  });
});
