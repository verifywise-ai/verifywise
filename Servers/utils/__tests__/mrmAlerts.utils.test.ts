import {
  isAutoFindingEligible,
  severityToFindingSeverity,
  unionRecipients,
  dispatchAlerts,
} from "../mrmAlerts.utils";
import { MrmEvalStatus, MrmThresholdSeverity } from "../../domain.layer/enums/mrmMonitoring.enum";
import { MrmFindingSeverity } from "../../domain.layer/enums/mrm.enum";
import { sendInAppNotification } from "../../services/inAppNotification.service";
import {
  NotificationType,
  NotificationEntityType,
} from "../../domain.layer/interfaces/i.notification";

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

describe("severityToFindingSeverity", () => {
  it("maps critical→critical, high→high, warn→null", () => {
    expect(severityToFindingSeverity(MrmThresholdSeverity.CRITICAL)).toBe(
      MrmFindingSeverity.CRITICAL,
    );
    expect(severityToFindingSeverity(MrmThresholdSeverity.HIGH)).toBe(MrmFindingSeverity.HIGH);
    expect(severityToFindingSeverity(MrmThresholdSeverity.WARN)).toBeNull();
  });
});

describe("isAutoFindingEligible", () => {
  it("fires only for a hard breach with the toggle on", () => {
    expect(isAutoFindingEligible(MrmEvalStatus.BREACH, true)).toBe(true);
    expect(isAutoFindingEligible(MrmEvalStatus.WARN, true)).toBe(false);
    expect(isAutoFindingEligible(MrmEvalStatus.OK, true)).toBe(false);
    expect(isAutoFindingEligible(MrmEvalStatus.NO_THRESHOLD, true)).toBe(false);
    expect(isAutoFindingEligible(MrmEvalStatus.BREACH, false)).toBe(false);
  });
});

describe("dispatchAlerts", () => {
  const mockSend = sendInAppNotification as jest.Mock;
  const baseNotification = {
    type: NotificationType.MRM_METRIC_BREACH,
    title: "Metric breach: psi",
    message: "Model X breached",
    entity_type: NotificationEntityType.MODEL,
    entity_id: 7,
    entity_name: "Model X",
  };
  const email = {
    template: "mrm-breach-alert.mjml",
    subject: "Metric breach: psi",
    variables: { metric: "psi" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue(undefined);
  });

  it("sends one dual-dispatch notification per recipient with the email flag", async () => {
    await dispatchAlerts(1, [10, 20], baseNotification, true, email);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledWith(1, { ...baseNotification, user_id: 10 }, true, email);
    expect(mockSend).toHaveBeenCalledWith(1, { ...baseNotification, user_id: 20 }, true, email);
  });

  it("passes emailEnabled=false through (in-app only)", async () => {
    await dispatchAlerts(1, [10], baseNotification, false, email);
    expect(mockSend).toHaveBeenCalledWith(1, { ...baseNotification, user_id: 10 }, false, email);
  });

  it("one failing recipient never blocks the rest and never throws", async () => {
    mockSend.mockRejectedValueOnce(new Error("smtp down"));
    await expect(
      dispatchAlerts(1, [10, 20], baseNotification, true, email),
    ).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("does nothing for an empty recipient list", async () => {
    await dispatchAlerts(1, [], baseNotification, true, email);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
