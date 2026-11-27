/**
 * The organizational project created for EU AI Act (organization) is owned by
 * the organization's first Admin (earliest joined), else by the user who
 * enabled EU AI Act, else by the use case's owner. The user who enabled it is
 * recorded as its creator.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: any[]) => Promise<unknown>>();
const mockCreateProject = jest.fn<(...args: any[]) => Promise<unknown>>();

jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock("../project.utils", () => ({
  createNewProjectQuery: (...args: unknown[]) => mockCreateProject(...args),
}));
jest.mock("../eu.utils", () => ({
  createEUAIActOrganizationFrameworkQuery: jest.fn(async () => undefined),
}));
jest.mock("../deadline.utils", () => ({ getDeadlineAdminIdsQuery: jest.fn(async () => []) }));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyEuAiActOrganizationAdded: jest.fn(async () => undefined),
}));
jest.mock("../logger/fileLogger", () => ({ __esModule: true, default: { error: jest.fn() } }));

import { ensureEuAiActOrganizationFrameworkQuery } from "../euAiActOrganization.utils";

const transaction = { afterCommit: jest.fn() } as any;

/** Answers each query of the ensure flow; `admins` is what organization_members returns. */
function arrange(admins: Array<{ user_id: number }>, useCaseOwner: number | null = 40) {
  mockQuery.mockImplementation(async (sql: any) => {
    const text = String(sql);
    if (text.includes("SELECT project_title, owner, is_demo FROM projects")) {
      return [{ project_title: "Claims triage", owner: useCaseOwner, is_demo: false }];
    }
    if (text.includes("AS attached")) return [{ attached: false }];
    if (text.includes("is_organizational = true AND is_demo = false")) return [];
    if (text.includes("SELECT name FROM organizations")) return [{ name: "Acme" }];
    if (text.includes("FROM organization_members")) return admins;
    return [[], 0];
  });
  mockCreateProject.mockImplementation(async (project: any) => ({
    id: 99,
    project_title: project.project_title,
    owner: project.owner,
  }));
}

const created = () => {
  const [project, , , organizationId, creator] = mockCreateProject.mock.calls[0] as any[];
  return { owner: project.owner, organizationId, creator };
};

beforeEach(() => {
  mockQuery.mockReset();
  mockCreateProject.mockReset();
});

describe("owner of an auto-created organizational project", () => {
  it("is the organization's first Admin, with the enabling user as creator", async () => {
    arrange([{ user_id: 7 }]);
    expect(await ensureEuAiActOrganizationFrameworkQuery(5, 1, 12, transaction)).toBe(true);
    expect(created()).toEqual({ owner: 7, organizationId: 1, creator: 12 });

    const adminQuery = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("FROM organization_members"),
    )!;
    expect(String(adminQuery[0])).toMatch(/role_id = :adminRoleId\s+ORDER BY joined_at, user_id/);
    expect((adminQuery[1] as any).replacements).toEqual({ organizationId: 1, adminRoleId: 1 });
  });

  it("falls back to the enabling user when the organization has no Admin", async () => {
    arrange([]);
    await ensureEuAiActOrganizationFrameworkQuery(5, 1, 12, transaction);
    expect(created()).toEqual({ owner: 12, organizationId: 1, creator: 12 });
  });

  it("falls back to the use case's owner when no user enabled it", async () => {
    arrange([], 40);
    await ensureEuAiActOrganizationFrameworkQuery(5, 1, null, transaction);
    expect(created()).toEqual({ owner: 40, organizationId: 1, creator: null });
  });
});
