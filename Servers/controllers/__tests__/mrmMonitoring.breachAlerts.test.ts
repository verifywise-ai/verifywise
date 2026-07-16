import { handleBreaches } from "../mrmMonitoring.ctrl";
import { getMrmOrgSettings } from "../../utils/mrmSettings.utils";
import {
  dispatchAlerts,
  getAlertRecipientsUnion,
  maybeAutoOpenFindingForBreach,
} from "../../utils/mrmAlerts.utils";
import { getModelLabelQuery } from "../../utils/mrmMonitoring.utils";
import {
  MrmBreachAction,
  MrmEvalStatus,
  MrmThresholdSeverity,
} from "../../domain.layer/enums/mrmMonitoring.enum";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../utils/mrmSettings.utils", () => ({
  getMrmOrgSettings: jest.fn(),
  MIN_RETENTION_MONTHS: 13,
}));
jest.mock("../../utils/mrmAlerts.utils", () => ({
  dispatchAlerts: jest.fn(),
  getAlertRecipientsUnion: jest.fn(),
  maybeAutoOpenFindingForBreach: jest.fn(),
}));
jest.mock("../../utils/mrmMonitoring.utils");
jest.mock("../../utils/mrmRevalidation.utils");
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockSettings = getMrmOrgSettings as jest.Mock;
const mockUnion = getAlertRecipientsUnion as jest.Mock;
const mockDispatch = dispatchAlerts as jest.Mock;
const mockAutoFinding = maybeAutoOpenFindingForBreach as jest.Mock;
const mockLabel = getModelLabelQuery as jest.Mock;

const outcome = (metric: string, status: MrmEvalStatus, severity: MrmThresholdSeverity) => ({
  point: {
    metric,
    value: 0.5,
    at: new Date("2026-07-01T00:00:00Z"),
    segment: "overall",
    window: "",
  },
  duplicate: false,
  metricId: 1,
  evaluation: {
    status,
    breached: true,
    threshold: {
      id: 1,
      metric,
      segment: null,
      window: null,
      op: "gt" as never,
      value_num: 0.25,
      value_lo: null,
      value_hi: null,
      severity,
      breach_action: MrmBreachAction.NOTIFY,
      active: true,
    },
    snapshot: null,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.mockResolvedValue({
    organization_id: 1,
    retention_months: 25,
    alert_email_enabled: true,
    breach_auto_open_finding: true,
  });
  mockUnion.mockResolvedValue([10, 20]);
  mockAutoFinding.mockResolvedValue(null);
  mockLabel.mockResolvedValue("Provider Model 1.0");
  mockDispatch.mockResolvedValue(undefined);
});

describe("handleBreaches alert dispatch", () => {
  it("returns early with no warn/breach outcomes", async () => {
    await handleBreaches(1, 7, [
      { ...outcome("psi", MrmEvalStatus.OK, MrmThresholdSeverity.HIGH) },
      { ...outcome("psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH), duplicate: true },
    ]);
    expect(mockSettings).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("dispatches per breach with title, email config and the recipient union", async () => {
    await handleBreaches(1, 7, [
      outcome("psi", MrmEvalStatus.WARN, MrmThresholdSeverity.WARN),
      outcome("auc", MrmEvalStatus.BREACH, MrmThresholdSeverity.CRITICAL),
    ]);
    expect(mockSettings).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const [orgId, recipients, notification, emailEnabled, email] = mockDispatch.mock.calls[0];
    expect(orgId).toBe(1);
    expect(recipients).toEqual([10, 20]);
    expect(notification.title).toBe("Metric warning: psi");
    expect(emailEnabled).toBe(true);
    expect(email.template).toBe("mrm-breach-alert.mjml");
    expect(email.variables.severity).toBe("warning");
    expect(mockDispatch.mock.calls[1][2].title).toBe("Metric breach: auc");
  });

  it("attempts the auto-finding for every breach outcome with the org toggle", async () => {
    await handleBreaches(1, 7, [
      outcome("psi", MrmEvalStatus.WARN, MrmThresholdSeverity.WARN),
      outcome("auc", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH),
    ]);
    expect(mockAutoFinding).toHaveBeenCalledTimes(2);
    expect(mockAutoFinding).toHaveBeenCalledWith(
      1,
      7,
      "auc",
      MrmEvalStatus.BREACH,
      MrmThresholdSeverity.HIGH,
      true,
    );
  });

  it("still auto-opens findings when there is nobody to notify", async () => {
    mockUnion.mockResolvedValue([]);
    await handleBreaches(1, 7, [outcome("psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH)]);
    expect(mockAutoFinding).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("swallows recipient-resolution and auto-finding failures", async () => {
    mockAutoFinding.mockRejectedValue(new Error("db down"));
    mockUnion.mockRejectedValue(new Error("db down"));
    await expect(
      handleBreaches(1, 7, [outcome("psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH)]),
    ).resolves.toBeUndefined();
  });

  it("skips breach alerts and auto-findings when the settings read fails", async () => {
    mockSettings.mockRejectedValue(new Error("db down"));
    await expect(
      handleBreaches(1, 7, [outcome("psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH)]),
    ).resolves.toBeUndefined();
    expect(mockAutoFinding).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
