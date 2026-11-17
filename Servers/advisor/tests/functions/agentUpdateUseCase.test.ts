import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/projectDeletion.utils", () => ({
  deleteProjectWithSideEffects: jest.fn(),
}));
jest.mock("../../../utils/userPermission.utils", () => ({
  userHasPermission: jest.fn(),
}));
jest.mock("../../../utils/project.utils", () => ({
  getUserProjects: jest.fn(),
  calculateProjectRisks: jest.fn(),
  lockProjectForDelete: jest.fn(),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import { sequelize } from "../../../database/db";
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
    });

    it("records the requester as the last updater", async () => {
      await execute({ ...params, _userId: 9, _requesterId: 5 }, 4);
      const [sql, options] = mockQuery.mock.calls[0] as [string, any];
      expect(sql).toContain("last_updated_by = :last_updated_by");
      expect(options.replacements).toMatchObject({ last_updated_by: 5, organizationId: 4 });
      expect(options.replacements.last_updated).toBeInstanceOf(Date);
    });

    it("falls back to the approver, then to no one", async () => {
      await execute({ ...params, _userId: 9 }, 4);
      expect((mockQuery.mock.calls[0][1] as any).replacements.last_updated_by).toBe(9);
      await execute({ ...params }, 4);
      expect((mockQuery.mock.calls[1][1] as any).replacements.last_updated_by).toBeNull();
    });
  },
);
