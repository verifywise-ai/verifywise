import { describe, it, expect, jest, beforeAll, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

// Real jwt.utils (unlike register.middleware.test.ts): these tests sign an
// actual invitation token and move the clock, so they exercise the
// middleware's own expiry rule.
jest.mock("../../utils/invitation.utils", () => ({
  getPendingInvitationQuery: jest.fn(),
}));
jest.mock("../../utils/roleMap", () => ({
  hasRoleId: jest.fn(),
  getRoleNameById: jest.fn(),
  invalidateRoleMapCache: jest.fn(),
}));

import registerJWT from "../register.middleware";
import { generateInviteTokenUntil, INVITATION_LIFETIME_MS } from "../../utils/jwt.utils";
import { getPendingInvitationQuery } from "../../utils/invitation.utils";
import { hasRoleId } from "../../utils/roleMap";

const invite = { name: "Ada", roleId: 1, organizationId: 1, email: "ada@test.com" };
const sentAt = new Date("2026-10-06T12:00:00Z").getTime();
const day = 24 * 3600 * 1000;

const createRes = () => {
  const res: Partial<Response> = { locals: {} };
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  return res;
};

/** Send an invitation, then try to register with it `days` later. */
const registerAfter = async (days: number) => {
  jest.useFakeTimers({ now: sentAt });
  // Signed as sendInviteEmail signs it: for the invitation's stored expiry.
  const token = generateInviteTokenUntil(invite, new Date(sentAt + INVITATION_LIFETIME_MS))!;
  jest.setSystemTime(sentAt + days * day);

  const req = {
    headers: { authorization: `Bearer ${token}` },
    body: { roleId: 1, organizationId: 1, email: invite.email },
    t: (key: string) => key,
  } as unknown as Request;
  const res = createRes();
  const next = jest.fn();
  await registerJWT(req, res as Response, next);
  return { res, next };
};

describe("registerJWT invitation lifetime", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-jwt-secret-key-for-testing"; // nosemgrep: test-only JWT secret
  });

  beforeEach(() => {
    (hasRoleId as jest.Mock<any>).mockResolvedValue(true);
    // The current invitation, stored with the same expiry the link was signed for.
    (getPendingInvitationQuery as jest.Mock<any>).mockResolvedValue({
      id: 1,
      role_id: 1,
      expires_at_ms: sentAt + 30 * day,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("accepts an invitation 29 days after it was sent", async () => {
    const { res, next } = await registerAfter(29);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects an invitation 31 days after it was sent as expired", async () => {
    const { res, next } = await registerAfter(31);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(406);
  });
});
