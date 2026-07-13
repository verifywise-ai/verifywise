jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
import { resolveRecipients, currentIsoWeek } from "../aiTrustIndex.utils";
import { sequelize } from "../../database/db";
import logger from "../logger/fileLogger";

const q = sequelize.query as jest.Mock;

describe("currentIsoWeek", () => {
  it("formats ISO week", () => {
    expect(currentIsoWeek(new Date(Date.UTC(2026, 5, 15)))).toMatch(/^2026-W\d{2}$/);
  });
});

describe("resolveRecipients", () => {
  beforeEach(() => {
    q.mockReset();
    (logger.warn as jest.Mock).mockReset();
    (logger.info as jest.Mock).mockReset();
  });
  it("unions configured users and free-text emails", async () => {
    q.mockResolvedValueOnce([{ recipient_user_ids: [1], recipient_emails: ["dpo@acme.com"] }]) // settings
      .mockResolvedValueOnce([{ email: "user1@acme.com" }]); // user emails for org
    const r = await resolveRecipients(7);
    expect(r.sort()).toEqual(["dpo@acme.com", "user1@acme.com"]);
  });
  it("returns an empty list and does NOT fall back to Admins/SuperAdmins when nothing is configured", async () => {
    // By design there is no Admin/SuperAdmin fallback: managing recipients is the
    // admin's duty, and an org with no configured recipients gets no digest.
    q.mockResolvedValueOnce([{ recipient_user_ids: [], recipient_emails: [] }]); // settings only
    const r = await resolveRecipients(7);
    expect(r).toEqual([]);
    // Only the settings query ran — no second query for roles/Admins/SuperAdmins.
    expect(q).toHaveBeenCalledTimes(1);
    const everySql = q.mock.calls.map((c) => String(c[0])).join("\n");
    expect(everySql).not.toMatch(/Admin/i);
    expect(everySql).not.toMatch(/roles/i);
  });
  it("logs an info note (not a warning) when an org has changes but no configured recipients", async () => {
    q.mockResolvedValueOnce([{ recipient_user_ids: [], recipient_emails: [] }]); // settings only
    await resolveRecipients(7);
    expect(logger.warn as jest.Mock).not.toHaveBeenCalled();
    expect(logger.info as jest.Mock).toHaveBeenCalledTimes(1);
    expect((logger.info as jest.Mock).mock.calls[0][0]).toMatch(/no configured recipients/);
  });
});
