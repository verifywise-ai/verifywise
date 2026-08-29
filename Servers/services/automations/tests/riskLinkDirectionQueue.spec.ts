const mockAdd = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    obliterate: jest.fn(),
  })),
  Worker: jest.fn(),
}));

jest.mock("../../../database/redis", () => ({
  __esModule: true,
  default: {},
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { enqueueRiskLinkDirection } from "../automationProducer";

beforeEach(() => {
  mockAdd.mockClear();
});

describe("enqueueRiskLinkDirection", () => {
  it("queues one job carrying the whole component", async () => {
    await enqueueRiskLinkDirection(7, [3, 1, 2]);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [name, data] = mockAdd.mock.calls[0];
    expect(name).toBe("risk_link_direction");
    expect(data).toEqual({ organizationId: 7, riskIds: [3, 1, 2] });
  });

  // The jobId is what makes a double-click cost one LLM call instead of two.
  // It is derived from the component's smallest id, which is stable because
  // connectedComponents sorts.
  it("derives a stable jobId from the org and the component's smallest id", async () => {
    await enqueueRiskLinkDirection(7, [3, 1, 2]);
    expect(mockAdd.mock.calls[0][2]).toMatchObject({
      jobId: "risk-link-direction:7:1",
    });
  });

  it("does not collide with another org's component of the same shape", async () => {
    await enqueueRiskLinkDirection(7, [1, 2]);
    await enqueueRiskLinkDirection(8, [1, 2]);
    expect(mockAdd.mock.calls[0][2].jobId).not.toBe(mockAdd.mock.calls[1][2].jobId);
  });

  it("cleans up after itself and retries with backoff", async () => {
    await enqueueRiskLinkDirection(7, [1, 2]);
    expect(mockAdd.mock.calls[0][2]).toMatchObject({
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });
  });

  it("refuses an empty component rather than queueing a job with no work", async () => {
    await expect(enqueueRiskLinkDirection(7, [])).rejects.toThrow();
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
