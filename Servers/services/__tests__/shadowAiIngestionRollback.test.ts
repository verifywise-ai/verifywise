jest.mock("../../database/db", () => ({ sequelize: { transaction: jest.fn() } }));
jest.mock("../../utils/shadowAiConfig.utils", () => ({ getSettingsQuery: jest.fn() }));
jest.mock("../shadowAiToolMatcher.service", () => ({
  matchDomain: jest.fn().mockResolvedValue(null),
  ensureTenantTool: jest.fn(),
  updateToolCounters: jest.fn(),
}));
jest.mock("../shadowAiModelExtractor.service", () => ({ extractModel: jest.fn() }));
jest.mock("../shadowAiAlertNotification.service", () => ({ evaluateRulesForBatch: jest.fn() }));
jest.mock("../../utils/shadowAiIngestion.utils", () => ({
  ...jest.requireActual("../../utils/shadowAiIngestion.utils"),
  insertEventsQuery: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { sequelize } from "../../database/db";
import { insertEventsQuery } from "../../utils/shadowAiIngestion.utils";
import { ingestShadowAiEvents } from "../shadowAiIngestion.service";

const events = [
  { user_email: "a@example.com", destination: "example.com", timestamp: "2026-11-01T10:00:00Z" },
];

describe("ingestShadowAiEvents when its own rollback fails", () => {
  const insertError = new Error("insert failed");
  const rollbackError = new Error("connection lost");

  beforeEach(() => {
    jest.clearAllMocks();
    (sequelize.transaction as jest.Mock).mockResolvedValue({
      commit: jest.fn(),
      rollback: jest.fn().mockRejectedValue(rollbackError),
    });
    (insertEventsQuery as jest.Mock).mockRejectedValue(insertError);
  });

  it("reports both errors to onRollbackFailure and rethrows the original", async () => {
    const onRollbackFailure = jest.fn().mockResolvedValue(undefined);
    await expect(ingestShadowAiEvents(1, events, { onRollbackFailure })).rejects.toBe(insertError);
    expect(onRollbackFailure).toHaveBeenCalledWith(insertError, rollbackError);
  });

  it("still rethrows the original when onRollbackFailure itself fails", async () => {
    const onRollbackFailure = jest.fn().mockRejectedValue(new Error("audit down"));
    await expect(ingestShadowAiEvents(1, events, { onRollbackFailure })).rejects.toBe(insertError);
  });
});
