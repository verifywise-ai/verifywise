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

import { enqueueRiskLinkRecompute } from "../automationProducer";

describe("enqueueRiskLinkRecompute", () => {
  beforeEach(() => mockAdd.mockReset());

  it("enqueues under the risk_link_recompute name with org-scoped data", async () => {
    await enqueueRiskLinkRecompute(7, 42);
    const [name, data] = mockAdd.mock.calls[0];
    expect(name).toBe("risk_link_recompute");
    expect(data).toEqual({ organizationId: 7, riskId: 42 });
  });

  it("dedups per risk with a jobId that is org-scoped", async () => {
    await enqueueRiskLinkRecompute(7, 42);
    expect(mockAdd.mock.calls[0][2].jobId).toBe("risk-link:7:42");
  });

  // Amendment C: BullMQ ignores an add whose jobId still exists, including a
  // retained completed or failed job. Without both of these the risk recomputes
  // exactly once and never again.
  it("removes the job on completion AND on failure so the jobId is reusable", async () => {
    await enqueueRiskLinkRecompute(7, 42);
    const options = mockAdd.mock.calls[0][2];
    expect(options.removeOnComplete).toBe(true);
    expect(options.removeOnFail).toBe(true);
  });
});
