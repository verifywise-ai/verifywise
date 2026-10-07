import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../utils/inviteEmail.utils", () => ({
  sendInviteEmail: jest.fn(),
}));
jest.mock("../../utils/invitation.utils", () => ({
  createInvitationQuery: jest.fn(),
}));
// The role ceiling is covered in vwmailer.ctrl.test.ts.
jest.mock("../../utils/inviteRole.utils", () => ({
  inviteRoleRefusal: jest.fn(async () => null),
  pendingInvitationToReplace: jest.fn(async () => ({ replace: null, refused: false })),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));

import { invite } from "../vwmailer.ctrl";
import { sendInviteEmail } from "../../utils/inviteEmail.utils";
import { createInvitationQuery } from "../../utils/invitation.utils";
import { INVITATION_LIFETIME_MS } from "../../utils/jwt.utils";

const mockSend = sendInviteEmail as jest.MockedFunction<typeof sendInviteEmail>;
const mockCreate = createInvitationQuery as jest.MockedFunction<typeof createInvitationQuery>;

const req = (): any => ({ userId: 9, organizationId: 42, t: (k: string) => k, lang: "en" });
const createRes = (): any => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const body: any = { to: "new@example.com", name: "New", roleId: 3, organizationId: 42 };

// The link only registers while it matches its invitation row, so the row is
// saved first and the email carries a link for that row's expiry.
describe("vwmailer.ctrl invite: invitation row before email", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({} as any);
    mockSend.mockImplementation(async (params: any) => ({
      link: "http://x/user-reg?token=t",
      expiresAt: params.expiresAt,
      info: {},
    }));
  });

  it("saves the invitation, then sends a link for the saved expiry", async () => {
    const before = Date.now();
    const res = createRes();
    await invite(req(), res, body);

    expect(res.status).toHaveBeenCalledWith(200);
    const savedExpiry = mockCreate.mock.calls[0][6] as Date;
    expect(savedExpiry.getTime()).toBeGreaterThanOrEqual(before + INVITATION_LIFETIME_MS);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: savedExpiry }));
    expect(mockCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mockSend.mock.invocationCallOrder[0],
    );
  });

  it("sends no email when the invitation cannot be saved", async () => {
    mockCreate.mockRejectedValueOnce(new Error("db down"));
    const res = createRes();
    await invite(req(), res, body);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
