import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../utils/inviteRole.utils", () => ({
  userInviteRefusal: jest.fn(),
  pendingInvitationToReplace: jest.fn(),
}));

import { writeToolExecutors } from "../../confirmation/createWriteTool";
import "../../functions/adminFunctions";
import { sequelize } from "../../../database/db";
import { pendingInvitationToReplace, userInviteRefusal } from "../../../utils/inviteRole.utils";

const mockRefusal = userInviteRefusal as jest.MockedFunction<typeof userInviteRefusal>;
const mockReplace = pendingInvitationToReplace as jest.MockedFunction<
  typeof pendingInvitationToReplace
>;
const mockQuery = sequelize.query as unknown as jest.Mock;

const execute = (params: Record<string, unknown>) =>
  writeToolExecutors.get("agent_send_invitation")!(params, 7);

// The tool runs as the approving user, who needs only aiApproval.admin.
describe("agent_send_invitation applies the invite rules to the approver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ["not_allowed", "You do not have permission to invite users"],
    ["unknown_role", "Unknown role"],
    ["exceeds_access", "You cannot invite a user with more access than your own"],
  ] as const)("refuses %s and writes nothing", async (refusal, message) => {
    mockRefusal.mockResolvedValue(refusal);

    await expect(execute({ email: "new@example.com", role_id: 1, _userId: 5 })).rejects.toThrow(
      message,
    );
    expect(mockRefusal).toHaveBeenCalledWith(7, 5, 1);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("refuses to replace a pending invitation the approver could not revoke", async () => {
    mockRefusal.mockResolvedValue(null);
    mockReplace.mockResolvedValue({
      replace: { id: 8, roleId: 1, expiresAtMs: 0 },
      refused: true,
    });

    await expect(execute({ email: "new@example.com", role_id: 3, _userId: 5 })).rejects.toThrow(
      "You cannot replace an invitation for a role with more access than your own",
    );
    expect(mockReplace).toHaveBeenCalledWith(7, "new@example.com", 3, expect.any(Function));
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
