const utils = { userCanAccessProjectQuery: jest.fn() };
jest.mock("../../utils/biasAudit.utils", () => utils);

import { assertProjectAccess } from "./projectAccess";

beforeEach(() => utils.userCanAccessProjectQuery.mockReset());

describe("assertProjectAccess", () => {
  it("lets an organization Admin through without asking the database", async () => {
    await expect(assertProjectAccess(7, 42, { userId: 9, role: "Admin" })).resolves.toBeUndefined();
    expect(utils.userCanAccessProjectQuery).not.toHaveBeenCalled();
  });

  it.each(["Editor", "Reviewer", "Auditor"])(
    "lets a %s through when they own or belong to the project",
    async (role) => {
      utils.userCanAccessProjectQuery.mockResolvedValue(true);
      await expect(assertProjectAccess(7, 42, { userId: 9, role })).resolves.toBeUndefined();
      expect(utils.userCanAccessProjectQuery).toHaveBeenCalledWith(7, 9, 42);
    },
  );

  it.each(["Editor", "Reviewer", "Auditor", "SuperAdmin", ""])(
    "answers not found for a %s who is not on the project",
    async (role) => {
      utils.userCanAccessProjectQuery.mockResolvedValue(false);
      await expect(assertProjectAccess(7, 42, { userId: 9, role })).rejects.toMatchObject({
        statusCode: 404,
      });
    },
  );

  it("gives SuperAdmin no bypass, since it is cross-tenant administration", async () => {
    utils.userCanAccessProjectQuery.mockResolvedValue(false);
    await expect(
      assertProjectAccess(7, 42, { userId: 1, role: "SuperAdmin" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(utils.userCanAccessProjectQuery).toHaveBeenCalled();
  });
});
