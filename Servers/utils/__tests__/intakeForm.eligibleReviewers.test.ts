import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn<any>() } }));
jest.mock("../roleMap", () => ({ getRoleById: jest.fn<any>() }));
jest.mock("../rolePermissions.utils", () => ({ roleInfoHasPermission: jest.fn<any>() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { sequelize } = require("../../database/db");
const { getRoleById } = require("../roleMap");
const { roleInfoHasPermission } = require("../rolePermissions.utils");
const { getEligibleReviewersQuery, getEligibleReviewerIdsQuery, updateSubmissionRoutingQuery } =
  require("../intakeForm.utils") as typeof import("../intakeForm.utils");
/* eslint-enable @typescript-eslint/no-require-imports */

const user = (id: number, role_id: number) => ({
  id,
  name: `n${id}`,
  surname: `s${id}`,
  email: `u${id}@x.co`,
  role_id,
});

beforeEach(() => {
  jest.clearAllMocks();
  getRoleById.mockImplementation(async (id: number) => ({
    id,
    name: `role${id}`,
    organizationId: null,
  }));
  roleInfoHasPermission.mockImplementation(async (_org: number, role: { id: number }) =>
    [1, 3].includes(role.id),
  );
});

describe("getEligibleReviewersQuery", () => {
  it("scopes the query to the organisation and keeps users whose role holds the permission", async () => {
    sequelize.query.mockResolvedValue([user(1, 1), user(2, 4), user(3, 3), user(4, 1)]);

    const result = await getEligibleReviewersQuery(5);

    expect(sequelize.query.mock.calls[0][0]).toContain("organization_id = :organizationId");
    expect(sequelize.query.mock.calls[0][1].replacements.organizationId).toBe(5);
    expect(result.map((u) => u.id)).toEqual([1, 3, 4]);
    expect(result[0]).toEqual({ id: 1, name: "n1", surname: "s1", email: "u1@x.co" });
    // one permission lookup per distinct role
    expect(roleInfoHasPermission).toHaveBeenCalledTimes(3);
    expect(roleInfoHasPermission).toHaveBeenCalledWith(5, expect.anything(), "intakeForm.edit");
  });

  it("denies a user whose role no longer exists", async () => {
    getRoleById.mockResolvedValue(undefined);
    sequelize.query.mockResolvedValue([user(1, 9)]);
    expect(await getEligibleReviewersQuery(5)).toEqual([]);
  });

  it("returns no ids for an empty id list without querying", async () => {
    expect(await getEligibleReviewerIdsQuery(5, [])).toEqual([]);
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  it("narrows to the requested ids", async () => {
    sequelize.query.mockResolvedValue([user(1, 1)]);
    expect(await getEligibleReviewerIdsQuery(5, [1, 2])).toEqual([1]);
    expect(sequelize.query.mock.calls[0][0]).toContain("id = ANY");
  });
});

describe("updateSubmissionRoutingQuery", () => {
  const routing = {
    lane: "senior",
    reason: "override_raised",
    score: 51,
    threshold: 50,
    closeCallMargin: 0,
    routedAt: "x",
  } as any;

  it("adds no routing condition without an expected value", async () => {
    sequelize.query.mockResolvedValue([undefined, 1]);
    expect(await updateSubmissionRoutingQuery(3, routing, 5)).toBe(true);
    const [sql, opts] = sequelize.query.mock.calls[0];
    expect(sql).not.toContain("IS NOT DISTINCT FROM");
    expect(opts.replacements).not.toHaveProperty("expected");
  });

  it("guards on the expected routing and reports a lost race as false", async () => {
    sequelize.query.mockResolvedValue([undefined, 0]);
    const expected = { ...routing, lane: "standard" };
    expect(await updateSubmissionRoutingQuery(3, routing, 5, undefined, expected)).toBe(false);
    const [sql, opts] = sequelize.query.mock.calls[0];
    expect(sql).toContain("routing IS NOT DISTINCT FROM CAST(:expected AS jsonb)");
    expect(opts.replacements.expected).toBe(JSON.stringify(expected));
  });

  it("treats a null expected value as 'no routing yet'", async () => {
    sequelize.query.mockResolvedValue([undefined, 1]);
    await updateSubmissionRoutingQuery(3, routing, 5, undefined, null);
    const [sql, opts] = sequelize.query.mock.calls[0];
    expect(sql).toContain("IS NOT DISTINCT FROM");
    expect(opts.replacements.expected).toBeNull();
  });
});
