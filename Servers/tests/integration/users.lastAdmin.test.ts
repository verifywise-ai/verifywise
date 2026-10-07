jest.setTimeout(60000);

import { cleanupDatabase, createTestUser, seedTwoOrgsAndUsers } from "./helpers";
import { sequelize } from "../../database/db";
import { isLastAdminQuery } from "../../utils/user.utils";

afterEach(async () => {
  await cleanupDatabase();
});

const isLastAdmin = async (organizationId: number, userId: number) => {
  const transaction = await sequelize.transaction();
  try {
    return await isLastAdminQuery(organizationId, userId, transaction);
  } finally {
    await transaction.rollback();
  }
};

describe("isLastAdminQuery", () => {
  it("is true only for the one built-in Admin of the organization", async () => {
    // Each organization starts with one Admin (role 1).
    const { orgA, userA, orgB, userB } = await seedTwoOrgsAndUsers(1);
    expect(await isLastAdmin(orgA, userA)).toBe(true);
    // Another organization's Admin does not count.
    expect(await isLastAdmin(orgB, userB)).toBe(true);

    const editor = await createTestUser(orgA, 3, `editor-${Date.now()}@test.com`, "Password123!");
    expect(await isLastAdmin(orgA, editor)).toBe(false);

    await createTestUser(orgA, 1, `admin2-${Date.now()}@test.com`, "Password123!");
    expect(await isLastAdmin(orgA, userA)).toBe(false);
  });

  it("makes a second concurrent check wait for the first one's change", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers(1);
    const second = await createTestUser(orgA, 1, `admin2-${Date.now()}@test.com`, "Password123!");

    // T1 demotes userA (seeing the other Admin), and holds its locks.
    const t1 = await sequelize.transaction();
    expect(await isLastAdminQuery(orgA, userA, t1)).toBe(false);
    await sequelize.query(`UPDATE users SET role_id = 3 WHERE id = :id`, {
      replacements: { id: userA },
      transaction: t1,
    });

    // T2 checks the other Admin; it must wait for T1, then see it is the last.
    const t2 = await sequelize.transaction();
    const pending = isLastAdminQuery(orgA, second, t2);
    await t1.commit();
    expect(await pending).toBe(true);
    await t2.rollback();
  });
});
