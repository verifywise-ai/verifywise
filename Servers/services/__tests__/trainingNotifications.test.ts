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

import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { createNotificationQuery } from "../../utils/notification.utils";
import { notificationService } from "../notificationService";
import { notifyTrainingAssigned, notifyTrainingReminder } from "../inAppNotification.service";

const createRow = createNotificationQuery as jest.Mock;
const sendEmail = notificationService.sendEmailWithTemplate as jest.Mock;
const query = sequelize.query as jest.Mock;
const BASE_URL = "https://app.example.com";

describe("training notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockResolvedValue([{ name: "Ada", surname: "L", email: "ada@example.com" }]);
    createRow.mockResolvedValue({ id: 1 });
    sendEmail.mockResolvedValue(undefined);
  });

  describe("notifyTrainingAssigned", () => {
    const training = { id: 7, name: "AI literacy", dueDate: "2026-12-01" };

    it("points the in-app notice and the email at the trainee's page", async () => {
      await notifyTrainingAssigned(3, 11, training, "Grace", BASE_URL);

      expect(createRow.mock.calls[0][0]).toMatchObject({
        user_id: 11,
        title: "Training assigned",
        action_url: "/training/my-training",
      });
      expect(sendEmail.mock.calls[0]).toEqual([
        "ada@example.com",
        "Training assigned: AI literacy",
        "training-assigned.mjml",
        expect.objectContaining({
          training_due_date: "2026-12-01",
          training_url: `${BASE_URL}/training/my-training`,
        }),
      ]);
    });

    it("lets a caller whose recipient is not a trainee link elsewhere", async () => {
      await notifyTrainingAssigned(
        3,
        11,
        { ...training, actionPath: "/training?trainingId=7" },
        "Grace",
        BASE_URL,
      );

      expect(createRow.mock.calls[0][0].action_url).toBe("/training?trainingId=7");
      expect(sendEmail.mock.calls[0][3].training_url).toBe(`${BASE_URL}/training?trainingId=7`);
    });

    it("resolves when the email fails, and logs it", async () => {
      sendEmail.mockRejectedValue(new Error("smtp down"));

      await expect(
        notifyTrainingAssigned(3, 11, training, "Grace", BASE_URL),
      ).resolves.toBeUndefined();
      await new Promise((resolve) => setImmediate(resolve));

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("smtp down"));
    });
  });

  describe("notifyTrainingReminder", () => {
    const training = { id: 7, name: "AI literacy", dueDate: "2026-12-01" };

    it.each([
      ["due_soon", "Training due soon", "training_due_soon"],
      ["overdue", "Training overdue", "training_overdue"],
    ] as const)("sends the %s notice as %s", async (kind, title, type) => {
      await notifyTrainingReminder(3, 11, training, kind, BASE_URL);

      expect(createRow.mock.calls[0][0]).toMatchObject({
        type,
        title,
        action_url: "/training/my-training",
      });
      expect(sendEmail.mock.calls[0]).toEqual([
        "ada@example.com",
        `${title}: AI literacy`,
        "training-reminder.mjml",
        expect.objectContaining({
          reminder_title: title,
          training_url: `${BASE_URL}/training/my-training`,
        }),
      ]);
    });

    it("rejects on a failed email and stores no in-app notice, so a retry is clean", async () => {
      sendEmail.mockRejectedValue(new Error("smtp down"));

      await expect(notifyTrainingReminder(3, 11, training, "overdue", BASE_URL)).rejects.toThrow(
        "smtp down",
      );
      expect(createRow).not.toHaveBeenCalled();
    });

    it("rejects when the person has no email address", async () => {
      query.mockResolvedValue([]);

      await expect(notifyTrainingReminder(3, 11, training, "overdue", BASE_URL)).rejects.toThrow(
        "no email",
      );
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });
});
