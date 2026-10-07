import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/invitation.utils", () => ({
  getInvitationsByTenantQuery: jest.fn(),
  getInvitationByIdQuery: jest.fn(),
  revokeInvitationQuery: jest.fn(),
  updateInvitationExpiryQuery: jest.fn(),
  // The state the guarded writes compare, as the real helper builds it.
  checkedInvitation: (row: any) => ({
    id: row.id,
    roleId: row.role_id,
    expiresAtMs: Number(row.expires_at_ms),
  }),
}));

jest.mock("../../utils/inviteEmail.utils", () => ({
  sendInviteEmail: jest.fn(),
}));

jest.mock("../../utils/inviteRole.utils", () => ({
  inviteRoleRefusal: jest.fn(),
}));

// Import controller AFTER mocks
import { getInvitations, revokeInvitation, resendInvitation } from "../invitation.ctrl";
import {
  getInvitationsByTenantQuery,
  getInvitationByIdQuery,
  revokeInvitationQuery,
  updateInvitationExpiryQuery,
} from "../../utils/invitation.utils";
import { sendInviteEmail } from "../../utils/inviteEmail.utils";
import { inviteRoleRefusal } from "../../utils/inviteRole.utils";

const mockGetAll = getInvitationsByTenantQuery as jest.MockedFunction<
  typeof getInvitationsByTenantQuery
>;
const mockGetById = getInvitationByIdQuery as jest.MockedFunction<typeof getInvitationByIdQuery>;
const mockRevoke = revokeInvitationQuery as jest.MockedFunction<typeof revokeInvitationQuery>;
const mockUpdateExpiry = updateInvitationExpiryQuery as jest.MockedFunction<
  typeof updateInvitationExpiryQuery
>;
const mockSendEmail = sendInviteEmail as jest.MockedFunction<typeof sendInviteEmail>;
const mockRoleRefusal = inviteRoleRefusal as jest.MockedFunction<typeof inviteRoleRefusal>;

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    lang: "en",
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("invitation.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoleRefusal.mockResolvedValue(null);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getInvitations", () => {
    it("should return 200 with invitations", async () => {
      const invitationsData = [{ id: 1, email: "a@b.com" }];
      mockGetAll.mockResolvedValue(invitationsData as any);
      const req = createReq();
      const res = createRes();

      await getInvitations(req, res);

      expect(mockGetAll).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ invitations: invitationsData });
    });

    it("should return 200 with empty array", async () => {
      mockGetAll.mockResolvedValue([]);
      const req = createReq();
      const res = createRes();

      await getInvitations(req, res);

      expect(mockGetAll).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ invitations: [] });
    });

    it("should return 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();

      await getInvitations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        error: "Failed to fetch invitations",
      });
    });
  });

  describe("revokeInvitation", () => {
    beforeEach(() => {
      mockGetById.mockResolvedValue({ id: 1, role_id: 3 } as any);
      mockRoleRefusal.mockResolvedValue(null);
    });

    it("refuses to revoke an invitation for a role above the caller's access", async () => {
      mockRoleRefusal.mockResolvedValue("exceeds_access");
      const req = createReq({ params: { id: "1" }, role: "Team lead" });
      const res = createRes();

      await revokeInvitation(req, res);

      expect(mockRoleRefusal).toHaveBeenCalledWith(1, "Team lead", 3);
      expect(mockRevoke).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("still revokes an invitation whose role no longer exists", async () => {
      mockRoleRefusal.mockResolvedValue("unknown_role");
      mockRevoke.mockResolvedValue({ id: 1 } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await revokeInvitation(req, res);

      expect(mockRevoke).toHaveBeenCalledWith(1, expect.objectContaining({ id: 1, roleId: 3 }));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns 404 without revoking when the invitation is not in the organization", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await revokeInvitation(req, res);

      expect(mockRevoke).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 when invitation is revoked", async () => {
      mockRevoke.mockResolvedValue({ id: 1 } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await revokeInvitation(req, res);

      expect(mockRevoke).toHaveBeenCalledWith(1, expect.objectContaining({ id: 1, roleId: 3 }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Invitation revoked" });
    });

    it("should return 400 for invalid ID", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();

      await revokeInvitation(req, res);

      expect(mockRevoke).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "Invalid invitation ID",
      });
    });

    it("should return 404 when invitation not found", async () => {
      // Accepted or revoked between the read and the delete.
      mockGetById.mockResolvedValueOnce({ id: 1, role_id: 3 } as any).mockResolvedValueOnce(null);
      mockRevoke.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await revokeInvitation(req, res);

      expect(mockRevoke).toHaveBeenCalledWith(1, expect.objectContaining({ id: 1, roleId: 3 }));
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Not Found",
        data: "Invitation not found",
      });
    });

    it("answers 409 when a re-invite changed the invitation after the check", async () => {
      // The delete matches only the role that was checked; the row is still
      // pending, under another role.
      mockRevoke.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await revokeInvitation(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("should return 500 on error", async () => {
      mockRevoke.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await revokeInvitation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        error: "Failed to revoke invitation",
      });
    });
  });

  describe("resendInvitation", () => {
    it("should return 200 when resent successfully", async () => {
      mockGetById.mockResolvedValue({
        email: "a@b.com",
        name: "A",
        surname: "B",
        role_id: 1,
      } as any);
      mockSendEmail.mockResolvedValue({
        link: "link",
        info: {},
      } as any);
      mockUpdateExpiry.mockResolvedValue({
        email: "a@b.com",
        name: "A",
        surname: "B",
        role_id: 1,
      });
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(mockGetById).toHaveBeenCalledWith(1, 1);
      // The new expiry is saved first, and the link is signed for it.
      const savedExpiry = mockUpdateExpiry.mock.calls[0][2];
      expect(savedExpiry).toBeInstanceOf(Date);
      expect(mockUpdateExpiry).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ roleId: 1 }),
        savedExpiry,
      );
      expect(mockSendEmail).toHaveBeenCalledWith({
        email: "a@b.com",
        name: "A",
        surname: "B",
        roleId: 1,
        organizationId: 1,
        lang: "en",
        expiresAt: savedExpiry,
      });
      expect(mockUpdateExpiry.mock.invocationCallOrder[0]).toBeLessThan(
        mockSendEmail.mock.invocationCallOrder[0],
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Invitation resent successfully",
      });
    });

    it("should return 206 when email fails", async () => {
      mockGetById.mockResolvedValue({
        email: "a@b.com",
        name: "A",
        surname: "B",
        role_id: 1,
      } as any);
      mockSendEmail.mockResolvedValue({
        link: "link",
        info: { error: { name: "SendError", message: "fail" } },
      } as any);
      mockUpdateExpiry.mockResolvedValue({
        email: "a@b.com",
        name: "A",
        surname: "B",
        role_id: 1,
      });
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(mockGetById).toHaveBeenCalledWith(1, 1);
      // The new expiry is saved first, and the link is signed for it.
      const savedExpiry = mockUpdateExpiry.mock.calls[0][2];
      expect(savedExpiry).toBeInstanceOf(Date);
      expect(mockUpdateExpiry).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ roleId: 1 }),
        savedExpiry,
      );
      expect(mockSendEmail).toHaveBeenCalledWith({
        email: "a@b.com",
        name: "A",
        surname: "B",
        roleId: 1,
        organizationId: 1,
        lang: "en",
        expiresAt: savedExpiry,
      });
      expect(mockUpdateExpiry.mock.invocationCallOrder[0]).toBeLessThan(
        mockSendEmail.mock.invocationCallOrder[0],
      );
      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.json).toHaveBeenCalledWith({
        message: "Partial Content",
        data: {
          error: "SendError: fail",
          link: "link",
        },
      });
    });

    it("refuses to resend an invitation whose role the caller may not grant", async () => {
      // Resending re-issues a working link; a custom role allowed to invite
      // must not re-issue an Admin invitation and register through it.
      mockGetById.mockResolvedValue({
        email: "a@b.com",
        name: "A",
        surname: "B",
        role_id: 1,
      } as any);
      mockRoleRefusal.mockResolvedValue("exceeds_access");
      const req = createReq({ params: { id: "1" }, role: "Team lead" });
      const res = createRes();

      await resendInvitation(req, res);

      expect(mockRoleRefusal).toHaveBeenCalledWith(1, "Team lead", 1);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockUpdateExpiry).not.toHaveBeenCalled();
    });

    it("extends only while the invitation is as checked, else answers 409", async () => {
      // The ceiling was checked against role 3; a re-invite that changed the
      // role in between must not get a link for the new role from this caller.
      mockGetById.mockResolvedValue({
        email: "a@b.com",
        name: "A",
        surname: "B",
        role_id: 3,
      } as any);
      mockUpdateExpiry.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(mockUpdateExpiry).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ roleId: 3 }),
        expect.any(Date),
      );
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("sends nothing when the new expiry cannot be saved", async () => {
      // An emailed link only registers while it matches the row; a link for
      // an unsaved expiry would be dead on arrival.
      mockGetById.mockResolvedValue({
        email: "a@b.com",
        name: "A",
        surname: "B",
        role_id: 1,
      } as any);
      mockUpdateExpiry.mockRejectedValue(new Error("db down"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("returns 404 and sends nothing when the invitation stopped being pending", async () => {
      // Accepted or revoked between the read and the update: no row updated.
      mockGetById
        .mockResolvedValueOnce({
          email: "a@b.com",
          name: "A",
          surname: "B",
          role_id: 1,
        } as any)
        .mockResolvedValueOnce(null);
      mockUpdateExpiry.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Not Found",
        data: "Invitation not found",
      });
    });

    it("should return 400 for invalid ID", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(mockGetById).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "Invalid invitation ID",
      });
    });

    it("should return 404 when invitation not found", async () => {
      mockGetById.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(mockGetById).toHaveBeenCalledWith(1, 1);
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Not Found",
        data: "Invitation not found",
      });
    });

    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        error: "Failed to resend invitation",
      });
    });
  });
});
