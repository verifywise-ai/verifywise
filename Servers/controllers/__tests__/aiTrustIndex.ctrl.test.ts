jest.mock("../../utils/aiTrustIndex.utils", () => ({
  upsertSettingsQuery: jest.fn().mockResolvedValue(undefined),
  getSettingsQuery: jest.fn().mockResolvedValue({ recipientUserIds: [], recipientEmails: [] }),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
import { updateSettings } from "../aiTrustIndex.ctrl";
import { upsertSettingsQuery } from "../../utils/aiTrustIndex.utils";

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("updateSettings", () => {
  it("rejects non-admins with 403 and does not write", async () => {
    const req: any = {
      role: "Editor",
      organizationId: 7,
      userId: 1,
      body: { recipientUserIds: [], recipientEmails: [] },
    };
    const res = mockRes();
    await updateSettings(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(upsertSettingsQuery).not.toHaveBeenCalled();
  });
  it("rejects malformed emails with 400", async () => {
    const req: any = {
      role: "Admin",
      organizationId: 7,
      userId: 1,
      body: { recipientUserIds: [], recipientEmails: ["not-an-email"] },
    };
    const res = mockRes();
    await updateSettings(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("rejects non-integer recipientUserIds with 400 and does not write", async () => {
    const req: any = {
      role: "Admin",
      organizationId: 7,
      userId: 1,
      body: { recipientUserIds: ["abc"], recipientEmails: [] },
    };
    const res = mockRes();
    await updateSettings(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(upsertSettingsQuery).not.toHaveBeenCalled();
  });
  it("rejects fractional recipientUserIds with 400 and does not write", async () => {
    const req: any = {
      role: "Admin",
      organizationId: 7,
      userId: 1,
      body: { recipientUserIds: [1.5], recipientEmails: [] },
    };
    const res = mockRes();
    await updateSettings(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(upsertSettingsQuery).not.toHaveBeenCalled();
  });
  it("accepts an admin with valid input", async () => {
    const req: any = {
      role: "Admin",
      organizationId: 7,
      userId: 1,
      body: { recipientUserIds: [2], recipientEmails: ["dpo@acme.com"] },
    };
    const res = mockRes();
    await updateSettings(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(upsertSettingsQuery).toHaveBeenCalledWith(7, 1, [2], ["dpo@acme.com"]);
  });
});
