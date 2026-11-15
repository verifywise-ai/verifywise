jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/notification.utils", () => ({
  createNotificationQuery: jest.fn().mockResolvedValue({ id: 1 }),
  createBulkNotificationsQuery: jest.fn(),
}));
jest.mock("../notificationService", () => ({
  notificationService: { sendEmailWithTemplate: jest.fn().mockResolvedValue(undefined) },
}));

import logger from "../../utils/logger/fileLogger";
import { createNotificationQuery } from "../../utils/notification.utils";
import { notificationService } from "../notificationService";
import { notifyAiAppAssessmentsAssigned } from "../inAppNotification.service";

const createRow = createNotificationQuery as jest.Mock;
const sendEmail = notificationService.sendEmailWithTemplate as jest.Mock;
const owner = { id: 7, name: "Ada", email: "ada@example.com" };

describe("notifyAiAppAssessmentsAssigned", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores one in-app summary and queues one email, both linking to the owner's list", async () => {
    await notifyAiAppAssessmentsAssigned(3, owner, 12, "Grace");

    expect(createRow).toHaveBeenCalledTimes(1);
    expect(createRow.mock.calls[0][0]).toMatchObject({
      user_id: 7,
      title: "12 AI app assessments to complete",
      action_url: "/ai-apps/assessments?assigned=me",
    });
    expect(createRow.mock.calls[0][1]).toBe(3);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, template, variables] = sendEmail.mock.calls[0];
    expect(to).toBe("ada@example.com");
    expect(subject).toBe("12 AI app assessments to complete");
    expect(template).toBe("ai-app-assessments-assigned.mjml");
    expect(variables.assessments_url).toMatch(/\/ai-apps\/assessments\?assigned=me$/);
  });

  it("uses the singular for one assessment", async () => {
    await notifyAiAppAssessmentsAssigned(3, owner, 1, "Grace");
    expect(createRow.mock.calls[0][0].title).toBe("1 AI app assessment to complete");
  });

  it("logs a failed email and still resolves", async () => {
    sendEmail.mockRejectedValueOnce(new Error("smtp down"));
    await expect(notifyAiAppAssessmentsAssigned(3, owner, 2, "Grace")).resolves.toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("smtp down"));
  });

  it("rejects when the in-app row can't be stored, so it isn't counted", async () => {
    createRow.mockRejectedValueOnce(new Error("db down"));
    await expect(notifyAiAppAssessmentsAssigned(3, owner, 2, "Grace")).rejects.toThrow("db down");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
