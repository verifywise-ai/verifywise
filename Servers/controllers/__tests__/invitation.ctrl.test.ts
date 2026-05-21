import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/invitation.utils", () => ({
  getInvitationsByTenantQuery: jest.fn(),
  getInvitationByIdQuery: jest.fn(),
  revokeInvitationQuery: jest.fn(),
  updateInvitationExpiryQuery: jest.fn(),
}));

jest.mock("../../utils/inviteEmail.utils", () => ({
  sendInviteEmail: jest.fn(),
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

const mockGetAll = getInvitationsByTenantQuery as jest.MockedFunction<
  typeof getInvitationsByTenantQuery
>;
const mockGetById = getInvitationByIdQuery as jest.MockedFunction<typeof getInvitationByIdQuery>;
const mockRevoke = revokeInvitationQuery as jest.MockedFunction<typeof revokeInvitationQuery>;
const mockUpdateExpiry = updateInvitationExpiryQuery as jest.MockedFunction<
  typeof updateInvitationExpiryQuery
>;
const mockSendEmail = sendInviteEmail as jest.MockedFunction<typeof sendInviteEmail>;

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
        error: "Failed to fetch invitations",
      });
    });
  });

  describe("revokeInvitation", () => {
    it("should return 200 when invitation is revoked", async () => {
      mockRevoke.mockResolvedValue({ id: 1 } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await revokeInvitation(req, res);

      expect(mockRevoke).toHaveBeenCalledWith(1, 1);
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
        error: "Invalid invitation ID",
      });
    });

    it("should return 404 when invitation not found", async () => {
      mockRevoke.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await revokeInvitation(req, res);

      expect(mockRevoke).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invitation not found",
      });
    });

    it("should return 500 on error", async () => {
      mockRevoke.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await revokeInvitation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
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
        expiresAt: "date",
        info: {},
      } as any);
      mockUpdateExpiry.mockResolvedValue(undefined);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(mockGetById).toHaveBeenCalledWith(1, 1);
      expect(mockSendEmail).toHaveBeenCalledWith({
        email: "a@b.com",
        name: "A",
        surname: "B",
        roleId: 1,
        organizationId: 1,
        lang: "en",
      });
      expect(mockUpdateExpiry).toHaveBeenCalledWith(1, 1, "date");
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
        expiresAt: "date",
        info: { error: { name: "SendError", message: "fail" } },
      } as any);
      mockUpdateExpiry.mockResolvedValue(undefined);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(mockGetById).toHaveBeenCalledWith(1, 1);
      expect(mockSendEmail).toHaveBeenCalledWith({
        email: "a@b.com",
        name: "A",
        surname: "B",
        roleId: 1,
        organizationId: 1,
        lang: "en",
      });
      expect(mockUpdateExpiry).toHaveBeenCalledWith(1, 1, "date");
      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.json).toHaveBeenCalledWith({
        error: "SendError: fail",
        message: "link",
      });
    });

    it("should return 400 for invalid ID", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(mockGetById).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid invitation ID",
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
        error: "Invitation not found",
      });
    });

    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await resendInvitation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to resend invitation",
      });
    });
  });
});
