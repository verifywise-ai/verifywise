jest.mock("../pipeline", () => ({ runVendorResearch: jest.fn(), resolveOrgModel: jest.fn() }));
// Only the reader of the configuration is replaced: the real factory builds the search provider
// from what it returns, as it does in production.
jest.mock("../config", () => ({ getVendorResearchConfig: jest.fn() }));
jest.mock("../../../advisor/llmSelfCorrect", () => ({
  generateObjectWithSelfCorrection: jest.fn(),
}));
jest.mock("../../../utils/vendor.utils", () => ({ getVendorByIdQuery: jest.fn() }));
jest.mock("../../../utils/vendorResearch.utils", () => ({
  finishRunQuery: jest.fn(),
  getRunByIdQuery: jest.fn(),
}));
jest.mock("../../inAppNotification.service", () => ({ notifyAssigneeOfVendorResearch: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { IVendor } from "../../../domain.layer/interfaces/i.vendor";
import { IVendorResearchRun } from "../../../domain.layer/interfaces/i.vendorResearch";
import logger from "../../../utils/logger/fileLogger";
import { getVendorByIdQuery } from "../../../utils/vendor.utils";
import { finishRunQuery, getRunByIdQuery } from "../../../utils/vendorResearch.utils";
import { notifyAssigneeOfVendorResearch } from "../../inAppNotification.service";
import { VendorResearchConfig, getVendorResearchConfig } from "../config";
import { handleVendorResearchJob } from "../job";
import { PipelineDeps, resolveOrgModel, runVendorResearch } from "../pipeline";

type AnyMock = jest.Mock<any, any[]>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

// Three different numbers, so that a swapped pair of arguments shows up as a failure.
const ORG = 3;
const VENDOR = 7;
const RUN_ID = 11;
const ASSIGNEE = 5;
const DATA = { organizationId: ORG, vendorId: VENDOR, runId: RUN_ID };

const TAVILY_KEY = "tvly-secret-key-1234";
const CONFIGURED: VendorResearchConfig = {
  searchProvider: "tavily",
  tavilyApiKey: TAVILY_KEY,
  autoRun: true,
  manualCooldownMinutes: 10,
  dailyRunCap: 50,
};
const NOT_CONFIGURED: VendorResearchConfig = { ...CONFIGURED, searchProvider: null };

const makeRun = (overrides: Partial<IVendorResearchRun> = {}): IVendorResearchRun => ({
  id: RUN_ID,
  organization_id: ORG,
  vendor_id: VENDOR,
  trigger_type: "auto",
  status: "queued",
  categories: [],
  category_summary: [],
  evidence: null,
  search_provider: null,
  model: null,
  prompt_version: null,
  searches_used: 0,
  duplicates_dropped: 0,
  error: null,
  requested_by: null,
  created_at: new Date("2031-04-20T12:00:00Z"),
  started_at: null,
  finished_at: null,
  ...overrides,
});

const makeVendor = (overrides: Partial<IVendor> = {}): IVendor =>
  ({ id: VENDOR, vendor_name: "Acme", assignee: ASSIGNEE, ...overrides }) as IVendor;

const loggedLines = (): string[] =>
  (["debug", "info", "warn", "error"] as const).flatMap((level) =>
    asMock(logger[level]).mock.calls.map((args) => args.map(String).join(" ")),
  );

beforeEach(() => {
  jest.resetAllMocks();
  asMock(getVendorResearchConfig).mockReturnValue(CONFIGURED);
  asMock(getRunByIdQuery).mockResolvedValue(makeRun());
  asMock(getVendorByIdQuery).mockResolvedValue(makeVendor());
  asMock(runVendorResearch).mockResolvedValue({ outcome: "completed", findingsCreated: 2 });
  asMock(notifyAssigneeOfVendorResearch).mockResolvedValue(true);
  asMock(finishRunQuery).mockResolvedValue(undefined);
});

afterEach(() => {
  for (const line of loggedLines()) expect(line).not.toContain(TAVILY_KEY);
});

describe("handleVendorResearchJob", () => {
  describe("when the search provider is not configured", () => {
    beforeEach(() => asMock(getVendorResearchConfig).mockReturnValue(NOT_CONFIGURED));

    it("finishes the queued run as failed, and does not run the pipeline", async () => {
      await handleVendorResearchJob(DATA);

      expect(getRunByIdQuery).toHaveBeenCalledWith(ORG, RUN_ID);
      expect(finishRunQuery).toHaveBeenCalledTimes(1);
      expect(finishRunQuery).toHaveBeenCalledWith({
        organizationId: ORG,
        runId: RUN_ID,
        status: "failed",
        categories: [],
        categorySummary: [],
        evidence: null,
        searchProvider: null,
        model: null,
        promptVersion: null,
        searchesUsed: 0,
        duplicatesDropped: 0,
        error: "Search provider not configured",
      });
      expect(runVendorResearch).not.toHaveBeenCalled();
      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it.each(["running", "completed", "failed"] as const)(
      "leaves a %s run as it is: only a queued run is failed",
      async (status) => {
        asMock(getRunByIdQuery).mockResolvedValue(makeRun({ status }));

        await handleVendorResearchJob(DATA);

        expect(finishRunQuery).not.toHaveBeenCalled();
        expect(runVendorResearch).not.toHaveBeenCalled();
      },
    );
  });

  it("drops a job whose run is not there (it was deleted with its vendor), without an error", async () => {
    asMock(getRunByIdQuery).mockResolvedValue(null);

    await expect(handleVendorResearchJob(DATA)).resolves.toBeUndefined();

    expect(runVendorResearch).not.toHaveBeenCalled();
    expect(finishRunQuery).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`run ${RUN_ID}`));
  });

  it("runs the pipeline for the run, with the search provider of the configuration and the real model, generator and clock", async () => {
    await handleVendorResearchJob(DATA);

    expect(runVendorResearch).toHaveBeenCalledTimes(1);
    const [args, deps] = asMock(runVendorResearch).mock.calls[0] as [typeof DATA, PipelineDeps];
    expect(args).toEqual(DATA);
    expect(deps.searchProvider.name).toBe("tavily");
    expect(deps.resolveModel).toBe(resolveOrgModel);
    expect(deps.generate).toBe(generateObjectWithSelfCorrection);
    const before = Date.now();
    const now = deps.now();
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("does not catch a rejection of the pipeline, so that BullMQ retries the job", async () => {
    const failure = new Error("could not mark the run running");
    asMock(runVendorResearch).mockRejectedValue(failure);

    await expect(handleVendorResearchJob(DATA)).rejects.toBe(failure);

    expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    expect(finishRunQuery).not.toHaveBeenCalled();
  });

  describe("the notice to the assignee", () => {
    it("tells the assignee once when an automatic run stored findings", async () => {
      await handleVendorResearchJob(DATA);

      expect(getVendorByIdQuery).toHaveBeenCalledWith(VENDOR, ORG);
      expect(notifyAssigneeOfVendorResearch).toHaveBeenCalledTimes(1);
      expect(notifyAssigneeOfVendorResearch).toHaveBeenCalledWith(
        ORG,
        { id: VENDOR, name: "Acme", assignee: ASSIGNEE },
        RUN_ID,
        2,
      );
    });

    it("says nothing after a manual run: the person who started it is looking at the result", async () => {
      asMock(getRunByIdQuery).mockResolvedValue(makeRun({ trigger_type: "manual" }));

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it("says nothing when the run stored no findings", async () => {
      asMock(runVendorResearch).mockResolvedValue({ outcome: "completed", findingsCreated: 0 });

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it("says nothing when the vendor has no assignee", async () => {
      asMock(getVendorByIdQuery).mockResolvedValue(makeVendor({ assignee: null as any }));

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it("says nothing when the vendor is gone", async () => {
      asMock(getVendorByIdQuery).mockResolvedValue(null);

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it.each(["failed", "skipped"] as const)("says nothing when the run %s", async (outcome) => {
      asMock(runVendorResearch).mockResolvedValue({ outcome, findingsCreated: 0 });

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it("does not make the job throw when the notice fails, and never touches the run", async () => {
      asMock(notifyAssigneeOfVendorResearch).mockRejectedValue(new Error("redis is down"));

      await expect(handleVendorResearchJob(DATA)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("redis is down"));
      expect(finishRunQuery).not.toHaveBeenCalled();
    });

    it("does not make the job throw when the vendor cannot be loaded for the notice", async () => {
      asMock(getVendorByIdQuery).mockRejectedValue(new Error("database is down"));

      await expect(handleVendorResearchJob(DATA)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("database is down"));
      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });
  });
});
