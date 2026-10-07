import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../utils/invitation.utils", () => ({ createInvitationQuery: jest.fn() }));
jest.mock("../../../utils/inviteEmail.utils", () => ({ sendInviteEmail: jest.fn() }));
// The role ceiling is covered in agentSendInvitation.authorization.test.ts.
jest.mock("../../../utils/inviteRole.utils", () => ({
  userInviteRefusal: jest.fn(async () => null),
  pendingInvitationToReplace: jest.fn(async () => ({ replace: null, refused: false })),
}));

import { writeToolExecutors } from "../../confirmation/createWriteTool";
import "../../functions/adminFunctions";
import { createInvitationQuery } from "../../../utils/invitation.utils";
import { sendInviteEmail } from "../../../utils/inviteEmail.utils";
import { INVITATION_LIFETIME_MS } from "../../../utils/jwt.utils";

const mockCreate = createInvitationQuery as jest.MockedFunction<typeof createInvitationQuery>;
const mockSend = sendInviteEmail as jest.MockedFunction<typeof sendInviteEmail>;

const execute = (params: Record<string, unknown>) =>
  writeToolExecutors.get("agent_send_invitation")!(params, 7);

describe("agent_send_invitation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 11, email: "new@example.com" } as any);
    mockSend.mockResolvedValue({ link: "https://app/user-reg?token=t", info: {} });
  });

  it("saves the invitation for the standard lifetime, then emails a link for that expiry", async () => {
    const before = Date.now();
    const result = await execute({
      email: "new@example.com",
      role_id: 3,
      name: "New",
      _userId: 5,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [orgId, email, name, surname, roleId, invitedBy, expiresAt] = mockCreate.mock.calls[0];
    expect([orgId, email, name, surname, roleId, invitedBy]).toEqual([
      7,
      "new@example.com",
      "New",
      "",
      3,
      5,
    ]);
    expect((expiresAt as Date).getTime()).toBeGreaterThanOrEqual(before + INVITATION_LIFETIME_MS);
    expect((expiresAt as Date).getTime()).toBeLessThanOrEqual(Date.now() + INVITATION_LIFETIME_MS);

    expect(mockSend).toHaveBeenCalledWith({
      email: "new@example.com",
      name: "New",
      roleId: 3,
      organizationId: 7,
      expiresAt,
    });
    expect(mockCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mockSend.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({ id: 11, status: "pending", email_sent: true });
  });

  it("reports a failed send without returning the registration link", async () => {
    mockSend.mockResolvedValue({
      link: "https://app/user-reg?token=secret",
      info: { error: { name: "SendError", message: "SMTP down" } },
    });

    const result = await execute({ email: "new@example.com", role_id: 3, _userId: 5 });

    expect(result).toMatchObject({ id: 11, status: "pending", email_sent: false });
    expect(JSON.stringify(result)).not.toContain("token=");
    expect(JSON.stringify(result)).toContain("SMTP down");
  });

  it("sends nothing when a re-invite changed the pending invitation meanwhile", async () => {
    mockCreate.mockResolvedValue(null);

    await expect(execute({ email: "new@example.com", role_id: 3, _userId: 5 })).rejects.toThrow(
      "The invitation was changed by someone else",
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends nothing when the invitation cannot be saved", async () => {
    mockCreate.mockRejectedValue(new Error("db down"));

    await expect(execute({ email: "new@example.com", role_id: 3, _userId: 5 })).rejects.toThrow(
      "db down",
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses to run without an inviting user", async () => {
    await expect(execute({ email: "new@example.com", role_id: 3 })).rejects.toThrow(
      "inviting user",
    );
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it.each([
    [{ email: "new@example.com", _userId: 5 }, "A valid role_id is required"],
    [{ email: "new@example.com", role_id: "admin", _userId: 5 }, "A valid role_id is required"],
    [{ email: "not-an-email", role_id: 3, _userId: 5 }, "A valid email address is required"],
    [{ role_id: 3, _userId: 5 }, "A valid email address is required"],
  ])("refuses bad model input %j before saving anything", async (params, message) => {
    await expect(execute(params)).rejects.toThrow(message);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
