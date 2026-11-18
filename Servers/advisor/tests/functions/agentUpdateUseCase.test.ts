import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/projectDeletion.utils", () => ({
  deleteProjectWithSideEffects: jest.fn(),
}));
jest.mock("../../../utils/userPermission.utils", () => ({
  userHasPermission: jest.fn(),
  getUserRoleInOrganization: jest.fn(),
}));
jest.mock("../../../utils/project.utils", () => ({
  getProjectAccessQuery: jest.fn(),
  getUserProjects: jest.fn(),
  calculateProjectRisks: jest.fn(),
  lockProjectForDelete: jest.fn(),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import { getUserRoleInOrganization, userHasPermission } from "../../../utils/userPermission.utils";
import { getProjectAccessQuery } from "../../../utils/project.utils";
import "../../functions/useCaseFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

const mockQuery = sequelize.query as unknown as jest.Mock<any>;

/** U-M4: every use case write records who made it and when, set on the server. */
describe.each(["agent_update_use_case", "agent_update_use_case_status"])(
  "%s executor",
  (toolName) => {
    const execute = writeToolExecutors.get(toolName)!;
    const params = { use_case_id: 12, status: "In progress", goal: "Answer questions" };

    beforeEach(() => {
      jest.clearAllMocks();
      mockQuery.mockResolvedValue([[{ id: 12 }]]);
      // The acting user may edit use cases and can access this one.
      (userHasPermission as unknown as jest.Mock<any>).mockResolvedValue(true);
      (getUserRoleInOrganization as unknown as jest.Mock<any>).mockResolvedValue({
        name: "Editor",
      });
      (getProjectAccessQuery as unknown as jest.Mock<any>).mockResolvedValue("allowed");
    });

    it("records the requester as the last updater", async () => {
      await execute({ ...params, _userId: 9, _requesterId: 5 }, 4);
      const [sql, options] = mockQuery.mock.calls[0] as [string, any];
      expect(sql).toContain("last_updated_by = :last_updated_by");
      expect(options.replacements).toMatchObject({ last_updated_by: 5, organizationId: 4 });
      expect(options.replacements.last_updated).toBeInstanceOf(Date);
    });

    it("falls back to the approver", async () => {
      await execute({ ...params, _userId: 9 }, 4);
      expect((mockQuery.mock.calls[0][1] as any).replacements.last_updated_by).toBe(9);
    });

    it("writes nothing without an acting user", async () => {
      await execute({ ...params }, 4);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  },
);
