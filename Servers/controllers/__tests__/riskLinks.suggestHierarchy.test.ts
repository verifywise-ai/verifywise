jest.mock("../../utils/riskLink.utils");
jest.mock("../../utils/llmKey.utils");
jest.mock("../../services/automations/automationProducer");
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));

import { suggestRiskHierarchy } from "../riskLinks.ctrl";
import { getRelatedPairsQuery } from "../../utils/riskLink.utils";
import { getLLMKeysQuery } from "../../utils/llmKey.utils";
import { enqueueRiskLinkDirection } from "../../services/automations/automationProducer";

const mockGetRelatedPairs = getRelatedPairsQuery as jest.Mock;
const mockGetKeys = getLLMKeysQuery as jest.Mock;
const mockEnqueue = enqueueRiskLinkDirection as jest.Mock;

const res = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const req = () => ({ userId: 1, organizationId: 42 }) as any;

beforeEach(() => {
  jest.resetAllMocks();
  mockGetKeys.mockResolvedValue([{ id: 1, name: "Anthropic" }]);
  mockEnqueue.mockResolvedValue(undefined);
});

describe("suggestRiskHierarchy", () => {
  // Without a key every job would run, log a warning, and write nothing. The
  // admin would see "grouping 4 clusters" and then silence.
  it("refuses with 400 when the org has no LLM key", async () => {
    mockGetKeys.mockResolvedValue([]);
    const r = res();

    await suggestRiskHierarchy(req(), r);

    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockGetRelatedPairs).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("enqueues one job per component and reports the count", async () => {
    mockGetRelatedPairs.mockResolvedValue([
      { a: 1, b: 2 },
      { a: 2, b: 3 },
      { a: 8, b: 9 },
    ]);
    const r = res();

    await suggestRiskHierarchy(req(), r);

    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledWith(42, [1, 2, 3]);
    expect(mockEnqueue).toHaveBeenCalledWith(42, [8, 9]);
    expect(r.status).toHaveBeenCalledWith(202);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enqueued: 2, skipped: 0 } }),
    );
  });

  // Truncating would make the grouping decision by an arbitrary cut rather than
  // by the model, so an oversized component is skipped whole — and counted, so
  // the admin can see it happened.
  it("skips a component larger than the cap and counts it", async () => {
    const chain = Array.from({ length: 30 }, (_, i) => ({ a: i + 1, b: i + 2 }));
    mockGetRelatedPairs.mockResolvedValue([...chain, { a: 500, b: 501 }]);
    const r = res();

    await suggestRiskHierarchy(req(), r);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(42, [500, 501]);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enqueued: 1, skipped: 1 } }),
    );
  });

  it("reports zero when the org has no related risks at all", async () => {
    mockGetRelatedPairs.mockResolvedValue([]);
    const r = res();

    await suggestRiskHierarchy(req(), r);

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(202);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enqueued: 0, skipped: 0 } }),
    );
  });

  it("answers 500 when the queue is unreachable", async () => {
    mockGetRelatedPairs.mockResolvedValue([{ a: 1, b: 2 }]);
    mockEnqueue.mockRejectedValue(new Error("redis down"));
    const r = res();

    await suggestRiskHierarchy(req(), r);

    expect(r.status).toHaveBeenCalledWith(500);
  });
});
