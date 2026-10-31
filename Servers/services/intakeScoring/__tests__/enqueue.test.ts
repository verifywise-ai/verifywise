jest.mock("../../automations/automationProducer", () => ({
  automationQueue: { add: jest.fn() },
}));

import { automationQueue } from "../../automations/automationProducer";
import { enqueueIntakeAssessment, NOTIFY_CAP_MS } from "../enqueue";

const add = automationQueue.add as jest.Mock;

describe("enqueueIntakeAssessment", () => {
  beforeEach(() => add.mockReset());

  it("queues the assessment and a 2-minute cap job when notifying", async () => {
    await enqueueIntakeAssessment({
      organizationId: 7,
      submissionId: 11,
      stages: ["scoring", "suggestions"],
      notify: true,
      lang: "de",
    });
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenNthCalledWith(
      1,
      "intake_assessment",
      expect.objectContaining({ submissionId: 11, stages: ["scoring", "suggestions"] }),
      {
        jobId: "intake-assessment:7:11-scoring+suggestions",
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    expect(add).toHaveBeenNthCalledWith(
      2,
      "intake_notify_cap",
      { organizationId: 7, submissionId: 11, lang: "de", adminFallback: undefined },
      {
        delay: NOTIFY_CAP_MS,
        jobId: "intake-notify-cap:7:11",
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    expect(NOTIFY_CAP_MS).toBe(120_000);
  });

  it("adds no cap job when not notifying", async () => {
    await enqueueIntakeAssessment({
      organizationId: 7,
      submissionId: 11,
      stages: ["scoring"],
      notify: false,
    });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][2].jobId).toBe("intake-assessment:7:11-scoring");
  });

  it("uses job ids BullMQ accepts (a ':' id must have exactly 3 parts)", async () => {
    await enqueueIntakeAssessment({
      organizationId: 7,
      submissionId: 11,
      stages: ["scoring", "suggestions"],
      notify: true,
    });
    for (const call of add.mock.calls) {
      const jobId: string = call[2].jobId;
      expect(jobId.includes(":") ? jobId.split(":").length : 3).toBe(3);
    }
  });
});
