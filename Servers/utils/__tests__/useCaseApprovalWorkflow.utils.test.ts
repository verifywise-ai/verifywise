jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../database/db";
import { getUseCaseApprovalWorkflowQuery } from "../project.utils";

const query = sequelize.query as jest.Mock;

describe("getUseCaseApprovalWorkflowQuery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("scopes the use case and the workflow to the organization, with bound values", async () => {
    query.mockResolvedValueOnce([]);
    await getUseCaseApprovalWorkflowQuery(12, 7);
    const [sql, opts] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE p\.id = :id AND p\.organization_id = :organizationId/);
    expect(sql).toMatch(/aw\.organization_id = :organizationId/);
    expect(opts.replacements).toEqual({ id: 12, organizationId: 7 });
  });

  it("is null when the use case is not in the organization", async () => {
    query.mockResolvedValueOnce([]);
    expect(await getUseCaseApprovalWorkflowQuery(12, 7)).toBeNull();
  });

  it("returns an active workflow", async () => {
    query.mockResolvedValueOnce([
      { approval_workflow_id: "4", workflow_title: "Model risk review", is_active: true },
    ]);
    expect(await getUseCaseApprovalWorkflowQuery(12, 7)).toEqual({
      approval_workflow_id: 4,
      workflow_title: "Model risk review",
      workflow_is_active: true,
    });
  });

  it("marks an archived workflow inactive", async () => {
    query.mockResolvedValueOnce([
      { approval_workflow_id: 4, workflow_title: "Old review", is_active: false },
    ]);
    expect((await getUseCaseApprovalWorkflowQuery(12, 7))?.workflow_is_active).toBe(false);
  });

  it("keeps a stored workflow the organization-scoped join does not find, as unusable", async () => {
    query.mockResolvedValueOnce([{ approval_workflow_id: 4, workflow_title: null, is_active: null }]);
    expect(await getUseCaseApprovalWorkflowQuery(12, 7)).toEqual({
      approval_workflow_id: 4,
      workflow_title: null,
      workflow_is_active: false,
    });
  });

  it("returns nulls when no workflow is attached", async () => {
    query.mockResolvedValueOnce([
      { approval_workflow_id: null, workflow_title: null, is_active: null },
    ]);
    expect(await getUseCaseApprovalWorkflowQuery(12, 7)).toEqual({
      approval_workflow_id: null,
      workflow_title: null,
      workflow_is_active: null,
    });
  });
});
