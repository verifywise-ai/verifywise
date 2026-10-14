import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../auditLedger.utils", () => ({ appendToAuditLedger: jest.fn<any>() }));
jest.mock("../logger/logHelper", () => ({
  logFailure: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import { appendRetentionChangeToLedger } from "../retentionAudit.utils";
import { appendToAuditLedger } from "../auditLedger.utils";
import { logFailure } from "../logger/logHelper";

const params = {
  organizationId: 3,
  userId: 7,
  description: "Shadow AI retention changed: event retention from 30 days to 90 days",
  functionName: "updateSettings",
  fileName: "shadowAi.ctrl.ts",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("appendRetentionChangeToLedger", () => {
  it("appends a data_retention Update event", async () => {
    await appendRetentionChangeToLedger(params);
    expect(appendToAuditLedger).toHaveBeenCalledWith({
      organizationId: 3,
      entryType: "event_log",
      userId: 7,
      eventType: "Update",
      entityType: "data_retention",
      description: params.description,
    });
  });

  it("logs a failed append and never throws", async () => {
    (appendToAuditLedger as jest.MockedFunction<any>).mockRejectedValue(new Error("ledger down"));
    await expect(appendRetentionChangeToLedger(params)).resolves.toBeUndefined();
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "Update",
        organizationId: 3,
        functionName: "updateSettings",
        description: expect.stringContaining("could not be written"),
      }),
    );
  });
});
