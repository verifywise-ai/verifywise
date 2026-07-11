import { unionRecipients } from "../mrmAlerts.utils";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../services/inAppNotification.service", () => ({
  sendInAppNotification: jest.fn(),
}));
jest.mock("../../utils/mrmMonitoring.utils", () => ({
  getBreachNotificationRecipientsQuery: jest.fn(),
  getModelLabelQuery: jest.fn(),
}));
jest.mock("../../utils/mrmRevalidation.utils", () => ({
  getOpenValidationForModelQuery: jest.fn(),
}));
jest.mock("../../utils/mrmSettings.utils", () => ({
  getMrmOrgSettings: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

describe("unionRecipients", () => {
  it("dedups overlapping role and extra recipients, roles first", () => {
    expect(unionRecipients([3, 5], [5, 9, 3, 12])).toEqual([3, 5, 9, 12]);
  });

  it("handles empty sides", () => {
    expect(unionRecipients([], [7])).toEqual([7]);
    expect(unionRecipients([7], [])).toEqual([7]);
    expect(unionRecipients([], [])).toEqual([]);
  });
});
