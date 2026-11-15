jest.mock("../../../utils/policyManager.utils", () => ({
  getAllPoliciesDueSoonQuery: jest.fn(),
}));
jest.mock("../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));
jest.mock("../slackNotificationService", () => ({
  sendSlackNotification: jest.fn(),
}));
jest.mock("../../../utils/policyReviewDate.utils", () => ({
  formatReviewDate: jest.fn(() => "Nov 20, 2026"),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { sendPolicyDueSoonNotification } from "../policyDueSoonNotification";
import { getAllPoliciesDueSoonQuery } from "../../../utils/policyManager.utils";
import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import { sendSlackNotification } from "../slackNotificationService";
import { SlackNotificationRoutingType } from "../../../domain.layer/enums/slack.enum";

const mockPolicies = getAllPoliciesDueSoonQuery as jest.Mock;
const mockOrgs = getAllOrganizationsQuery as jest.Mock;
const mockSend = sendSlackNotification as jest.Mock;

const policy = (id: number, authorId: number | null) => ({
  id,
  title: `Policy ${id}`,
  author_id: authorId,
  next_review_date: new Date("2026-11-20"),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockResolvedValue({ attempted: true, delivered: true });
});

describe("sendPolicyDueSoonNotification", () => {
  it("no organizations → nothing sent", async () => {
    mockOrgs.mockResolvedValue([]);

    await expect(sendPolicyDueSoonNotification()).resolves.toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("two organizations with several policies → one send per policy, for its organization", async () => {
    mockOrgs.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockPolicies.mockImplementation(async (orgId: number) =>
      orgId === 1 ? [policy(10, 5), policy(11, 6), policy(12, 5)] : [policy(20, 7), policy(21, 8)],
    );

    const sent = await sendPolicyDueSoonNotification();

    expect(sent).toBe(5);
    expect(mockSend).toHaveBeenCalledTimes(5);
    expect(mockSend.mock.calls.map(([params]) => [params.organizationId, params.userId])).toEqual([
      [1, 5],
      [1, 6],
      [1, 5],
      [2, 7],
      [2, 8],
    ]);
    for (const [params, message] of mockSend.mock.calls) {
      expect(params.routingType).toBe(SlackNotificationRoutingType.POLICY_REMINDERS_AND_STATUS);
      expect(message.message).toContain("is due on Nov 20, 2026");
    }
  });

  it("a policy without an author → sent with no user (organization-wide connections)", async () => {
    mockOrgs.mockResolvedValue([{ id: 3 }]);
    mockPolicies.mockResolvedValue([policy(30, null)]);

    await expect(sendPolicyDueSoonNotification()).resolves.toBe(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 3, userId: null }),
      expect.any(Object),
    );
  });

  it("one failing send doesn't stop the rest", async () => {
    mockOrgs.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockPolicies.mockImplementation(async (orgId: number) =>
      orgId === 1 ? [policy(10, 5), policy(11, 6)] : [policy(20, 7)],
    );
    mockSend.mockImplementation(async (params: { userId: number | null }) => {
      if (params.userId === 5) throw new Error("slack down");
      return { attempted: true, delivered: true };
    });

    const sent = await sendPolicyDueSoonNotification();

    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(sent).toBe(2);
  });

  it("an organization whose policy lookup fails doesn't stop the next one", async () => {
    mockOrgs.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockPolicies.mockImplementation(async (orgId: number) => {
      if (orgId === 1) throw new Error("db blip");
      return [policy(20, 7)];
    });

    await expect(sendPolicyDueSoonNotification()).resolves.toBe(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 2 }),
      expect.any(Object),
    );
  });

  it("an organization with no admins doesn't crash and still sends its policies", async () => {
    // The job no longer looks up admins at all; an organization without any
    // Admin used to crash on admins[0].
    mockOrgs.mockResolvedValue([{ id: 4 }, { id: 5 }]);
    mockPolicies.mockImplementation(async (orgId: number) => (orgId === 4 ? [] : [policy(50, 9)]));

    await expect(sendPolicyDueSoonNotification()).resolves.toBe(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 5, userId: 9 }),
      expect.any(Object),
    );
  });
});
