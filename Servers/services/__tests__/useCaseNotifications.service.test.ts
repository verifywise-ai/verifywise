jest.mock("../../utils/user.utils", () => ({ getUserByIdQuery: jest.fn() }));
jest.mock("../../utils/logger/logHelper", () => ({ logFailure: jest.fn() }));
jest.mock("../userNotification/projectNotifications", () => ({
  sendProjectCreatedNotification: jest.fn(),
  sendUserAddedToProjectNotification: jest.fn(),
}));
jest.mock("../slack/slackNotificationService", () => ({ sendSlackNotification: jest.fn() }));
jest.mock("../projects/approvalRequest.service", () => ({
  createUseCaseApprovalRequest: jest.fn(),
  notifyUseCaseApprovalRequested: jest.fn(),
}));
jest.mock("../externalOwnerNotification.service", () => ({
  notifyExternalOwnerAssigned: jest.fn(),
}));
jest.mock("../inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn(),
  notifyApprovalAutoApproved: jest.fn(),
}));

import { getUserByIdQuery } from "../../utils/user.utils";
import { sendSlackNotification } from "../slack/slackNotificationService";
import { notifyExternalOwnerAssigned } from "../externalOwnerNotification.service";
import { notifyUserAssigned } from "../inAppNotification.service";
import { sendProjectCreatedNotification } from "../userNotification/projectNotifications";
import { notifyUseCaseCreated, notifyUseCaseUpdated } from "../useCaseNotifications.service";

const LOG = { functionName: "test", fileName: "test.ts" };
const userById = getUserByIdQuery as unknown as jest.Mock;
const resolved = (fn: unknown) => (fn as jest.Mock).mockResolvedValue(undefined);

beforeEach(() => {
  jest.clearAllMocks();
  [sendSlackNotification, notifyExternalOwnerAssigned, notifyUserAssigned].forEach(resolved);
  resolved(sendProjectCreatedNotification);
});

describe.each([
  ["throws", () => userById.mockRejectedValue(new Error("db down"))],
  ["finds no one", () => userById.mockResolvedValue(undefined)],
])("when the actor lookup %s", (_label, arrange) => {
  beforeEach(arrange);

  it("still tells a user owner on create, with a generic name, and skips Slack", async () => {
    await notifyUseCaseCreated({ id: 3, project_title: "P", owner: 7 } as any, null, 9, 4, LOG);
    expect(notifyUserAssigned).toHaveBeenCalledWith(
      4,
      7,
      expect.objectContaining({ entityId: 3 }),
      "Someone",
      expect.any(String),
    );
    expect(sendSlackNotification).not.toHaveBeenCalled();
  });

  it("still emails an external owner on create", async () => {
    await notifyUseCaseCreated(
      { id: 3, project_title: "P", owner: null, external_owner_email: "a@b.test" } as any,
      null,
      9,
      4,
      LOG,
    );
    expect(notifyExternalOwnerAssigned).toHaveBeenCalled();
  });

  it("still sends the owner and external owner notices on update", async () => {
    await notifyUseCaseUpdated(
      { owner: 5, external_owner_email: null },
      { id: 3, project_title: "P", owner: 7, external_owner_email: null, members: [] } as any,
      [],
      9,
      4,
      LOG,
    );
    expect(notifyUserAssigned).toHaveBeenCalledWith(
      4,
      7,
      expect.anything(),
      "Someone",
      expect.any(String),
    );
  });
});
