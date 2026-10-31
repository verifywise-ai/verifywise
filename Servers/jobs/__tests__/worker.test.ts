/**
 * The process that carries out the background jobs: every queue has a worker here, or its jobs wait
 * for ever. A worker that is made and not listed would not be told of errors or shut down.
 */
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const mockWorker = (name: string) => ({
  name,
  on: jest.fn().mockReturnThis(),
  close: jest.fn().mockResolvedValue(undefined),
});

jest.mock("../../services/slack/slackWorker", () => ({
  createNotificationWorker: jest.fn(() => mockWorker("slack-notifications")),
}));
jest.mock("../../services/automations/automationWorker", () => ({
  createAutomationWorker: jest.fn(() => mockWorker("automation-actions")),
}));
jest.mock("../../services/vendorResearch/worker", () => ({
  createVendorResearchWorker: jest.fn(() => mockWorker("vendor-research")),
}));
jest.mock("../../services/vendorResearch/vrdb/worker", () => ({
  createVrdbWorker: jest.fn(() => mockWorker("vendor-risk-database")),
}));

import { createAutomationWorker } from "../../services/automations/automationWorker";
import { createNotificationWorker } from "../../services/slack/slackWorker";
import { createVrdbWorker } from "../../services/vendorResearch/vrdb/worker";
import { createVendorResearchWorker } from "../../services/vendorResearch/worker";

const asMock = (fn: unknown) => fn as jest.Mock;

/** The worker a factory made, with the functions the process called on it. */
const madeBy = (factory: unknown) => asMock(factory).mock.results[0].value;

describe("the worker process", () => {
  let signalHandlers: Record<string, () => Promise<void>>;
  let exit: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    signalHandlers = {};
    // The process must not get the handler of a test, and must not stop.
    jest.spyOn(process, "on").mockImplementation(((event: string, handler: () => Promise<void>) => {
      signalHandlers[event] = handler;
      return process;
    }) as never);
    exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    jest.isolateModules(() => {
      require("../worker");
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["notifications", createNotificationWorker],
    ["automations", createAutomationWorker],
    ["vendor research", createVendorResearchWorker],
    ["vendor risk database", createVrdbWorker],
  ])("starts the worker of the %s queue, once", (_label, factory) => {
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["notifications", createNotificationWorker],
    ["automations", createAutomationWorker],
    ["vendor research", createVendorResearchWorker],
    ["vendor risk database", createVrdbWorker],
  ])("listens for the errors of the %s worker", (_label, factory) => {
    expect(madeBy(factory).on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  // One sync at a time: a list is tens of megabytes, and the syncs share no work.
  it("gives the worker of the vendor risk database one place", () => {
    expect(createVrdbWorker).toHaveBeenCalledWith(1);
  });

  it("closes every worker when it is interrupted, and then stops", async () => {
    await signalHandlers.SIGINT();

    expect(madeBy(createNotificationWorker).close).toHaveBeenCalled();
    expect(madeBy(createAutomationWorker).close).toHaveBeenCalled();
    expect(madeBy(createVendorResearchWorker).close).toHaveBeenCalled();
    expect(madeBy(createVrdbWorker).close).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });
});
