import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// The write tool wrapper captures the requester's local date when they ask
// for an action, so a day it records is theirs even when an approver runs it
// later. The date comes from the request (X-Client-Date), never the model.

jest.mock("../approvalGateway", () => ({
  submitForApproval: jest.fn(async () => ({ outcome: "completed", executionResult: { ok: 1 } })),
}));

import { submitForApproval } from "../approvalGateway";
import { createWriteToolFn } from "../../confirmation/createWriteTool";
import { asyncLocalStorage } from "../../../utils/context/context";
import { REQUESTER_CLIENT_DATE_PARAM } from "../types";

const mockSubmit = submitForApproval as unknown as jest.Mock<(...a: any[]) => Promise<any>>;

const tool = createWriteToolFn({
  toolName: "test_client_date_tool",
  warningLevel: "warning",
  descriptionFn: () => "Test",
  executeFn: async () => ({ ok: 1 }),
});

const submitted = () => mockSubmit.mock.calls[0][0] as Record<string, any>;

describe("write tools capture the requester's client date", () => {
  beforeEach(() => jest.clearAllMocks());

  it("submits today's client date (one that is today somewhere) with the action", async () => {
    // Today in UTC is always today somewhere.
    const today = new Date().toISOString().slice(0, 10);
    await asyncLocalStorage.run({ clientDate: today }, () => tool({ title: "x", _userId: 3 }, 1));

    expect(submitted().requesterClientDate).toBe(today);
    expect(submitted().inputParams).toEqual({ title: "x" });
  });

  it("submits none without a usable client date, and drops one sent as a param", async () => {
    await asyncLocalStorage.run({ clientDate: "2001-01-01" }, () =>
      tool({ title: "x", [REQUESTER_CLIENT_DATE_PARAM]: "2001-01-01" }, 1),
    );
    await tool({ title: "y" }, 1);

    for (const [config] of mockSubmit.mock.calls as any[]) {
      expect(config.requesterClientDate).toBeUndefined();
      expect(config.inputParams).not.toHaveProperty(REQUESTER_CLIENT_DATE_PARAM);
    }
  });
});
