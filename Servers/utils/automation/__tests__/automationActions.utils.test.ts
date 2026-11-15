/**
 * enqueueAutomationActions: one action after another in query order (so
 * aa."order" holds), a failed enqueue logged and skipped, after commit inside
 * a transaction and at once without one.
 */
jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { enqueueAutomationAction } from "../../../services/automations/automationProducer";
import logger from "../../logger/fileLogger";
import { enqueueAutomationActions, IAutomationActionRow } from "../automationActions.utils";

const mockEnqueue = enqueueAutomationAction as jest.Mock;
const settle = () => new Promise((resolve) => setImmediate(resolve));

const ACTIONS: IAutomationActionRow[] = [
  { automation_id: 1, action_key: "send_email", params: { subject: "1a {{name}}" } },
  { automation_id: 1, action_key: "send_slack", params: { subject: "1b" } },
  { automation_id: 2, action_key: "send_email", params: { subject: "2a" } },
];
const keys = () => mockEnqueue.mock.calls.map(([key, data]) => `${key}:${data.automation_id}`);

beforeEach(() => {
  jest.clearAllMocks();
  mockEnqueue.mockResolvedValue(undefined);
});

describe("enqueueAutomationActions", () => {
  it("starts each enqueue only after the previous one settled", async () => {
    let releaseFirst: () => void = () => undefined;
    mockEnqueue.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseFirst = resolve)),
    );

    const done = enqueueAutomationActions(ACTIONS, { name: "Policy" }, 4);
    await settle();
    expect(keys()).toEqual(["send_email:1"]);

    releaseFirst();
    await done;
    expect(keys()).toEqual(["send_email:1", "send_slack:1", "send_email:2"]);
    expect(mockEnqueue.mock.calls[0][1]).toEqual({
      subject: "1a Policy",
      body: "",
      automation_id: 1,
      organizationId: 4,
    });
  });

  it("logs a failed enqueue once, with the log context, and goes on in order", async () => {
    mockEnqueue.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("redis down"));

    await enqueueAutomationActions(ACTIONS, {}, 4, undefined, "scan 42");

    expect(keys()).toEqual(["send_email:1", "send_slack:1", "send_email:2"]);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/send_slack enqueue failed for automation 1 \(scan 42\): .*redis down/),
    );
  });

  it("waits for the commit inside a transaction", async () => {
    let onCommit: () => void = () => undefined;
    const tx = { afterCommit: jest.fn((cb: () => void) => (onCommit = cb)) };

    await enqueueAutomationActions(ACTIONS, {}, 4, tx as never);
    expect(mockEnqueue).not.toHaveBeenCalled();

    onCommit();
    await settle();
    expect(keys()).toEqual(["send_email:1", "send_slack:1", "send_email:2"]);
  });

  it("does nothing for no actions", async () => {
    const tx = { afterCommit: jest.fn() };

    await enqueueAutomationActions([], {}, 4, tx as never);

    expect(tx.afterCommit).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
