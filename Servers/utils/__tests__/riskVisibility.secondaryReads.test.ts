import { describe, it, expect, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../policyManager.utils", () => ({
  policyExistsInOrganizationQuery: jest.fn().mockResolvedValue(true),
}));

import { sequelize } from "../../database/db";
import { getPortfolioByProject, recordPortfolioSnapshot } from "../quantitativeRisk.utils";
import {
  getAllPolicyLinkedObjectsQuery,
  getPolicyLinkedObjectByIdQuery,
  linkObjectsToPolicyQuery,
} from "../policyLinkedObject.utils";
import { ForbiddenException } from "../../domain.layer/exceptions/custom.exception";
import { wiseSearch } from "../search.utils";
import { SYSTEM_RISK_VIEWER } from "../riskVisibility.utils";

const mockQuery = sequelize.query as jest.Mock;
const editor = { userId: 9, role: "Editor" };
const admin = { userId: 1, role: "Admin" };

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
});

describe("getPortfolioByProject", () => {
  it("sums only the use case's risks a non-Admin can see", async () => {
    await getPortfolioByProject(4, 12, editor);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("prv.risk_id = r.id");
    // a hidden use case gives only the risks the viewer owns or approves
    expect(sql).toContain("pvs.id = :projectId");
    expect(options.replacements).toEqual({ organizationId: 4, projectId: 12, visibilityUserId: 9 });
  });

  it.each([
    ["an Admin", admin],
    ["the system viewer", SYSTEM_RISK_VIEWER],
  ])("sums every risk of the use case for %s", async (_label, viewer) => {
    await getPortfolioByProject(4, 12, viewer);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).not.toContain("visibilityUserId");
    expect(options.replacements).toEqual({ organizationId: 4, projectId: 12 });
  });

  it("records project snapshots organization-wide (ruling J4)", async () => {
    await recordPortfolioSnapshot(4, 12);
    expect(mockQuery.mock.calls[0][0]).not.toContain("visibilityUserId");
  });
});

describe("policy linked objects", () => {
  it.each([
    ["all links", () => getAllPolicyLinkedObjectsQuery(4, editor)],
    ["one policy's links", () => getPolicyLinkedObjectByIdQuery(2, 4, editor)],
  ])("leave out %s to risks a non-Admin cannot see", async (_label, read) => {
    await read();
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("object_type <> 'risk' OR EXISTS");
    expect(sql).toContain("lr.id = policy_linked_objects.object_id");
    expect(sql).toContain("prv.risk_id = lr.id");
    expect(options.replacements).toMatchObject({ organizationId: 4, visibilityUserId: 9 });
  });

  it("keep every link for an Admin", async () => {
    await getPolicyLinkedObjectByIdQuery(2, 4, admin);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).not.toContain("object_type <> 'risk'");
    expect(options.replacements).toEqual({ organizationId: 4, policy_id: 2 });
  });
});

describe("linking objects to a policy", () => {
  const TX = { id: "tx" } as never;
  const ownershipCheck = () =>
    mockQuery.mock.calls.find(([sql]) => String(sql).includes("SELECT COUNT(*)")) as [
      string,
      { replacements: Record<string, unknown> },
    ];

  it("counts a risk a non-Admin cannot see as one outside the organization", async () => {
    // One of the two ids is hidden, so only one is counted: the same 403 an
    // unknown id gets.
    mockQuery.mockResolvedValueOnce([{ count: "1" }]);
    await expect(linkObjectsToPolicyQuery(2, "risk", [7, 8], 4, TX, editor)).rejects.toThrow(
      ForbiddenException,
    );
    const [sql, { replacements }] = ownershipCheck();
    expect(sql).toContain("prv.risk_id = risks.id");
    expect(replacements).toMatchObject({ organizationId: 4, visibilityUserId: 9 });
  });

  it.each([
    ["an Admin", admin],
    ["the system viewer", SYSTEM_RISK_VIEWER],
  ])("checks only the organization for %s", async (_label, viewer) => {
    mockQuery.mockResolvedValueOnce([{ count: "1" }]);
    await linkObjectsToPolicyQuery(2, "risk", [7], 4, TX, viewer);
    expect(ownershipCheck()[0]).not.toContain("visibilityUserId");
  });

  it("does not apply the risk rule to evidence", async () => {
    mockQuery.mockResolvedValueOnce([{ count: "1" }]);
    await linkObjectsToPolicyQuery(2, "evidence", [7], 4, TX, editor);
    expect(ownershipCheck()[0]).not.toContain("visibilityUserId");
  });
});

describe("Wise Search risk results", () => {
  const riskSearch = () =>
    mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM risks")) as [
      string,
      { replacements: Record<string, unknown> },
    ];

  it("returns only the risks a non-Admin can see", async () => {
    await wiseSearch({ query: "bias", organizationId: 4, userId: 9, riskViewer: editor });
    const [sql, { replacements }] = riskSearch();
    expect(sql).toContain("prv.risk_id = risks.id");
    expect(sql).toContain("risks.risk_owner = :visibilityUserId");
    expect(replacements).toMatchObject({ organizationId: 4, visibilityUserId: 9 });
  });

  it("does not narrow the risk results for an Admin", async () => {
    await wiseSearch({ query: "bias", organizationId: 4, userId: 1, riskViewer: admin });
    const [sql, { replacements }] = riskSearch();
    expect(sql).not.toContain("visibilityUserId");
    expect(replacements.visibilityUserId).toBeUndefined();
  });
});
