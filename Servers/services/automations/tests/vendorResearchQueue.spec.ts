const mockAdd = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockAdd, obliterate: jest.fn() })),
  Worker: jest.fn(),
}));
jest.mock("../../../database/redis", () => ({ REDIS_URL: "redis://localhost:6379" }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import {
  VENDOR_RESEARCH_JOB,
  VENDOR_RESEARCH_JOB_OPTIONS,
  enqueueVendorResearch,
  vendorResearchJobId,
} from "../automationProducer";

describe("enqueueVendorResearch", () => {
  beforeEach(() => mockAdd.mockReset());

  it("adds one vendor_research job with the ids of the run, an id of its own, two attempts and removal on settle", async () => {
    await enqueueVendorResearch(1, 2, 3);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      "vendor_research",
      { organizationId: 1, vendorId: 2, runId: 3 },
      {
        jobId: "vendor-research-1-2-3",
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it("returns what the queue returns", async () => {
    const job = { id: "vendor-research-1-2-3" };
    mockAdd.mockResolvedValue(job);

    await expect(enqueueVendorResearch(1, 2, 3)).resolves.toBe(job);
  });

  // An id per vendor would make BullMQ ignore the add of a new run while the job of an earlier,
  // swept run is still in Redis. The id has no colon: BullMQ rejects a custom id with a colon
  // unless it has exactly three parts.
  it("gives each run its own job id, in the same organization and for the same vendor", () => {
    expect(vendorResearchJobId(1, 2, 3)).toBe("vendor-research-1-2-3");
    expect(vendorResearchJobId(1, 2, 4)).not.toBe(vendorResearchJobId(1, 2, 3));
    expect(vendorResearchJobId(10, 2, 3)).not.toBe(vendorResearchJobId(1, 20, 3));
    expect(vendorResearchJobId(1, 2, 3)).not.toContain(":");
  });

  it("exports the job name and the options the integration test adds a job with", () => {
    expect(VENDOR_RESEARCH_JOB).toBe("vendor_research");
    expect(VENDOR_RESEARCH_JOB_OPTIONS).toEqual({
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  });
});
